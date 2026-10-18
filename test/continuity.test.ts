import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import * as G from '../server/game.ts';
import { applyContinuity, continuityPrompt, CANON_MAX } from '../server/continuity.ts';
import { CONTINUITY_SCHEMA, ASK_SCHEMA, playSystem, publicSystem } from '../server/prompts.ts';
import { GM } from '../server/gm.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { FakeGM, gameInReading, emptyAsk } from './fixtures.ts';

const empty = { problems: [], canon_add: [], corrections: [], patches: [], solvable: true, missing: [] };
const playing = () => {
  const game = gameInReading(4, 1_000, { questions: true });
  G.startPlay(game, 1_000);
  return game;
};

async function appPlaying(gm = new FakeGM()) {
  let now = 1_000;
  const logs = [];
  const app = await new App({ gm, store: new MemoryStore(), clock: () => now, log: (l) => logs.push(l) }).init();
  const tokens = [];
  for (let i = 0; i < 3; i += 1) tokens.push(await app.join({ name: `P${i + 1}` }));
  await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2, roundStyle: 'classic', questions: 6 });
  await app.idle();
  await app.start(app.game.hostToken);
  await app.idle();
  return { app, gm, tokens, logs, tick: (ms) => (now += ms) };
}

describe('continuity during play', () => {
  test('should run at a round change, after 8 answers and before the final vote, one at a time', async () => {
    const ctx = await appPlaying();
    const { app, gm, tokens } = ctx;
    for (let i = 0; i < 7; i += 1) {
      await app.ask(tokens[i % 3], { kind: 'question', text: `Question ${i}` });
      await app.idle();
    }
    assert.deepEqual(gm.checks, []);
    await app.ask(tokens[0], { kind: 'question', text: 'Question 8' });
    await app.idle();
    assert.deepEqual(gm.checks, ['answers']);

    let release;
    gm.continuityGate = new Promise((r) => (release = r));
    app.advance();
    await new Promise((r) => setTimeout(r, 5));
    app.checkContinuity(app.game, 'answers');
    await new Promise((r) => setTimeout(r, 5));
    assert.deepEqual(gm.checks, ['answers', 'round'], 'a second trigger waits for the running check');
    release();
    await app.idle();
    gm.continuityGate = null;
    assert.equal(app.game.state.phaseIndex, 1);

    app.advance();
    await app.idle();
    app.advance();
    await app.idle();
    assert.equal(app.game.status, 'final');
    assert.equal(gm.checks.at(-1), 'final');
  });

  test('should add canon that later GM prompts carry', () => {
    const game = playing();
    const out = applyContinuity(game, { ...empty, canon_add: [{ fact: 'The generator door was locked at 11:10.', about: ['n1', 'zz'], public: true }, { fact: 'Only Player2 heard the bell.', about: ['p2'], public: false }] }, 2_000);
    assert.equal(out.canon, 2);
    assert.deepEqual(game.state.canon[0], { fact: 'The generator door was locked at 11:10.', about: ['n1'], public: true, round: 1, at: 2_000 });
    assert.deepEqual(G.snapshotForGM(game).canon.map((c) => c.fact), ['The generator door was locked at 11:10.', 'Only Player2 heard the bell.']);
    assert.deepEqual(G.publicKnowledge(game).canon, ['The generator door was locked at 11:10.']);
    for (const system of [playSystem(game.scenario), publicSystem(G.publicKnowledge(game))]) {
      assert.match(system, /Established facts \(canon\) are true; never contradict them\./);
    }
  });

  test('should keep canon to 60 facts, merging the oldest', () => {
    const game = playing();
    applyContinuity(game, { ...empty, canon_add: Array.from({ length: 62 }, (_, i) => ({ fact: `Fact ${i}.`, about: [], public: true })) }, 2_000);
    assert.equal(CANON_MAX, 60);
    assert.equal(game.state.canon.length, 60);
    assert.match(game.state.canon[0].fact, /^Fact 0\. Fact 1\. Fact 2\.$/);
    assert.equal(game.state.canon.at(-1).fact, 'Fact 61.');
  });

  test("should send a correction as a GM character's ripple or whisper, never in a player's voice", () => {
    const game = playing();
    const out = applyContinuity(game, { ...empty, corrections: [
      { to: 'table', speaker: 'n1', text: 'I had the time wrong. It was 11:40, not 11.' },
      { to: 'p2', speaker: 'n2', text: 'I saw the lamp move. Player3 says she saw it too.' },
      { to: 'table', speaker: 'p3', text: 'I lied about the shed.' },
      { to: 'p9', speaker: 'n1', text: 'Nobody gets this.' },
    ] }, 2_000);
    assert.equal(out.corrections, 2);
    const ripple = game.state.events.filter((e) => e.kind === 'ripple').at(-1);
    assert.equal(ripple.text, 'The Butler: "I had the time wrong. It was 11:40, not 11."');
    assert.deepEqual(game.state.threads.p2.at(-1), { from: 'whisper', text: 'The Widow: "I saw the lamp move."', at: 2_000 });
    assert.ok(!JSON.stringify(game.state.events).includes('I lied about the shed'));
  });

  test('should patch only future fields and skip the rest', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'search' });
    G.completeAsk(game, 'p2', { ...emptyAsk, clues_found: ['c1'] });
    game.state.hintCursor = 1;
    const out = applyContinuity(game, { ...empty, patches: [
      { path: 'phases.1.question', value: 'Who moved the lamp?' },
      { path: 'phases.2.options', value: '["A", "B", "C"]' },
      { path: 'phases.0.question', value: 'Changed now?' },
      { path: 'truth.culprit_ids', value: '["p2"]' },
      { path: 'clues.0.shows', value: 'Found already' },
      { path: 'clues.1.reveal_round', value: '3' },
      { path: 'hint_ladder.0.text', value: 'Used already' },
      { path: 'hint_ladder.2.text', value: 'A new hint.' },
      { path: 'npcs.0.knows', value: 'He saw the lamp move.' },
      { path: 'npcs.0.secrets', value: 'Nope' },
    ] }, 2_000);
    const sc = game.scenario;
    assert.equal(out.applied, 5);
    assert.equal(sc.phases[1].question, 'Who moved the lamp?');
    assert.deepEqual(sc.phases[2].options, ['A', 'B', 'C']);
    assert.equal(sc.phases[0].question, 'QUESTION-1');
    assert.deepEqual(sc.truth.culprit_ids, ['p1']);
    assert.equal(sc.clues[0].shows, 'CLUE-1-SHOWS');
    assert.equal(sc.clues[1].reveal_round, 3);
    assert.equal(sc.hint_ladder[0].text, 'HINT-1');
    assert.equal(sc.hint_ladder[2].text, 'A new hint.');
    assert.equal(sc.npcs[0].knows, 'He saw the lamp move.');
    assert.equal(sc.npcs[0].secrets, 'NPC-SECRET');
    assert.equal(out.skipped.length, 5);
  });

  test('should add a backup clue when an essential clue was destroyed', () => {
    const game = playing();
    const backup = { path: 'clues.+', value: JSON.stringify({ replaces: 'c1', name: 'Glove print', where: 'l2', shows: 'A wet glove print on the sill.', does_not_prove: '', reveal_round: 1 }) };
    assert.equal(applyContinuity(game, { ...empty, patches: [backup] }, 2_000).applied, 0, 'nothing was destroyed yet');
    game.state.destroyed.push('c1');
    assert.equal(applyContinuity(game, { ...empty, patches: [backup] }, 3_000).applied, 1);
    const added = game.scenario.clues.at(-1);
    assert.equal(added.id, 'c4');
    assert.equal(added.importance, 'essential');
    assert.equal(added.can_be_destroyed, false);
    assert.equal(added.reveal_round, 1);
    assert.ok(game.scenario.key_deductions.filter((k) => k.clue_ids.includes('c1')).every((k) => k.clue_ids.includes('c4')));
    assert.equal(applyContinuity(game, { ...empty, patches: [backup] }, 4_000).applied, 0, 'one backup per destroyed clue');
  });

  test('should change nothing when the check fails or times out', async () => {
    const gm = new FakeGM();
    const ctx = await appPlaying(gm);
    gm.continuityFail = true;
    const before = JSON.stringify(ctx.app.game.scenario);
    await ctx.app.checkContinuity(ctx.app.game, 'answers');
    assert.equal(JSON.stringify(ctx.app.game.scenario), before);
    assert.equal(ctx.app.game.state.continuity.lastAt, 0);
    assert.ok(ctx.logs.some((l) => /^gm continuity \(answers\) skipped/.test(l)));
  });

  test('should log what each check found and fixed, never the facts', async () => {
    const gm = new FakeGM();
    gm.continuityResult = { ...empty, problems: [{ what: 'Two times for the bell', kind: 'contradiction' }], canon_add: [{ fact: 'SECRET-CANON', about: [], public: false }] };
    const ctx = await appPlaying(gm);
    await ctx.app.checkContinuity(ctx.app.game, 'answers');
    const line = ctx.logs.find((l) => l.startsWith('gm continuity (answers):'));
    assert.equal(line, 'gm continuity (answers): 1 problems (contradiction 1), 1 canon, 0 corrections, 0 patches, 0 skipped');
    assert.ok(!ctx.logs.join('\n').includes('SECRET-CANON'));
    assert.equal(ctx.app.game.state.continuity.log.at(-1).reason, 'answers');
  });

  test('should hand the GM the truth, the plan to come, canon and only what was said since the last check', () => {
    const game = playing();
    game.state.events.push({ at: 1_500, phase: 0, kind: 'event', text: 'OLD-EVENT' });
    game.state.continuity = { lastAt: 1_600, answers: 0, log: [] };
    game.state.events.push({ at: 1_700, phase: 0, kind: 'event', text: 'NEW-EVENT' });
    game.state.threads.p2.push({ from: 'gm', text: 'NEW-ANSWER', at: 1_800 });
    applyContinuity(game, { ...empty, canon_add: [{ fact: 'CANON-FACT', about: [], public: true }] }, 1_650);
    const prompt = continuityPrompt(game);
    assert.match(prompt, /^You keep a mystery whole while it is played\./);
    for (const s of ['TRUTH-SUMMARY', 'CANON-FACT', 'NEW-EVENT', 'NEW-ANSWER', 'QUESTION-2']) assert.ok(prompt.includes(s), s);
    assert.ok(!prompt.includes('OLD-EVENT'));
    assert.ok(!prompt.includes('"QUESTION-1"'), 'the current round is not part of the plan to come');
  });

  test('should keep its own GM slot', async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const gm = new GM({ workDir: tmpdir(), maxParallel: 1, run: async ({ schema }) => {
      if (schema === CONTINUITY_SCHEMA) await gate;
      return schema === ASK_SCHEMA ? emptyAsk : empty;
    } });
    const game = playing();
    const check = gm.continuity(game);
    const answer = await gm.answer(game, 'p2', { kind: 'question', text: 'hi' });
    assert.equal(answer.answer, 'An answer.');
    release();
    await check;
  });
});
