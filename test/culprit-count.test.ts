import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { pickCulprits, pickTwists, TWISTS } from '../server/prompts.ts';
import { Final } from '../src/app/play/endgame.tsx';
import { gameInReading } from './fixtures.ts';

const lobby = (n) => {
  const game = G.createGame(1_000);
  for (let i = 0; i < n; i += 1) G.addPlayer(game, { name: `P${i + 1}` });
  return game;
};
const base = { tone: 'tense', length: 'short', hints: 2 };
const team = TWISTS.find((t) => t.id === 'culprit-team');
const seqr = (...v) => { let i = 0; return () => v[i++ % v.length]; };

describe('the host picks how many culprits before the game', () => {
  test('should let the GM decide when the host picks nothing', () => {
    const game = lobby(6);
    assert.equal(G.applySetup(game, base).culprits, 'gm');
  });

  test('should keep one or two culprits when the host picks them', () => {
    assert.equal(G.applySetup(lobby(6), { ...base, culprits: 1 }).culprits, 1);
    assert.equal(G.applySetup(lobby(6), { ...base, culprits: '2' }).culprits, 2);
  });

  test('should refuse two culprits with fewer than 6 players', () => {
    assert.throws(() => G.applySetup(lobby(5), { ...base, culprits: 2 }), /Two culprits need 6 players or more/);
  });

  test('should refuse a count that is not 1, 2 or the GM', () => {
    assert.throws(() => G.applySetup(lobby(6), { ...base, culprits: 3 }), /Pick 1 or 2 culprits, or let the GM decide/);
  });
});

describe('the game picks the culprits from the host choice', () => {
  test('should pick exactly one culprit when the host picked one, even with the culprit team twist', () => {
    assert.equal(pickCulprits(8, [team], seqr(0.1, 0.9), 1).length, 1);
  });

  test('should pick exactly two culprits when the host picked two', () => {
    assert.equal(pickCulprits(6, [], seqr(0.9, 0.1, 0.5), 2).length, 2);
  });

  test('should still let chance decide when the GM decides', () => {
    assert.equal(pickCulprits(6, [], seqr(0.9), 'gm').length, 1);
    assert.equal(pickCulprits(6, [], seqr(0.1, 0.2, 0.7), 'gm').length, 2);
  });

  test('should never draw the culprit team twist when the host picked one culprit', () => {
    for (let i = 0; i < 40; i += 1) {
      assert.ok(!pickTwists(8, Math.random, { culprits: 1 }).some((t) => t.id === 'culprit-team'));
    }
  });
});

describe('the final vote says how many to find', () => {
  const finalGame = (culprits) => {
    const game = gameInReading(6);
    game.scenario.truth.culprit_ids = culprits;
    for (const p of game.scenario.players) p.side = culprits.includes(p.id) ? 'culprit' : 'investigator';
    G.startPlay(game, 1_000);
    game.status = 'final';
    return game;
  };

  test('should hide the culprit count while the game is played', () => {
    const game = finalGame(['p1', 'p2']);
    game.status = 'playing';
    assert.equal(G.tableView(game, 2_000).culpritCount, null);
  });

  test('should show the culprit count at the final vote', () => {
    assert.equal(G.tableView(finalGame(['p1', 'p2']), 2_000).culpritCount, 2);
    assert.equal(G.playerView(finalGame(['p1']), 'p3', 2_000).culpritCount, 1);
  });

  test('should refuse an answer that names a different number of people', () => {
    const game = finalGame(['p1', 'p2']);
    assert.throws(() => G.submitFinal(game, 'p3', { culprit_ids: ['p1'] }), /Pick 2 people/);
    G.submitFinal(game, 'p3', { culprit_ids: ['p1', 'p2'] });
    assert.deepEqual(game.state.submissions.p3.culprit_ids, ['p1', 'p2']);
  });

  test('should tell the phone how many culprits to pick', () => {
    const game = finalGame(['p1', 'p2']);
    const html = renderToStaticMarkup(React.createElement(Final, { view: G.playerView(game, 'p3', 2_000) }));
    assert.match(html, /There are 2 culprits\. Pick 2\./);
    const one = renderToStaticMarkup(React.createElement(Final, { view: G.playerView(finalGame(['p1']), 'p3', 2_000) }));
    assert.match(one, /There is 1 culprit\. Pick 1\./);
  });
});

describe('the setup screen asks how many culprits', () => {
  const setupHtml = async (players) => {
    const { Setup } = await import('../src/app/table/setup.tsx');
    const view = { status: 'lobby', players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })), surprise: null };
    return renderToStaticMarkup(React.createElement(Setup, { view, host: true, act: async () => null, onNewGame: () => {} }));
  };

  test('should offer Let the GM decide as the picked choice', async () => {
    const html = await setupHtml(6);
    assert.match(html, /How many culprits\?/);
    assert.match(html, /aria-checked="true"[^>]*>Let the GM decide|data-state="on"[^>]*>Let the GM decide/);
  });

  test('should offer two culprits only with 6 players or more', async () => {
    assert.match(await setupHtml(6), />2<\/button>/);
    const small = (await setupHtml(4)).split('How many culprits?')[1].split('Round style')[0];
    assert.doesNotMatch(small, />2<\/button>/);
  });
});

describe('the playtest bots are told how many culprits to name', () => {
  test('should ask a bot for exactly as many culprits as the final vote says', async () => {
    const { askLine } = await import('../scripts/playtest/bots.ts');
    assert.match(askLine({ culpritCount: 2 }, 'final'), /There are 2 culprits: name exactly 2/);
    assert.match(askLine({ culpritCount: 1 }, 'final'), /There is 1 culprit: name exactly one/);
    assert.match(askLine({}, 'vote'), /A round vote is open/);
    assert.equal(askLine({}, 'play'), '');
  });
});

describe('review fixes: the host count holds', () => {
  test('should refuse a world that adds a GM character as a culprit when the host fixed the count', async () => {
    const { makeScenario } = await import('./fixtures.ts');
    const s = makeScenario(6);
    s.truth.culprit_ids = ['p1', 'n1'];
    const rules = { playerCount: 6, phases: 3, hints: 3, culprits: ['p1'] };
    assert.ok(G.validateScenario(s, { ...rules, exact: true }).some((e) => /Exactly 1 culprit/.test(e)));
    assert.ok(!G.validateScenario(s, rules).some((e) => /Exactly 1 culprit/.test(e)));
  });

  test('should tell the world writer GM characters are never culprits when the host fixed the count', async () => {
    const { generationPrompt } = await import('../server/prompts.ts');
    const game = lobby(6);
    G.applySetup(game, { ...base, culprits: 1 });
    assert.match(generationPrompt(game, [], ['p2']), /The host fixed the count: GM characters may help, but are never culprits\./);
  });

  test('should say on the setup screen that only Let the GM decide keeps the count secret', async () => {
    const { Setup } = await import('../src/app/table/setup.tsx');
    const view = { status: 'lobby', players: Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}` })), surprise: null };
    const html = renderToStaticMarkup(React.createElement(Setup, { view, host: true, act: async () => null, onNewGame: () => {} }));
    assert.match(html, /The room sees this choice\. With Let the GM decide, nobody knows how many until the final vote\./);
  });

  test('should show no stray number on the phone when the count is unknown', () => {
    const game = gameInReading(4);
    G.startPlay(game, 1_000);
    game.status = 'final';
    const view = { ...G.playerView(game, 'p2', 2_000), culpritCount: null };
    const html = renderToStaticMarkup(React.createElement(Final, { view }));
    assert.doesNotMatch(html, /<\/h1>0/);
  });
});
