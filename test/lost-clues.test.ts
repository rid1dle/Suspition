import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../server/game.ts';
import { feedItem } from '../src/lib/feed.ts';
import { gameInReading } from './fixtures.ts';

// From story run 5: the bar prints burned, and a round later a player "showed" them, clear, to the room.
function playing() {
  const game = gameInReading(4);
  G.startPlay(game, 1_000);
  game.state.found.p2.push('c1');
  return game;
}

describe('a clue that is gone is told, not shown', () => {
  test('should tell the room what a destroyed clue showed, from memory', () => {
    const game = playing();
    game.state.destroyed.push('c1');
    G.shareClue(game, 'p2', 'c1', 2_000);
    const e = game.state.events.at(-1);
    assert.match(e.text, /^Character 2 tells the room what a lost clue showed\. Torn glove: CLUE-1-SHOWS$/);
    assert.equal(e.lost, 'destroyed');
    assert.equal(game.state.shared.at(-1).lost, 'destroyed');
  });

  test('should show only what is left of a damaged clue', () => {
    const game = playing();
    game.state.damaged = ['c1'];
    G.shareClue(game, 'p2', 'c1', 2_000);
    assert.match(game.state.events.at(-1).text, /^Character 2 shows what is left of a clue\. Torn glove: CLUE-1-SHOWS$/);
  });

  test('should keep the usual words for a clue that is whole', () => {
    const game = playing();
    G.shareClue(game, 'p2', 'c1', 2_000);
    assert.match(game.state.events.at(-1).text, /^Character 2 shows a clue\. Torn glove/);
    assert.equal(game.state.shared.at(-1).lost, undefined);
  });

  test('should tell the out-loud GM and the table the clue is gone', () => {
    const game = playing();
    game.state.destroyed.push('c1');
    G.shareClue(game, 'p2', 'c1', 2_000);
    assert.match(G.publicKnowledge(game).shared_clues[0], /Torn glove \(destroyed: known only from what Character 2 remembers\): CLUE-1-SHOWS/);
    assert.equal(G.tableView(game, 2_000).sharedClues[0].lost, 'destroyed');
  });

  test('should say in the feed that a lost clue was told', () => {
    assert.equal(feedItem({ kind: 'clue', text: 'x', by: 'Jai', name: 'Bar prints', lost: 'destroyed' }).text, 'Jai told the room about a lost clue: Bar prints');
    assert.equal(feedItem({ kind: 'clue', text: 'x', by: 'Jai', name: 'Bar prints', lost: 'damaged' }).text, 'Jai showed what is left of a clue: Bar prints');
  });
});
