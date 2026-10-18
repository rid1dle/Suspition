import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURE } from '../src/lib/soundtrack/fixture.ts';
import { cleanSoundtrack } from '../src/lib/soundtrack/clean.ts';
import { arrangeBar, stingerNotes } from '../src/lib/soundtrack/arrange.ts';
import { INSTRUMENTS } from '../src/lib/soundtrack/instruments.ts';
import { STINGER_KINDS } from '../src/lib/soundtrack/types.ts';
import type { InstrumentId } from '../src/lib/soundtrack/types.ts';

describe('the music lab fixture', () => {
  test('should keep the fixture valid after cleaning', () => {
    assert.deepEqual(cleanSoundtrack(FIXTURE, { rounds: 4, names: [] }), FIXTURE);
  });

  test('should give three different directions with four rounds each', () => {
    assert.equal(FIXTURE.directions.length, 3);
    assert.equal(new Set(FIXTURE.directions.map((d) => d.lead)).size, 3);
    for (const d of FIXTURE.directions) assert.equal(d.rounds.length, 4);
  });

  test('should play every round and stinger of the fixture inside the instruments', () => {
    for (const d of FIXTURE.directions) {
      const notes = [0, 1, 2, 3].flatMap((round) => [0, 1, 2, 3, 4, 5, 6, 7].flatMap((bar) => arrangeBar(d, round, bar, 1, null).events));
      notes.push(...[...STINGER_KINDS, 'hint' as const].flatMap((k) => stingerNotes(d, k)));
      assert.ok(notes.length > 50, d.name);
      for (const n of notes) {
        const inst = INSTRUMENTS[n.instrument as InstrumentId];
        if (inst) assert.ok(n.midi >= inst.range[0] && n.midi <= inst.range[1], `${d.name} ${n.instrument} ${n.midi}`);
      }
    }
  });
});
