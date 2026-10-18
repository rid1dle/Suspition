import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSoundtrack } from '../src/lib/soundtrack/clean.ts';
import { INSTRUMENTS, KIT_IDS, defaultFor, instrumentsOf } from '../src/lib/soundtrack/instruments.ts';
import type { Direction, RoundPlan } from '../src/lib/soundtrack/types.ts';

const plan = (extra: Partial<RoundPlan> = {}): RoundPlan => ({ mood: 'quiet and curious', chords: [0, 5, 3, 4], variation: 'plain', shift: 0, pulse: 'none', groove: 'none', low: 0.1, high: 0.4, ...extra });

const direction = (extra: Partial<Direction> = {}): Direction => ({
  name: 'Candle and Cello',
  line: 'Slow cellos and a ticking clock.',
  tempo: 72,
  root: 'D',
  mode: 'minor',
  lead: 'cellos',
  harmony: 'violins',
  bass: 'basses',
  texture: 'harp',
  kit: ['shaker', 'kick'],
  theme: [{ degree: 0, beats: 1 }, { degree: 1, beats: 1 }, { degree: 2, beats: 2 }, { degree: 4, beats: 1 }, { degree: 3, beats: 1 }, { degree: 2, beats: 2 }],
  rounds: [plan(), plan({ chords: [0, 3, 4, 0, 5, 3, 1, 4], variation: 'dark', pulse: 'arp_up', groove: 'ticking', low: 0.3, high: 0.7 }), plan({ variation: 'broken', shift: 2, pulse: 'ostinato', groove: 'heartbeat', low: 0.5, high: 1 })],
  stingers: { round: 'swell', seat: 'hit', vote: 'rise', reveal: 'chime' },
  ...extra,
});

const clean = (directions: unknown[], opts: { rounds?: number; names?: string[]; chosen?: unknown } = {}) =>
  cleanSoundtrack({ directions, chosen: opts.chosen ?? 0 }, { rounds: opts.rounds ?? 3, names: opts.names ?? [] });

describe('the instrument catalogue', () => {
  test('should give every instrument a plain label, roles and a range around its samples', () => {
    for (const [id, i] of Object.entries(INSTRUMENTS)) {
      assert.ok(i.label && i.roles.length, id);
      assert.ok(i.range[0] < i.range[1], id);
    }
    assert.deepEqual(INSTRUMENTS.pad.range, [36, 84]);
    assert.deepEqual(INSTRUMENTS.cellos.range, [36 - 5, 77 + 5]);
  });

  test('should default each role to a sound that can play it', () => {
    assert.deepEqual([defaultFor('lead'), defaultFor('harmony'), defaultFor('bass'), defaultFor('texture')], ['piano', 'violins', 'cellos', 'harp']);
    assert.equal(KIT_IDS.length, 7);
  });

  test('should list each sound a direction needs once', () => {
    assert.deepEqual(instrumentsOf(direction({ texture: 'cellos', kit: ['kick'] })), ['cellos', 'violins', 'basses', 'kick']);
  });
});

describe('cleanSoundtrack', () => {
  test('should keep a valid direction as given', () => {
    assert.deepEqual(clean([direction()]), { directions: [direction()], chosen: 0 });
  });

  test('should replace an unknown or wrong-role instrument with the role default', () => {
    const d = clean([direction({ lead: 'kazoo' as never, bass: 'flute' })])!.directions[0];
    assert.equal(d.lead, 'piano');
    assert.equal(d.bass, 'cellos');
  });

  test('should clamp tempo, theme degrees and beats into playable values', () => {
    const theme = [{ degree: 99, beats: 0.3 }, { degree: 1, beats: 1 }, { degree: 2, beats: 1 }, { degree: -30, beats: 1 }];
    const d = clean([direction({ tempo: 400, theme })])!.directions[0];
    assert.equal(d.tempo, 140);
    assert.equal(d.theme[0].degree, 14);
    assert.equal(d.theme[0].beats, 0.5);
    assert.equal(d.theme[3].degree, -7);
    assert.equal(d.theme.reduce((n, t) => n + t.beats, 0), 8, 'padded to 8 beats');
    assert.ok(d.theme.slice(4).every((t) => t.rest), 'padded with rests');
  });

  test('should pad a theme past 8 beats to 16 and trim one past 16', () => {
    const long = Array.from({ length: 10 }, (_, i) => ({ degree: i % 5, beats: 2 }));
    const trimmed = clean([direction({ theme: long })])!.directions[0].theme;
    assert.equal(trimmed.reduce((n, t) => n + t.beats, 0), 16);
    const mid = Array.from({ length: 5 }, (_, i) => ({ degree: i, beats: 2 }));
    assert.equal(clean([direction({ theme: mid })])!.directions[0].theme.reduce((n, t) => n + t.beats, 0), 16);
  });

  test('should give every game round a plan, repeating the last when the GM wrote too few', () => {
    const d = clean([direction({ rounds: [plan(), plan({ variation: 'slow', high: 0.9 })] })], { rounds: 5 })!.directions[0];
    assert.equal(d.rounds.length, 5);
    for (const r of d.rounds.slice(2)) assert.deepEqual(r, d.rounds[1]);
  });

  test('should drop extra round plans', () => {
    assert.equal(clean([direction()], { rounds: 2 })!.directions[0].rounds.length, 2);
  });

  test('should give a direction with no round plans a calm default for each round', () => {
    const d = clean([direction({ rounds: [] })], { rounds: 2 })!.directions[0];
    assert.equal(d.rounds.length, 2);
    assert.ok(d.rounds.every((r) => r.chords.length === 4));
  });

  test('should keep chords to 4 or 8 scale degrees from 0 to 6', () => {
    assert.deepEqual(clean([direction({ rounds: [plan({ chords: [0, 9, 4] })] })], { rounds: 1 })!.directions[0].rounds[0].chords, [0, 6, 4, 0]);
    assert.deepEqual(clean([direction({ rounds: [plan({ chords: [0, 1, 2, 3, 4, 5] })] })], { rounds: 1 })!.directions[0].rounds[0].chords, [0, 1, 2, 3]);
    assert.equal(clean([direction({ rounds: [plan({ chords: Array(12).fill(1) })] })], { rounds: 1 })!.directions[0].rounds[0].chords.length, 8);
  });

  test('should order low and high and keep them between 0 and 1', () => {
    const r = clean([direction({ rounds: [plan({ low: 0.9, high: 0.2 })] })], { rounds: 1 })!.directions[0].rounds[0];
    assert.deepEqual([r.low, r.high], [0.2, 0.9]);
    const out = clean([direction({ rounds: [plan({ low: -3, high: 7 })] })], { rounds: 1 })!.directions[0].rounds[0];
    assert.deepEqual([out.low, out.high], [0, 1]);
  });

  test('should fall back to the safe choice for unknown styles, keys and stingers', () => {
    const d = clean([direction({ root: 'H', mode: 'locrian', stingers: { round: 'boom' } as never, rounds: [plan({ variation: 'wild' as never, pulse: 'x' as never, groove: 'y' as never, shift: 40 })] })], { rounds: 1 })!.directions[0];
    assert.equal(d.root, 'C');
    assert.equal(d.mode, 'minor');
    assert.deepEqual(d.stingers, { round: 'swell', seat: 'swell', vote: 'swell', reveal: 'swell' });
    assert.deepEqual([d.rounds[0].variation, d.rounds[0].pulse, d.rounds[0].groove, d.rounds[0].shift], ['plain', 'none', 'none', 7]);
  });

  test("should never show a person's name in a direction name or line", () => {
    const s = clean([direction({ name: "Priya's Waltz", line: 'A waltz for PRIYA and the lake.' }), direction({ name: 'The Vale Nocturne', line: 'Slow piano at night.' })], { names: ['Priya', 'Dr. Edmund Vale'] })!;
    assert.equal(s.directions[0].name, 'Music 1');
    assert.equal(s.directions[0].line, '');
    assert.equal(s.directions[1].name, 'Music 2');
    assert.equal(s.directions[1].line, 'Slow piano at night.');
  });

  test('should hide a two-letter player name but not two-letter words inside longer names', () => {
    assert.equal(clean([direction({ name: "Bo's Blues" })], { names: ['Bo'] })!.directions[0].name, 'Music 1');
    assert.equal(clean([direction({ name: 'Al and the Sea' })], { names: ['Jo Al Smith'] })!.directions[0].name, 'Al and the Sea');
  });

  test('should keep a name when a person is only part of a longer word', () => {
    assert.equal(clean([direction({ name: 'Valentine Waltz' })], { names: ['Vale'] })!.directions[0].name, 'Valentine Waltz');
  });

  test('should take long dashes out of names and lines', () => {
    const d = clean([direction({ name: 'Ice — and Fire', line: 'Cold strings – then warm horns.' })])!.directions[0];
    assert.equal(d.name, 'Ice, and Fire');
    assert.equal(d.line, 'Cold strings, then warm horns.');
  });

  test('should keep at most 3 directions and return null when none can play', () => {
    assert.equal(clean([direction(), direction(), direction(), direction()])!.directions.length, 3);
    const short = direction({ theme: [{ degree: 0, beats: 1 }, { degree: 1, beats: 1 }, { degree: 2, beats: 1, rest: true }, { degree: 3, beats: 1 }] });
    assert.equal(clean([short]), null);
    assert.equal(clean([short, direction()])!.directions.length, 1);
    assert.equal(cleanSoundtrack(null, { rounds: 3, names: [] }), null);
    assert.equal(cleanSoundtrack({ directions: 'nope' }, { rounds: 3, names: [] }), null);
  });

  test('should cap the kit at 3 known pieces', () => {
    const d = clean([direction({ kit: ['kick', 'gong', 'snare', 'kick', 'shaker', 'cymbal'] as never })])!.directions[0];
    assert.deepEqual(d.kit, ['kick', 'snare', 'shaker']);
  });

  test('should keep chosen inside the directions', () => {
    assert.equal(clean([direction(), direction()], { chosen: 1 })!.chosen, 1);
    assert.equal(clean([direction(), direction()], { chosen: 5 })!.chosen, 0);
    assert.equal(clean([direction()], { chosen: 'x' })!.chosen, 0);
  });
});
