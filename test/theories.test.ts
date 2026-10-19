import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { pendingTheory, applyTheory, theoryPrompt } from '../server/theory.ts';
import { THEORY_SCHEMA, phasePrompt } from '../server/prompts.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { gameInReading, FakeGM } from './fixtures.ts';

// Three players, round 1 asks QUESTION-1 with options A, B, C; B is right.
const voted = (choice = 2, players = 3) => {
  const game = gameInReading(players, 1_000, { questions: true, phases: 4 });
  G.startPlay(game, 1_000);
  G.beginRoundVote(game, 2_000);
  for (const p of game.players) G.voteRound(game, p.id, choice, 2_000);
  return game;
};
const fold = (over = {}) => ({ mode: 'fold', known_facts: [{ fact: 'The plate reads nothing yet.', agrees: true }, { fact: 'The log says 11:30.', agrees: true }], patches: [{ path: 'clues.1.shows', value: 'The ledger shows the gate opened at midnight.' }], canon_add: [{ fact: 'The gate opened at midnight.', about: [], public: true }], line: 'The night clerk nods. The gate did open at midnight.', lead_clue_id: '', lead_round: { name: '', objective: '', question: '', options: [], answer_index: 0 }, ...over });
const lead = (over = {}) => ({ mode: 'lead', known_facts: [{ fact: 'The plate reads 11:35.', agrees: false }], patches: [], canon_add: [], line: 'The Captain frowns at the plate. Her log says something else.', lead_clue_id: 'c2', lead_round: { name: 'The Plate Again', objective: 'Look at the ledger in the kitchen.', question: 'When did the gate open?', options: ['11:35', 'Midnight'], answer_index: 0 }, ...over });

describe('a wrong answer is the room\'s theory, not a mistake', () => {
  test('should show what the room picked with no "Not quite", and wait for the GM', () => {
    const game = voted();
    const before = game.state.suspicion;
    const last = game.state.events.at(-1).text;
    assert.equal(last, 'The group picked: C.');
    assert.doesNotMatch(last, /Not quite/);
    assert.equal(pendingTheory(game).pickedText, 'C');
    assert.equal(game.state.suspicion, before);
  });

  test('should never make a theory out of a right answer or a split vote', () => {
    assert.equal(pendingTheory(voted(1)), null);
    const game = gameInReading(4, 1_000, { questions: true });
    G.startPlay(game, 1_000);
    G.beginRoundVote(game, 2_000);
    G.voteRound(game, 'p1', 0, 2_000);
    G.voteRound(game, 'p2', 1, 2_000);
    G.resolveRoundVote(game, 2_000, true);
    assert.equal(pendingTheory(game), null);
    assert.doesNotMatch(game.state.events.at(-1).text, /Not quite/);
  });
});

describe('the GM folds a theory into the story when nothing known says otherwise', () => {
  test('should make the room\'s answer the right one, with the GM\'s line and a new fact', () => {
    const game = voted();
    const before = game.state.suspicion;
    applyTheory(game, fold(), 3_000);
    const r = game.state.roundResults.at(-1);
    assert.deepEqual([r.correct, r.theory], [true, 'folded']);
    assert.equal(game.scenario.phases[0].answer_index, 2);
    assert.equal(game.scenario.clues[1].shows, 'The ledger shows the gate opened at midnight.');
    assert.ok(game.state.canon.some((c: { fact: string }) => c.fact === 'The gate opened at midnight.'));
    assert.equal(game.state.events.at(-1).text, 'That is right! The night clerk nods. The gate did open at midnight.');
    assert.equal(game.state.suspicion, before + 10);
    assert.equal(pendingTheory(game), null);
  });

  test('should lead instead when any known fact disagrees with the theory', () => {
    const game = voted();
    applyTheory(game, fold({ known_facts: [{ fact: 'The plate reads 11:35.', agrees: false }, { fact: 'x', agrees: true }] }), 3_000);
    assert.equal(game.state.roundResults.at(-1).theory, 'led');
    assert.equal(game.scenario.phases[0].answer_index, 1);
  });

  test('should lead instead when the GM checked fewer than two known facts', () => {
    const game = voted();
    applyTheory(game, fold({ known_facts: [{ fact: 'One.', agrees: true }] }), 3_000);
    assert.equal(game.state.roundResults.at(-1).theory, 'led');
  });

  test('should never fold by changing who did it, and leave the world as it was', () => {
    const game = voted();
    const before = JSON.stringify(game.scenario);
    applyTheory(game, fold({ patches: [{ path: 'truth.culprit_ids', value: ['p2'] }] }), 3_000);
    assert.equal(game.state.roundResults.at(-1).theory, 'led');
    assert.deepEqual(game.scenario.truth.culprit_ids, ['p1']);
    assert.equal(JSON.stringify({ ...game.scenario, phases: game.scenario.phases.slice(0, 4) }).length > 0, true);
    assert.equal(game.scenario.clues[1].shows, JSON.parse(before).clues[1].shows);
  });

  test('should never fold a clue someone already found', () => {
    const game = voted();
    game.state.found.p2.push('c2');
    applyTheory(game, fold(), 3_000);
    assert.equal(game.state.roundResults.at(-1).theory, 'led');
    assert.equal(game.scenario.clues[1].shows, 'CLUE-2-SHOWS');
  });

  test('should never fold a step of the night that players already heard about', () => {
    const game = voted();
    game.scenario.truth.timeline = [{ time: '11:35 pm', event: 'Greaves opens the iron gate with his ring', location_id: 'l1', character_ids: [] }];
    game.state.events.push({ at: 2_500, phase: 0, kind: 'event', text: 'Everyone hears that Greaves opens the iron gate with his ring.' });
    applyTheory(game, fold({ patches: [{ path: 'truth.timeline.0.time', value: '12:00 am' }] }), 3_000);
    assert.equal(game.state.roundResults.at(-1).theory, 'led');
    assert.equal(game.scenario.truth.timeline[0].time, '11:35 pm');
  });

  test('should fold a hidden step of the night nobody has heard about', () => {
    const game = voted();
    game.scenario.truth.timeline = [{ time: '11:35 pm', event: 'Greaves opens the iron gate with his ring', location_id: 'l1', character_ids: [] }];
    applyTheory(game, fold({ patches: [{ path: 'truth.timeline.0.time', value: '12:00 am' }] }), 3_000);
    assert.equal(game.state.roundResults.at(-1).theory, 'folded');
    assert.equal(game.scenario.truth.timeline[0].time, '12:00 am');
  });

  test('should never fold a question whose options point at a culprit', () => {
    const game = voted();
    game.scenario.phases[0].options = ['Character 2', 'Character 3', 'Character 1'];
    applyTheory(game, fold(), 3_000);
    assert.equal(game.state.roundResults.at(-1).theory, 'led');
  });

  test('should drop a fold line that names the culprit', () => {
    const game = voted();
    applyTheory(game, fold({ line: 'Character 1 opened it at midnight.' }), 3_000);
    assert.equal(game.state.events.at(-1).text, 'That is right!');
  });
});

describe('the GM leads the room back when the theory does not fit', () => {
  test('should say a story line, not "wrong", and give the culprit a little cover', () => {
    const game = voted();
    const before = game.state.suspicion;
    applyTheory(game, lead(), 3_000);
    assert.equal(game.state.events.at(-1).text, 'The Captain frowns at the plate. Her log says something else.');
    assert.equal(game.state.suspicion, before - 10);
    assert.equal(game.state.roundResults.at(-1).theory, 'led');
  });

  test('should open the clue that shows the real answer in the next round', () => {
    const game = voted();
    game.scenario.clues[1].reveal_round = 3;
    applyTheory(game, lead(), 3_000);
    assert.equal(game.scenario.clues[1].reveal_round, 2);
  });

  test('should add the lead round right after this one, asking again', () => {
    const game = voted();
    const count = game.scenario.phases.length;
    applyTheory(game, lead(), 3_000);
    assert.equal(game.scenario.phases.length, count + 1);
    assert.equal(game.scenario.phases[1].name, 'The Plate Again');
    assert.equal(game.scenario.phases[1].question, 'When did the gate open?');
    assert.equal(game.state.roundResults.at(-1).roundAdded, true);
  });

  test('should not add a second round for the same miss when the story is paced', () => {
    const game = voted();
    applyTheory(game, lead(), 3_000);
    const count = game.scenario.phases.length;
    G.paceStory(game, 3_500);
    assert.equal(game.scenario.phases.length, count);
  });

  test('should cut a sentence of the line that tells the room what only one player\'s card says', () => {
    const game = voted();
    game.scenario.players[1].private_info = 'One hard blow to the back of the head killed him.';
    applyTheory(game, lead({ line: 'The wound shows one hard blow to the back of the head. The weight box is open.' }), 3_000);
    assert.equal(game.state.events.at(-1).text, 'The weight box is open.');
  });

  test('should tell the GM the line is seen by everyone', () => {
    assert.match(theoryPrompt(voted()), /KNOWN TO EVERYONE/);
  });

  test('should still lead with the round\'s own nudge when the GM gave nothing', () => {
    const game = voted();
    applyTheory(game, null, 3_000);
    assert.equal(game.state.events.at(-1).text, 'Something does not fit yet. NUDGE-1');
    assert.equal(game.state.roundResults.at(-1).theory, 'led');
  });
});

describe('what the GM is asked', () => {
  test('should give the theory, the true answer and the rules for folding and leading', () => {
    const game = voted();
    const p = theoryPrompt(game);
    assert.match(p, /THE ROOM'S ANSWER: C/);
    assert.match(p, /THE TRUE ANSWER \(secret\): B/);
    assert.match(p, /A player's answer is their reading of the case, not a mistake/);
    assert.match(p, /Never change who did it, how or why/);
    assert.ok(THEORY_SCHEMA.properties.known_facts);
    assert.ok(THEORY_SCHEMA.properties.lead_round);
  });

  test('should tell the next round what became of the theory', () => {
    const game = voted();
    applyTheory(game, lead(), 3_000);
    const r = game.state.roundResults.at(-1);
    const p = phasePrompt({ snapshot: {}, nextPhase: { name: 'x', planned_beat: 'y' }, lastRound: r });
    assert.match(p, /did not fit the truth/);
    assert.match(p, /never call their answer wrong/);
  });
});

describe('the app asks the GM about a theory before the next round', () => {
  const run = async (gm: FakeGM) => {
    const app = await new App({ gm, store: new MemoryStore(), clock: () => 5_000 }).init();
    for (const name of ['Asha', 'Bo', 'Cy']) await app.join({ name });
    app.game.setup = null;
    G.applySetup(app.game, { tone: 'tense', length: 'standard', hints: 2 });
    G.attachScenario(app.game, gameInReading(3, 1_000, { questions: true, phases: 4 }).scenario, 1_000);
    G.startPlay(app.game, 5_000);
    G.beginRoundVote(app.game, 5_000);
    for (const p of app.game.players) await app.voteRound(p.token, 2);
    await app.idle();
    return app;
  };

  test('should fold the theory and move on to the next round', async () => {
    class GM2 extends FakeGM { theory() { return Promise.resolve(fold()); } }
    const app = await run(new GM2());
    assert.equal(app.game.state.roundResults[0].theory, 'folded');
    assert.equal(app.game.state.phaseIndex, 1);
  });

  test('should lead and still move on when the GM cannot answer', async () => {
    class GM3 extends FakeGM { theory() { return Promise.reject(new Error('down')); } }
    const app = await run(new GM3());
    assert.equal(app.game.state.roundResults[0].theory, 'led');
    assert.equal(app.game.state.phaseIndex, 1);
  });
});
