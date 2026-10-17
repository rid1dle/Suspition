import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMusic, degreeToMidi, midiToFreq, intensityFor, cuesBetween, triad } from '../src/lib/music-theory.ts';

describe('sanitizeMusic', () => {
  test('should keep a valid theme as given', () => {
    const m = { root: 'A', mode: 'dorian', tempo: 70, palette: 'bells', percussion: 'tribal', motif: [0, 2, 3, 5] };
    assert.deepEqual(sanitizeMusic(m, 'cozy'), m);
  });

  test('should fall back to the tone default for anything missing or invalid', () => {
    const m = sanitizeMusic({ root: 'H', mode: 'locrian', tempo: 'fast', palette: 'kazoo', motif: [1] }, 'dark');
    assert.deepEqual(m, sanitizeMusic(null, 'dark'));
    assert.equal(m.mode, 'phrygian');
  });

  test('should clamp tempo and motif degrees into playable ranges', () => {
    const m = sanitizeMusic({ tempo: 400, motif: [0, 99, -4, 2, 1, 1, 1, 1, 1, 1] }, 'tense');
    assert.equal(m.tempo, 140);
    assert.deepEqual(m.motif, [0, 7, 0, 2, 1, 1, 1, 1]);
  });

  test('should give old saved games without a theme a sound for their tone', () => {
    assert.equal(sanitizeMusic(undefined, 'funny').palette, 'marimba');
    assert.equal(sanitizeMusic(undefined, 'nonsense').mode, 'harmonic_minor');
  });
});

describe('pitch', () => {
  test('should put A4 at 440 Hz', () => {
    assert.equal(midiToFreq(69), 440);
    assert.equal(degreeToMidi({ root: 'A', mode: 'minor' }, 0, 4), 69);
  });

  test('should walk the chosen mode and wrap into the next octave', () => {
    const m = { root: 'C', mode: 'major' };
    assert.deepEqual([0, 1, 2, 7].map((d) => degreeToMidi(m, d, 4)), [60, 62, 64, 72]);
    assert.equal(degreeToMidi({ root: 'C', mode: 'phrygian' }, 1, 4), 61);
  });

  test('should build triads from the mode, minor in minor keys', () => {
    assert.deepEqual(triad({ root: 'A', mode: 'minor' }, 0, 3), [57, 60, 64]);
    assert.deepEqual(triad({ root: 'C', mode: 'major' }, 0, 3), [48, 52, 55]);
  });
});

describe('intensityFor', () => {
  const playing = (index, suspicion, endsAt = Date.now() + 600_000) => ({ status: 'playing', suspicion, phase: { index, count: 4, endsAt } });

  test('should stay calm in the lobby and while the world is written', () => {
    assert.ok(intensityFor({ status: 'lobby' }) <= 0.2);
    assert.ok(intensityFor({ status: 'generating' }) <= 0.2);
  });

  test('should rise with each phase and with suspicion', () => {
    assert.ok(intensityFor(playing(2, 20)) > intensityFor(playing(0, 20)));
    assert.ok(intensityFor(playing(1, 90)) > intensityFor(playing(1, 10)));
  });

  test('should push harder in the last minute of a phase, but never past 1', () => {
    const now = Date.now();
    assert.ok(intensityFor(playing(1, 50, now + 30_000), now) > intensityFor(playing(1, 50, now + 300_000), now));
    assert.ok(intensityFor(playing(3, 100, now + 1_000), now) <= 1);
  });
});

describe('cuesBetween', () => {
  const v = (extra) => ({ gameId: 'g', status: 'playing', hintsLeft: 3, phase: { index: 0 }, ...extra });

  test('should cue a hint chime when the pool shrinks', () => {
    assert.deepEqual(cuesBetween(v(), v({ hintsLeft: 2 })), ['hint']);
  });

  test('should cue a swell on a new phase and when play starts', () => {
    assert.deepEqual(cuesBetween(v(), v({ phase: { index: 1 } })), ['phase']);
    assert.deepEqual(cuesBetween(v({ status: 'reading', phase: null }), v()), ['phase']);
  });

  test('should cue the final and the reveal', () => {
    assert.deepEqual(cuesBetween(v(), v({ status: 'final' })), ['final']);
    assert.deepEqual(cuesBetween(v({ status: 'final' }), v({ status: 'reveal' })), ['reveal']);
  });

  test('should stay silent across a new game or the first view', () => {
    assert.deepEqual(cuesBetween(null, v()), []);
    assert.deepEqual(cuesBetween(v(), v({ gameId: 'other', hintsLeft: 0 })), []);
  });
});
