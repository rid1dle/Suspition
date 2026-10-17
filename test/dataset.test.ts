import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forDataset } from '../server/game.ts';
import { Archive, datasetName, MemoryStore } from '../server/store.ts';
import { App } from '../server/app.ts';
import { exportDataset } from '../scripts/export-dataset.ts';
import { gameInReading, makeScenario, FakeGM } from './fixtures.ts';

describe('dataset of played games', () => {
  test('should keep everything except the host and player join tokens', () => {
    const game = gameInReading(3);
    const copy = forDataset(game);
    assert.equal(copy.hostToken, undefined);
    assert.ok(copy.players.every((p) => p.token === undefined && p.name));
    assert.deepEqual(copy.scenario, game.scenario);
    assert.ok(game.hostToken && game.players[0].token, 'the live game keeps its tokens');
  });

  test('should name each game by day, title and id, and skip games with no players', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ds-'));
    const game = gameInReading(3);
    assert.match(datasetName(game, 'before-rework'), /^\d{4}-\d{2}-\d{2}-the-test-case-[a-f0-9]+-before-rework\.json$/);
    const file = await new Archive(dir).save(game);
    const saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.id, game.id);
    assert.ok(!JSON.stringify(saved).includes(game.hostToken));
    assert.equal(await new Archive(dir).save({ players: [] }), null);
  });

  test('should keep the old game when the host starts a new one', async () => {
    const saved = [];
    const app = await new App({ gm: new FakeGM(), store: new MemoryStore(), archive: { save: async (g) => saved.push(g.id) } }).init();
    const old = app.game.id;
    await app.join({ name: 'A' });
    await app.newGame(app.game.hostToken);
    assert.deepEqual(saved, [old]);
  });

  test('should export saved games and generated worlds from files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ds-'));
    const game = gameInReading(3);
    await writeFile(join(dir, 'current-game.before-rework.json'), JSON.stringify(game));
    await writeFile(join(dir, 'try-scenario.json'), JSON.stringify(makeScenario(3)));
    const out = await exportDataset([join(dir, 'current-game.before-rework.json'), join(dir, 'try-scenario.json')], join(dir, 'dataset'));
    assert.equal(out.length, 2);
    assert.match((await readdir(join(dir, 'dataset', 'games')))[0], /-before-rework\.json$/);
    assert.deepEqual(await readdir(join(dir, 'dataset', 'worlds')), ['the-test-case.json']);
  });
});
