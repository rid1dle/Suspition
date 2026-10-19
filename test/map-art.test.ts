import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { mapArtPrompt } from '../server/prompts.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { gameInReading, FakeGM } from './fixtures.ts';

const SVG = '<svg viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#334"/></svg>';

describe('the GM draws the world map from public facts', () => {
  test('should give the drawer every place with its spot, and nothing secret', () => {
    const game = gameInReading(3);
    const { spots, input } = G.mapArtInput(game.scenario);
    assert.deepEqual(input.places.map((p: { id: string }) => p.id), ['l1', 'l2']);
    assert.deepEqual(input.places[0].at, spots.l1);
    const all = JSON.stringify(input);
    for (const secret of ['Torn glove', 'CLUE-1-SHOWS', 'TRUTH-SUMMARY', 'METHOD', 'PRIVATE-1', 'Character 1']) assert.ok(!all.includes(secret), secret);
  });

  test('should ask for a top-down map on a 1200 x 800 canvas, with no words, in the world\'s art style', () => {
    const p = mapArtPrompt(G.mapArtInput(gameInReading(3).scenario).input, 'occult-victorian');
    assert.match(p, /seen from straight above/);
    assert.match(p, /viewBox="0 0 1200 800"/);
    assert.match(p, /No words, letters or numbers anywhere/);
    assert.match(p, /Ballroom/);
  });

  test('should keep a safe drawing with its spots, and refuse an unsafe one', () => {
    const game = gameInReading(3);
    const { spots } = G.mapArtInput(game.scenario);
    assert.equal(G.mapArt(game, '<svg><script>alert(1)</script></svg>', spots), false);
    assert.equal(game.state.mapArt ?? null, null);
    assert.equal(G.mapArt(game, SVG, spots), true);
    assert.deepEqual(G.tableView(game).map.art, { svg: SVG, spots });
  });
});

describe('the app draws the map while everyone reads', () => {
  test('should draw the map once the world is made', async () => {
    const seen: unknown[] = [];
    class GM2 extends FakeGM { drawMap(_g: unknown, opts: unknown) { seen.push(opts); return Promise.resolve({ svg: SVG }); } }
    const app = await new App({ gm: new GM2(), store: new MemoryStore(), clock: () => 1_000 }).init();
    for (const name of ['Asha', 'Bo', 'Cy']) await app.join({ name });
    await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
    await app.idle();
    assert.equal(app.game.state.mapArt.svg, SVG);
    assert.ok((seen[0] as { input: { places: unknown[] } }).input.places.length > 0);
  });

  test('should keep the plain map when the drawing fails', async () => {
    class GM3 extends FakeGM { drawMap() { return Promise.reject(new Error('no')); } }
    const app = await new App({ gm: new GM3(), store: new MemoryStore(), clock: () => 1_000 }).init();
    for (const name of ['Asha', 'Bo', 'Cy']) await app.join({ name });
    await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
    await app.idle();
    assert.equal(app.game.state.mapArt ?? null, null);
    assert.equal(app.game.status, 'reading');
  });
});
