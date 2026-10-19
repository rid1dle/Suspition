import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { CONTINUITY_SCHEMA } from '../server/prompts.ts';
import { applyContinuity, continuityPrompt } from '../server/continuity.ts';
import { gameInReading, emptyPhase } from './fixtures.ts';

const playing = () => {
  const game = gameInReading(4, 1_000, { questions: true });
  game.scenario.clues[1].reveal_round = 3;
  game.scenario.public_timeline[1].reveal_round = 3;
  G.startPlay(game, 1_000);
  return game;
};
const round = (name) => ({ name, objective: 'Find the second key.', planned_beat: 'A key turns up.', question: 'Who had the key?', options: ['A', 'B', 'C'], answer_index: 0, reward: 'R', wrong_nudge: 'N', why: 'The players opened the cellar thread.' });
const empty = { problems: [], canon_add: [], corrections: [], patches: [], offers: [], extra_rounds: [], solvable: true, missing: [] };

describe('rounds grow with the story', () => {
  test('should add a round before the last one and move later clues back', () => {
    const game = playing();
    assert.equal(G.addRound(game, round('The cellar'), 2_000), true);
    const sc = game.scenario;
    assert.deepEqual(sc.phases.map((p) => p.name), ['Phase name 1', 'Phase name 2', 'The cellar', 'Phase name 3']);
    assert.equal(sc.clues[1].reveal_round, 4);
    assert.equal(sc.clues[0].reveal_round, 1);
    assert.equal(sc.public_timeline[1].reveal_round, 4);
    assert.equal(G.totalRounds(game), 4);
    assert.ok(!game.state.events.some((e) => /needs one more round/.test(e.text)), 'the room is not told the round count');
    assert.match(G.playerView(game, 'p1').rules.join(' '), /There are 4 rounds\./);
  });

  test('should never go past 2 extra rounds, counting replays', () => {
    const game = playing();
    assert.equal(G.roundCap(game), 5);
    assert.ok(G.addRound(game, round('A'), 2_000));
    game.state.replays = 1;
    assert.equal(G.addRound(game, round('B'), 3_000), false);
    assert.equal(game.scenario.phases.length, 4);
  });

  test('should never put the new round into the round being played', () => {
    const game = playing();
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 2_000);
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 3_000);
    assert.equal(game.state.phaseIndex, 2);
    assert.ok(G.addRound(game, round('After the last'), 4_000));
    assert.equal(game.scenario.phases[2].name, 'Phase name 3');
    assert.equal(game.scenario.phases[3].name, 'After the last');
    assert.equal(G.isLastPhase(game), false);
  });

  test('should not put a new round into the round about to start, nor add one at the final vote', () => {
    const game = playing();
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 2_000);
    G.beginPhaseChange(game);
    assert.ok(G.addRound(game, round('Later'), 3_000));
    assert.deepEqual(game.scenario.phases.map((p) => p.name), ['Phase name 1', 'Phase name 2', 'Phase name 3', 'Later']);
    G.completePhase(game, emptyPhase, 4_000);
    assert.equal(game.state.phaseIndex, 2);
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 5_000);
    G.beginPhaseChange(game);
    assert.equal(G.addRound(game, round('Too late'), 6_000), false);
  });

  test('should take at most one extra round per check, and say so to everyone', () => {
    assert.ok(CONTINUITY_SCHEMA.properties.extra_rounds);
    const game = playing();
    const out = applyContinuity(game, { ...empty, extra_rounds: [round('One'), round('Two')] }, 2_000);
    assert.equal(out.rounds, 1);
    assert.equal(game.scenario.phases.length, 4);
    assert.match(continuityPrompt(game), /rounds_you_may_add":1/);
  });

  test('should stop a replay once the cap is reached', () => {
    const game = playing();
    game.setup.replays = 2;
    G.addRound(game, round('A'), 2_000);
    G.addRound(game, round('B'), 2_000);
    G.beginRoundVote(game, 3_000);
    G.voteRound(game, 'p1', 0, 3_000);
    G.resolveRoundVote(game, 3_000, true);
    assert.equal(G.willReplay(game), false);
  });
});
