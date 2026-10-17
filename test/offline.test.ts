import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { currentGame } from '../scripts/offline.ts';
import { openDb } from '../src/db/index.ts';
import { gameInReading } from './fixtures.ts';

describe('repair scripts find the live game', () => {
  test('should load and save the current game in the database, keeping a backup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'offline-'));
    const db = openDb(join(dir, 'suspition.db'));
    const game = gameInReading(3);
    db.saveGame(game);
    db.setCurrent(game.id);
    db.close();
    const current = await currentGame(null, { dataDir: dir });
    const loaded = await current.load();
    assert.equal(loaded.id, game.id);
    loaded.scenario.title = 'Fixed';
    const backup = await current.save(loaded, 'fix-cards');
    current.close();
    assert.equal(JSON.parse(await readFile(backup, 'utf8')).scenario.title, 'The Test Case');
    const again = openDb(join(dir, 'suspition.db'));
    assert.equal(again.loadCurrent().scenario.title, 'Fixed');
    again.close();
  });

  test('should still work on a game file given by path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'offline-'));
    const file = join(dir, 'old.json');
    await writeFile(file, JSON.stringify(gameInReading(3)));
    const current = await currentGame(file);
    const g = await current.load();
    g.note = 'x';
    await current.save(g, 'rework');
    assert.equal(JSON.parse(await readFile(file, 'utf8')).note, 'x');
    assert.ok(JSON.parse(await readFile(join(dir, 'old.before-rework.json'), 'utf8')));
  });
});
