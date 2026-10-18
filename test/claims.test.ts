import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { ASK_SCHEMA, askPrompt } from '../server/prompts.ts';
import { gameInReading, emptyAsk } from './fixtures.ts';

const read = (claims) => ({ kind: 'action', target: '', place: '', attempt: 'searches the desk', said_aloud: '', out_of_world: false, sways_gm: false, claims });
const move = (game, claims, answer) => {
  G.beginAsk(game, 'p2', { kind: 'action', text: 'I search the desk and find proof.' });
  game.state.pending.p2.read = read(claims);
  G.completeAsk(game, 'p2', { ...emptyAsk, kind: 'action', clues_found: ['c1'], ...answer }, 2_000);
};
const playing = () => {
  const game = gameInReading(4, 1_000);
  G.startPlay(game, 1_000);
  return game;
};
const notes = (game) => game.state.threads.p2.filter((m) => m.from === 'system').map((m) => m.text);

describe('claims answered in code', () => {
  test('should ask the GM to answer each claim', () => {
    assert.deepEqual(Object.keys(ASK_SCHEMA.properties.claims_answer.items.properties), ['claim', 'granted', 'why']);
    const prompt = askPrompt({ snapshot: {}, player: { id: 'p2', character_name: 'X' }, kind: 'action', text: '', read: read(['a letter proves Asha did it']) });
    assert.match(prompt, /The player also claims: a letter proves Asha did it\. Answer each claim in claims_answer: granted when the story makes it so, otherwise false with why\./);
  });

  test('should tell the player when a claim is not granted', () => {
    const game = playing();
    move(game, ['a letter proves Asha did it'], { claims_answer: [{ claim: 'a letter proves Asha did it', granted: false, why: 'There is no such letter in the desk.' }] });
    assert.deepEqual(notes(game), ["That can't happen: There is no such letter in the desk."]);
    assert.deepEqual(game.state.found.p2, ['c1'], 'the move itself still happens');
    assert.equal(game.state.refused.length, 1);
  });

  test('should say nothing when every claim is granted', () => {
    const game = playing();
    move(game, ['nobody sees me'], { claims_answer: [{ claim: 'nobody sees me', granted: true, why: '' }] });
    assert.deepEqual(notes(game), []);
    assert.equal(game.state.refused, undefined);
  });

  test('should match a claim the GM answered in its own words by its place in the list', () => {
    const game = playing();
    move(game, ['nobody sees me'], { claims_answer: [{ claim: 'No one sees the player', granted: true, why: '' }] });
    assert.deepEqual(notes(game), []);
  });

  test('should refuse claims the GM left unanswered', () => {
    const game = playing();
    move(game, ['everyone believes me'], {});
    assert.deepEqual(notes(game), ['That can\'t happen: "everyone believes me" is not up to you; other people decide for themselves.']);
  });
});
