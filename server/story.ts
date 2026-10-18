// @ts-nocheck -- legacy JS, typed file by file later
import { namesAnyOf, clueWhereErrors, isMinor } from './game.ts';
import { difficultyRules, difficultyOf } from '../src/lib/difficulty.ts';

const ASLEEP = /\b(asleep|sleeping|slept|unconscious|knocked out|passed out|out of sight|hidden|hiding|behind a|blindfold)/i;
const sameTime = (a, b) => String(a ?? '').replace(/\s+/g, '').toLowerCase() === String(b ?? '').replace(/\s+/g, '').toLowerCase();

// Story problems the code can see in a world, one plain line each, naming the field. They never fail a world;
// they go to the GM's consistency check. A world written before these fields existed returns nothing.
export function storyIssues(scenario, { players = [], difficulty = 'normal', rounds } = {}) {
  const s = scenario;
  if (!s || !Array.isArray(s.suspects)) return [];
  const level = difficultyOf(difficulty);
  const total = rounds ?? s.phases?.length ?? 1;
  const culprits = s.truth?.culprit_ids ?? [];
  const innocents = (s.players ?? []).filter((p) => !culprits.includes(p.id)).length;
  const rules = difficultyRules(level, innocents, total);
  const clue = Object.fromEntries((s.clues ?? []).map((c) => [c.id, c]));
  const roundOf = (id) => Number(clue[id]?.reveal_round) || 1;
  const out = [];

  const names = (text, except = null) => namesAnyOf(s, players, culprits.filter((id) => id !== except), text);
  const check = (field, text, except = null) => {
    if (names(text, except)) out.push(`giveaway: ${field} names the culprit; it must not point at them alone.`);
  };
  (s.clues ?? []).forEach((c, i) => {
    if (roundOf(c.id) < total) check(`clues[${i}].shows (${c.id})`, c.shows);
  });
  (s.public_timeline ?? []).forEach((t, i) => check(`public_timeline[${i}].event`, t?.event));
  (s.background ?? []).forEach((t, i) => check(`background[${i}]`, t));
  check('opening_scene', s.opening_scene);
  const ladder = s.hint_ladder ?? [];
  const free = rules.hintNames === 'never' ? ladder.length : rules.hintNames === 'last' ? ladder.length - 1 : Math.floor(ladder.length / 2);
  ladder.forEach((h, i) => {
    if (i < free) check(`hint_ladder[${i}].text`, h?.text);
  });
  (s.players ?? []).forEach((p, i) => {
    for (const key of ['public_info', 'intro_line', 'distrust_why']) check(`players[${i}].${key}`, p?.[key], p.id);
  });
  (s.phases ?? []).forEach((ph, i) => {
    check(`phases[${i}].question`, ph?.question);
    if ((ph?.options ?? []).some((o) => names(o))) out.push(`giveaway: phases[${i}].options names the culprit; it must not point at them alone.`);
    check(`phases[${i}].reward`, ph?.reward);
    check(`phases[${i}].wrong_nudge`, ph?.wrong_nudge);
  });

  const culpritClues = [...new Set((s.key_deductions ?? []).filter((k) => k.about === 'culprit').flatMap((k) => k.clue_ids ?? []).filter((id) => clue[id]))];
  if (culpritClues.length < rules.culpritClues) out.push(`spread: the key_deductions about the culprit use ${culpritClues.length} clues; ${level} needs ${rules.culpritClues}.`);
  const spanned = new Set(culpritClues.map(roundOf)).size;
  if (spanned < rules.culpritRounds) out.push(`spread: the culprit's clues open in ${spanned} round${spanned === 1 ? '' : 's'}; ${level} needs ${rules.culpritRounds}.`);

  s.suspects.forEach((x, i) => {
    const at = `suspects[${i}] (${x?.character_id})`;
    const pointers = x?.pointer_clue_ids ?? [];
    const clears = x?.cleared_by_clue_ids ?? [];
    if (culprits.includes(x?.character_id)) {
      if (clears.length) out.push(`suspect: ${at} is a culprit but has a clearing clue; a culprit cannot be cleared.`);
      return;
    }
    if (!String(x?.motive_against_victim ?? '').trim()) out.push(`suspect: ${at} has no motive against the victim.`);
    if (!pointers.length) out.push(`suspect: ${at} has no clue points at them.`);
    if (!clears.length) out.push(`suspect: ${at} has no clue that clears them.`);
    if (clears.some((c) => pointers.includes(c))) out.push(`suspect: ${at} has a clue that both clears and points at them; use a different clue to clear them.`);
  });
  for (const n of s.npcs ?? []) {
    if (!isMinor(n) && !s.suspects.some((x) => x?.character_id === n.id)) out.push(`suspect: GM character ${n.id} has no suspects entry; add one unless they are the victim.`);
  }

  const herrings = s.red_herrings ?? [];
  if (herrings.length < rules.herrings) out.push(`herring: ${herrings.length} red herrings; ${level} needs ${rules.herrings}.`);
  herrings.forEach((h, i) => {
    const own = h?.clue_ids ?? [];
    const refuting = h?.refuted_by_clue_ids ?? [];
    if (culprits.includes(h?.points_at)) out.push(`herring: red_herrings[${i}] points at a culprit; it must point at an innocent.`);
    if (refuting.some((c) => own.includes(c))) out.push(`herring: red_herrings[${i}] rules itself out: a refuting clue is one of its own clues.`);
    if (!refuting.length || Math.max(...refuting.map(roundOf)) <= Math.max(0, ...own.map(roundOf))) out.push(`herring: red_herrings[${i}] is refuted too soon; a refuting clue must open in a later round than its own clues.`);
  });

  const crime = s.truth?.crime;
  const suspects = new Set(s.suspects.map((x) => x?.character_id));
  (s.truth?.whereabouts ?? []).forEach((w, i) => {
    if (!crime || w?.location_id !== crime.location_id || !sameTime(w?.time, crime.time)) return;
    if (culprits.includes(w.character_id) || !suspects.has(w.character_id) || ASLEEP.test(w.doing ?? '')) return;
    out.push(`presence: truth.whereabouts[${i}] puts ${w.character_id} at the crime place at the crime time, awake; move them or say they were asleep or out of sight.`);
  });

  out.push(...clueWhereErrors(s).map((e) => `where: ${e}`));
  return out;
}

// For logs the host can read: how many of each kind, never the lines (they can name the culprit).
export const issueCounts = (issues) => {
  const counts = {};
  for (const line of issues ?? []) {
    const kind = line.split(':')[0];
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
};
