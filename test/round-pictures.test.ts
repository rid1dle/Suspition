import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import * as G from '../server/game.ts';
import { roundPicturePrompt } from '../server/prompts.ts';
import { resolveStyle } from '../src/lib/art-styles.ts';
import { FakeGM, gameInReading, emptyPhase } from './fixtures.ts';

const SVG = (n: number) => ({ svg: `<svg viewBox="0 0 10 10"><rect width="${n}" height="10"/></svg>` });

async function playingApp(artStyle = 'moody-flat') {
  const gm = new FakeGM();
  const styles: (string | undefined)[] = [];
  let n = 0;
  gm.illustrate = function (_game: unknown, opts: { style?: string } = {}) {
    styles.push(opts.style);
    n += 1;
    return this.step('illustrate', SVG(n));
  };
  const app = await new App({ gm, store: new MemoryStore() }).init();
  for (const name of ['A', 'B', 'C']) await app.join({ name });
  await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2, artStyle });
  await app.idle();
  await app.start(app.game.hostToken);
  await app.idle();
  return { app, gm, styles };
}

describe('a picture for every round', () => {
  test('should build the round picture prompt from public facts only', () => {
    const game = gameInReading(3, 1_000);
    G.startPlay(game, 1_000);
    G.completePhase(game, { ...emptyPhase, public_event: 'The lights go out in the ballroom.' }, 5_000);
    const prompt = roundPicturePrompt(game);
    assert.match(prompt, /Phase name 2/);
    assert.match(prompt, /The lights go out in the ballroom\./);
    assert.match(prompt, /Draw a symbol of this round: an object or a place that stands for it\. No people, no faces, nothing that shows who did it or how\./);
    for (const secret of ['BEAT-', 'TRUTH-SUMMARY', 'METHOD', 'MOTIVE', 'PRIVATE-', 'CLUE-1-SHOWS', 'CLUE-2-SHOWS']) assert.ok(!prompt.includes(secret), `no "${secret}"`);
  });

  test("should store the round's picture and show it on the table for that round only", async () => {
    const { app } = await playingApp();
    const first = app.tableView().picture;
    assert.ok(first?.startsWith('<svg'), 'round 1 has a picture');
    assert.notEqual(first, app.tableView().illustration, 'not the scene picture');
    await app.nextPhase(app.game.hostToken);
    await app.idle();
    const second = app.tableView().picture;
    assert.ok(second && second !== first, 'round 2 has its own picture');
    assert.equal(G.playerView(app.game, 'p1').picture, undefined, 'phones do not get it');
  });

  test('should keep the scene picture when the round picture fails', async () => {
    const gm = new FakeGM();
    const app = await new App({ gm, store: new MemoryStore() }).init();
    for (const name of ['A', 'B', 'C']) await app.join({ name });
    await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
    await app.idle();
    gm.fail.illustrate = true;
    await app.start(app.game.hostToken);
    await app.idle();
    assert.equal(app.tableView().picture, null);
    assert.ok(app.tableView().illustration, 'the scene picture stays');
  });

  test('should use the next Mix style for each round', async () => {
    const { app, styles } = await playingApp('mix');
    await app.nextPhase(app.game.hostToken);
    await app.idle();
    const id = app.game.id;
    assert.deepEqual(styles, [0, 1, 2].map((i) => resolveStyle('mix', id, i)), 'scene, round 1, round 2');
  });

  test('should not draw a round picture for a replayed round twice', async () => {
    const { app, gm } = await playingApp();
    const before = gm.calls.filter((c) => c === 'illustrate').length;
    await app.drawRound(app.game);
    await app.idle();
    assert.equal(gm.calls.filter((c) => c === 'illustrate').length, before, 'no second picture for the same round');
  });
});
