import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { playSystem } from '../server/prompts.ts';
import { gameInReading, emptyAsk, emptyPhase } from './fixtures.ts';

const playing = () => {
  const game = gameInReading(4, 1_000);
  G.startPlay(game, 1_000);
  return game;
};
const find = (game, ids) => {
  G.beginAsk(game, 'p2', { kind: 'question', text: 'I search the kitchen.' });
  G.completeAsk(game, 'p2', { ...emptyAsk, clues_found: ids });
};

describe('clues open by round', () => {
  test('should not give a clue before its round', () => {
    const game = playing();
    find(game, ['c2', 'c1']);
    assert.deepEqual(game.state.found.p2, ['c1']);
    assert.deepEqual(G.openClues(game), ['c1', 'c3']);
  });

  test('should give it once its round comes', () => {
    const game = playing();
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 2_000);
    assert.equal(game.state.phaseIndex, 1);
    find(game, ['c2']);
    assert.deepEqual(game.state.found.p2, ['c2']);
  });

  test('should keep every clue open in an old world', () => {
    const game = playing();
    for (const c of game.scenario.clues) delete c.reveal_round;
    assert.deepEqual(G.openClues(game), ['c1', 'c2', 'c3']);
    find(game, ['c2']);
    assert.deepEqual(game.state.found.p2, ['c2']);
  });

  test('should tell the GM which clues are open now', () => {
    const game = playing();
    const snap = G.snapshotForGM(game);
    assert.deepEqual(snap.clues_open_now, ['c1', 'c3']);
    assert.deepEqual(snap.clues_later, [{ id: 'c2', round: 2 }]);
    assert.match(playSystem(game.scenario), /Only hand out clues listed in clues_open_now\./);
  });
});
