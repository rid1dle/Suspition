import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { applyContinuity } from '../server/continuity.ts';
import { cleanRead } from '../server/reader.ts';
import { FakeGM, emptyAsk, emptyPhase, gameInReading } from './fixtures.ts';

const tick = () => new Promise((r) => setTimeout(r, 5));
const read = (over = {}) => ({ kind: 'question', target: '', place: '', goes_to: '', attempt: 'P looks around', said_aloud: '', out_of_world: false, sways_gm: false, claims: [], acts: true, ...over });
const empty = { problems: [], canon_add: [], corrections: [], patches: [], offers: [], extra_rounds: [], solvable: true, missing: [] };

const playing = ({ phases = 3, round = 1, questions = true } = {}) => {
  const game = gameInReading(4, 1_000, { questions, phases });
  game.setup.replays = 0;
  G.startPlay(game, 1_000);
  for (let i = 1; i < round; i += 1) {
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 1_000 + i);
  }
  return game;
};
const spot = (game, top) => game.state.roundResults.push({ kind: 'spotlight', phaseIndex: game.state.phaseIndex, round: G.roundNumber(game), question: G.SPOTLIGHT_QUESTION, picked: Number(top.slice(1)) - 1, pickedText: top, top, line: null, correct: null, counts: [0, 0, 0, 0] });

async function app(setupOver = {}) {
  const gm = new FakeGM();
  const a = await new App({ gm, store: new MemoryStore(), clock: () => 5_000 }).init();
  const tokens = [];
  for (const name of ['Ana', 'Ben', 'Cal']) tokens.push(await a.join({ name }));
  await a.setup(a.game.hostToken, { tone: 'tense', length: 'short', hints: 2, roundStyle: 'classic', questions: 3, ...setupOver });
  await a.idle();
  return { app: a, gm, tokens };
}
async function started() {
  const t = await app();
  await t.app.start(t.app.game.hostToken);
  await t.app.idle();
  return t;
}

describe('review: pacing never tells the room who did it', () => {
  test('should pace the same whether the spotlight named a culprit or not', () => {
    for (const round of [2]) {
      const a = playing({ round });
      const b = playing({ round });
      for (const g of [a, b]) g.state.found.p2.push('c1', 'c2', 'c3');
      spot(a, 'p1');
      spot(b, 'p2');
      assert.equal(G.paceStory(a, 5_000), G.paceStory(b, 5_000));
      assert.equal(a.scenario.phases.length, b.scenario.phases.length);
    }
  });

  test('should close sooner from clues found alone, never from who the room picked', () => {
    const a = playing({ phases: 5, round: 2 });
    a.scenario.clues[1].reveal_round = 2;
    a.state.found.p2.push('c1', 'c2', 'c3');
    assert.equal(G.paceStory(a, 5_000), 'sooner');
    const b = playing({ phases: 5, round: 2 });
    b.state.found.p2.push('c1');
    spot(b, 'p1');
    b.state.roundResults.push({ ...b.state.roundResults[0], round: 1, phaseIndex: 0 });
    assert.equal(G.paceStory(b, 5_000), 'on');
  });

  test('should ignore clues for an old world whose clues have no rounds', () => {
    const g = playing({ round: 2 });
    for (const c of g.scenario.clues) delete c.reveal_round;
    g.state.roundResults.push({ phaseIndex: 1, round: 2, question: 'Q', picked: 0, pickedText: 'A', correct: true, counts: [3] });
    assert.equal(G.paceStory(g, 5_000), 'on');
  });

  test('should not add a round after the story said the next round is the last', () => {
    const g = playing({ phases: 5, round: 2 });
    g.state.found.p2.push('c1', 'c2', 'c3');
    g.scenario.clues[1].reveal_round = 2;
    assert.equal(G.paceStory(g, 5_000), 'sooner');
    assert.equal(G.addRound(g, { name: 'More' }, 6_000), false);
  });
});

describe('review: the because line and the round name', () => {
  const pickThen = (top, line) => {
    const g = playing();
    spot(g, top);
    G.beginPhaseChange(g);
    G.completePhase(g, { ...emptyPhase, because: line, round_name: `${line.split(',')[0].replace('Because the room looked at ', '')} Answers` }, 2_000);
    return g;
  };
  test('should keep the room pick in the line, culprit or not', () => {
    const c = pickThen('p1', 'Because the room looked at Character 1, the cellar is opened.');
    const i = pickThen('p2', 'Because the room looked at Character 2, the cellar is opened.');
    assert.ok(c.state.events.some((e) => e.kind === 'because'));
    assert.ok(i.state.events.some((e) => e.kind === 'because'));
    assert.equal(c.scenario.phases[1].name, 'Character 1 Answers');
    assert.equal(i.scenario.phases[1].name, 'Character 2 Answers');
  });

  test('should still drop a line that names a culprit the room did not pick', () => {
    const g = pickThen('p2', 'Because the room looked at Character 2, Character 1 hides the knife.');
    assert.ok(!g.state.events.some((e) => e.kind === 'because'));
  });
});

describe('review: going somewhere', () => {
  test('should not ask anyone to go anywhere during the briefing', async () => {
    const t = await app();
    t.gm.readResult = read({ goes_to: 'Ballroom' });
    await t.app.askPublic(t.tokens[1], 'How far is the ballroom?');
    await t.app.idle();
    assert.equal(t.app.game.state.moveConfirm?.p2, undefined);
  });

  test('should ask to go only when the reader says the character goes there', async () => {
    const t = await started();
    t.gm.readResult = read({ place: 'Ballroom', goes_to: '' });
    await t.app.askPublic(t.tokens[1], 'Who was in the ballroom at ten?');
    await t.app.idle();
    assert.equal(t.app.game.state.moveConfirm?.p2, undefined);
    assert.ok(t.app.game.state.events.some((e) => e.kind === 'qa'));
  });

  test('should answer a move the player declined where they stand', async () => {
    const t = await started();
    t.gm.readResult = read({ goes_to: 'Ballroom' });
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'I go to the ballroom and search the desk.' });
    for (let i = 0; i < 20 && !t.app.game.state.moveConfirm?.p2; i += 1) await tick();
    await t.app.confirmMove(t.tokens[1], false);
    await t.app.idle();
    assert.equal(G.currentPlace(t.app.game, 'p2'), 'l2');
    assert.ok(t.gm.calls.includes('answer'));
    assert.equal(t.app.game.state.threads.p2.at(-1).from, 'gm');
  });

  test('should ask about only one move at a time per player', async () => {
    const t = await started();
    t.gm.readResult = read({ goes_to: 'Ballroom' });
    await t.app.askPublic(t.tokens[1], 'I walk to the ballroom.');
    for (let i = 0; i < 20 && !t.app.game.state.moveConfirm?.p2; i += 1) await tick();
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'I go to the ballroom.' });
    await tick();
    await t.app.confirmMove(t.tokens[1], true);
    await t.app.idle();
    assert.equal(G.currentPlace(t.app.game, 'p2'), 'l1');
    assert.equal(t.app.game.state.moveConfirm?.p2, undefined);
    assert.ok(t.app.game.state.events.some((e) => e.kind === 'qa'));
    assert.equal(t.app.game.state.threads.p2.at(-1).from, 'gm');
  });

  test('should settle a waiting move as Not now when the round changes', async () => {
    const t = await started();
    t.gm.readResult = read({ goes_to: 'Ballroom' });
    await t.app.ask(t.tokens[1], { kind: 'chat', text: 'I go to the ballroom.' });
    for (let i = 0; i < 20 && !t.app.game.state.moveConfirm?.p2; i += 1) await tick();
    t.app.game.state.roundResults.push({ phaseIndex: 0, round: 1, question: 'Q', picked: 1, pickedText: 'B', correct: true, counts: [3] });
    t.app.game.state.found.p1.push('c1', 'c2', 'c3');
    t.app.advance();
    await t.app.idle();
    assert.equal(t.app.game.state.phaseIndex, 1);
    assert.equal(G.currentPlace(t.app.game, 'p2'), 'l2');
  });

  test('should read a whole place name, not a piece of one', () => {
    const g = playing();
    g.scenario.locations[0].name = 'Reading Room';
    assert.equal(G.placeIdFromText(g, 'room'), null);
    assert.equal(G.placeIdFromText(g, 'here'), null);
    assert.equal(G.placeIdFromText(g, 'the reading room'), 'l1');
    assert.equal(G.placeIdFromText(g, 'reading room upstairs'), 'l1');
  });

  test('should have the reader say where the character goes, apart from where it happens', () => {
    assert.equal(cleanRead({ kind: 'question', goes_to: 'Ballroom' }, 'move').goes_to, 'Ballroom');
    assert.equal(cleanRead({ kind: 'question' }, 'move').goes_to, undefined);
  });
});

describe('review: secrets of where people are', () => {
  test('should not move a finder to the secret place of the player holding the clue', () => {
    const g = playing();
    g.scenario.clues[0].where = 'p1';
    g.state.at.p1 = 'l2';
    g.state.positions.p1 = 'l1';
    g.state.at.p3 = 'l1';
    G.beginAsk(g, 'p3', { kind: 'question', text: 'I look at the coat.' });
    G.completeAsk(g, 'p3', { ...emptyAsk, clues_found: ['c1'] }, 2_000);
    assert.equal(G.currentPlace(g, 'p3'), 'l1');
  });

  test('should never show where a key object is when a player holds it', () => {
    const g = playing();
    g.scenario.key_objects = [{ name: 'Ledger', about: 'The house accounts.', where: 'p1', where_is_public: true }, { name: 'Seal', about: 'Character 1 keeps it close.', where: 'l1', where_is_public: true }];
    const view = G.keyObjectsView(g);
    assert.equal(view[0].where, null);
    assert.equal(view[1].about, '');
    assert.equal(view[1].where, 'Ballroom');
  });

  test('should give a dropped player a new link, so the old one stops working', async () => {
    const t = await started();
    const old = t.tokens[1];
    const out = t.app.rejoin(t.app.game.hostToken, 'p2', 'http://x/play');
    assert.doesNotMatch(out.url, new RegExp(old));
    assert.throws(() => t.app.playerView(old));
    assert.equal(t.app.playerView(out.url.split('#t=')[1]).me.id, 'p2');
  });
});

describe('review: story checks during play', () => {
  test('should run the round check after a check that was still running', async () => {
    const t = await started();
    let release;
    t.gm.continuityGate = new Promise((r) => (release = r));
    t.app.checkContinuity(t.app.game, 'answers');
    t.app.checkContinuity(t.app.game, 'round');
    release();
    await t.app.idle();
    t.gm.continuityGate = null;
    await t.app.idle();
    assert.deepEqual(t.gm.checks, ['answers', 'round']);
  });

  test('should drop round patches written before the rounds changed', () => {
    const g = playing({ round: 2 });
    const before = g.state.roundsVersion ?? 0;
    G.addRound(g, { name: 'Extra' }, 2_000);
    const out = applyContinuity(g, { ...empty, patches: [{ path: 'phases.2.planned_beat', value: 'OLD INDEX' }] }, 3_000, { roundsVersion: before });
    assert.equal(out.applied, 0);
    assert.notEqual(g.scenario.phases[2].planned_beat, 'OLD INDEX');
  });

  test('should send no offers or corrections once play is over', () => {
    const g = playing();
    g.status = 'final';
    const out = applyContinuity(g, { ...empty, offers: [{ player_id: 'p2', text: 'Where were you at 11?', choice: 'Shed' }], corrections: [{ to: 'table', speaker: 'n1', text: 'I had it wrong.' }] }, 2_000);
    assert.equal(out.offers, 0);
    assert.equal(out.corrections, 0);
  });
});

describe('review: smaller fixes', () => {
  test('should keep a planned quiz in classic rounds when the GM asks for a spotlight', () => {
    const g = playing();
    G.beginPhaseChange(g);
    G.completePhase(g, { ...emptyPhase, vote: { kind: 'spotlight', question: '', options: [] } }, 2_000);
    assert.equal(G.roundQuestion(g, 1).question, 'QUESTION-2');
  });

  test('should give the lead point only for naming one person', () => {
    const g = playing({ round: 2 });
    g.scenario.phases[1] = { ...g.scenario.phases[1], vote_kind: 'spotlight' };
    G.addFacts(g, [{ person: 'p4', fact: 'Said out loud: "Was it Character 3 or Character 2?"' }], 'said', 2_000);
    G.beginRoundVote(g, 3_000);
    for (const [pid, pick] of Object.entries({ p1: 2, p2: 2, p3: 1, p4: 2 })) G.voteRound(g, pid, pick, 3_100);
    assert.ok(!(g.state.play?.p4 ?? []).some((m) => m.why === 'The room followed your lead.'));
  });

  test('should match a claim to its answer by position only when the lists line up', () => {
    const g = playing();
    G.beginAsk(g, 'p2', { kind: 'question', text: 'x' });
    g.state.pending.p2.read = { claims: ['everyone trusts me', 'the guard sleeps'] };
    G.completeAsk(g, 'p2', { ...emptyAsk, claims_answer: [{ claim: 'a paraphrase', granted: true, why: '' }] }, 2_000);
    assert.equal(g.state.threads.p2.filter((m) => /^That can't happen/.test(m.text)).length, 2);
  });

  test('should write the story it became in plain lower case', () => {
    const g = playing();
    g.scenario.story_type = 'frame-up';
    g.state.storyArc = [{ round: 2, text: 'Revenge gone wrong' }];
    assert.equal(G.storyShape(g), 'This story began as a frame-up. It became a revenge gone wrong.');
  });
});
