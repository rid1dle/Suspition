import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { phasePrompt } from '../server/prompts.ts';
import { gameInReading } from './fixtures.ts';

const playing = (n: number) => {
  const game = gameInReading(n, 1_000, { questions: false, phases: 4 });
  G.startPlay(game, 1_000);
  return game;
};
const change = (game: ReturnType<typeof playing>, recap: string[], extra = {}) => {
  G.beginPhaseChange(game);
  G.completePhase(game, { public_event: 'The captain orders every coat searched.', recap, ...extra }, 5_000);
  return game.state.recap?.lines ?? [];
};

describe('"Where we are now" only says what the players have seen', () => {
  test('should keep a line built from the public news', () => {
    const game = playing(3);
    game.state.events.push({ at: 2_000, phase: 0, kind: 'event', text: 'The brass compass is gone from case seven in the vault.' });
    assert.deepEqual(change(game, ['The brass compass is gone from case seven.']), ['The brass compass is gone from case seven.']);
  });

  test('should keep a line about this very round change', () => {
    assert.deepEqual(change(playing(3), ['The captain has ordered every coat searched.']), ['The captain has ordered every coat searched.']);
  });

  test('should drop a line nobody has seen or been told', () => {
    const game = playing(3);
    const lines = change(game, ['The captain has ordered every coat searched.', 'Greaves says his gate ring was taken at 11:15 while he washed his hands.']);
    assert.deepEqual(lines, ['The captain has ordered every coat searched.']);
  });

  test('should count a player alone\'s private chat as what they know', () => {
    const game = playing(1);
    game.state.threads.p1.push({ from: 'gm', text: 'Greaves: "My gate ring was taken at 11:15 while I washed my hands."', at: 3_000 });
    const lines = change(game, ['Greaves says his gate ring was taken at 11:15 while he washed his hands.']);
    assert.equal(lines.length, 1);
  });

  test('should never put one player\'s private chat in the shared recap of a group', () => {
    const game = playing(3);
    game.state.threads.p2.push({ from: 'gm', text: 'Greaves: "My gate ring was taken at 11:15 while I washed my hands."', at: 3_000 });
    assert.deepEqual(change(game, ['Greaves says his gate ring was taken at 11:15 while he washed his hands.']), []);
  });

  test('should tell the GM every recap line must come from what players have seen', () => {
    assert.match(phasePrompt({ snapshot: {}, nextPhase: { name: 'x', planned_beat: 'y' }, lastRound: null }), /Every recap line must come from something players have already seen or been told/);
  });
});
