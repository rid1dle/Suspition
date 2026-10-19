import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { gameInReading, emptyAsk } from './fixtures.ts';

function playing() {
  const game = gameInReading(3);
  G.startPlay(game, 2_000);
  return game;
}
const moves = (game) => game.state.events.filter((e) => e.kind === 'move').map((e) => e.text);

describe('everyone sees a character walk somewhere, unless they sneak', () => {
  test('should put a move made while looking at something on the map and tell the room', () => {
    const game = playing();
    G.beginAsk(game, 'p1', { kind: 'question', text: 'What is on the kitchen door?' });
    G.completeAsk(game, 'p1', { ...emptyAsk, player_location: 'l2', move_is_public: false }, 3_000);
    assert.equal(game.state.positions.p1, 'l2');
    assert.deepEqual(moves(game), ['Character 1 goes to the Kitchen.']);
  });

  test('should tell the room when an open act takes them to where a clue is', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'I look around the ballroom' });
    G.completeAsk(game, 'p2', { ...emptyAsk, clues_found: ['c1'] }, 3_000);
    assert.equal(game.state.positions.p2, 'l1');
    assert.deepEqual(moves(game), ['Character 2 goes to the Ballroom.']);
  });

  test('should keep a secret act off the map and out of the room', () => {
    const game = playing();
    G.beginAsk(game, 'p1', { kind: 'action', text: 'Secretly, I slip into the kitchen' });
    G.completeAsk(game, 'p1', { ...emptyAsk, kind: 'action', player_location: 'l2', move_is_public: false }, 3_000);
    assert.equal(game.state.positions.p1, 'l1');
    assert.deepEqual(moves(game), []);
  });

  test('should announce nothing when they stay where they are', () => {
    const game = playing();
    G.beginAsk(game, 'p1', { kind: 'question', text: 'What is on the floor?' });
    G.completeAsk(game, 'p1', { ...emptyAsk, player_location: 'l1' }, 3_000);
    assert.deepEqual(moves(game), []);
  });
});
