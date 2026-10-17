import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db/index.ts';
import { DbStore, DbPeople, DbArchive } from '../src/db/stores.ts';
import { importOnce } from '../src/db/importer.ts';
import { exportFromDb } from '../src/db/export.ts';
import { App } from '../server/app.ts';
import { newProfile, addAnswer } from '../server/profiles.ts';
import { forDataset } from '../server/game.ts';
import { FakeGM, gameInReading } from './fixtures.ts';

const tmp = () => mkdtemp(join(tmpdir(), 'learn-'));
const dbIn = async (dir) => openDb(join(dir ?? await tmp(), 'suspition.db'));

const played = (username = 'asha', points = 2) => {
  const game = gameInReading(3);
  game.players[0].username = username;
  game.status = 'reveal';
  game.state.play = { p1: [{ points, skill: 'searching', why: 'x', rubric: 1, from: 'private', round: 1 }] };
  game.state.result = { players: [{ player_id: 'p1', culprit_correct: true, method_score: 0, motive_score: 0, goal_achieved: false, play: points, skills: { searching: points } }] };
  return game;
};

describe('the game on the database', () => {
  test('should resume the current game after a restart', async () => {
    const db = await dbIn();
    const first = await new App({ gm: new FakeGM(), store: new DbStore(db), people: new DbPeople(db) }).init();
    await first.join({ name: 'Asha' });
    const again = await new App({ gm: new FakeGM(), store: new DbStore(db), people: new DbPeople(db) }).init();
    assert.equal(again.game.id, first.game.id);
    assert.equal(again.game.players[0].name, 'Asha');
  });

  test("should keep answers but leave test games out of a person's skills and rating", async () => {
    const db = await dbIn();
    const people = new DbPeople(db);
    await people.save(addAnswer(newProfile('asha', 'Asha', 1), { id: 'party', answer: 'First to leave' }));
    const real = played('asha', 2);
    const test1 = played('asha', -1);
    db.saveGame(real);
    db.saveGame(test1);
    db.setLearning(test1.id, 'test');
    const p = await people.load('asha');
    assert.equal(p.answers[0].answer, 'First to leave');
    assert.deepEqual(p.games.map((g) => g.gameId), [real.id]);
    assert.equal(p.rating.overall, 0.5);
  });

  test('should not list people who only played test games', async () => {
    const db = await dbIn();
    const people = new DbPeople(db);
    await people.save(newProfile('ben', 'Ben', 1));
    const g = played('ben');
    db.saveGame(g);
    db.setLearning(g.id, 'test');
    assert.deepEqual(await people.list(), []);
  });

  test('should save a finished game to the database and to the git dataset with its tag', async () => {
    const dir = await tmp();
    const db = await dbIn(dir);
    const game = played();
    await new DbArchive(db, join(dir, 'dataset')).save(game);
    db.setLearning(game.id, 'outlier', 'odd night');
    await exportFromDb(db, join(dir, 'dataset'));
    const files = await readdir(join(dir, 'dataset', 'games'));
    const saved = JSON.parse(await readFile(join(dir, 'dataset', 'games', files[0]), 'utf8'));
    assert.deepEqual([saved.learning, saved.note], ['outlier', 'odd night']);
    assert.equal(saved.players[0].token, undefined);
  });
});

describe('first start import', () => {
  const lay = async () => {
    const dir = await tmp();
    await mkdir(join(dir, 'dataset', 'games'), { recursive: true });
    await mkdir(join(dir, 'dataset', 'people'), { recursive: true });
    await mkdir(join(dir, 'dataset', 'playtests', 'pt1'), { recursive: true });
    await mkdir(join(dir, 'game-data'), { recursive: true });
    const old = played('asha');
    await writeFile(join(dir, 'dataset', 'games', `2026-10-17-the-test-case-${old.id}.json`), JSON.stringify({ ...forDataset(old), learning: 'test' }));
    await writeFile(join(dir, 'dataset', 'games', `2026-10-17-the-test-case-${old.id}-before-rework.json`), JSON.stringify({ ...forDataset(old), status: 'reading' }));
    const current = gameInReading(3);
    current.players[0].username = 'asha';
    await writeFile(join(dir, 'game-data', 'current-game.json'), JSON.stringify(current));
    await writeFile(join(dir, 'dataset', 'people', 'asha.json'), JSON.stringify(addAnswer(newProfile('asha', 'Asha', 1), { id: 'party', answer: 'First to leave' })));
    const pt = played('guest');
    await writeFile(join(dir, 'dataset', 'playtests', 'pt1', 'game.json'), JSON.stringify(forDataset(pt)));
    await writeFile(join(dir, 'dataset', 'playtests', 'pt1', 'report.json'), JSON.stringify({ id: 'pt1' }));
    return { dir, old, current, pt };
  };

  test('should import old JSON games, people and playtests once', async () => {
    const { dir, old, current, pt } = await lay();
    const db = await dbIn(dir);
    const out = await importOnce(db, { gameData: join(dir, 'game-data'), dataset: join(dir, 'dataset') });
    assert.deepEqual(out, { games: 3, people: 1, playtests: 1 });
    assert.equal(db.loadCurrent().id, current.id);
    assert.ok(db.loadCurrent().players[0].token);
    assert.equal(db.loadGame(old.id).status, 'reveal');
    assert.equal(db.listGames().find((g) => g.id === old.id).learning, 'test');
    assert.equal(db.listGames().find((g) => g.id === pt.id).learning, 'playtest');
    assert.equal(db.person('asha').answers[0].answer, 'First to leave');
    assert.equal(db.listPlaytests()[0].id, 'pt1');
  });

  test('should skip the import when the database has games', async () => {
    const { dir } = await lay();
    const db = await dbIn(dir);
    await importOnce(db, { gameData: join(dir, 'game-data'), dataset: join(dir, 'dataset') });
    assert.deepEqual(await importOnce(db, { gameData: join(dir, 'game-data'), dataset: join(dir, 'dataset') }), { skipped: true });
  });
});
