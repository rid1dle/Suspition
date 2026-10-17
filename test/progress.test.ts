import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { TopLevelTracker, stepForKey } from '../server/progress.ts';

function track(chunks) {
  const keys = [];
  const items = [];
  const t = new TopLevelTracker((k) => keys.push(k), (k, n) => items.push(`${k}:${n}`));
  for (const c of chunks) t.feed(c);
  return { keys, items, tracker: t };
}

const doc = JSON.stringify({
  title: 'A "quoted" {brace} [bracket] title',
  truth: { summary: 'x', timeline: [{ time: '9', event: 'y' }], culprit_ids: ['p1'] },
  players: [{ id: 'p1', hidden_facts: [{ id: 'h1' }] }, { id: 'p2', hidden_facts: [] }],
  clues: [{ id: 'c1', shows: 'a \\ backslash, and a "key": inside' }, { id: 'c2' }, { id: 'c3' }],
});

describe('TopLevelTracker', () => {
  test('should report each top-level key once, in order, ignoring nested keys', () => {
    assert.deepEqual(track([doc]).keys, ['title', 'truth', 'players', 'clues']);
  });

  test('should count items in top-level arrays of objects only', () => {
    assert.deepEqual(track([doc]).items, ['players:1', 'players:2', 'clues:1', 'clues:2', 'clues:3']);
  });

  test('should give the same answer however the stream is split', () => {
    const oneByOne = track(doc.split(''));
    assert.deepEqual(oneByOne.keys, ['title', 'truth', 'players', 'clues']);
    assert.deepEqual(oneByOne.items, track([doc]).items);
  });

  test('should not mistake braces, quotes or colons inside strings for structure', () => {
    const { keys } = track(['{"a": "x\\": {\\"fake\\": 1}", "b": 1}']);
    assert.deepEqual(keys, ['a', 'b']);
  });

  test('should start over after a reset, for a second draft', () => {
    const { tracker, keys } = track(['{"players": [{}, {}']);
    tracker.reset();
    tracker.feed('{"players": [{}');
    assert.deepEqual(keys, ['players', 'players']);
    assert.equal(tracker.counts.players, 1);
  });
});

describe('stepForKey', () => {
  test('should group scenario fields into the steps shown on screen', () => {
    assert.equal(stepForKey('opening_scene'), 'scene');
    assert.equal(stepForKey('twists'), 'hints');
    assert.equal(stepForKey('key_deductions'), 'deductions');
    assert.equal(stepForKey('nonsense'), null);
  });
});
