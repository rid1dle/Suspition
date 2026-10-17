import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sameStory } from '../scripts/simplify-game.ts';
import { makeScenario } from './fixtures.ts';

describe('sameStory', () => {
  test('should accept a rewrite that only changes the words', () => {
    const before = makeScenario(3);
    const after = structuredClone(before);
    after.opening_scene = 'Short and simple.';
    after.players[0].private_info = 'You did it.';
    assert.deepEqual(sameStory(before, after), []);
  });

  test('should refuse a rewrite that changes who did it, a side, a name or the clues', () => {
    const before = makeScenario(3);
    const after = structuredClone(before);
    after.truth.culprit_ids = ['p2'];
    after.players[1].side = 'culprit';
    after.players[2].character_name = 'Someone Else';
    after.clues.pop();
    const problems = sameStory(before, after).join(' | ');
    for (const bit of ['culprits changed', 'p2 side changed', 'p3 name changed', 'clues changed']) assert.ok(problems.includes(bit), bit);
  });
});
