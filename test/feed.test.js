import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { feedItem, roundGroups, feedHtml, visibleCount } from '../public/feed.js';

const ev = (phase, kind, text, extra = {}) => ({ phase, kind, text, ...extra });

describe('news feed', () => {
  test('should hide news that another part of the screen already shows', () => {
    for (const kind of ['opening', 'phase', 'goal', 'vote', 'moment']) assert.equal(feedItem(ev(0, kind, 'x')), null);
    assert.deepEqual(feedItem(ev(0, 'event', 'A door slams.')), { kind: 'event', text: 'A door slams.' });
  });

  test('should shorten a shared clue to who showed what, pointing to the Clues tab', () => {
    assert.deepEqual(feedItem(ev(0, 'clue', 'Jai shows a clue. Bribe Envelope: Cash under the boards.', { by: 'Jai', name: 'Bribe Envelope' })),
      { kind: 'clue', text: 'Jai showed a clue: Bribe Envelope', tab: 'clues' });
    assert.equal(feedItem(ev(0, 'clue', 'Jai shows a clue. Old Clipping: A story.')).text, 'Jai showed a clue: Old Clipping');
  });

  test('should mark a round vote result as right or wrong', () => {
    assert.equal(feedItem(ev(1, 'round', 'Most said: fuse. That is right! The lights were cut.')).kind, 'right');
    assert.equal(feedItem(ev(1, 'round', 'Most said: hand. Not quite. Look at the box.')).kind, 'wrong');
  });

  test('should group news by round, newest round and newest item first, named after the round', () => {
    const groups = roundGroups([
      ev(-1, 'qa', 'Yes.', { by: 'Asha', q: 'Cold?' }),
      ev(0, 'phase', 'Round 1 of 3: The Lights'),
      ev(0, 'event', 'First'),
      ev(0, 'event', 'Second'),
      ev(1, 'phase', 'Round 2 of 3: The Glove'),
      ev(1, 'goal', "This round's goal: Whose glove?"),
    ]);
    assert.deepEqual(groups.map((g) => g.title), ['Round 1 · The Lights', 'Before round 1']);
    assert.deepEqual(groups[0].items.map((i) => i.text), ['Second', 'First']);
  });

  test('should open only the newest round and fold the rest, remembering folds the reader opened', () => {
    const events = [ev(0, 'event', 'Old news'), ev(1, 'event', 'New news')];
    const html = feedHtml(events);
    assert.match(html, /<div class="round-group current"><div class="label">This round<\/div>[\s\S]*New news/);
    assert.match(html, /<details class="round-group" data-round="0"><summary>Round 1 <span class="muted small">1 update<\/span>/);
    assert.match(feedHtml(events, { open: new Set([0]) }), /data-round="0" open>/);
  });

  test('should flash only the fresh items and escape text', () => {
    const html = feedHtml([ev(0, 'event', 'Old'), ev(0, 'event', '<b>New</b>')], { fresh: 1 });
    assert.match(html, /<li class="k-event fresh"><div>&lt;b&gt;New&lt;\/b&gt;<\/div><\/li><li class="k-event">/);
  });

  test('should say so when nothing has happened, and count only visible news', () => {
    assert.match(feedHtml([ev(0, 'phase', 'Round 1 of 3: A')]), /Nothing has happened yet/);
    assert.equal(visibleCount([ev(0, 'phase', 'x'), ev(0, 'event', 'y'), ev(0, 'moment', 'z')]), 1);
  });
});
