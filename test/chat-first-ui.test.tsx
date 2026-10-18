import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as G from '../server/game.ts';
import { gameInReading } from './fixtures.ts';
import { Playing as PhonePlaying } from '../src/app/play/playing';
import { Playing as TablePlaying } from '../src/app/table/playing';

const playing = () => {
  const game = gameInReading(3, 1_000, { questions: true });
  game.scenario.players[1].backstory = 'BACKSTORY-OF-TWO';
  game.scenario.players[1].intro_line = 'I heard the bell at nine.';
  G.startPlay(game, 1_000);
  return game;
};
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const phone = (game, pid, now = 2_000) => text(renderToStaticMarkup(h(PhonePlaying, { view: G.playerView(game, pid, now), dots: new Set(['clues']), clearDot: () => {} })));
const table = (game, host = 'h') => text(renderToStaticMarkup(h(TablePlaying, { view: G.tableView(game, 2_000), host, act: async () => null, readNow: () => {}, onNewGame: () => {} } as never)));

describe('the chat-first phone', () => {
  test('should put the chat first with one composer for the room or the GM, and drawers for the rest', () => {
    const out = phone(playing(), 'p2');
    for (const t of ['To the room', 'Private, to the GM', 'Me', 'Goals', 'Clues', 'Map', 'People', 'Case file', 'Send']) assert.ok(out.includes(t), t);
    assert.match(out, /3 acts left · talking is free/);
    assert.match(out, /Everyone hears it and the room answers\. Free\./);
  });

  test('should show the room and my private thread together, marking what only I see', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'MY-PRIVATE-MOVE' });
    G.completeAsk(game, 'p2', { answer: 'PRIVATE-ANSWER', clues_found: [], suspicion_change: 0, public_event: '', clues_destroyed: [], messages_to_players: [] }, 1_500);
    const out = phone(game, 'p2');
    assert.match(out, /You · only the GM sees MY-PRIVATE-MOVE/);
    assert.match(out, /GM · only you PRIVATE-ANSWER/);
    assert.ok(!phone(game, 'p3').includes('MY-PRIVATE-MOVE'));
    assert.match(out, /Round 1 · Phase name 1/);
  });

  test('should start from my story and offer first lines to the room', () => {
    const out = phone(playing(), 'p2');
    assert.match(out, /Your story so far Character 2/);
    assert.match(out, /BACKSTORY-OF-TWO/);
    assert.match(out, /Introduce yourself to the room I'm Character 2, the Role 2\. I heard the bell at nine\./);
    assert.match(out, /Just look around first/);
  });

  test('should offer a meeting, then show it to everyone with who called it and why', () => {
    const game = playing();
    assert.match(phone(game, 'p1'), /Call a meeting · once a game/);
    G.callMeeting(game, 'p2', 'The ledger burned!', 1_500);
    const out = phone(game, 'p3');
    assert.match(out, /Meeting · \d+:\d\d/);
    assert.match(out, /Player2 called everyone together: "The ledger burned!"/);
    assert.ok(!out.includes('Call a meeting · once a game'));
    assert.match(phone(game, 'p2'), /End the meeting/);
    assert.ok(!out.includes('End the meeting'));
  });

  test('should show the meeting on the table with an end button for the host', () => {
    const game = playing();
    G.callMeeting(game, 'p2', 'The ledger burned!', 1_500);
    assert.match(table(game), /Meeting[\s\S]*Player2 called everyone together: "The ledger burned!"[\s\S]*End the meeting/);
    assert.ok(!table(game, null).includes('End the meeting'));
  });

  test('should pin the vote with its brief above the chat', () => {
    const game = playing();
    G.beginRoundVote(game, 1_500);
    const out = phone(game, 'p2');
    assert.ok(out.indexOf('QUESTION-1') < out.indexOf('To the room'));
  });
});
