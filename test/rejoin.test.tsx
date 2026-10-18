import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import * as G from '../server/game.ts';
import { App } from '../server/app.ts';
import { MemoryStore } from '../server/store.ts';
import { FakeGM } from './fixtures.ts';
import { createElement as h } from 'react';
import { RejoinPanel, REJOIN_SHOW_MS } from '../src/components/game/rejoin';

async function started() {
  const app = await new App({ gm: new FakeGM(), store: new MemoryStore(), clock: () => 1_000 }).init();
  const tokens = [];
  for (const name of ['Nikhil', 'Himanshu', 'Rishabh']) tokens.push(await app.join({ name }));
  await app.setup(app.game.hostToken, { tone: 'tense', length: 'short', hints: 2 });
  await app.idle();
  await app.start(app.game.hostToken);
  return { app, tokens };
}

describe('getting a dropped player back in', () => {
  test("should give the host a player's own rejoin link", async () => {
    const { app, tokens } = await started();
    const out = app.rejoin(app.game.hostToken, 'p1', 'http://192.168.1.16:4321/play');
    assert.equal(out.name, 'Nikhil');
    assert.equal(out.url, `http://192.168.1.16:4321/play#t=${app.game.players[0].token}`);
    assert.notEqual(app.game.players[0].token, tokens[0]);
  });

  test('should refuse anyone but the host, and an unknown player', async () => {
    const { app, tokens } = await started();
    assert.throws(() => app.rejoin(tokens[1], 'p1', 'x'), /Only the table screen/);
    assert.throws(() => app.rejoin(app.game.hostToken, 'p9', 'x'), /No such player/);
  });

  test('should tell a late phone how to get back in', () => {
    const game = G.createGame();
    for (const name of ['A', 'B', 'C']) G.addPlayer(game, { name });
    G.applySetup(game, { tone: 'tense', length: 'short', hints: 2 });
    assert.throws(() => G.addPlayer(game, { name: 'A' }), /already started\. If you were playing, ask the table for your rejoin code: Rejoin a player\./);
  });

  test("should show the players' names and the chosen player's code", () => {
    const html = renderToStaticMarkup(<RejoinPanel players={[{ id: 'p1', name: 'Nikhil' }, { id: 'p2', name: 'Ben' }]} code={{ name: 'Nikhil', url: 'http://h/play#t=abc' }} onPick={() => {}} onClose={() => {}} />);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    assert.match(text, /Rejoin a player/);
    assert.match(text, /Nikhil/);
    assert.match(text, /Ben/);
    assert.match(text, /Nikhil: scan this, or open http:\/\/h\/play#t=abc/);
    assert.match(html, /<svg/);
  });
  test('should say the code hides soon and that it replaces the old link', () => {
    const html = renderToStaticMarkup(h(RejoinPanel, { players: [{ id: 'p1', name: 'Nikhil' }], code: { name: 'Nikhil', url: 'http://x/play#t=abc' }, onPick: () => {}, onClose: () => {} }));
    assert.match(html, /It hides in 30 seconds\. Their old link no longer works\./);
    assert.equal(REJOIN_SHOW_MS, 30_000);
  });
});
