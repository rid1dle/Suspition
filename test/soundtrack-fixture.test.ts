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

  test("should play the lead's melody in a 10 s preview of each fixture direction", () => {
    for (const d of FIXTURE.directions) {
      const bars = Math.ceil((10 * d.tempo) / 60 / 4);
      const melody = Array.from({ length: bars }, (_, bar) => arrangeBar(d, 0, bar, 0.55, null).events).flat().filter((e) => e.part === 'melody' && e.instrument === d.lead);
      assert.ok(melody.length >= 3, `${d.name}: ${melody.length} melody notes`);
    }
  });

  test('should play the theme while the table reads, not just a pad', () => {
    const reading = 0.25;
    for (const d of FIXTURE.directions) {
      const parts = new Set(arrangeBar(d, 0, 0, reading, null).events.map((e) => e.part));
      assert.ok(parts.has('melody'), d.name);
    }
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
