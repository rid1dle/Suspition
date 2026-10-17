import { QUESTIONS } from './questions.ts';
import { rating, skillSplit, SKILL_LABELS, PENALTIES } from './skills.ts';
import type { Game, Profile } from './types.ts';

const label = (k: string): string => (SKILL_LABELS as Record<string, string>)[k] ?? k;

export function usernameFor(name: unknown, taken: string[] = []): string {
  const base = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'player';
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export const newProfile = (username: string, name: string, now = Date.now()): Profile => ({ username, name, createdAt: now, answers: [], games: [], moves: [], skills: {}, rating: rating([]) });

export function addAnswer(profile: Profile, { id, answer }: { id: string; answer: unknown }, now = Date.now()): Profile {
  const q = QUESTIONS.find((x) => x.id === id);
  const text = String(answer ?? '').trim().slice(0, 200);
  if (!q || !text) return profile;
  profile.answers = profile.answers.filter((a) => a.id !== id);
  profile.answers.push({ id, question: q.question, answer: text, at: now });
  return profile;
}

export function aboutForGM(profile: Profile | null | undefined) {
  return {
    about: (profile?.answers ?? []).map((a) => ({ question: a.question, answer: a.answer })),
    played_before: (profile?.games ?? []).slice(-3).map((g) => ({ side: g.side, persona: g.persona, points: g.points, play: g.play })),
  };
}

export function recordGame(profile: Profile, game: Game, playerId: string): Profile {
  const sc = game.scenario;
  const st = game.state ?? {};
  if (!sc) return profile;
  if (profile.games.some((g) => g.gameId === game.id)) return profile;
  const card = sc.players.find((c) => c.id === playerId);
  const r = st.result?.players?.find((p: { player_id: string }) => p.player_id === playerId) ?? {};
  const moves = (st.play?.[playerId] ?? []) as Profile['moves'];
  const read = st.persona?.[playerId] ?? {};
  profile.games.push({
    gameId: game.id,
    day: new Date(game.createdAt ?? Date.now()).toISOString().slice(0, 10),
    title: sc.title,
    character: card?.character_name,
    side: card?.side,
    intent: read.intent ?? '',
    persona: read.persona ?? '',
    points: (r.culprit_correct ? 1 : 0) + (r.method_score ?? 0) + (r.motive_score ?? 0) + (r.goal_achieved ? 1 : 0),
    play: r.play ?? 0,
    rubric: moves[0]?.rubric ?? null,
    skills: r.skills ?? skillSplit(moves),
    coaching: r.coaching ?? '',
  });
  profile.moves = [...(profile.moves ?? []), ...moves.map((m) => ({ ...m, gameId: game.id }))];
  profile.rating = rating(profile.moves);
  profile.skills = Object.fromEntries(Object.entries(profile.rating.bySkill).map(([k, v]) => [k, { points: v.points, moves: v.moves }]));
  return profile;
}

function changeLine(games: Profile['games']): string {
  if (games.length < 2) return '';
  const before = games.at(-2)?.skills ?? {};
  const now = games.at(-1)?.skills ?? {};
  return [...new Set([...Object.keys(before), ...Object.keys(now)])]
    .map((k): [string, number] => [k, (now[k] ?? 0) - (before[k] ?? 0)])
    .filter(([, d]) => d)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([k, d]) => `${label(k)} ${PENALTIES.includes(k) ? (d < 0 ? 'more' : 'less') : d > 0 ? 'up' : 'down'}`)
    .join(', ');
}

export function profileView(profile: Profile, { full = false }: { full?: boolean } = {}) {
  const skills = Object.entries(profile.skills ?? {})
    .map(([skill, s]) => ({ skill, label: label(skill), points: s.points, moves: s.moves }))
    .sort((a, b) => (Number(PENALTIES.includes(a.skill)) - Number(PENALTIES.includes(b.skill))) || b.points - a.points);
  return {
    username: profile.username,
    name: profile.name,
    games: profile.games.length,
    skills,
    coaching: profile.games.at(-1)?.coaching ?? '',
    change: changeLine(profile.games),
    rating: profile.rating?.overall ?? 0,
    ...(full ? { answers: profile.answers.map((a) => ({ question: a.question, answer: a.answer })) } : {}),
  };
}
