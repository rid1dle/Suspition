import { SKILL_LABELS, PENALTY_SKILLS } from '../src/lib/skill-labels.ts';
import { PLAY_MAX } from '../src/lib/rules.ts';
import type { Move, Play, Rating, Read } from './types.ts';

// Play points: what a move does in the story, never what it claims. Each move keeps the rubric it
// was scored under, so the basis can change later without mixing old and new scores.

export const SKILLS = ['searching', 'questioning', 'connecting', 'persuading', 'bluffing', 'own_goal', 'teamwork'];
export const PENALTIES = PENALTY_SKILLS;
export { SKILL_LABELS };
export const RUBRIC_VERSION = 1;
export const PLAY_MIN = -2;
export { PLAY_MAX };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const current = (moves: Move[] | undefined | null) => (moves ?? []).filter((m) => m.rubric === RUBRIC_VERSION);
type ReadFlags = Partial<Pick<Read, 'claims' | 'finds' | 'out_of_world' | 'sways_gm' | 'kind'>> | null | undefined;
interface ScoreOpts { from?: string }

export function scoreMove(play: Play | null | undefined, read: ReadFlags, { from = 'private' }: ScoreOpts = {}): Move {
  const outLoud = from === 'out loud';
  const why = String(play?.why ?? '').trim().slice(0, 160);
  const base = { why, rubric: RUBRIC_VERSION, from };
  if (read?.sways_gm) return { ...base, points: -1, skill: 'swaying' };
  // Narrating what your own search finds is writing the story with the GM: it never costs a point.
  let points = clamp(Math.round(Number(play?.points) || 0), outLoud || read?.finds?.length ? 0 : -1, outLoud ? 1 : 2);
  // Asking about your own character is part of the game, even if the reader also marked it out of the game.
  const outOfWorld = read?.out_of_world && read?.kind !== 'self';
  if (read?.claims?.length || outOfWorld) {
    points = Math.max(-1, points - 1);
    if (points < 0) return { ...base, points, skill: 'breaking', why: why || 'Claims about others or the game do not count. Play your own character.' };
    base.why = `${why} A claim about others cost one point.`.trim();
  }
  const named = String(play?.skill ?? '');
  const skill = points > 0 && SKILLS.includes(named) ? named : points < 0 && PENALTIES.includes(named) ? named : points < 0 ? 'breaking' : null;
  return { ...base, points, skill };
}

// A move that also tried to steer the GM keeps the credit for what it did in the story, plus a separate demerit.
export function scoreMoves(play: Play | null | undefined, read: ReadFlags, opts: ScoreOpts = {}): Move[] {
  if (!read?.sways_gm) return [scoreMove(play, read, opts)];
  const real = scoreMove(play, { ...read, sways_gm: false }, opts);
  const penalty = { ...scoreMove(play, read, opts), why: 'Talking to the game master instead of the story costs a point.' };
  return real.points > 0 ? [real, penalty] : [penalty];
}

export const playEarned = (moves: Move[] | undefined | null): number => current(moves).reduce((sum, m) => sum + m.points, 0);

// Each round counts up to PLAY_MAX, so strong play across rounds shows; the game total never drops below PLAY_MIN.
export function playTotal(moves: Move[] | undefined | null): number {
  const rounds = new Map<unknown, number>();
  for (const m of current(moves)) rounds.set(m.round, (rounds.get(m.round) ?? 0) + m.points);
  return Math.max(PLAY_MIN, [...rounds.values()].reduce((sum, n) => sum + Math.min(PLAY_MAX, n), 0));
}

export function skillSplit(moves: Move[] | undefined | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of current(moves)) if (m.skill) out[m.skill] = (out[m.skill] ?? 0) + m.points;
  return out;
}

export function rating(moves: Move[] | undefined | null): Rating {
  const list = current(moves);
  const bySkill: Rating['bySkill'] = {};
  for (const m of list) {
    if (!m.skill) continue;
    const s = (bySkill[m.skill] ??= { points: 0, moves: 0, perMove: 0 });
    s.points += m.points;
    s.moves += 1;
    s.perMove = Math.round((s.points / s.moves) * 100) / 100;
  }
  const sum = list.reduce((t, m) => t + m.points, 0);
  return { rubric: RUBRIC_VERSION, overall: Math.round((sum / Math.max(4, list.length)) * 100) / 100, bySkill };
}
