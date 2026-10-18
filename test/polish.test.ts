import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as G from '../server/game.ts';
import { DECK, drawIdea } from '../src/lib/settings-deck.ts';
import { openDb } from '../src/db/index.ts';
import { GameLibrary } from '../src/db/library.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { particleOptions } from '../src/components/world/table-effects';
import { tensionTick } from '../src/lib/story-look.ts';
import { FakeGM, gameInReading } from './fixtures.ts';

const css = readFileSync('src/app/world.css', 'utf8');
const SVG = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';

describe('polish from the living story review', () => {
  test('should keep past world titles off the views and out of the dataset export', () => {
    const game = gameInReading(3);
    game.setup.recent = ['Old World: a dam in a flood.'];
    assert.ok(!('recent' in G.tableView(game).setup));
    assert.ok(!('recent' in G.playerView(game, 'p1').setup));
    assert.ok(!('recent' in G.forDataset(game).setup));
    assert.deepEqual(game.setup.recent, ['Old World: a dam in a flood.'], 'the server keeps them for the world prompt');
  });

  test('should read recent worlds with one query, newest 10, without playtests', async () => {
    const db = openDb(join(await mkdtemp(join(tmpdir(), 'polish-')), 'suspition.db'));
    for (let i = 0; i < 12; i += 1) {
      const g = gameInReading(3);
      g.scenario.title = `World ${i}`;
      g.scenario.setting_summary = `Place ${i}.`;
      g.createdAt = 1_000 + i;
      if (i === 11) g.learning = 'playtest';
      db.saveGame(g);
      if (i === 11) db.setLearning(g.id, 'playtest');
    }
    db.saveGame(G.createGame(5_000));
    db.loadGame = () => { throw new Error('loadGame must not be used'); };
    const out = new GameLibrary(db).recentWorlds(10);
    assert.equal(out.length, 10);
    assert.equal(out[0], 'World 10: Place 10.');
    assert.equal(out.at(-1), 'World 1: Place 1.');
    db.close();
  });

  test('should draw the idea matching only the oldest recent world when every idea matches', () => {
    const overlaps = (a, b) => a.includes(b) || b.includes(a);
    const target = DECK.find((d) => DECK.every((o) => o.id === d.id || !o.keywords.some((k) => d.keywords.some((t) => overlaps(k, t)))));
    const others = DECK.filter((d) => d.id !== target.id).flatMap((d) => d.keywords);
    const newest = `newest: ${others.join(' ')}`;
    const oldest = `oldest: ${DECK.flatMap((d) => d.keywords).join(' ')}`;
    for (const r of [0, 0.5, 0.99]) assert.equal(drawIdea([newest, oldest], () => r).id, target.id);
  });

  test('should keep the newest round picture through the final vote and the reveal', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    G.setRoundPicture(game, 1, SVG);
    G.setRoundPicture(game, 3, SVG.replace('10"/>', '9"/>'));
    game.status = 'final';
    assert.equal(G.tableView(game).picture, SVG.replace('10"/>', '9"/>'));
    game.status = 'reveal';
    assert.ok(G.roundPicture(game));
  });

  test('should draw a missing round picture after a restart mid-round', async () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    const store = new MemoryStore();
    await store.save(game);
    const gm = new FakeGM();
    const app = await new App({ gm, store, clock: () => 2_000 }).init();
    await app.idle();
    assert.ok(gm.calls.includes('illustrate'));
    assert.ok(app.game.state.roundArt?.[1]);
  });

  test('should quicken the particle effects with tension', () => {
    const calm = particleOptions('snow', '#fff', 0).particles.move.speed;
    const tense = particleOptions('snow', '#fff', 1).particles.move.speed;
    assert.deepEqual(tense, { min: calm.min * 1.5, max: calm.max * 1.5 });
    assert.equal(particleOptions('dust', '#fff', 0.5).particles.move.speed, 0.15 * 1.25);
  });

  test('should keep sparks no faster than embers', () => {
    const flickers = [...css.matchAll(/\.ambient\[data-effect='sparks'\] i[^{]*\{[^}]*animation(?:-duration)?:\s*([^;]+);/g)].map((m) => m[1]);
    assert.ok(flickers.length >= 3);
    for (const decl of flickers) {
      const flicker = decl.includes('flicker') ? decl.match(/flicker ([\d.]+)s/)[1] : decl.split(',')[1].trim().replace('s', '');
      assert.ok(Number(flicker) >= 1.7, `sparks flicker at ${flicker}s`);
    }
  });

  test('should fade the vignette with opacity, not gradient steps', () => {
    assert.ok(!/\.story-edge \{[^}]*--tension/.test(css), 'the edge layer has no stepped gradient');
    const rule = css.match(/\.story-vignette \{[^}]*\}/)[0];
    const background = rule.match(/background:[^;]*;/)[0];
    assert.ok(!background.includes('--tension'), 'the gradient itself is fixed');
    assert.match(rule, /opacity: calc\([^)]*var\(--tension/);
    assert.match(rule, /transition: opacity/);
  });

  test('should re-render the room only when the tension value changes', () => {
    const view = { status: 'playing', suspicion: 40 };
    const first = tensionTick(0, view, 1_000);
    assert.equal(tensionTick(first, view, 6_000), first);
    assert.equal(tensionTick(0.95, null, 6_000), 0);
  });
});
