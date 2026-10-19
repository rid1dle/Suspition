import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as G from '../server/game.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { composePrompt, SOUNDTRACK_SCHEMA } from '../server/prompts.ts';
import { musicPool } from '../src/lib/soundtrack/pool.ts';
import { FIXTURE } from '../src/lib/soundtrack/fixture.ts';
import { openDb } from '../src/db/index.ts';
import { gameInReading, FakeGM } from './fixtures.ts';

const dir = (name: string, lead = 'piano', mode = 'major') => ({ ...FIXTURE.directions[0], name, lead, mode });
const past = (chosen: string, switched = false, others = ['Other A', 'Other B']) => ({ directions: [dir(chosen), ...others.map((o) => dir(o))], chosen: 0, switched });

describe('the music pool', () => {
  test('should put the music the room switched to first, then the hand-made favourites, then what played', () => {
    const pool = musicPool([past('Played One'), past('Switched To', true)], FIXTURE.directions);
    assert.equal(pool.favourites[0].name, 'Switched To');
    assert.ok(pool.favourites.some((d) => d.name === FIXTURE.directions[0].name));
    assert.ok(pool.favourites.length <= 3);
  });

  test('should keep only what makes a direction sound like itself, not its whole score', () => {
    const fav = musicPool([], FIXTURE.directions).favourites[0];
    assert.deepEqual(Object.keys(fav).sort(), ['bass', 'harmony', 'kit', 'lead', 'line', 'mode', 'name', 'root', 'tempo', 'texture']);
  });

  test('should list what played in the last games so the GM never repeats it', () => {
    const pool = musicPool([past('Night One'), past('Night Two'), past('Night Three')], FIXTURE.directions);
    assert.deepEqual(pool.recent.map((r) => r.name), ['Night One', 'Night Two', 'Night Three']);
    assert.equal(musicPool(Array.from({ length: 12 }, (_, i) => past(`G${i}`)), []).recent.length, 6);
  });

  test('should work with no past games at all', () => {
    const pool = musicPool([], FIXTURE.directions);
    assert.equal(pool.favourites.length, 3);
    assert.deepEqual(pool.recent, []);
  });
});

describe('the GM composes from the pool and picks the best fit itself', () => {
  test('should give the composer the world look, the favourites to learn from and what not to repeat', () => {
    const game = gameInReading(4);
    game.scenario.room = { seed_color: '#3a5f8a', font_pair: 'old-typewriter', texture: 'rain-glass', ambient: 'rain', intensity: 'low', sound_set: 'tense' };
    const prompt = composePrompt(game, musicPool([past('Old Night')], FIXTURE.directions));
    assert.match(prompt, /THE LOOK OF THIS WORLD/);
    assert.match(prompt, /rain/);
    assert.match(prompt, /FAVOURITES[\s\S]*Warm Lamplight/);
    assert.match(prompt, /PLAYED RECENTLY[\s\S]*Old Night/);
    assert.match(prompt, /never copy them/);
    assert.match(prompt, /best: the index \(0 to 2\) of the direction that fits this world best/);
  });

  test('should ask the GM for the best direction and why', () => {
    assert.ok(SOUNDTRACK_SCHEMA.properties.best);
    assert.ok(SOUNDTRACK_SCHEMA.properties.why);
  });

  test('should play the direction the GM picked, even when another direction was dropped', () => {
    const game = gameInReading(3);
    const raw = { directions: [{ name: 'broken' }, dir('Second'), dir('Third')], best: 2, why: 'Fits the rain.' };
    G.applySoundtrack(game, raw);
    assert.equal(game.state.soundtrack.directions[game.state.soundtrack.chosen].name, 'Third');
    assert.equal(game.state.soundtrack.why, 'Fits the rain.');
  });

  test('should remember when the host switched away from the GM pick', () => {
    const game = gameInReading(3);
    G.applySoundtrack(game, { directions: [dir('A'), dir('B'), dir('C')], best: 0 });
    assert.ok(!game.state.soundtrack.switched);
    G.pickSoundtrack(game, 1);
    assert.equal(game.state.soundtrack.switched, true);
  });

  test('should hand the composer the pool from past real games', async () => {
    const seen: unknown[] = [];
    class GM2 extends FakeGM { compose(_game: unknown, pool: unknown) { seen.push(pool); return Promise.resolve({ directions: [dir('A'), dir('B'), dir('C')], best: 1 }); } }
    const library = { musicPool: () => [past('Before')] };
    const app = await new App({ gm: new GM2(), store: new MemoryStore(), clock: () => 1_000, library }).init();
    for (const name of ['Asha', 'Bo', 'Cy']) await app.join({ name });
    await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
    await app.idle();
    const pool = seen[0] as { recent: { name: string }[] };
    assert.equal(pool.recent[0].name, 'Before');
    assert.equal(app.game.state.soundtrack.chosen, 1);
  });
});

describe('the game database keeps the music that played', () => {
  test('should return the soundtracks of past real games, newest first, never playtests', async () => {
    const db = openDb(join(await mkdtemp(join(tmpdir(), 'pool-')), 'suspition.db'));
    const make = (name: string, at: number, learning = 'real') => {
      const game = gameInReading(3);
      game.id = `g-${name}`;
      game.createdAt = at;
      game.learning = learning;
      G.applySoundtrack(game, { directions: [dir(name), dir('x'), dir('y')], best: 0 });
      db.saveGame(game, at);
    };
    make('Older', 1_000);
    make('Newer', 2_000);
    make('Test only', 3_000, 'playtest');
    const pool = db.musicPool(10);
    assert.deepEqual(pool.map((p: { directions: { name: string }[]; chosen: number }) => p.directions[p.chosen].name), ['Newer', 'Older']);
    db.close();
  });
});

describe('the briefing shows the GM pick, with Change folded away', () => {
  test('should show what plays and why, and keep the list under Change', async () => {
    const React = (await import('react')).default;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { MusicPicker } = await import('../src/components/game/music-picker.tsx');
    const soundtrack = { status: 'ready', directions: [dir('Rain Strings'), dir('Lantern Piano'), dir('Tin Drums')], chosen: 1, why: 'Soft, like the fog.' };
    const html = renderToStaticMarkup(React.createElement(MusicPicker, { soundtrack, host: true, previewing: null, onListen: () => {}, onPick: () => {} } as never));
    const head = html.split('<details')[0];
    assert.match(head, /Lantern Piano/);
    assert.match(head, /Soft, like the fog\./);
    assert.match(html, /<details[^>]*>\s*<summary[^>]*>Change/);
  });
});
