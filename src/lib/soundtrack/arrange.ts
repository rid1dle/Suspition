// Pure music: turns a cleaned Direction into notes, one 4-beat bar at a time. No audio, no randomness.
import { degreeToMidi, triad } from '../music-theory.ts';
import { INSTRUMENTS } from './instruments.ts';
import type { Direction, InstrumentId, KitId, NoteEvent, Part, RoundPlan, StingerKind, ThemeNote, Variation } from './types.ts';

const BAR = 4;
const CENTER = 57;
const MAJOR_MODES = new Set(['major', 'lydian']);
const GROOVE_STANDINS: KitId[] = ['woodblock', 'snare', 'kick', 'shaker', 'triangle'];

// The theme comes in early (the reading step sits near 0.17) so every direction is heard for what it is.
const LAYERS: [Part, number][] = [['drone', 0], ['pad', 0.1], ['melody', 0.15], ['bass', 0.3], ['chords', 0.4], ['pulse', 0.45], ['groove', 0.55], ['counter', 0.8]];

const key = (d: Pick<Direction, 'root' | 'mode'>) => ({ root: d.root, mode: d.mode });
const rangeOf = (id: InstrumentId) => INSTRUMENTS[id].range;

export function roundPlan(d: Direction, roundIndex: number): RoundPlan {
  return d.rounds[Math.max(0, Math.min(d.rounds.length - 1, Math.floor(roundIndex) || 0))];
}

export function chordPitches(d: Pick<Direction, 'root' | 'mode'>, degree: number, shift: number): number[] {
  return (triad(key(d), degree, 3) as number[]).map((n) => n + shift);
}

function closeVoicings(next: number[]): number[][] {
  const pcs = [...new Set(next.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b);
  const out: number[][] = [];
  for (let r = 0; r < pcs.length; r += 1) {
    for (let octave = 1; octave <= 7; octave += 1) {
      const v = [pcs[r] + 12 * octave];
      for (let k = 1; k < pcs.length; k += 1) {
        const last = v[v.length - 1];
        let m = last - (((last % 12) + 12) % 12) + pcs[(r + k) % pcs.length];
        if (m <= last) m += 12;
        v.push(m);
      }
      out.push(v);
    }
  }
  return out;
}

const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

export function voiceLead(prev: number[] | null, next: number[], center = CENTER): number[] {
  let best: number[] = next;
  let bestCost = Infinity;
  for (const v of closeVoicings(next)) {
    const drift = Math.abs(mean(v) - center);
    const move = prev && prev.length === v.length ? v.reduce((s, n, i) => s + Math.abs(n - prev[i]), 0) : prev ? Math.abs(mean(v) - mean(prev)) * v.length : 0;
    const cost = prev ? move + drift * 0.25 : drift;
    if (cost < bestCost) {
      best = v;
      bestCost = cost;
    }
  }
  return best;
}

export function fitRange(midi: number, range: [number, number]): number {
  let m = midi;
  while (m < range[0]) m += 12;
  while (m > range[1]) m -= 12;
  return m < range[0] ? range[0] : m;
}

export function vary(theme: ThemeNote[], kind: Variation, mode = 'minor'): ThemeNote[] {
  switch (kind) {
    case 'slow':
      return theme.map((n) => ({ ...n, beats: n.beats * 2 }));
    case 'dark':
      return theme.map((n) => {
        const flat = MAJOR_MODES.has(mode) && !n.rest && [2, 5].includes(((n.degree % 7) + 7) % 7);
        return { ...n, degree: n.degree - 7, ...(flat ? { alter: -1 } : {}) };
      });
    case 'broken': {
      const half = theme.slice(0, Math.ceil(theme.length / 2));
      const kept = half.map((n, i) => (i % 2 === 1 ? { ...n, rest: true } : { ...n }));
      const gap = theme.slice(half.length).reduce((s, n) => s + n.beats, 0);
      return gap > 0 ? [...kept, { degree: 0, beats: gap, rest: true }] : kept;
    }
    case 'high':
      return theme.map((n) => ({ ...n, degree: n.degree + 7 }));
    case 'inverted': {
      const first = theme[0]?.degree ?? 0;
      return theme.map((n) => ({ ...n, degree: 2 * first - n.degree }));
    }
    default:
      return theme.map((n) => ({ ...n }));
  }
}

export function effective(x: number, plan: RoundPlan): number {
  return plan.low + (plan.high - plan.low) * Math.max(0, Math.min(1, x));
}

export function layersFor(eff: number, plan: RoundPlan): Set<Part> {
  const on = new Set<Part>();
  for (const [part, at] of LAYERS) {
    if (eff < at) continue;
    if (part === 'pulse' && plan.pulse === 'none') continue;
    if (part === 'groove' && plan.groove === 'none') continue;
    on.add(part);
  }
  return on;
}

function themePitch(d: Direction, n: ThemeNote, shift: number, octave = 4): number {
  return (degreeToMidi(key(d), n.degree, octave) as number) + shift + (n.alter ?? 0);
}

// One octave move for a whole line, so a phrase never jumps an octave in the middle.
function lineOffset(pitches: number[], range: [number, number]): number {
  if (!pitches.length) return 0;
  const mid = (range[0] + range[1]) / 2;
  let best = 0;
  let bestScore = Infinity;
  for (let k = -4; k <= 4; k += 1) {
    const moved = pitches.map((p) => p + 12 * k);
    const out = moved.filter((p) => p < range[0] || p > range[1]).length;
    const score = out * 100 + Math.abs(mean(moved) - mid);
    if (score < bestScore) {
      best = 12 * k;
      bestScore = score;
    }
  }
  return best;
}

function fitLine(pitches: number[], range: [number, number]): number[] {
  const off = lineOffset(pitches, range);
  return pitches.map((p) => fitRange(p + off, range));
}

function kitPiece(d: Direction, want: KitId[]): KitId | null {
  return want.find((k) => d.kit.includes(k)) ?? GROOVE_STANDINS.find((k) => d.kit.includes(k)) ?? null;
}

type Hit = [at: number, want: KitId[], level: number];
const GROOVES: Record<string, Hit[]> = {
  heartbeat: [[0, ['kick'], 1], [0.28, ['kick'], 0.7]],
  ticking: [[0, ['shaker'], 1], [1, ['shaker'], 0.8], [2, ['shaker'], 1], [3, ['shaker'], 0.8]],
  march: [[0, ['kick'], 1], [1, ['snare'], 0.9], [3, ['snare'], 0.9]],
  brush: [[1, ['snare'], 0.5], [3, ['snare'], 0.5]],
  tribal: [[0, ['woodblock', 'kick'], 1], [1.5, ['woodblock', 'kick'], 0.7], [2, ['woodblock', 'kick'], 0.9]],
};

function groove(d: Direction, plan: RoundPlan, v: number, tonic: number): NoteEvent[] {
  const hits = GROOVES[plan.groove] ?? [];
  const timpani = plan.groove === 'tribal' && d.bass === 'timpani';
  const out: NoteEvent[] = [];
  for (const [at, want, level] of hits) {
    if (timpani) {
      out.push({ at, part: 'groove', instrument: 'timpani', midi: fitRange(tonic, rangeOf('timpani')), beats: 1, velocity: v * level });
      continue;
    }
    const piece = kitPiece(d, want);
    if (piece) out.push({ at, part: 'groove', instrument: piece, midi: 60, beats: 1, velocity: v * level });
  }
  return out;
}

function pulse(d: Direction, plan: RoundPlan, voicing: number[], v: number): NoteEvent[] {
  const range = rangeOf(d.texture);
  let line: number[];
  switch (plan.pulse) {
    case 'eighths':
      line = Array(8).fill(voicing[0] + 12);
      break;
    case 'arp_up': {
      const up = [...voicing, voicing[0] + 12].map((n) => n + 12);
      line = Array.from({ length: 8 }, (_, i) => up[i % up.length]);
      break;
    }
    case 'arp_updown': {
      const up = [...voicing, voicing[0] + 12].map((n) => n + 12);
      const cycle = [...up, ...up.slice(1, -1).reverse()];
      line = Array.from({ length: 8 }, (_, i) => cycle[i % cycle.length]);
      break;
    }
    case 'ostinato': {
      const [a, b] = d.theme.filter((n) => !n.rest).map((n) => themePitch(d, n, plan.shift));
      line = Array.from({ length: 8 }, (_, i) => (i % 2 === 0 ? a : b));
      break;
    }
    default:
      return [];
  }
  return fitLine(line, range).map((midi, i) => ({ at: i * 0.5, part: 'pulse' as const, instrument: d.texture, midi, beats: 0.5, velocity: v * (i % 2 === 0 ? 0.9 : 0.7) }));
}

function melody(d: Direction, theme: ThemeNote[], plan: RoundPlan, bar: number, eff: number, v: number, part: 'melody' | 'counter'): NoteEvent[] {
  const length = theme.reduce((s, n) => s + n.beats, 0);
  if (length <= 0) return [];
  const instrument = part === 'melody' ? d.lead : d.harmony;
  const lift = part === 'counter' ? 2 : 0;
  const range = rangeOf(instrument);
  const raw = theme.map((n) => themePitch(d, { ...n, degree: n.degree + lift }, plan.shift));
  // The octave is set by the unvaried theme, so high and dark keep the octave they move to.
  const off = lineOffset(d.theme.filter((n) => !n.rest).map((n) => themePitch(d, { ...n, degree: n.degree + lift }, plan.shift)), range);
  const start = bar * BAR;
  const out: NoteEvent[] = [];
  for (let phrase = Math.floor(start / length); phrase * length < start + BAR; phrase += 1) {
    if (eff < 0.5 && phrase % 2 === 1) continue;
    let t = phrase * length;
    theme.forEach((n, i) => {
      if (!n.rest && t >= start && t < start + BAR) {
        out.push({ at: t - start, part, instrument, midi: fitRange(raw[i] + off, range), beats: n.beats, velocity: part === 'counter' ? v * 0.75 : v });
      }
      t += n.beats;
    });
  }
  return out;
}

export function arrangeBar(d: Direction, roundIndex: number, bar: number, x: number, prev: number[] | null, variation?: Variation): { events: NoteEvent[]; voicing: number[] } {
  const plan = roundPlan(d, roundIndex);
  const eff = effective(x, plan);
  const on = layersFor(eff, plan);
  const v = Math.max(0.3, Math.min(0.9, 0.3 + 0.6 * eff));
  const degree = plan.chords[((bar % plan.chords.length) + plan.chords.length) % plan.chords.length];
  const pitches = chordPitches(d, degree, plan.shift);
  const voicing = voiceLead(prev, pitches);
  const tonic = (degreeToMidi(key(d), 0, 2) as number) + plan.shift;
  const root = voicing.find((n) => n % 12 === pitches[0] % 12) ?? voicing[0];
  const theme = vary(d.theme, variation ?? plan.variation, d.mode);
  const events: NoteEvent[] = [];
  const bassRange = rangeOf(d.bass);
  const low = (m: number) => fitRange(m - 24, bassRange);

  if (on.has('drone')) events.push({ at: 0, part: 'drone', instrument: d.bass, midi: fitRange(tonic, bassRange), beats: BAR, velocity: v * 0.8 });
  if (on.has('pad')) for (const n of voicing) events.push({ at: 0, part: 'pad', instrument: 'pad', midi: fitRange(n, rangeOf('pad')), beats: BAR, velocity: v * 0.7 });
  if (on.has('bass')) {
    const hits = eff >= 0.6 ? [0, 2] : [0];
    for (const at of hits) events.push({ at, part: 'bass', instrument: d.bass, midi: low(root), beats: BAR / hits.length, velocity: v });
  }
  if (on.has('chords')) {
    const hits = eff >= 0.7 ? [0, 2] : [0];
    const range = rangeOf(d.harmony);
    for (const at of hits) for (const n of fitLine(voicing, range)) events.push({ at, part: 'chords', instrument: d.harmony, midi: n, beats: BAR / hits.length, velocity: v * 0.8 });
  }
  if (on.has('pulse')) events.push(...pulse(d, plan, voicing, v));
  if (on.has('melody')) events.push(...melody(d, theme, plan, bar, eff, v, 'melody'));
  if (on.has('counter')) events.push(...melody(d, theme, plan, bar, eff, v, 'counter'));
  if (on.has('groove')) events.push(...groove(d, plan, v, tonic));
  return { events, voicing };
}

export function stingerNotes(d: Direction, kind: StingerKind | 'hint'): NoteEvent[] {
  const style = kind === 'hint' ? 'chime' : d.stingers[kind];
  const s = (at: number, instrument: InstrumentId | KitId, midi: number, beats: number, velocity: number): NoteEvent => ({ at, part: 'stinger', instrument, midi, beats, velocity });
  const chord = voiceLead(null, chordPitches(d, 0, 0));
  switch (style) {
    case 'hit': {
      const out = [s(0, d.bass, fitRange((degreeToMidi(key(d), 0, 2) as number), rangeOf(d.bass)), 2, 0.9)];
      if (d.kit.includes('kick')) out.push(s(0, 'kick', 60, 1, 0.9));
      for (const n of fitLine(chord, rangeOf(d.harmony))) out.push(s(1, d.harmony, n, 1, 0.7));
      return out;
    }
    case 'chime': {
      const notes = d.theme.filter((n) => !n.rest).slice(0, 4);
      const line = fitLine(notes.map((n) => themePitch(d, n, 0, 5)), rangeOf(d.texture));
      return line.map((midi, i) => s(i * 0.5, d.texture, midi, i === line.length - 1 ? 2 : 0.5, 0.7));
    }
    case 'rise':
    case 'fall': {
      const degrees = style === 'rise' ? [0, 1, 2, 3, 4, 5, 6, 7, 7] : [7, 6, 5, 4, 3, 2, 1, 0, -1];
      const line = fitLine(degrees.map((degree) => themePitch(d, { degree, beats: 1 }, 0)), rangeOf(d.lead));
      return line.map((midi, i) => (i < 8 ? s(i * 0.25, d.lead, midi, 0.25, 0.55 + i * 0.03) : s(2, d.lead, midi, 2, 0.8)));
    }
    case 'swell':
    default: {
      const [a, b, c] = fitLine(chord, rangeOf(d.harmony));
      const out = [s(0, d.harmony, a, 4, 0.35), s(1, d.harmony, b, 3, 0.55), s(2, d.harmony, c, 2, 0.75)];
      if (d.kit.includes('cymbal')) out.push(s(0, 'cymbal', 60, 4, 0.7));
      if (d.kit.includes('timpani_roll')) out.push(s(0, 'timpani_roll', 60, 4, 0.6));
      return out;
    }
  }
}
