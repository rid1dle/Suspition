import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { App, RETRY_MS } from '../server/app.js';
import { MemoryStore, Store } from '../server/store.js';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  test('should show which part of the world is being written, then clear it', async () => {
    const ctx = await setupApp();
    let release;
    ctx.gm.gate = new Promise((r) => (release = r));
    ctx.gm.progressEvents = [
      { kind: 'attempt', attempt: 1 }, { kind: 'thinking' }, { kind: 'draft' },
      { kind: 'key', key: 'title' }, { kind: 'key', key: 'truth' }, { kind: 'key', key: 'players' },
      { kind: 'item', key: 'players', count: 1 }, { kind: 'item', key: 'players', count: 2 },
    ];
    await ctx.app.setup(ctx.host, { tone: 'cozy', length: 'short', hints: 2 });
    const progress = ctx.app.tableView().progress;
    assert.equal(progress.step, 'players');
    assert.deepEqual(progress.seen, ['thinking', 'scene', 'truth', 'players']);
    assert.deepEqual(progress.counts, { players: 2 });
    assert.equal(progress.steps[0].label, 'Inventing the crime');
    assert.equal(ctx.app.playerView(ctx.tokens[0]).progress.step, 'players');
    release();
    await ctx.app.idle();
    assert.equal(ctx.app.tableView().progress, null);
    assert.equal(ctx.app.game.progress, null);
  });

  test('should tick off sections in whatever order the GM writes them', async () => {
    const ctx = await setupApp();
    ctx.gm.gate = new Promise(() => {});
    ctx.gm.progressEvents = [{ kind: 'attempt', attempt: 1 }, { kind: 'draft' }, { kind: 'key', key: 'clues' }, { kind: 'key', key: 'title' }];
    await ctx.app.setup(ctx.host, { tone: 'cozy', length: 'short', hints: 2 });
    const p = ctx.app.tableView().progress;
    assert.equal(p.step, 'scene');
    assert.deepEqual(p.seen, ['thinking', 'clues', 'scene']);
  });

  test('should reset the checklist when a garbled draft is rewritten in the same call', async () => {
    const ctx = await setupApp();
    ctx.gm.gate = new Promise(() => {});
    ctx.gm.progressEvents = [{ kind: 'attempt', attempt: 1 }, { kind: 'draft' }, { kind: 'key', key: 'players' }, { kind: 'item', key: 'players', count: 3 }, { kind: 'draft' }];
    await ctx.app.setup(ctx.host, { tone: 'cozy', length: 'short', hints: 2 });
    const p = ctx.app.tableView().progress;
    assert.deepEqual([p.draft, p.step, p.seen, p.counts], [2, 'thinking', ['thinking'], {}]);
  });

  test('should start a second draft from the top when the first is rejected', async () => {
    const ctx = await setupApp();
    let release;
    ctx.gm.gate = new Promise((r) => (release = r));
    ctx.gm.progressEvents = [{ kind: 'key', key: 'clues' }, { kind: 'item', key: 'clues', count: 9 }, { kind: 'checking' }, { kind: 'attempt', attempt: 2 }];
    await ctx.app.setup(ctx.host, { tone: 'cozy', length: 'short', hints: 2 });
    const progress = ctx.app.tableView().progress;
    assert.deepEqual([progress.attempt, progress.step, progress.counts], [2, 'thinking', {}]);
    release();
    await ctx.app.idle();
  });

  test('should mark the game failed with a reason when generation fails, and allow a retry', async () => {
    const ctx = await setupApp();
    ctx.gm.fail.generate = true;
    await ctx.app.setup(ctx.host, { tone: 'cozy', length: 'short', hints: 2 });
    await ctx.app.idle();
    assert.equal(ctx.app.game.status, 'failed');
    assert.match(ctx.app.game.error, /could not write the world/);
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

describe('App under failure', () => {
  test('should wait a minute before retrying an automatic phase change that failed', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    ctx.gm.fail.phase = true;
    ctx.advanceClock(10 * 60_000 + 1);
    await ctx.app.tick();
    await ctx.app.idle();
    await ctx.app.tick();
    await ctx.app.idle();
    assert.equal(ctx.gm.calls.filter((c) => c === 'phase').length, 1);
    assert.equal(ctx.app.game.state.phaseEndsAt, ctx.now() + RETRY_MS);
    ctx.advanceClock(RETRY_MS);
    await ctx.app.tick();
    await ctx.app.idle();
    assert.equal(ctx.gm.calls.filter((c) => c === 'phase').length, 2);
  });

  test('should start a new game at once even while the world is still being written', async () => {
    const ctx = await setupApp();
    ctx.gm.gate = new Promise(() => {});
    await ctx.app.setup(ctx.host, { tone: 'cozy', length: 'short', hints: 2 });
    const host = await ctx.app.newGame(ctx.host);
    assert.equal(ctx.app.game.status, 'lobby');
    assert.equal(ctx.app.game.hostToken, host);
  });

  test('should end a game mid-phase and ignore the GM answer that arrives afterwards', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    let release;
    ctx.gm.gate = new Promise((r) => (release = r));
    await ctx.app.ask(ctx.tokens[0], { kind: 'question', text: 'q' });
    const host = await ctx.app.newGame(ctx.host);
    release();
    await ctx.app.idle();
    assert.equal(ctx.app.game.status, 'lobby');
    assert.deepEqual(ctx.app.game.players, []);
    assert.equal(ctx.app.game.hostToken, host);
    assert.throws(() => ctx.app.playerView(ctx.tokens[0]), /Unknown player/);
  });

  test('should keep raw GM error text off the shared screens', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    ctx.gm.phase = async () => {
      throw new Error('unreadable output: {"messages_to_players":[{"text":"PRIVATE WHISPER"}]}');
    };
    await ctx.app.nextPhase(ctx.host);
    await ctx.app.idle();
    const body = JSON.stringify(ctx.app.tableView());
    assert.match(ctx.app.tableView().error, /could not move to the next phase/);
    assert.ok(!body.includes('PRIVATE WHISPER'));
  });

  test('should refuse a final answer once scoring has started', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    ctx.app.game.status = 'final';
    ctx.gm.gate = new Promise(() => {});
    await ctx.app.submit(ctx.tokens[0], { culprit_ids: ['p1'] });
    await ctx.app.finish(ctx.host);
    await assert.rejects(() => ctx.app.submit(ctx.tokens[1], { culprit_ids: ['p1'] }), /already weighing/);
  });

  test('should refund a question that was waiting when the server restarted', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    ctx.gm.gate = new Promise(() => {});
    await ctx.app.ask(ctx.tokens[0], { kind: 'question', text: 'q' });
    assert.equal(ctx.app.game.state.questionsLeft.p1, 2);
    const restarted = await new App({ gm: new FakeGM(), store: ctx.app.store }).init();
    const view = restarted.playerView(ctx.tokens[0]);
    assert.equal(view.questionsLeft, 3);
    assert.match(view.thread.at(-1).text, /restarted before the GM answered/);
  });

  test('should make a phase change wait for a question sent in the same moment', async () => {
    const ctx = await setupApp();
    await toPlaying(ctx);
    let release;
    ctx.gm.gate = new Promise((r) => (release = r));
    const asking = ctx.app.ask(ctx.tokens[0], { kind: 'question', text: 'q' });
    await ctx.app.nextPhase(ctx.host);
    await asking;
    release();
    ctx.gm.gate = null;
    await ctx.app.idle();
    assert.equal(ctx.app.game.state.threads.p1.length, 2);
    assert.equal(ctx.app.game.state.phaseIndex, 1);
    assert.equal(ctx.app.game.state.questionsLeft.p1, 3);
  });
});

describe('Store', () => {
  test('should keep saving after one write fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'detective-store-'));
    const blocker = join(dir, 'not-a-dir');
    await writeFile(blocker, 'x');
    const store = new Store(join(blocker, 'inside'));
    await assert.rejects(() => store.save({ n: 1 }));
    store.dir = dir;
    store.file = join(dir, 'current-game.json');
    await store.save({ n: 2 });
    assert.deepEqual(await store.load(), { n: 2 });
  });
});
