import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { bendPrompt } from '../server/bend.ts';
import { gameInReading } from './fixtures.ts';

// From story run 4: Zoya searched the coat in private ("the other pockets hold a pencil stub and lint"), then Kabir
// narrated a napkin in that pocket and the world agreed. A bend now sees the private scenes that touch its find.
describe('a bend sees what was already seen in private', () => {
  const playing = () => {
    const game = gameInReading(3);
    G.startPlay(game, 1_000);
    game.state.threads.p3.push({ from: 'gm', text: 'You ease the torn form out of his coat pocket. The other pockets hold a pencil stub and lint.', at: 1_500 });
    game.state.threads.p3.push({ from: 'gm', text: 'The kettle sings in the galley.', at: 1_600 });
    return game;
  };

  test('should show the private scenes that share the find\'s words', () => {
    const p = bendPrompt(playing(), 'p2', { finds: ['a cocoa-stained napkin in the coat pocket'] });
    assert.match(p, /seen_in_private/);
    assert.match(p, /The other pockets hold a pencil stub and lint/);
    assert.doesNotMatch(p, /The kettle sings/);
  });

  test('should show the narrator\'s own earlier scenes too', () => {
    const game = playing();
    game.state.threads.p2.push({ from: 'gm', text: 'You pat his coat pocket and feel nothing.', at: 1_700 });
    const p = bendPrompt(game, 'p2', { finds: ['a napkin in the coat pocket'] });
    assert.match(p, /You pat his coat pocket and feel nothing/);
    assert.match(p, /pencil stub and lint/);
  });
});
