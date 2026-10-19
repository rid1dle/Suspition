import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { applyContinuity, continuityPrompt, CANON_MAX } from '../server/continuity.ts';
import { gameInReading } from './fixtures.ts';

const empty = { problems: [], canon_add: [], corrections: [], patches: [], offers: [], extra_rounds: [], solvable: true, missing: [] };
const playing = () => {
  const game = gameInReading(3, 1_000, { questions: true });
  G.startPlay(game, 1_000);
  return game;
};

describe('older minors', () => {
  test('should keep every canon line short however long the game runs', () => {
    const game = playing();
    for (let i = 0; i < 200; i += 1) applyContinuity(game, { ...empty, canon_add: [{ fact: `Fact number ${i} about the night, told in plain words to fill a line of about a hundred chars.`, about: [], public: false }] }, 2_000 + i);
    assert.ok(game.state.canon.length <= CANON_MAX);
    assert.ok(game.state.canon.every((c) => c.fact.length <= 600), String(Math.max(...game.state.canon.map((c) => c.fact.length))));
  });

  test('should never open a clue after the last round, or in a round already played', () => {
    const game = playing();
    const late = applyContinuity(game, { ...empty, patches: [{ path: 'clues.1.reveal_round', value: '9' }] }, 2_000);
    assert.equal(late.applied, 0);
    G.beginPhaseChange(game);
    G.completePhase(game, { public_event: 'x', messages_to_players: [], clues_destroyed: [], suspicion_change: 0 }, 2_100);
    const early = applyContinuity(game, { ...empty, patches: [{ path: 'clues.1.reveal_round', value: '1' }] }, 2_200);
    assert.equal(early.applied, 0);
    const ok = applyContinuity(game, { ...empty, patches: [{ path: 'clues.1.reveal_round', value: '3' }] }, 2_300);
    assert.equal(ok.applied, 1);
  });

  test('should tell the story check which round number reveal_round uses', () => {
    const game = playing();
    game.state.roundNumber = 3;
    const prompt = continuityPrompt(game);
    assert.match(prompt, /"reveal_round_now":1/);
  });
});
