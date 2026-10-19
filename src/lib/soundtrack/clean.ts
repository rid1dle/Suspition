import { ROOTS, MODES } from '../music-theory.ts';
import { INSTRUMENTS, KIT_IDS, defaultFor } from './instruments.ts';
import { VARIATIONS, PULSES, GROOVES, STINGER_STYLES, STINGER_KINDS, ROLES } from './types.ts';
import type { Direction, InstrumentId, KitId, RoundPlan, Soundtrack, StingerKind, StingerStyle, ThemeNote } from './types.ts';

export const BEATS = [0.5, 1, 1.5, 2, 3, 4];
const MAX_DIRECTIONS = 3;
const MAX_KIT = 3;
const MIN_NOTES = 4;
const DEFAULT_CHORDS = [0, 5, 3, 4];
const TITLES = new Set(['the', 'and', 'of', 'dr', 'mr', 'mrs', 'ms', 'miss', 'sir', 'lady', 'lord', 'madam', 'professor', 'prof', 'captain', 'father', 'mother', 'aunt', 'uncle', 'von', 'van', 'del', 'des']);

type Raw = Record<string, unknown>;
const obj = (x: unknown): Raw => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Raw) : {});
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const num = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(Number(x)) ? Number(x) : fallback);
const oneOf = <T extends string>(list: readonly T[], x: unknown, fallback: T): T => (list.includes(x as T) ? (x as T) : fallback);

function plain(x: unknown, max: number): string {
  if (typeof x !== 'string') return '';
  return x.replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}

function nameWords(names: string[]): string[] {
  const words = new Set<string>();
  for (const n of names) {
    const parts = String(n).split(/[^\p{L}]+/u).filter(Boolean);
    for (const w of parts) if ((w.length >= 3 || (parts.length === 1 && w.length >= 2)) && !TITLES.has(w.toLowerCase())) words.add(w);
  }
  return [...words];
}

function namesSomeone(text: string, words: string[]): boolean {
  return words.some((w) => new RegExp(`(?<!\\p{L})${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\p{L})`, 'iu').test(text));
}

function snapBeats(x: unknown): number {
  const b = num(x, 1);
  return BEATS.reduce((best, c) => (Math.abs(c - b) < Math.abs(best - b) ? c : best), BEATS[0]);
}

function rests(beats: number): ThemeNote[] {
  const out: ThemeNote[] = [];
  let left = beats;
  while (left >= 0.5) {
    const b = [...BEATS].reverse().find((c) => c <= left)!;
    out.push({ degree: 0, beats: b, rest: true });
    left -= b;
  }
  return out;
}

function cleanTheme(raw: unknown): ThemeNote[] {
  const notes: ThemeNote[] = [];
  let total = 0;
  for (const item of Array.isArray(raw) ? raw : []) {
    const n = obj(item);
    const degree = num(n.degree, NaN);
    if (!Number.isFinite(degree)) continue;
    let beats = snapBeats(n.beats);
    if (total + beats > 16) {
      const left = 16 - total;
      if (left < 0.5) break;
      beats = [...BEATS].reverse().find((c) => c <= left)!;
    }
    notes.push({ degree: clamp(Math.round(degree), -7, 14), beats, ...(n.rest === true ? { rest: true } : {}) });
    total += beats;
    if (total >= 16) break;
  }
  return [...notes, ...rests((total <= 8 ? 8 : 16) - total)];
}

function cleanChords(raw: unknown): number[] {
  const list = (Array.isArray(raw) ? raw : []).map((c) => num(c, NaN)).filter(Number.isFinite).map((c) => clamp(Math.round(c), 0, 6));
  if (!list.length) return [...DEFAULT_CHORDS];
  if (list.length >= 8) return list.slice(0, 8);
  return Array.from({ length: 4 }, (_, i) => list[i % list.length]);
}

export function cleanRoundPlan(raw: unknown): RoundPlan {
  const r = obj(raw);
  const a = clamp(num(r.low, 0.1), 0, 1);
  const b = clamp(num(r.high, 0.6), 0, 1);
  return {
    mood: plain(r.mood, 60),
    chords: cleanChords(r.chords),
    variation: oneOf(VARIATIONS, r.variation, 'plain'),
    shift: clamp(Math.round(num(r.shift, 0)), -5, 7),
    pulse: oneOf(PULSES, r.pulse, 'none'),
    groove: oneOf(GROOVES, r.groove, 'none'),
    low: Math.min(a, b),
    high: Math.max(a, b),
  };
}

function cleanRounds(raw: unknown, rounds: number): RoundPlan[] {
  const plans = (Array.isArray(raw) ? raw : []).map(cleanRoundPlan);
  if (!plans.length) plans.push(cleanRoundPlan({}));
  const want = Math.max(1, rounds);
  const out = plans.slice(0, want);
  while (out.length < want) {
    const last = out[out.length - 1];
    out.push({ ...last, chords: [...last.chords] });
  }
  return out;
}

function instrument(x: unknown, role: typeof ROLES[number]): InstrumentId {
  const i = INSTRUMENTS[x as InstrumentId];
  return i && i.roles.includes(role) ? (x as InstrumentId) : defaultFor(role);
}

function cleanDirection(raw: unknown, index: number, rounds: number, words: string[]): Direction | null {
  const d = obj(raw);
  const theme = cleanTheme(d.theme);
  if (theme.filter((t) => !t.rest).length < MIN_NOTES) return null;
  const name = plain(d.name, 40);
  const line = plain(d.line, 120);
  const kit = [...new Set((Array.isArray(d.kit) ? d.kit : []).filter((k): k is KitId => KIT_IDS.includes(k as KitId)))].slice(0, MAX_KIT);
  const stingers = obj(d.stingers);
  return {
    name: !name || namesSomeone(name, words) ? `Music ${index + 1}` : name,
    line: namesSomeone(line, words) ? '' : line,
    tempo: clamp(Math.round(num(d.tempo, 80)), 50, 140),
    root: ROOTS.includes(d.root as string) ? (d.root as string) : 'C',
    mode: Object.hasOwn(MODES, d.mode as string) ? (d.mode as string) : 'minor',
    lead: instrument(d.lead, 'lead'),
    harmony: instrument(d.harmony, 'harmony'),
    bass: instrument(d.bass, 'bass'),
    texture: instrument(d.texture, 'texture'),
    kit,
    theme,
    rounds: cleanRounds(d.rounds, rounds),
    stingers: Object.fromEntries(STINGER_KINDS.map((k) => [k, oneOf(STINGER_STYLES, stingers[k], 'swell')])) as Record<StingerKind, StingerStyle>,
  };
}

export function cleanSoundtrack(raw: unknown, opts: { rounds: number; names: string[] }): Soundtrack | null {
  const r = obj(raw);
  if (!Array.isArray(r.directions)) return null;
  const words = nameWords(opts.names);
  const directions: Direction[] = [];
  for (const d of r.directions) {
    if (directions.length >= MAX_DIRECTIONS) break;
    const clean = cleanDirection(d, directions.length, opts.rounds, words);
    if (clean) directions.push(clean);
  }
  if (!directions.length) return null;
  const chosen = Number.isInteger(r.chosen) && (r.chosen as number) >= 0 && (r.chosen as number) < directions.length ? (r.chosen as number) : 0;
  return { directions, chosen };
}
