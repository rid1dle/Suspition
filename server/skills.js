import { SKILL_LABELS, PENALTY_SKILLS } from '../public/skill-labels.js';

// Play points: what a move does in the story, never what it claims. Each move keeps the rubric it
// was scored under, so the basis can change later without mixing old and new scores.

export const SKILLS = ['searching', 'questioning', 'connecting', 'persuading', 'bluffing', 'own_goal', 'teamwork'];
export const PENALTIES = PENALTY_SKILLS;
export { SKILL_LABELS };
export const RUBRIC_VERSION = 1;
export const PLAY_MIN = -2;
export const PLAY_MAX = 3;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const current = (moves) => (moves ?? []).filter((m) => m.rubric === RUBRIC_VERSION);

export function scoreMove(play, read, { from = 'private' } = {}) {
  const outLoud = from === 'out loud';
  const why = String(play?.why ?? '').trim().slice(0, 160);
  const base = { why, rubric: RUBRIC_VERSION, from };
  if (read?.sways_gm) return { ...base, points: -1, skill: 'swaying' };
  let points = clamp(Math.round(Number(play?.points) || 0), outLoud ? 0 : -1, outLoud ? 1 : 2);
  if (read?.claims?.length || read?.out_of_world) {
    points = Math.max(-1, points - 1);
    if (points < 0) return { ...base, points, skill: 'breaking', why: why || 'Claims about others or the game do not count. Play your own character.' };
    base.why = `${why} A claim about others cost one point.`.trim();
  }
  const skill = points > 0 && SKILLS.includes(play?.skill) ? play.skill : points < 0 && PENALTIES.includes(play?.skill) ? play.skill : points < 0 ? 'breaking' : null;
  return { ...base, points, skill };
}

// A move that also tried to steer the GM keeps the credit for what it did in the story, plus a separate demerit.
export function scoreMoves(play, read, opts = {}) {
  if (!read?.sways_gm) return [scoreMove(play, read, opts)];
  const real = scoreMove(play, { ...read, sways_gm: false }, opts);
  const penalty = { ...scoreMove(play, read, opts), why: 'Talking to the game master instead of the story costs a point.' };
  return real.points > 0 ? [real, penalty] : [penalty];
}

export const playTotal = (moves) => clamp(current(moves).reduce((sum, m) => sum + m.points, 0), PLAY_MIN, PLAY_MAX);

export function skillSplit(moves) {
  const out = {};
  for (const m of current(moves)) if (m.skill) out[m.skill] = (out[m.skill] ?? 0) + m.points;
  return out;
}

export function rating(moves) {
  const list = current(moves);
  const bySkill = {};
  for (const m of list.filter((x) => x.skill)) {
    const s = (bySkill[m.skill] ??= { points: 0, moves: 0, perMove: 0 });
    s.points += m.points;
    s.moves += 1;
    s.perMove = Math.round((s.points / s.moves) * 100) / 100;
  }
  const sum = list.reduce((t, m) => t + m.points, 0);
  return { rubric: RUBRIC_VERSION, overall: Math.round((sum / Math.max(4, list.length)) * 100) / 100, bySkill };
}
