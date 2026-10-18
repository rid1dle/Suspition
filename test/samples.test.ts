import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { measurePitch, noteName, noteMidi } from '../scripts/samples/pitch.ts';
import { MANIFEST } from '../src/lib/soundtrack/manifest.ts';
import { spaced } from '../scripts/build-samples.ts';

const SR = 44100;
const tone = (parts: [number, number][], seconds = 3) =>
  new Float32Array(SR * seconds).map((_, i) => parts.reduce((s, [hz, amp]) => s + amp * Math.sin((2 * Math.PI * hz * i) / SR), 0));

const PITCHED = ['piano', 'harp', 'violins', 'cellos', 'pizzicato', 'tremolo', 'basses', 'bass_pizz', 'flute', 'clarinet', 'oboe', 'horn', 'glockenspiel', 'marimba', 'timpani'];
const KIT = ['kick', 'snare', 'shaker', 'woodblock', 'triangle', 'cymbal', 'timpani_roll'];

describe('measurePitch', () => {
  test('should measure a pure 110 Hz tone as A2', () => {
    assert.ok(Math.abs(measurePitch(tone([[110, 1]]), SR)! - 110) < 1, 'within 1 Hz');
    assert.equal(noteName(45), 'A2');
  });

  test('should not halve the pitch of a tone with a strong second harmonic', () => {
    const hz = measurePitch(tone([[220, 1], [440, 1]]), SR)!;
    assert.ok(Math.abs(hz - 220) < 2, `read ${hz}`);
  });

  test('should return null for silence', () => {
    assert.equal(measurePitch(new Float32Array(SR), SR), null);
  });

  test('should name notes in scientific pitch with sharps, middle C as C4', () => {
    assert.equal(noteName(60), 'C4');
    assert.equal(noteName(66), 'F#4');
    assert.equal(noteMidi('F#3'), 54);
    assert.equal(noteMidi('A#0'), 22);
  });
});

describe('the bundled sample set', () => {
  test('should give every catalogue instrument and kit piece at least one sample on disk', () => {
    for (const id of [...PITCHED, ...KIT]) {
      const entry = MANIFEST[id];
      assert.ok(entry, `${id} is missing`);
      assert.ok(Object.keys(entry.notes).length >= 1, `${id} has no samples`);
      for (const file of Object.values(entry.notes)) assert.ok(existsSync(`public/samples/${file}`), `${file} is not on disk`);
    }
    for (const id of KIT) assert.deepEqual(Object.keys(MANIFEST[id].notes), ['hit']);
  });

  test('should keep the whole sample set at 30 MB or less', () => {
    assert.ok(Object.values(MANIFEST).reduce((n, i) => n + i.bytes, 0) <= 30 * 1024 * 1024, 'over budget');
  });

  test('should ship the VSCO licence with the samples', () => {
    assert.match(readFileSync('public/samples/LICENSE-VSCO.txt', 'utf8'), /CC0/);
  });

  // VSCO 2 CE samples these instruments more sparsely than every 4 semitones; nothing in between exists
  // in the same articulation, so they are held to the library's own spacing instead.
  const SPARSE: Record<string, number> = { flute: 5, clarinet: 5, oboe: 5, glockenspiel: 7, marimba: 7, horn: 14 };

  test('should space pitched samples at most 4 semitones apart', () => {
    for (const id of PITCHED) {
      const midi = Object.keys(MANIFEST[id].notes).map(noteMidi).sort((a, b) => a - b);
      for (let i = 1; i < midi.length; i += 1) assert.ok(midi[i] - midi[i - 1] <= (SPARSE[id] ?? 4), `${id}: ${noteName(midi[i - 1])} to ${noteName(midi[i])}`);
    }
  });

  test('should keep the fewest samples that still leave no gap over 4 semitones', () => {
    assert.deepEqual(spaced([48, 50, 52, 53, 55, 57]), [48, 52, 55, 57]);
    assert.deepEqual(spaced([40, 47, 49]), [40, 47, 49]);
    assert.deepEqual(spaced([60]), [60]);
  });
});
