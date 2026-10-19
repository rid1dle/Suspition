import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { ASK_SCHEMA, playSystem } from '../server/prompts.ts';
import { gameInReading, emptyAsk } from './fixtures.ts';

function playing() {
  const game = gameInReading(3);
  G.startPlay(game, 2_000);
  return game;
}

describe('a private find comes with a line the player can tell the room', () => {
  test('should ask the GM for one first-person line of only what the player saw', () => {
    assert.ok(ASK_SCHEMA.properties.tell);
    assert.match(playSystem(gameInReading(3).scenario, 3), /- tell: /);
  });

  test('should keep the line on the reply, short and clean', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'I look at the floor' });
    G.completeAsk(game, 'p2', { ...emptyAsk, tell: '  I found bare footprints going out the orchard door.  ' }, 3_000);
    assert.equal(game.state.threads.p2.at(-1).tell, 'I found bare footprints going out the orchard door.');
  });

  test('should keep a line about the culprit exactly like a line about anyone else', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'I look' });
    G.completeAsk(game, 'p2', { ...emptyAsk, tell: 'I saw Character 1 by the window.' }, 3_000);
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'I look again' });
    G.completeAsk(game, 'p2', { ...emptyAsk, tell: 'I saw Character 3 by the window.' }, 3_100);
    assert.deepEqual(game.state.threads.p2.filter((m) => m.from === 'gm').map((m) => Boolean(m.tell)), [true, true]);
  });

  test('should leave no line when there is nothing to tell', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'Hello' });
    G.completeAsk(game, 'p2', { ...emptyAsk, tell: '' }, 3_000);
    assert.equal(game.state.threads.p2.at(-1).tell, undefined);
  });
});
