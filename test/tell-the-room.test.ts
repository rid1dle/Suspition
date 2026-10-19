import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import * as G from '../server/game.ts';
import { GM } from '../server/gm.ts';
import { gameInReading } from './fixtures.ts';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CluesBody } from '../src/app/play/playing.tsx';

function playing() {
  const game = gameInReading(3);
  G.startPlay(game, 2_000);
  game.state.found.p2 = ['c1'];
  return game;
}
const say = (game, pid, text) => {
  G.beginPublicAsk(game, pid, text);
  G.completePublicAsk(game, pid, 'Everyone listens.', 3_000);
};
const glove = (game, pid) => G.playerView(game, pid).clues.find((c) => c.id === 'c1');

describe('telling the room about a find, in your own words', () => {
  test('should mark the find as told when the player tells the room about it', () => {
    const game = playing();
    say(game, 'p2', 'Everyone, I found a torn glove by the window!');
    assert.equal(glove(game, 'p2').told, true);
  });

  test('should not show everyone the whole clue: the room heard only the words said', () => {
    const game = playing();
    say(game, 'p2', 'Everyone, I found a torn glove by the window!');
    assert.deepEqual(G.tableView(game).sharedClues, []);
  });

  test('should not mark a find the player did not talk about', () => {
    const game = playing();
    say(game, 'p2', 'Who was in the kitchen at nine?');
    assert.equal(glove(game, 'p2').told, false);
  });

  test('should not mark a clue someone else found', () => {
    const game = playing();
    say(game, 'p3', 'I heard there is a torn glove somewhere.');
    assert.equal(G.playerView(game, 'p3').clues.length, 0);
    assert.equal(glove(game, 'p2').told, false);
  });
});

describe('the GM characters never doubt what a speaker really found', () => {
  test('should give the out-loud answer what the asker found, marked as only theirs', async () => {
    const game = playing();
    const seen = [];
    const gm = new GM({ workDir: tmpdir(), run: async (opts) => { seen.push(opts); return { lines: [], ripple: '', refused: { refused: false, why: '' }, asker_read: { intent: '', persona: '', facts: [], play: { points: 0, skill: '', why: '' } } }; } });
    await gm.publicAnswer(game, 'I found a torn glove!', null, 'p2');
    const system = String(seen[0]?.system ?? seen[0]?.systemPrompt ?? JSON.stringify(seen[0]));
    assert.match(system, /CLUE-1-SHOWS/);
    assert.match(system, /never doubt/i);
  });

  test('should give nothing extra for a question from someone with no finds', async () => {
    const game = playing();
    const seen = [];
    const gm = new GM({ workDir: tmpdir(), run: async (opts) => { seen.push(opts); return { lines: [], ripple: '', refused: { refused: false, why: '' }, asker_read: { intent: '', persona: '', facts: [], play: { points: 0, skill: '', why: '' } } }; } });
    await gm.publicAnswer(game, 'Who is here?', null, 'p3');
    assert.doesNotMatch(JSON.stringify(seen[0]), /CLUE-1-SHOWS/);
  });
});

describe('the clue drawer after telling the room', () => {
  test('should say the find was told and offer the whole clue quietly, not ask to announce it again', () => {
    const game = playing();
    say(game, 'p2', 'Everyone, I found a torn glove by the window!');
    const html = renderToStaticMarkup(React.createElement(CluesBody, { view: G.playerView(game, 'p2') }));
    assert.match(html, /You told the room in your own words\./);
    assert.match(html, /Show all of it/);
    assert.doesNotMatch(html, />Show everyone</);
  });

  test('should still offer Show everyone for a find nobody has heard about', () => {
    const game = playing();
    const html = renderToStaticMarkup(React.createElement(CluesBody, { view: G.playerView(game, 'p2') }));
    assert.match(html, />Show everyone</);
  });
});
