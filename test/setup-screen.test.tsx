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

describe('the setup screen shows only choices that can change this game', () => {
  const rows = (out: string) => out.replace(/<[^>]+>/g, '|').split('|').map((t) => t.trim()).filter(Boolean);

  test('should hide the culprit count when only one culprit is possible', () => {
    assert.ok(!rows(html(4)).includes('How many culprits?'));
    assert.ok(rows(html(6)).includes('How many culprits?'));
  });

  test('should hide overrides playing alone, where nobody hears a moment but the GM', () => {
    assert.ok(!rows(html(1)).includes('Overrides per player'));
    assert.ok(rows(html(2)).includes('Overrides per player'));
  });

  test('should call them hints, not group hints, playing alone', () => {
    assert.ok(rows(html(1)).includes('Hints'));
    assert.ok(!rows(html(1)).includes('Group hints'));
  });

  test('should never offer zero or background-only GM characters under 3 players: they carry the story', () => {
    for (const n of [1, 2]) {
      const out = html(n);
      assert.ok(!rows(out).includes('Background only'), `${n} players`);
      const people = out.split('People the GM plays')[1].split('Test game')[0];
      assert.doesNotMatch(people, />0</, `${n} players`);
    }
    assert.ok(rows(html(3)).includes('Background only'));
  });

  test('should keep a small game from starting with no GM characters or background-only ones', () => {
    for (const n of [1, 2]) {
      const game = G.createGame(1_000);
      for (let i = 0; i < n; i += 1) G.addPlayer(game, { name: `P${i}` });
      const setup = G.applySetup(game, { tone: 'tense', length: 'short', hints: 2, npcs: 0, npcRole: 'background' });
      assert.equal(setup.npcs, 1);
      assert.equal(setup.npcRole, 'mixed');
    }
  });
});

describe('the phone shows a player alone no group buttons', () => {
  test('should say get a hint and answer now, not ask the group, playing alone', async () => {
    const { Playing } = await import('../src/app/play/playing');
    const { gameInReading } = await import('./fixtures.ts');
    const screen = (players: number) => {
      const game = gameInReading(players, 1_000, { questions: true });
      G.startPlay(game, 1_000);
      return renderToStaticMarkup(React.createElement(Playing, { view: G.playerView(game, 'p1', 2_000), dots: new Set(), clearDot: () => {} } as never)).replace(/<[^>]+>/g, ' ');
    };
    const solo = screen(1);
    assert.match(solo, /Get a hint · 3 left/);
    assert.match(solo, /Answer the round question now/);
    assert.doesNotMatch(solo, /Ask the group|everyone has to agree|Call a meeting/);
    assert.match(screen(3), /Ask the group for a hint/);
  });
});

describe('a player alone gets a hint or the vote with one tap', () => {
  test('should give a hint at once, and start the round vote at once', async () => {
    const { gameInReading } = await import('./fixtures.ts');
    const game = gameInReading(1, 1_000, { questions: true });
    G.startPlay(game, 1_000);
    G.proposeHint(game, 'p1', 2_000);
    assert.equal(game.state.hintsLeft, 2);
    G.askVote(game, 'p1', 3_000);
    assert.ok(game.state.roundVote, 'the vote is open');
    assert.ok(!game.state.events.some((e) => /Everyone else has to say yes/.test(e.text)), 'no group words for a player alone');
  });
});
