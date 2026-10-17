import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, DbError } from '../src/db/index.ts';
import { gameInReading } from './fixtures.ts';

const file = async () => join(await mkdtemp(join(tmpdir(), 'db-')), 'suspition.db');

const finished = (names = ['Asha', 'Ben', 'Cy']) => {
  const game = gameInReading(3);
  game.players.forEach((p, i) => { p.name = names[i]; p.username = names[i].toLowerCase(); });
  game.status = 'reveal';
  game.state.events.push({ at: 5, phase: 0, kind: 'event', text: 'Something happened.' });
  game.state.play = { p1: [{ points: 2, skill: 'searching', why: 'x', rubric: 1, from: 'private', round: 1 }], p2: [{ points: -1, skill: 'swaying', why: 'y', rubric: 1, from: 'private', round: 1 }] };
  return game;
};

describe('game database', () => {
  test('should keep a game and find it again after reopening', async () => {
    const f = await file();
    const game = finished();
    const db = openDb(f);
    db.saveGame(game);
    db.setCurrent(game.id);
    db.close();
    const again = openDb(f);
    assert.equal(again.loadCurrent().id, game.id);
    assert.deepEqual(again.loadGame(game.id).state.play, game.state.play);
    again.close();
  });

  test('should rebuild moves for a game when it is saved again', async () => {
    const db = openDb(await file());
    const game = finished();
    db.saveGame(game);
    game.state.play.p1.push({ points: 1, skill: 'questioning', why: 'z', rubric: 1, from: 'out loud', round: 2 });
    db.saveGame(game);
    assert.equal(db.realMovesFor('asha').length, 2);
    assert.equal(db.events(game.id).length, game.state.events.length);
    db.close();
  });

  test('should give only moves from real games', async () => {
    const db = openDb(await file());
    const real = finished();
    const test1 = finished();
    db.saveGame(real);
    db.saveGame(test1);
    db.setLearning(test1.id, 'test', 'just trying');
    assert.deepEqual(db.realMovesFor('asha').map((m) => m.gameId), [real.id]);
    assert.deepEqual(db.realGamesFor('asha').map((g) => g.id), [real.id]);
    db.close();
  });

  test('should list games newest first with their learning tag', async () => {
    const db = openDb(await file());
    const a = finished();
    a.createdAt = 1_000;
    const b = finished();
    b.createdAt = 2_000;
    db.saveGame(a);
    db.saveGame(b);
    db.setLearning(a.id, 'outlier', 'odd night');
    const list = db.listGames();
    assert.deepEqual(list.map((g) => g.id), [b.id, a.id]);
    assert.deepEqual([list[1].learning, list[1].note, list[1].title, list[1].players], ['outlier', 'odd night', 'The Test Case', ['Asha', 'Ben', 'Cy']]);
    assert.deepEqual(db.listGames({ learning: 'real' }).map((g) => g.id), [b.id]);
    db.close();
  });

  test('should keep people and their answers', async () => {
    const db = openDb(await file());
    db.savePerson({ username: 'asha', name: 'Asha', answers: [{ id: 'party', question: 'Q', answer: 'A', at: 1 }], createdAt: 1 });
    assert.equal(db.person('asha').answers[0].answer, 'A');
    assert.deepEqual(db.peopleList(), [{ username: 'asha', name: 'Asha' }]);
    assert.equal(db.person('nobody'), null);
    db.close();
  });

  test('should keep playtest reports', async () => {
    const db = openDb(await file());
    db.savePlaytest('pt1', 'g1', { ok: true });
    assert.deepEqual(db.listPlaytests(), [{ id: 'pt1', gameId: 'g1', report: { ok: true }, createdAt: db.listPlaytests()[0].createdAt }]);
    db.close();
  });

  test('should refuse a database it cannot migrate with a clear message', async () => {
    const f = await file();
    await writeFile(f, 'this is not a database');
    assert.throws(() => openDb(f), (err) => err instanceof DbError && /The game database is newer or broken/.test(err.message));
  });
});

describe('database safety', () => {
  test('should only learn from finished real games', async () => {
    const db = openDb(await file());
    const done = finished();
    const half = finished();
    half.status = 'playing';
    db.saveGame(done);
    db.saveGame(half);
    assert.deepEqual(db.realGamesFor('asha').map((g) => g.id), [done.id]);
    assert.deepEqual(db.realMovesFor('asha').map((m) => m.gameId), [done.id]);
    assert.ok(db.realPlayers().has('asha'));
    db.close();
  });

  test('should refuse a database written by a newer version', async () => {
    const f = await file();
    openDb(f).close();
    const Database = (await import('better-sqlite3')).default;
    const raw = new Database(f);
    raw.prepare('insert into __drizzle_migrations (hash, created_at) values (?, ?)').run('future', 9_999_999_999_999);
    raw.close();
    assert.throws(() => openDb(f), (err) => err instanceof DbError && /newer/.test(err.message));
  });

  test('should stop with a clear message when the current game cannot be read', async () => {
    const f = await file();
    const db = openDb(f);
    const game = finished();
    db.saveGame(game);
    db.setCurrent(game.id);
    db.sqlite.prepare('update games set state = ? where id = ?').run('{broken', game.id);
    assert.throws(() => db.loadCurrent(), (err) => err instanceof DbError && /cannot be read/.test(err.message));
    assert.equal(db.listGames()[0].status, 'unreadable');
    db.close();
  });
});
