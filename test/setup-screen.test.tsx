import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { Setup } from '../src/app/table/setup.tsx';
import { DIFFICULTY_NOTES } from '../src/lib/difficulty.ts';

const html = (players = 4) => {
  const view = { status: 'lobby', players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })), surprise: null };
  return renderToStaticMarkup(React.createElement(Setup, { view, host: true, act: async () => null, onNewGame: () => {} } as never));
};

describe('the setup screen, simpler', () => {
  test('should group the choices into the story, the culprit, and more options folded away', () => {
    const out = html();
    assert.match(out, /The story/);
    assert.match(out, /The culprit/);
    assert.match(out, /<details[^>]*data-more-options[^>]*>\s*<summary[^>]*>[^<]*More options/);
    const more = out.split('data-more-options')[1];
    for (const t of ['Art style', 'Round style', 'Group hints', 'Overrides per player', 'People the GM plays', 'Test game', 'Anything the GM should know?']) assert.ok(more.includes(t), t);
  });

  test('should keep the start button beside the join code, where it never scrolls away', () => {
    const out = html();
    const join = out.split('data-join')[1].split('</section>')[0];
    assert.match(join, /Make our mystery/);
  });

  test('should not offer playing a round again: a wrong answer already changes the next round', () => {
    assert.doesNotMatch(html(), /Play it again|replays the round/);
    const game = G.createGame(1_000);
    for (let i = 0; i < 3; i += 1) G.addPlayer(game, { name: `P${i}` });
    assert.equal(G.applySetup(game, { tone: 'tense', length: 'short', hints: 2, roundStyle: 'classic', replays: 2 }).replays, 0);
  });

  test('should never assume a killer in the difficulty notes', () => {
    for (const note of Object.values(DIFFICULTY_NOTES)) assert.doesNotMatch(note, /killer|murder/i);
  });
});
