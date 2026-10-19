import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { rulesLines } from '../src/lib/rules.ts';
import { gameInReading, emptyAsk } from './fixtures.ts';

const playing = () => {
  const game = gameInReading(3, 1_000);
  G.startPlay(game, 1_000);
  return game;
};
const act = { kind: 'action', acts: true, target: '', place: '', attempt: 'searches the desk', said_aloud: '', out_of_world: false, sways_gm: false, claims: [] };

describe('chat first: no limit on talking or acting', () => {
  test('should let a player act as often as they like in one round', () => {
    const game = playing();
    for (let i = 0; i < 10; i += 1) {
      G.beginAsk(game, 'p2', { kind: 'chat', text: `I search place ${i}` });
      const settled = G.settleAct(game, 'p2', act);
      assert.equal(settled.spent, true, `act ${i} is an act`);
      assert.equal(settled.held, undefined, `act ${i} is not held`);
      G.completeAsk(game, 'p2', emptyAsk, 2_000 + i);
    }
    assert.ok(!game.state.threads.p2.some((m) => /No acts left/.test(m.text)));
  });

  test('should still answer talk as talk', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'Butler, where were you?' });
    assert.equal(G.settleAct(game, 'p2', { ...act, kind: 'question', acts: false }).spent, false);
  });

  test('should still hold acts while a meeting is on', () => {
    const game = playing();
    G.callMeeting(game, 'p1', 'talk it out', 1_500);
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'I search the desk' });
    const settled = G.settleAct(game, 'p2', act);
    assert.equal(settled.held, 'meeting');
    assert.equal(settled.spent, false);
  });

  test('should not show an act count on the phone', () => {
    assert.equal('questionsLeft' in G.playerView(playing(), 'p2', 2_000), false);
  });

  test('should tell players in the rules that talking and acting are free', () => {
    const lines = rulesLines({ rounds: 3, overrides: 2, hints: 2 });
    assert.ok(lines.some((l) => /Talk and act as much as you like: ask anyone, search, take, hide, follow\. Going somewhere on the map is free too\./.test(l)));
    assert.ok(!lines.some((l) => /acts? each round/.test(l)));
  });

  test('should accept an old setup that still sends a question count', () => {
    const game = G.createGame(1_000);
    for (let i = 0; i < 3; i += 1) G.addPlayer(game, { name: `P${i}` });
    assert.doesNotThrow(() => G.applySetup(game, { tone: 'tense', length: 'short', hints: 2, questions: 9 }));
    assert.equal('questions' in game.setup, false);
  });
});
