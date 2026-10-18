import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { SCENARIO_SCHEMA, GENERATION_SYSTEM, playSystem, askPrompt } from '../server/prompts.ts';
import { gameInReading, emptyAsk } from './fixtures.ts';

// Fixture: p2 starts in the Kitchen (l2), p1 in the Ballroom (l1). c1 is in l1, c2 in l2, c3 is held by the Butler (n1, in l2).
const playing = () => {
  const game = gameInReading(4, 1_000);
  game.scenario.how_we_talk = 'Everyone carries a walkie-talkie from the front desk.';
  for (const c of game.scenario.clues) c.reveal_round = 1;
  G.startPlay(game, 1_000);
  return game;
};
const search = (game, pid, result, kind = 'question') => {
  G.beginAsk(game, pid, { kind, text: 'I search.' });
  G.completeAsk(game, pid, { ...emptyAsk, ...result }, 2_000);
};

describe('being somewhere matters', () => {
  test('should say how everyone talks across rooms, in the world and the briefing', () => {
    assert.ok(SCENARIO_SCHEMA.properties.how_we_talk);
    assert.match(GENERATION_SYSTEM, /how_we_talk: how the characters talk to each other when they are in different places/);
    const bg = G.briefingSteps(playing()).find((s) => s.kind === 'background');
    assert.equal(bg.lines[0], 'How you talk: Everyone carries a walkie-talkie from the front desk.');
  });

  test('should tell the GM where the asker is and that finding something means going there', () => {
    const game = playing();
    assert.match(askPrompt({ snapshot: {}, player: { id: 'p2', character_name: 'Character 2' }, kind: 'question', text: 'x', here: 'Kitchen' }), /Character 2 is in the Kitchen now\./);
    assert.match(playSystem(game.scenario), /A character can only find or read something where it is/);
  });

  test('should take the character to the room of a clue they find', () => {
    const game = playing();
    search(game, 'p2', { clues_found: ['c1'] });
    assert.deepEqual(game.state.found.p2, ['c1']);
    assert.equal(game.state.at.p2, 'l1');
    assert.match(G.placeOf(game, 'p2'), /Ballroom/);
  });

  test('should find it once the move takes them there, and reward the trip', () => {
    const game = playing();
    search(game, 'p2', { clues_found: ['c1'], player_location: 'l1', move_is_public: false }, 'action');
    assert.deepEqual(game.state.found.p2, ['c1']);
    assert.equal(game.state.at.p2, 'l1', 'the game knows where they really are');
    assert.equal(game.state.positions.p2, 'l2', 'a secret trip does not show on the map');
    assert.ok(game.state.play.p2.some((m) => m.skill === 'searching' && /Went to the Ballroom and found Torn glove\./.test(m.why)));
  });

  test('should reward no trip when the player was already there', () => {
    const game = playing();
    search(game, 'p2', { clues_found: ['c2'] });
    assert.deepEqual(game.state.found.p2, ['c2']);
    assert.ok(!(game.state.play.p2 ?? []).some((m) => /Went to/.test(m.why)));
  });

  test('should take the character to the GM character who holds the clue', () => {
    const game = playing();
    search(game, 'p1', { clues_found: ['c3'] });
    assert.deepEqual(game.state.found.p1, ['c3']);
    assert.equal(game.state.at.p1, 'l2');
  });

  test('should let an old world find clues anywhere', () => {
    const game = playing();
    game.scenario.clues[0].where = 'Under the rug';
    search(game, 'p2', { clues_found: ['c1'] });
    assert.deepEqual(game.state.found.p2, ['c1']);
  });
});

describe('where you are, on your phone', () => {
  test('should show each player only their own place', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'action', text: 'I slip into the ballroom.' });
    G.completeAsk(game, 'p2', { ...emptyAsk, kind: 'action', player_location: 'l1', move_is_public: false }, 2_000);
    assert.equal(G.playerView(game, 'p2').here, 'Ballroom');
    assert.equal(G.playerView(game, 'p4').here, 'Kitchen');
    assert.ok(!('here' in G.tableView(game)));
  });
});
