import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { slowStreak, PARTICLE_AMBIENTS } from '../src/lib/effects.ts';

describe('table effects', () => {
  test('should drop to light effects after 3 slow seconds in a row', () => {
    assert.equal(slowStreak(0, 30), 1);
    assert.equal(slowStreak(2, 55), 0);
    let s = 0;
    for (const fps of [35, 30, 38]) s = slowStreak(s, fps);
    assert.equal(s, 3);
  });

  test('should use particles only for embers, fireflies, snow and dust', () => {
    assert.deepEqual([...PARTICLE_AMBIENTS].sort(), ['dust', 'embers', 'fireflies', 'snow']);
  });
});
