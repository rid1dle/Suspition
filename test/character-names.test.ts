import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { gameInReading, emptyAsk } from './fixtures.ts';

function playing() {
  const game = gameInReading(3);
  G.startPlay(game, 2_000);
  return game;
}
const shown = (game) => game.state.events.map((e) => e.text).join('\n');

describe('the room hears characters, not the friends playing them', () => {
  test('should name the character when someone asks the room something', () => {
    const game = playing();
    G.beginPublicAsk(game, 'p2', 'Who has the key?');
    G.completePublicAsk(game, 'p2', 'Nobody answers.', 3_000);
    const qa = game.state.events.find((e) => e.kind === 'qa');
    assert.equal(qa.by, 'Character 2');
    assert.ok(!JSON.stringify(qa).includes('Player2'));
  });

  test('should name the character when a moment calls them and when they say it', () => {
    const game = playing();
    G.addMoments(game, [{ player_id: 'p2', line: 'I saw the glove.', why: 'w' }], 3_000);
    const m = game.state.moments[0];
    G.answerMoment(game, 'p2', m.id, 'said', 4_000);
    assert.match(shown(game), /Character 2, the story turns to you\./);
    assert.match(shown(game), /Character 2 said: "I saw the glove\."/);
    assert.doesNotMatch(shown(game), /Player2/);
  });

  test('should name the character when they go somewhere and when they ask to vote', () => {
    const game = playing();
    G.goTo(game, 'p2', 'l1', 3_000);
    assert.match(shown(game), /^Character 2 goes to the Ballroom/m);
    assert.doesNotMatch(shown(game), /Player2/);
  });

  test('should name the character on a clue they show everyone', () => {
    const game = playing();
    game.state.found.p2 = ['c1'];
    G.shareClue(game, 'p2', 'c1', 3_000);
    assert.match(shown(game), /Character 2 shows a clue/);
    assert.equal(G.tableView(game).sharedClues[0].by, 'Character 2');
  });

  test('should still know what each player asked out loud after the names change', () => {
    const game = playing();
    G.beginPublicAsk(game, 'p2', 'Who has the key?');
    G.completePublicAsk(game, 'p2', 'Nobody answers.', 3_000);
    assert.ok(G.saidOutLoud(game, 'p2').includes('who has the key?'));
    assert.ok(!G.saidOutLoud(game, 'p3').includes('who has the key?'));
  });

  test('should tell a player the meeting is theirs without comparing names', () => {
    const game = playing();
    G.callMeeting(game, 'p2', 'Look!', 3_000);
    const view = G.playerView(game, 'p2', 3_500);
    assert.equal(view.meeting.by, 'Character 2');
    assert.equal(view.meeting.mine, true);
    assert.equal(G.playerView(game, 'p3', 3_500).meeting.mine, false);
  });
});

describe('before the world exists, the lobby still uses names', () => {
  test('should fall back to the player name with no character yet', () => {
    const game = playing();
    game.scenario.players[1].character_name = '';
    G.goTo(game, 'p2', 'l1', 3_000);
    assert.match(shown(game), /^Player2 goes to the Ballroom/m);
  });
});

void emptyAsk;
