import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { App } from '../server/app.js';
import { MemoryStore } from '../server/store.js';
import { FakeGM } from './fixtures.js';

async function setupApp({ players = 3, gm = new FakeGM() } = {}) {
  let now = 1_000;
  const app = await new App({ gm, store: new MemoryStore(), clock: () => now }).init();
  const host = app.game.hostToken;
  const tokens = [];
  for (let i = 0; i < players; i += 1) tokens.push(await app.join({ name: `P${i + 1}` }));
  return { app, gm, host, tokens, advanceClock: (ms) => (now += ms), now: () => now };
}

async function toPlaying(ctx) {
  await ctx.app.setup(ctx.host, { tone: 'tense', length: 'short', hints: 2 });
  await ctx.app.idle();
  await ctx.app.start(ctx.host);
}

describe('App', () => {
  test('should write the world in the background and move to reading', async () => {
    const ctx = await setupApp();
    let release;
    ctx.gm.gate = new Promise((r) => (release = r));
    await ctx.app.setup(ctx.host, { tone: 'cozy', length: 'short', hints: 2 });
    assert.equal(ctx.app.game.status, 'generating');
    release();
    await ctx.app.idle();
    assert.equal(ctx.app.game.status, 'reading');
    assert.equal(ctx.app.playerView(ctx.tokens[0]).card.private_info, 'PRIVATE-1');
  });

  test('should mark the game failed with a reason when generation fails, and allow a retry', async () => {
    const ctx = await setupApp();
    ctx.gm.fail.generate = true;
    await ctx.app.setup(ctx.host, { tone: 'cozy', length: 'short', hints: 2 });
    await ctx.app.idle();
    assert.equal(ctx.app.game.status, 'failed');
    assert.match(ctx.app.game.error, /fake generate failure/);
    ctx.gm.fail.generate = false;
    await ctx.app.setup(ctx.host, { tone: 'cozy', length: 'short', hints: 2 });
    await ctx.app.idle();
    assert.equal(ctx.app.game.status, 'reading');
  });

  test('should refuse host actions without the host token', async () => {
    const ctx = await setupApp();
    await assert.rejects(() => ctx.app.setup('wrong', { tone: 'cozy', length: 'short', hints: 2 }), /table screen/);
    await assert.rejects(() => ctx.app.newGame(ctx.tokens[0]), /table screen/);
  });

  test('should answer a question and put it in that player thread only', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    let release;
    ctx.gm.gate = new Promise((r) => (release = r));
    await ctx.app.ask(ctx.tokens[1], { kind: 'question', text: 'Where were you?' });
    assert.deepEqual(ctx.app.playerView(ctx.tokens[1]).pending, { kind: 'question', text: 'Where were you?' });
    release();
    await ctx.app.idle();
    const thread = ctx.app.playerView(ctx.tokens[1]).thread;
    assert.deepEqual(thread.map((m) => m.from), ['you', 'gm']);
    assert.deepEqual(ctx.app.playerView(ctx.tokens[2]).thread, []);
  });

  test('should refund the question and say so when the GM fails to answer', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    ctx.gm.fail.answer = true;
    await ctx.app.ask(ctx.tokens[0], { kind: 'question', text: 'Hello?' });
    await ctx.app.idle();
    const view = ctx.app.playerView(ctx.tokens[0]);
    assert.equal(view.questionsLeft, 3);
    assert.equal(view.pending, null);
    assert.match(view.thread.at(-1).text, /could not answer/);
  });

  test('should wait for answers in flight before changing phase', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    let release;
    ctx.gm.gate = new Promise((r) => (release = r));
    await ctx.app.ask(ctx.tokens[0], { kind: 'question', text: 'q' });
    await ctx.app.nextPhase(ctx.host);
    assert.equal(ctx.app.game.state.transitioning, true);
    release();
    ctx.gm.gate = null;
    await ctx.app.idle();
    assert.deepEqual(ctx.gm.calls.slice(-2), ['answer', 'phase']);
    assert.equal(ctx.app.game.state.phaseIndex, 1);
    assert.equal(ctx.app.game.state.transitioning, false);
  });

  test('should keep the phase and show an error when the phase change fails', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    ctx.gm.fail.phase = true;
    await ctx.app.nextPhase(ctx.host);
    await ctx.app.idle();
    assert.equal(ctx.app.game.state.phaseIndex, 0);
    assert.equal(ctx.app.game.state.transitioning, false);
    assert.match(ctx.app.tableView().error, /could not move/);
  });

  test('should advance the phase by itself when the timer runs out', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    ctx.advanceClock(10 * 60_000 + 1);
    await ctx.app.tick();
    await ctx.app.idle();
    assert.equal(ctx.app.game.state.phaseIndex, 1);
  });

  test('should go to the final reconstruction without a GM call after the last phase', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    for (let i = 0; i < 3; i += 1) {
      await ctx.app.nextPhase(ctx.host);
      await ctx.app.idle();
    }
    assert.equal(ctx.app.game.status, 'final');
    assert.equal(ctx.gm.calls.filter((c) => c === 'phase').length, 2);
  });

  test('should reveal automatically once everyone has submitted', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    ctx.app.game.status = 'final';
    for (const t of ctx.tokens) await ctx.app.submit(t, { culprit_ids: ['p1'] });
    await ctx.app.idle();
    const table = ctx.app.tableView();
    assert.equal(table.status, 'reveal');
    assert.equal(table.reveal.verdict.winner, 'investigators');
    assert.equal(table.reveal.reveal_story, 'STORY');
  });

  test('should let the host reveal early, but not before anyone has answered', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    ctx.app.game.status = 'final';
    await assert.rejects(() => ctx.app.finish(ctx.host), /Nobody has submitted/);
    await ctx.app.submit(ctx.tokens[0], { culprit_ids: ['n1'] });
    await ctx.app.finish(ctx.host);
    await ctx.app.idle();
    assert.equal(ctx.app.tableView().reveal.verdict.winner, 'culprits');
  });

  test('should resume a saved game after a restart, clearing work that was in flight', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    ctx.app.game.state.pending.p1 = { kind: 'question', text: 'q' };
    ctx.app.game.state.transitioning = true;
    await ctx.app.changed();
    const restarted = await new App({ gm: new FakeGM(), store: ctx.app.store }).init();
    assert.equal(restarted.game.status, 'playing');
    assert.deepEqual(restarted.game.state.pending, {});
    assert.equal(restarted.game.state.transitioning, false);
    assert.equal(restarted.playerView(ctx.tokens[0]).me.name, 'P1');
  });

  test('should mark an interrupted world generation as failed after a restart', async () => {
    const ctx = await setupApp();
    ctx.gm.gate = new Promise(() => {});
    await ctx.app.setup(ctx.host, { tone: 'cozy', length: 'short', hints: 2 });
    const restarted = await new App({ gm: new FakeGM(), store: ctx.app.store }).init();
    assert.equal(restarted.game.status, 'failed');
  });

  test('should forget old players when a new game starts', async () => {
    const ctx = await setupApp();
    const host = await ctx.app.newGame(ctx.host);
    assert.notEqual(host, ctx.host);
    assert.throws(() => ctx.app.playerView(ctx.tokens[0]), /Unknown player/);
  });
});
