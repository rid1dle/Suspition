import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { gameInReading, emptyPhase } from './fixtures.ts';

const playing = (n = 3) => {
  const game = gameInReading(n, 1_000, { questions: true });
  G.startPlay(game, 1_000);
  return game;
};
const MIN = 60_000;

describe('asking the group to vote now', () => {
  test('should start the round vote once every other player says yes', () => {
    const game = playing(3);
    G.askVote(game, 'p1', 2_000);
    G.answerVoteAsk(game, 'p2', true, 3_000);
    assert.equal(game.state.roundVote, null);
    G.answerVoteAsk(game, 'p3', true, 4_000);
    assert.ok(game.state.roundVote);
    assert.equal(game.state.voteAsk, null);
  });

  test('should drop the request when anyone says no', () => {
    const game = playing(3);
    G.askVote(game, 'p1', 2_000);
    G.answerVoteAsk(game, 'p2', false, 3_000);
    assert.equal(game.state.voteAsk, null);
    assert.equal(game.state.roundVote, null);
  });

  test('should close a request after one minute', () => {
    const game = playing(3);
    G.askVote(game, 'p1', 2_000);
    G.resolveVoteAsk(game, 2_000 + MIN);
    assert.equal(game.state.voteAsk, null);
  });

  test('should block a player for the round after two requests nobody took within five minutes', () => {
    const game = playing(3);
    G.askVote(game, 'p1', 2_000);
    G.resolveVoteAsk(game, 2_000 + MIN);
    G.askVote(game, 'p1', 3 * MIN);
    G.answerVoteAsk(game, 'p2', false, 3 * MIN + 1_000);
    assert.throws(() => G.askVote(game, 'p1', 4 * MIN), /next round/);
    assert.doesNotThrow(() => G.askVote(game, 'p2', 4 * MIN));
  });

  test('should lift the block when the next round starts', () => {
    const game = playing(3);
    for (const at of [2_000, 2 * MIN]) {
      G.askVote(game, 'p1', at);
      G.resolveVoteAsk(game, at + MIN);
    }
    assert.throws(() => G.askVote(game, 'p1', 4 * MIN), /next round/);
    G.beginPhaseChange(game);
    G.completePhase(game, emptyPhase, 5 * MIN);
    assert.doesNotThrow(() => G.askVote(game, 'p1', 6 * MIN));
  });

  test('should not count a request someone else said yes to', () => {
    const game = playing(3);
    G.askVote(game, 'p1', 2_000);
    G.answerVoteAsk(game, 'p2', true, 3_000);
    G.answerVoteAsk(game, 'p3', false, 4_000);
    G.askVote(game, 'p1', 2 * MIN);
    G.resolveVoteAsk(game, 3 * MIN + 1);
    assert.doesNotThrow(() => G.askVote(game, 'p1', 4 * MIN));
  });

  test('should not count requests more than five minutes apart', () => {
    const game = playing(3);
    G.askVote(game, 'p1', 2_000);
    G.resolveVoteAsk(game, 2_000 + MIN);
    G.askVote(game, 'p1', 8 * MIN);
    G.resolveVoteAsk(game, 9 * MIN);
    assert.doesNotThrow(() => G.askVote(game, 'p1', 10 * MIN));
  });

  test('should refuse a request while a vote or another request is open', () => {
    const game = playing(3);
    G.askVote(game, 'p1', 2_000);
    assert.throws(() => G.askVote(game, 'p2', 3_000), /already/);
    G.answerVoteAsk(game, 'p2', true, 3_000);
    G.answerVoteAsk(game, 'p3', true, 3_000);
    assert.throws(() => G.askVote(game, 'p2', 4_000), /vote is open/);
  });

  test('should show everyone who asked and how many said yes', () => {
    const game = playing(3);
    G.askVote(game, 'p1', 2_000);
    G.answerVoteAsk(game, 'p2', true, 3_000);
    const ask = G.tableView(game, 3_500).voteAsk;
    assert.deepEqual({ proposer: ask.proposer, yes: ask.yes, need: ask.need }, { proposer: game.players[0].name, yes: 2, need: 3 });
    assert.equal(G.playerView(game, 'p2', 3_500).myVoteAsk, true);
    assert.equal(G.playerView(game, 'p3', 3_500).myVoteAsk, null);
  });
});

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { Playing as PhonePlaying } from '../src/app/play/playing';
import { Playing as TablePlaying } from '../src/app/table/playing';

const phone = (game, id) => renderToStaticMarkup(h(PhonePlaying, { view: G.playerView(game, id, 3_000), dots: new Set(), clearDot: () => {} }));

describe('vote requests on screen', () => {
  test('should offer every player a way to ask for the vote', () => {
    assert.match(phone(playing(3), 'p2'), /Ask to vote now/);
  });

  test('should ask the others yes or no, and show the asker the count', () => {
    const game = playing(3);
    G.askVote(game, 'p1', 2_000);
    assert.match(phone(game, 'p2'), /wants to vote now[\s\S]*Yes[\s\S]*Not yet/);
    assert.match(phone(game, 'p1'), /1 of 3 ready/);
  });

  test('should tell a blocked player they can ask again next round', () => {
    const game = playing(3);
    for (const at of [2_000, 2 * MIN]) {
      G.askVote(game, 'p1', at);
      G.resolveVoteAsk(game, at + MIN);
    }
    const html = renderToStaticMarkup(h(PhonePlaying, { view: G.playerView(game, 'p1', 4 * MIN), dots: new Set(), clearDot: () => {} }));
    assert.match(html, /You can ask for the vote again next round/);
  });

  test('should show the table who asked to vote', () => {
    const game = playing(3);
    G.askVote(game, 'p1', 2_000);
    const html = renderToStaticMarkup(h(TablePlaying, { view: G.tableView(game, 3_000), host: null, act: async () => null, readNow: () => {}, onNewGame: () => {} } as never));
    assert.match(html, new RegExp(`${game.players[0].name}[^<]*</b> wants to vote now`));
  });
});
