import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { FAIR_PLAY } from '../server/prompts.ts';
import { gameInReading, emptyAsk } from './fixtures.ts';

const playing = () => {
  const game = gameInReading(3, 1_000);
  game.scenario.players[1].private_info = 'Your real name is Arora and you grew up in Amritsar.';
  G.startPlay(game, 1_000);
  return game;
};

describe('a GM character never puts words in a player\'s mouth', () => {
  test('should drop "you told us" when the player never said it', () => {
    const game = playing();
    const out = G.dropPuppeting(game, 'p2', 'The tag says Arora, Amritsar. You told us you are from Amritsar too.', { others: true });
    assert.equal(out.text, 'The tag says Arora, Amritsar.');
    assert.equal(out.dropped, 1);
  });

  test('should keep "you told us" when the player really said it in play', () => {
    const game = playing();
    game.state.threads.p2.push({ from: 'you', text: 'I tell the guard I am from Amritsar.', at: 1_500 });
    const out = G.dropPuppeting(game, 'p2', 'You told us you are from Amritsar too.', { others: true });
    assert.equal(out.dropped, 0);
  });

  test('should keep it when the words are in the question being answered', () => {
    const game = playing();
    const out = G.dropPuppeting(game, 'p2', 'You said the lamp went out at nine.', { others: true, backing: { p2: ['Did the lamp go out at nine?'] } });
    assert.equal(out.dropped, 0);
  });

  test('should drop other ways of saying it: you said, as you said, you mentioned', () => {
    const game = playing();
    for (const line of ['You said you hid the ledger.', 'As you said, the ledger was yours.', 'You mentioned a brother in Delhi.', "You've told me about the ledger already."]) {
      assert.equal(G.dropPuppeting(game, 'p2', line, { others: true }).dropped, 1, line);
    }
  });

  test('should check the player a private message is for', () => {
    const game = playing();
    game.state.threads.p3.push({ from: 'you', text: 'I say my brother lives in Delhi.', at: 1_500 });
    assert.equal(G.dropPuppeting(game, 'p2', 'You mentioned a brother in Delhi.', { to: 'p3', others: true }).dropped, 0);
    assert.equal(G.dropPuppeting(game, 'p3', 'You mentioned a brother in Delhi.', { to: 'p2', others: true }).dropped, 1);
  });

  test('should not count the player card as something they said', () => {
    const game = playing();
    assert.equal(G.dropPuppeting(game, 'p2', 'You told us your real name is Arora.', { others: true }).dropped, 1);
  });

  test('should keep a question that asks the player what they said', () => {
    const game = playing();
    assert.equal(G.dropPuppeting(game, 'p2', 'Did you say you are from Amritsar?', { others: true }).dropped, 0);
  });

  test('should drop it from a GM character\'s spoken line in a private answer', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'question', text: 'Ramesh, whose coat is this?' });
    G.completeAsk(game, 'p2', { ...emptyAsk, lines: [{ speaker: 'n1', text: 'It is an Arora coat. You told me you are an Arora.' }] }, 2_000);
    const reply = game.state.threads.p2.at(-1);
    assert.doesNotMatch(JSON.stringify(reply), /You told me/);
    assert.match(JSON.stringify(reply), /It is an Arora coat\./);
  });

  test('should tell the GM the rule', () => {
    assert.match(FAIR_PLAY, /never says "you told us" or "you said" to a player unless that player really said it in play/);
  });
});

describe('review fixes: told-you lines', () => {
  test('should keep a line that only supposes the player said something', () => {
    const game = playing();
    for (const line of ['If you told her, she would run.', 'Whatever you said to him, he is angry now.']) {
      assert.equal(G.dropPuppeting(game, 'p2', line, { others: true }).dropped, 0, line);
    }
  });
});
