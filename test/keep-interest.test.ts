import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { applyTheory } from '../server/theory.ts';
import { addCanon } from '../server/continuity.ts';
import { playSystem, phasePrompt } from '../server/prompts.ts';
import { gameInReading } from './fixtures.ts';

function playing(n = 3, phases = 4) {
  const game = gameInReading(n, 1_000, { phases, questions: true });
  G.startPlay(game, 2_000);
  return game;
}
const lead = (q, options) => ({ mode: 'lead', known_facts: [], patches: [], canon_add: [], line: 'Bhola frowns.', lead_clue_id: '', lead_round: { name: 'Look again', objective: 'Look at the prints.', question: q, options, answer_index: 0 } });

describe('a lead never asks the same thing again', () => {
  test('should add a lead round without its question when it offers the same answers as one already asked', () => {
    const game = playing();
    game.state.roundResults.push({ phaseIndex: 0, round: 1, question: 'QUESTION-1', picked: 0, pickedText: 'A', correct: false, theory: 'open', counts: [1, 0, 0] });
    applyTheory(game, lead('Who was too far away?', ['B', 'A', 'C']), 3_000);
    const added = game.scenario.phases.find((p) => p.name === 'Look again');
    assert.ok(added, 'the round is added to lead them back');
    assert.equal(added.question, undefined);
    assert.equal(added.objective, 'Look at the prints.');
  });

  test('should never chain a lead off a round that was itself a lead', () => {
    const game = playing();
    game.state.roundResults.push({ phaseIndex: 0, round: 1, question: 'QUESTION-1', picked: 0, pickedText: 'A', correct: false, theory: 'open', counts: [1, 0, 0] });
    applyTheory(game, lead('A sharper question?', ['X', 'Y']), 3_000);
    const at = game.scenario.phases.findIndex((p) => p.name === 'Look again');
    const count = game.scenario.phases.length;
    game.state.roundResults.push({ phaseIndex: at, round: at + 1, question: 'A sharper question?', picked: 1, pickedText: 'Y', correct: false, theory: 'open', counts: [0, 1] });
    applyTheory(game, { ...lead('Another one?', ['P', 'Q']), lead_round: { ...lead('Another one?', ['P', 'Q']).lead_round, name: 'Again' } }, 4_000);
    assert.equal(game.scenario.phases.length, count, 'no third round about the same thing');
  });
});

describe('a split vote is talked out once', () => {
  test('should reopen the vote once when everyone voted and the answers split', () => {
    const game = playing(2);
    G.beginRoundVote(game, 3_000);
    G.voteRound(game, 'p1', 0, 3_100);
    const out = G.voteRound(game, 'p2', 1, 3_200);
    assert.equal(out, null);
    assert.ok(game.state.roundVote, 'the vote is still open');
    assert.deepEqual(game.state.roundVote.votes, {});
    assert.equal(game.state.events.at(-1).text, 'You picked different answers. Talk it out, then pick again.');
  });

  test('should settle a second split as before', () => {
    const game = playing(2);
    G.beginRoundVote(game, 3_000);
    G.voteRound(game, 'p1', 0, 3_100);
    G.voteRound(game, 'p2', 1, 3_200);
    G.voteRound(game, 'p1', 0, 3_300);
    const out = G.voteRound(game, 'p2', 1, 3_400);
    assert.equal(out.picked, null);
    assert.equal(game.state.roundVote, null);
  });
});

describe('the story never talks about the game', () => {
  test('should add a round without telling the room the round count', () => {
    const game = playing();
    G.addRound(game, { name: 'The cellar', objective: 'Search it.' }, 3_000);
    assert.ok(!game.state.events.some((e) => /needs one more round/.test(e.text)));
  });

  test('should keep votes and rounds out of the settled facts', () => {
    const game = playing();
    addCanon(game, [{ fact: 'The two of you voted that nobody could be ruled out. An extra round was added.', about: [], public: true }, { fact: 'The cellar door is locked.', about: [], public: true }], 3_000);
    assert.deepEqual(game.state.canon.map((c) => c.fact), ['The cellar door is locked.']);
  });

  test('should drop a because line about a vote rather than about something someone did', () => {
    const game = playing();
    assert.equal(G.storyBecause(game, 'Because the two of you could not agree, Bhola walked the trail.'), '');
    assert.equal(G.storyBecause(game, 'Because you followed the prints, Bhola walks the trail.'), 'Because you followed the prints, Bhola walks the trail.');
  });
});

describe('the GM is told how a story holds attention', () => {
  test('should give the GM the causal chain and transportation rules', () => {
    const p = playSystem(gameInReading(3).scenario, 3);
    assert.match(p, /caused by something a player did/);
    assert.match(p, /never a dead end/i);
    assert.match(p, /never block .* more than once/i);
    assert.match(p, /never repeats/i);
    assert.match(p, /never talk about the game/i);
  });

  test('should ask the round change for a because line about what players did, and a recap that reads as a chain', () => {
    const game = playing();
    const p = phasePrompt({ snapshot: {}, nextPhase: { name: 'X', planned_beat: 'B' }, lastRound: null });
    assert.match(p, /something a player did/);
    assert.match(p, /a player who is there finds it/i);
    void game;
  });
});
