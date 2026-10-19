import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { gameInReading } from './fixtures.ts';
import { Playing as TablePlaying } from '../src/app/table/playing';
import { Playing as PhonePlaying } from '../src/app/play/playing';
import { Final } from '../src/app/play/endgame';

const playing = () => {
  const game = gameInReading(3, 1_000, { questions: true });
  game.scenario.key_objects = [{ id: 'o1', name: 'The brass weight', about: 'From the scale.', where: 'l1', where_is_public: true }];
  G.startPlay(game, 1_000);
  return game;
};
const table = (game) => renderToStaticMarkup(React.createElement(TablePlaying, { view: G.tableView(game, 2_000), host: 'h', act: async () => null, readNow: () => {}, onNewGame: () => {} } as never));
const phone = (game, pid = 'p2') => renderToStaticMarkup(React.createElement(PhonePlaying, { view: G.playerView(game, pid, 2_000), dots: new Set(), clearDot: () => {} } as never));

describe('the table during play: right now on the left, reference on the right', () => {
  test('should keep only what the room needs now in the left column', () => {
    const html = table(playing());
    const left = html.split('data-now')[1].split('data-reference')[0];
    assert.match(left, /THE BIG QUESTION|The big question/i);
    assert.doesNotMatch(left, /Things that matter|Who&#x27;s who|Who's who/);
  });

  test('should give things that matter their own tab beside the map', () => {
    const html = table(playing());
    const tabs = html.split('data-reference')[1];
    assert.match(tabs, />Things<span[^>]*>1<\/span>|>Things</);
  });

  test('should list who plays who in the People tab', async () => {
    const src = (await import('node:fs')).readFileSync('src/app/table/playing.tsx', 'utf8');
    assert.match(src, /side === 'people' && <>[\s\S]*<WhoList/);
  });
});

describe('the phone keeps the room buttons in reach', () => {
  test('should put the meeting, hint and vote-early buttons in the bottom bar, not in the chat', () => {
    const html = phone(playing());
    const bar = html.split('data-composer')[1];
    assert.match(bar, /Ask the group for a hint/);
    assert.match(bar, /Call a meeting/);
    assert.doesNotMatch(html.split('data-composer')[0], /Ask the group for a hint/);
  });
});

describe('the phone after your final answer', () => {
  test('should show who has picked and who is still picking', () => {
    const game = playing();
    game.status = 'final';
    G.submitFinal(game, 'p1', { culprit_ids: ['p1'] });
    G.submitFinal(game, 'p2', { culprit_ids: ['p1'] });
    const html = renderToStaticMarkup(React.createElement(Final, { view: G.playerView(game, 'p2', 2_000) } as never)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(html, /✓ Player1/);
    assert.match(html, /✓ Player2 \(you\)/);
    assert.match(html, /… Player3/);
  });
});
