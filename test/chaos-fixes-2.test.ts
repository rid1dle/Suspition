import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { playSystem, publicSystem, phasePrompt, scorePrompt, GENERATION_SYSTEM } from '../server/prompts.ts';
import { readerSystem } from '../server/reader.ts';
import { gameInReading, makeScenario, emptyPhase } from './fixtures.ts';

// Fixes from the second 10-player chaos playtest (2026-10-20).
describe('the story never counts rounds', () => {
  test('should drop a sentence that counts the game rounds and keep the rest', () => {
    assert.equal(G.withoutRoundTalk('Nobody skips anything. This is the first round of four. Sit down.'), 'Nobody skips anything. Sit down.');
    assert.equal(G.withoutRoundTalk('Two rounds left, sahib.'), '');
    assert.equal(G.withoutRoundTalk('He bought a round of drinks at nine.'), 'He bought a round of drinks at nine.');
  });

  test('should clean round talk out of a GM reply to a player', () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    const lines = G.novelLines(game, [{ speaker: 'n1', text: 'This is round 1 of 4. Nobody skips anything.' }]);
    assert.deepEqual(lines.map((l) => l.text), ['Nobody skips anything.']);
  });
});

describe('a goal met in play stays met', () => {
  test('should count a goal whose last step was done in play, even if the scorer said no', () => {
    const game = gameInReading(3);
    game.scenario.players[1].goal_steps = ['Find the seam.', 'Show the Colonel the cut seam.'];
    G.startPlay(game, 1_000);
    game.state.goalSteps = { p2: [1] };
    G.applyScore(game, { correct_player_ids: [], winner: 'culprits' }, { reveal_story: 'x', players: [{ player_id: 'p2', goal_achieved: false }, { player_id: 'p3', goal_achieved: false }] });
    const r = Object.fromEntries(game.state.result.players.map((p) => [p.player_id, p.goal_achieved]));
    assert.equal(r.p2, true);
    assert.equal(r.p3, false);
  });

  test('should tell the scorer a goal met before a change still counts', () => {
    assert.match(scorePrompt({ snapshot: {}, submissions: [], verdict: {} }), /A goal met in play stays met/);
  });
});

describe('the round change keeps the mystery open', () => {
  function playing() {
    const game = gameInReading(4, 1_000, { phases: 3 });
    G.startPlay(game, 1_000);
    return game;
  }

  test('should put an unseen red herring in reach before the last round, and not once it is found', () => {
    const game = playing();
    const next = G.nextPhaseInfo(game);
    assert.deepEqual(next.herrings, ['Note']);
    assert.match(phasePrompt({ snapshot: {}, nextPhase: next, lastRound: null }), /Red herrings nobody has met yet[^]*Note/);
    game.state.found.p2.push('c3');
    assert.equal('herrings' in G.nextPhaseInfo(game), false);
  });

  test('should let a broken liar give way in the last round', () => {
    const game = playing();
    for (const at of [2_000]) {
      G.beginPhaseChange(game);
      G.completePhase(game, emptyPhase, at);
    }
    const next = G.nextPhaseInfo(game);
    assert.equal(next.last, true);
    assert.equal('herrings' in next, false);
    assert.match(phasePrompt({ snapshot: {}, nextPhase: next, lastRound: null }), /This is the last round\. A GM character whose lie the room has already broken/);
  });
});

describe('GM rules from the second chaos playtest', () => {
  test('should keep claims and lies out of narration, fix who owns what, and let pressure build', () => {
    const sys = playSystem(makeScenario(4));
    assert.match(sys, /never put a claim, an alibi or a GM character's lie in narration/);
    assert.match(sys, /does not make it theirs/);
    assert.match(sys, /the pressure builds until something gives/);
    assert.match(publicSystem({}), /never put a claim, an alibi or a lie in narration/);
  });

  test('should give a refusal reason that names the fact, never a person', () => {
    assert.match(playSystem(makeScenario(4)), /never a secret and never a person's name/);
  });

  test('should make a round reward follow from its own clues', () => {
    assert.match(GENERATION_SYSTEM, /never a new secret, backstory or fact a later clue reveals/);
  });

  test('should never read acting unseen as a claim', () => {
    assert.match(readerSystem({}), /"while nobody is watching"[^]*never a claim/);
  });
});
