import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { gameInReading, emptyAsk } from './fixtures.ts';

const playing = () => {
  const game = gameInReading(4, 1_000);
  G.startPlay(game, 1_000);
  return game;
};
const clean = (game, t) => G.dropPuppeting(game, null, t, { others: true }).text;

describe('pronouns and the refusal line', () => {
  test('should drop "He came down the stairs" after a player was named', () => {
    const game = playing();
    assert.equal(clean(game, 'Ask Character 2. He came down the stairs then.'), 'Ask Character 2.');
    assert.equal(clean(game, 'Character 3 is the cook. She walked to the shed.'), 'Character 3 is the cook.');
  });

  test('should keep a pronoun with no player before it', () => {
    const game = playing();
    assert.equal(clean(game, 'He came down the stairs then.'), 'He came down the stairs then.');
    assert.equal(clean(game, 'Ask Character 2. The Butler nods. He walked out.'), 'Ask Character 2. The Butler nods. He walked out.');
  });

  test('should clean the refusal line', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'action', text: 'x' });
    G.completeAsk(game, 'p2', { ...emptyAsk, refused: { refused: true, why: 'Character 1 did it, not you.' } }, 2_000);
    assert.equal(game.state.threads.p2.at(-1).text, "That can't happen: It does not fit the story.");
    G.beginPublicAsk(game, 'p3', 'q');
    G.completePublicAsk(game, 'p3', [{ speaker: 'n1', text: 'No.' }], 3_000, null, null, '', { refused: true, why: 'Player4 went home early.' });
    assert.equal(game.state.events.at(-1).text, "That can't happen: It does not fit the story.");
  });
});
