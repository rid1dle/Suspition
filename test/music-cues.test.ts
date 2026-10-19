import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cuesBetween } from '../src/lib/music-theory.ts';

const v = (extra: Record<string, unknown> = {}) => ({ gameId: 'g', status: 'playing', hintsLeft: 3, phase: { index: 0 }, seat: null, round: { vote: null }, ...extra });

describe('cuesBetween for the soundtrack', () => {
  test('should cue a seat when a hot seat goes live', () => {
    assert.deepEqual(cuesBetween(v({ seat: { name: 'Asha', status: 'getready' } }), v({ seat: { name: 'Asha', status: 'live' } })), ['seat']);
    assert.deepEqual(cuesBetween(v({ seat: { name: 'Asha', status: 'live' } }), v({ seat: { name: 'Bo', status: 'live' } })), ['seat']);
    assert.deepEqual(cuesBetween(v({ seat: { name: 'Asha', status: 'live' } }), v({ seat: { name: 'Asha', status: 'live' } })), []);
    assert.deepEqual(cuesBetween(v(), v({ seat: { name: 'Asha', status: 'getready' } })), []);
  });

  test('should cue a vote when the round vote opens', () => {
    assert.deepEqual(cuesBetween(v(), v({ round: { vote: { endsAt: 5, voted: 0, of: 3 } } })), ['vote']);
    assert.deepEqual(cuesBetween(v({ round: { vote: { endsAt: 5, voted: 0, of: 3 } } }), v({ round: { vote: { endsAt: 5, voted: 1, of: 3 } } })), []);
    assert.deepEqual(cuesBetween(v({ round: null }), v({ round: { vote: { endsAt: 5, voted: 0, of: 3 } } })), ['vote']);
  });
});
