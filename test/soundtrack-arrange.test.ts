import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { roundPlan, chordPitches, voiceLead, fitRange, vary, effective, layersFor, arrangeBar, stingerNotes } from '../src/lib/soundtrack/arrange.ts';
import { INSTRUMENTS, instrumentsOf } from '../src/lib/soundtrack/instruments.ts';
import { cleanSoundtrack } from '../src/lib/soundtrack/clean.ts';
import { STINGER_KINDS } from '../src/lib/soundtrack/types.ts';
import type { Direction, RoundPlan, ThemeNote, InstrumentId } from '../src/lib/soundtrack/types.ts';

const plan = (extra: Partial<RoundPlan> = {}): RoundPlan => ({ mood: '', chords: [0, 5, 3, 4], variation: 'plain', shift: 0, pulse: 'arp_up', groove: 'heartbeat', low: 0.2, high: 0.5, ...extra });

const RAW: Partial<Direction>[] = [
  { name: 'Candle and Cello', line: 'Slow cellos and a ticking clock.', tempo: 70, root: 'D', mode: 'minor', lead: 'cellos', harmony: 'violins', bass: 'basses', texture: 'harp', kit: ['kick', 'shaker'],
    theme: [{ degree: 0, beats: 1 }, { degree: 1, beats: 1 }, { degree: 2, beats: 2 }, { degree: 4, beats: 1 }, { degree: 3, beats: 1 }, { degree: 2, beats: 2 }],
    rounds: [plan(), plan({ variation: 'dark', pulse: 'arp_updown', groove: 'ticking', low: 0.4, high: 0.8 }), plan({ variation: 'broken', shift: 2, pulse: 'ostinato', groove: 'march', low: 0.6, high: 1 })],
    stingers: { round: 'swell', seat: 'hit', vote: 'rise', reveal: 'fall' } },
  { name: 'Music Box', line: 'A small music box and a harp.', tempo: 96, root: 'F', mode: 'lydian', lead: 'glockenspiel', harmony: 'pad', bass: 'piano', texture: 'marimba', kit: ['triangle'],
    theme: [{ degree: 4, beats: 0.5 }, { degree: 7, beats: 0.5 }, { degree: 9, beats: 1 }, { degree: 14, beats: 2 }, { degree: -3, beats: 2 }, { degree: 0, beats: 2 }],
    rounds: [plan({ pulse: 'eighths', groove: 'brush' }), plan({ variation: 'high', shift: -5 }), plan({ variation: 'inverted', shift: 7, low: 0.5, high: 1 })],
    stingers: { round: 'chime', seat: 'swell', vote: 'hit', reveal: 'rise' } },
  { name: 'Drums in the Dark', line: 'Low drums, plucked bass and a horn.', tempo: 132, root: 'C#', mode: 'phrygian', lead: 'horn', harmony: 'tremolo', bass: 'timpani', texture: 'pizzicato', kit: ['woodblock', 'snare', 'cymbal'],
    theme: [{ degree: 0, beats: 1 }, { degree: 1, beats: 0.5 }, { degree: 0, beats: 0.5 }, { degree: -1, beats: 2 }, { degree: 0, beats: 4 }],
    rounds: [plan({ groove: 'tribal' }), plan({ variation: 'slow', pulse: 'none', groove: 'none' }), plan({ variation: 'dark', low: 0.7, high: 1 })],
    stingers: { round: 'hit', seat: 'fall', vote: 'swell', reveal: 'chime' } },
];
const DIRECTIONS = cleanSoundtrack({ directions: RAW }, { rounds: 3, names: [] })!.directions;
const [CELLO, BOX, DRUMS] = DIRECTIONS;

const T: ThemeNote[] = [{ degree: 0, beats: 1 }, { degree: 2, beats: 1 }, { degree: 4, beats: 1 }, { degree: 5, beats: 1 }];

describe('harmony', () => {
  test('should move a C major chord to F major by the smallest steps', () => {
    assert.deepEqual(voiceLead([48, 52, 55], [53, 57, 60]), [48, 53, 57]);
  });

  test('should voice the first chord near the centre', () => {
    const v = voiceLead(null, [48, 52, 55]);
    assert.ok(Math.abs(v.reduce((a, b) => a + b, 0) / 3 - 57) <= 4, String(v));
    assert.deepEqual(v.map((n) => n % 12).sort((a, b) => a - b), [0, 4, 7]);
  });

  test('should build minor triads in a minor key', () => {
    const pcs = chordPitches({ root: 'A', mode: 'minor' } as Direction, 0, 0).map((n) => n % 12).sort((a, b) => a - b);
    assert.deepEqual(pcs, [0, 4, 9]);
  });

  test('should move a chord into a new key by the round shift', () => {
    assert.deepEqual(chordPitches({ root: 'C', mode: 'major' } as Direction, 0, 2), [50, 54, 57]);
  });

  test("should fold a note into an instrument's range by octaves", () => {
    assert.equal(fitRange(30, [40, 80]), 42);
    assert.equal(fitRange(90, [40, 80]), 78);
    assert.equal(fitRange(60, [40, 80]), 60);
  });
});

describe('vary', () => {
  test('should return the theme unchanged for plain', () => {
    assert.deepEqual(vary(T, 'plain'), T);
  });

  test('should double every length for slow', () => {
    assert.deepEqual(vary(T, 'slow'), T.map((n) => ({ ...n, beats: n.beats * 2 })));
  });

  test('should drop an octave and flatten the third and sixth of a major key for dark', () => {
    assert.deepEqual(vary(T, 'dark', 'major'), [{ degree: -7, beats: 1 }, { degree: -5, beats: 1, alter: -1 }, { degree: -3, beats: 1 }, { degree: -2, beats: 1, alter: -1 }]);
    assert.deepEqual(vary(T, 'dark', 'minor'), [{ degree: -7, beats: 1 }, { degree: -5, beats: 1 }, { degree: -3, beats: 1 }, { degree: -2, beats: 1 }]);
  });

  test('should keep the first half with every other note silent for broken, at the same length', () => {
    assert.deepEqual(vary(T, 'broken'), [{ degree: 0, beats: 1 }, { degree: 2, beats: 1, rest: true }, { degree: 0, beats: 2, rest: true }]);
  });

  test('should raise everything an octave for high', () => {
    assert.deepEqual(vary(T, 'high').map((n) => n.degree), [7, 9, 11, 12]);
  });

  test('should mirror the degrees around the first note for inverted', () => {
    assert.deepEqual(vary([{ degree: 2, beats: 1 }, ...T.slice(1)], 'inverted').map((n) => n.degree), [2, 2, 0, -1]);
  });
});

describe('layers by tension', () => {
  test('should spread the tension between the round low and high', () => {
    assert.equal(effective(0, plan()), 0.2);
    assert.equal(effective(1, plan()), 0.5);
    assert.ok(Math.abs(effective(0.5, plan({ low: 0, high: 1 })) - 0.5) < 1e-9);
  });

  test('should add layers as the tension rises and drop pulse and groove when they are none', () => {
    const p = plan();
    assert.deepEqual([...layersFor(0.1, p)].sort(), ['drone']);
    assert.deepEqual([...layersFor(0.35, p)].sort(), ['bass', 'drone', 'melody', 'pad']);
    assert.deepEqual([...layersFor(0.6, p)].sort(), ['bass', 'chords', 'drone', 'groove', 'melody', 'pad', 'pulse']);
    assert.deepEqual([...layersFor(0.9, p)].sort(), ['bass', 'chords', 'counter', 'drone', 'groove', 'melody', 'pad', 'pulse']);
    assert.deepEqual([...layersFor(0.9, plan({ pulse: 'none', groove: 'none' }))].sort(), ['bass', 'chords', 'counter', 'drone', 'melody', 'pad']);
  });

  test('should play only drone and pad at the lowest tension of round 1', () => {
    const parts = new Set(arrangeBar(CELLO, 0, 0, 0, null).events.map((e) => e.part));
    assert.deepEqual([...parts].sort(), ['drone', 'pad']);
  });
});

describe('arrangeBar', () => {
  test("should keep every note of a bar inside its instrument's range", () => {
    for (const d of DIRECTIONS) {
      for (let round = 0; round < 3; round += 1) {
        let prev: number[] | null = null;
        for (let bar = 0; bar < 16; bar += 1) {
          for (let x = 0; x <= 1.0001; x += 0.1) {
            const { events, voicing } = arrangeBar(d, round, bar, x, prev);
            for (const e of events) {
              const inst = INSTRUMENTS[e.instrument as InstrumentId];
              if (!inst) continue;
              assert.ok(e.midi >= inst.range[0] && e.midi <= inst.range[1], `${d.name} r${round} b${bar} ${e.part} ${e.instrument} ${e.midi}`);
            }
            assert.ok(events.every((e) => e.at >= 0 && e.at < 4 && e.velocity > 0 && e.velocity <= 1), 'inside the bar');
            prev = voicing;
          }
        }
      }
    }
  });

  test('should only use the direction’s own sounds', () => {
    for (const d of DIRECTIONS) {
      const own = new Set<string>([...instrumentsOf(d), 'pad']);
      for (let bar = 0; bar < 8; bar += 1) for (const e of arrangeBar(d, 2, bar, 1, null).events) assert.ok(own.has(e.instrument), `${d.name}: ${e.instrument}`);
    }
  });

  test('should cycle one chord per bar through the round chords', () => {
    const roots = [0, 1, 2, 3, 4].map((bar) => arrangeBar(CELLO, 0, bar, 0.5, null).voicing.map((n) => n % 12).sort((a, b) => a - b));
    const expect = (deg: number) => chordPitches(CELLO, deg, 0).map((n) => n % 12).sort((a, b) => a - b);
    assert.deepEqual(roots, [expect(0), expect(5), expect(3), expect(4), expect(0)]);
  });

  test('should play the theme across bars and rest every other phrase below half tension', () => {
    const melody = (bar: number, x: number) => arrangeBar({ ...CELLO, rounds: [plan({ low: 0, high: 1 })] }, 0, bar, x, null).events.filter((e) => e.part === 'melody');
    assert.ok(melody(0, 0.3).length > 0, 'first phrase plays');
    assert.equal(melody(2, 0.3).length, 0, 'second phrase rests');
    assert.ok(melody(2, 0.7).length > 0, 'second phrase plays when tense');
    assert.deepEqual(melody(0, 0.7).map((e) => e.at), [0, 1, 2]);
  });

  test('should raise the velocity with the tension', () => {
    const loud = (x: number) => Math.max(...arrangeBar(CELLO, 0, 0, x, null).events.filter((e) => e.part === 'drone').map((e) => e.velocity));
    assert.ok(loud(1) > loud(0));
    assert.ok(loud(0) >= 0.3 && loud(1) <= 0.9);
  });

  test('should repeat the last round plan for a round past the end', () => {
    assert.deepEqual(roundPlan(CELLO, 7), CELLO.rounds[2]);
    assert.deepEqual(roundPlan(CELLO, -1), CELLO.rounds[0]);
    assert.deepEqual(arrangeBar(CELLO, 9, 3, 0.7, null), arrangeBar(CELLO, 2, 3, 0.7, null));
  });

  test('should give the same bar the same notes every time', () => {
    assert.deepEqual(arrangeBar(BOX, 1, 5, 0.66, [60, 64, 67]), arrangeBar(BOX, 1, 5, 0.66, [60, 64, 67]));
  });

  test('should play the groove on the kit the direction has', () => {
    const groove = arrangeBar({ ...CELLO, rounds: [plan({ high: 1 })] }, 0, 0, 1, null).events.filter((e) => e.part === 'groove');
    assert.deepEqual(groove.map((e) => [e.instrument, e.at]), [['kick', 0], ['kick', 0.28]]);
    const tick = arrangeBar(CELLO, 1, 0, 1, null).events.filter((e) => e.part === 'groove');
    assert.deepEqual(tick.map((e) => [e.instrument, e.at]), [['shaker', 0], ['shaker', 1], ['shaker', 2], ['shaker', 3]]);
  });
});

describe('stingerNotes', () => {
  test("should keep every stinger within 4 beats and use the direction's own instruments", () => {
    for (const d of DIRECTIONS) {
      const own = new Set<string>(instrumentsOf(d));
      for (const kind of [...STINGER_KINDS, 'hint'] as const) {
        const notes = stingerNotes(d, kind);
        assert.ok(notes.length > 0, `${d.name} ${kind}`);
        for (const n of notes) {
          assert.ok(n.at >= 0 && n.at + n.beats <= 4, `${d.name} ${kind} ends by beat 4`);
          assert.ok(own.has(n.instrument), `${d.name} ${kind}: ${n.instrument}`);
          assert.equal(n.part, 'stinger');
          const inst = INSTRUMENTS[n.instrument as InstrumentId];
          if (inst) assert.ok(n.midi >= inst.range[0] && n.midi <= inst.range[1], `${kind} ${n.instrument} ${n.midi}`);
        }
      }
    }
  });

  test('should always chime for a hint', () => {
    const hint = stingerNotes(CELLO, 'hint');
    assert.deepEqual(hint, stingerNotes({ ...CELLO, stingers: { ...CELLO.stingers, round: 'chime' } }, 'round'));
    assert.ok(hint.every((n) => n.instrument === CELLO.texture));
  });

  test('should run up for rise and down for fall', () => {
    const up = stingerNotes(CELLO, 'vote').map((n) => n.midi);
    assert.ok(up[up.length - 1] > up[0], 'rise ends higher');
    const down = stingerNotes(CELLO, 'reveal').map((n) => n.midi);
    assert.ok(down[down.length - 1] < down[0], 'fall ends lower');
  });

  test('should build a swell that grows and adds the cymbal when the kit has it', () => {
    const swell = stingerNotes(DRUMS, 'vote');
    assert.ok(swell.some((n) => n.instrument === 'cymbal'));
    const pitched = swell.filter((n) => n.instrument !== 'cymbal');
    assert.ok(pitched[pitched.length - 1].velocity > pitched[0].velocity, 'gets louder');
    assert.ok(stingerNotes(BOX, 'seat').every((n) => n.instrument !== 'cymbal'));
  });

  test('should roll the timpani under a swell when the kit has the roll', () => {
    assert.ok(stingerNotes({ ...DRUMS, kit: ['timpani_roll'] }, 'vote').some((n) => n.instrument === 'timpani_roll' && n.at === 0));
    assert.ok(stingerNotes(DRUMS, 'vote').every((n) => n.instrument !== 'timpani_roll'));
  });
});
