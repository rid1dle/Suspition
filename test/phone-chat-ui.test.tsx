import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import * as G from '../server/game.ts';
import { gameInReading, emptyAsk } from './fixtures.ts';
import { Playing } from '../src/app/play/playing';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
function withLayout<T>(layout: string | null, run: () => T): T {
  const store = new Map(layout ? [['detective-chat-layout', layout]] : []);
  store.set('detective-intro-g1', '1');
  const before = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) }, configurable: true, writable: true });
  try {
    return run();
  } finally {
    if (before) Object.defineProperty(globalThis, 'localStorage', before);
    else delete (globalThis as Record<string, unknown>).localStorage;
  }
}
const phone = (game, pid, layout: string | null = null) => withLayout(layout, () => text(renderToStaticMarkup(h(Playing, { view: { ...G.playerView(game, pid, 3_000), gameId: 'g1' }, dots: new Set(), clearDot: () => {} }))));

function playing(n = 3) {
  const game = gameInReading(n);
  G.startPlay(game, 1_000);
  return game;
}

describe('the phone chat, room and private apart', () => {
  test('should open on the Room tab with the GM answering, and offer Private beside it', () => {
    const out = phone(playing(), 'p2');
    assert.match(out, /Room\s+Private/);
    assert.match(out, /To Everyone/);
    assert.match(out, /GM answers/);
    assert.match(out, /Everyone hears it\. Free\./);
  });

  test('should keep a message between two players off the Room tab and show it to both in one stream', () => {
    const game = playing();
    G.sendDm(game, 'p1', 'p2', 'MEET-ME-AT-THE-WELL', 2_000);
    assert.doesNotMatch(phone(game, 'p2'), /MEET-ME-AT-THE-WELL/);
    assert.match(phone(game, 'p2', 'stream'), /Character 1 · only you two MEET-ME-AT-THE-WELL/);
    assert.match(phone(game, 'p1', 'stream'), /You → Character 2 MEET-ME-AT-THE-WELL/);
    assert.doesNotMatch(phone(game, 'p3', 'stream'), /MEET-ME-AT-THE-WELL/);
  });

  test('should offer to tell the room what a private reply showed', () => {
    const game = playing();
    G.beginAsk(game, 'p2', { kind: 'chat', text: 'I look' });
    G.completeAsk(game, 'p2', { ...emptyAsk, answer: 'Prints on the floor.', tell: 'I found prints.' }, 2_000);
    assert.match(phone(game, 'p2', 'stream'), /Prints on the floor\.[\s\S]*Tell the room/);
  });

  test('should show a card to come along when someone asks everyone to go somewhere', () => {
    const game = playing();
    G.invite(game, 'p1', 'l2', 2_000);
    const out = phone(game, 'p3');
    assert.match(out, /Character 1 asks everyone to come To the Kitchen\. Go with them Not now/);
  });

  test('should give the GM its own tab and People its own in the three-tab layout', () => {
    const out = phone(playing(), 'p2', 'three');
    assert.match(out, /Room\s+GM\s+People/);
  });

  test('should hide People and messages for a player alone', () => {
    const out = phone(playing(1), 'p1', 'three');
    assert.doesNotMatch(out, /People\s*$|GM\s+People/);
  });
});
