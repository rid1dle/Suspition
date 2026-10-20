// @ts-nocheck -- legacy JS, typed file by file later
import { namesAnyOf, clueWhereErrors, isMinor, validateScenario, sameTime, resolveStoryIds, retells, nightMinutes, walkMetres } from './game.ts';
import { walkMinutes, tripTime } from '../src/lib/geography.ts';
import { difficultyRules, difficultyOf } from '../src/lib/difficulty.ts';
import { craftIssues } from './craft.ts';

const wordsOf = (text) => String(text ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');
const ROLE_SKIP = new Set(['head', 'chief', 'senior', 'junior', 'night', 'day', 'young', 'old', 'assistant', 'main', 'second', 'first', 'lead', 'deputy', 'former', 'from', 'with', 'into', 'over', 'under', 'near', 'their', 'that', 'this', 'upon', 'after', 'before', 'about', 'house', 'home']);

// True when a text singles out a culprit: by name, or by a role word only a culprit's role has ("the gardener").
export function pointsAtCulprit(s, players, text, except = null) {
  const culprits = (s?.truth?.culprit_ids ?? []).filter((id) => id !== except);
  if (namesAnyOf(s, players, culprits, text)) return true;
  const people = [...(s?.players ?? []), ...(s?.npcs ?? [])];
  const roleOf = (c) => new Set(wordsOf(c.role_title).filter((w) => w.length >= 4 && !ROLE_SKIP.has(w)).map(stem));
  const owners = {};
  for (const c of people) for (const w of roleOf(c)) owners[w] = (owners[w] ?? 0) + 1;
  const said = new Set(wordsOf(text).map(stem));
  return people.some((c) => culprits.includes(c.id) && [...roleOf(c)].some((w) => owners[w] === 1 && said.has(w)));
}

const ASLEEP = /\b(asleep|sleeping|slept|unconscious|knocked out|passed out|out of sight|hidden|hiding|behind a|blindfold)/i;

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

  // Names count everywhere; a role only the culprit has counts in clues, hints and round lines.
  const names = (text, except = null) => namesAnyOf(s, players, culprits.filter((id) => id !== except), text);
  const check = (field, text, except = null, roles = false) => {
    if (roles ? pointsAtCulprit(s, players, text, except) : names(text, except)) out.push(`giveaway: ${field} names the culprit; it must not point at them alone.`);
  };
  (s.clues ?? []).forEach((c, i) => check(`clues[${i}].shows (${c.id})`, c.shows, null, true));
  (s.public_timeline ?? []).forEach((t, i) => check(`public_timeline[${i}].event`, t?.event));
  (s.background ?? []).forEach((t, i) => check(`background[${i}]`, t));
  check('opening_scene', s.opening_scene);
  const ladder = s.hint_ladder ?? [];
  const free = rules.hintNames === 'never' ? ladder.length : rules.hintNames === 'last' ? ladder.length - 1 : Math.floor(ladder.length / 2);
  ladder.forEach((h, i) => {
    if (i < free) check(`hint_ladder[${i}].text`, h?.text, null, true);
  });
  (s.players ?? []).forEach((p, i) => {
    for (const key of ['public_info', 'intro_line', 'distrust_why']) check(`players[${i}].${key}`, p?.[key], p.id);
  });
  (s.phases ?? []).forEach((ph, i) => {
    check(`phases[${i}].question`, ph?.question, null, true);
    if ((ph?.options ?? []).some((o) => pointsAtCulprit(s, players, o))) out.push(`giveaway: phases[${i}].options names the culprit; it must not point at them alone.`);
    check(`phases[${i}].reward`, ph?.reward, null, true);
    check(`phases[${i}].wrong_nudge`, ph?.wrong_nudge, null, true);
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
    if (pointers.length && clears.length && Math.min(...clears.map(roundOf)) <= Math.min(...pointers.map(roundOf))) out.push(`suspect: ${at} is cleared (round ${Math.min(...clears.map(roundOf))}) before anything points at them (round ${Math.min(...pointers.map(roundOf))}); open a pointer clue first.`);
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
    const target = s.suspects.find((x) => x?.character_id === h?.points_at);
    const seen = (s.truth?.whereabouts ?? []).some((w) => w?.character_id === h?.points_at && s.truth?.crime && sameTime(w.time, s.truth.crime.time) && (w.seen_by ?? []).length);
    if (String(target?.alibi_witness ?? '').trim() || seen) out.push(`herring: red_herrings[${i}] points at ${h?.points_at}, but they have a witness at the crime time, so it cannot mislead; remove the witness until the refuting clue.`);
    if (refuting.some((c) => own.includes(c))) out.push(`herring: red_herrings[${i}] rules itself out: a refuting clue is one of its own clues.`);
    if (!refuting.length || Math.max(...refuting.map(roundOf)) <= Math.max(0, ...own.map(roundOf))) out.push(`herring: red_herrings[${i}] is refuted too soon; a refuting clue must open in a later round than its own clues.`);
  });

  // Nobody awake may stand where the culprit acts: at the crime, or at any other step of the culprit's path.
  const crime = s.truth?.crime;
  const suspects = new Set(s.suspects.map((x) => x?.character_id));
  const witness = (w, place, time, acting = []) => w?.location_id === place && sameTime(w?.time, time)
    && !culprits.includes(w.character_id) && !acting.includes(w.character_id) && suspects.has(w.character_id) && !ASLEEP.test(w.doing ?? '');
  const flagged = new Set();
  (s.truth?.whereabouts ?? []).forEach((w, i) => {
    if (!crime || !witness(w, crime.location_id, crime.time)) return;
    flagged.add(i);
    out.push(`presence: truth.whereabouts[${i}] puts ${w.character_id} at the crime place at the crime time, awake; move them or say they were asleep or out of sight.`);
  });
  (s.truth?.timeline ?? []).forEach((t, j) => {
    if (!t?.location_id || !(t.character_ids ?? []).some((id) => culprits.includes(id))) return;
    (s.truth?.whereabouts ?? []).forEach((w, i) => {
      if (flagged.has(i) || !witness(w, t.location_id, t.time, t.character_ids)) return;
      flagged.add(i);
      out.push(`presence: truth.whereabouts[${i}] puts ${w.character_id} where a culprit acts (truth.timeline[${j}]), awake; move them or say they were asleep or out of sight.`);
    });
  });

  // Every goal can be reached: a place or person to reach it at, and steps to get there. Worlds from before goal_where skip this.
  if ((s.players ?? []).some((p) => p && 'goal_where' in p)) {
    const reachable = new Set([...(s.locations ?? []), ...(s.npcs ?? []), ...(s.players ?? [])].map((x) => x?.id));
    (s.players ?? []).forEach((p, i) => {
      const at = `players[${i}] (${p?.id})`;
      const where = String(p?.goal_where ?? '').trim();
      const steps = (p?.goal_steps ?? []).length;
      if (steps < 2) out.push(`goal: ${at} has ${steps} goal step${steps === 1 ? '' : 's'}; it needs 2 or 3.`);
      if (!where && !culprits.includes(p?.id)) out.push(`goal: ${at} has no goal_where; give the place or GM character where the goal can be reached, and put what it needs there.`);
      else if (where && !reachable.has(where)) out.push(`goal: players[${i}].goal_where (${where}) is not a place or a person.`);
    });
  }

  // A watcher knows a vague threat and what it costs them, never who is behind it.
  for (const w of s.watchers ?? []) {
    const i = (s.players ?? []).findIndex((p) => p?.id === w.watcher);
    if (i < 0) continue;
    const threat = String(s.players[i].watch_threat ?? '').trim();
    if (!threat) out.push(`watch: players[${i}] (${w.watcher}) watches ${w.owner}'s goal but has no watch_threat; say what someone wants to make happen and roughly where, never who.`);
    else if (namesAnyOf(s, players, [w.owner], threat)) out.push(`watch: players[${i}].watch_threat names the owner of the goal; say what and where, never who.`);
  }

  (s.key_objects ?? []).forEach((o, i) => {
    if (pointsAtCulprit(s, players, o?.about) || (o?.where_is_public && culprits.includes(o?.where))) out.push(`giveaway: key_objects[${i}] points at the culprit; keep where it is secret and say only what it is.`);
  });

  // A GM character who freely tells a later round's clue hands it out in round 1.
  (s.npcs ?? []).forEach((n, i) => {
    for (const c of s.clues ?? []) {
      if (roundOf(c.id) > 1 && retells(n.reveals_freely, c.shows)) out.push(`leak: npcs[${i}].reveals_freely gives away clue ${c.id} (round ${roundOf(c.id)}) from the start; move it to reveals_under_pressure or hold it back.`);
    }
  });

  out.push(...farIssues(s));
  out.push(...craftIssues(s));
  out.push(...clueWhereErrors(s).map((e) => `where: ${e}`));
  return out;
}

// Each character's whereabouts in time order: two places a longer walk apart than the minutes between them.
function farIssues(s) {
  if (!s.geography) return [];
  const out = [];
  const placeName = (id) => String((s.locations ?? []).find((l) => l.id === id)?.name ?? id).replace(/^the\s+/i, '');
  const timed = (s.truth?.whereabouts ?? []).map((w, i) => ({ w, i, at: nightMinutes(w?.time) })).filter((x) => x.w && x.at !== null);
  for (const id of new Set(timed.map((x) => x.w.character_id))) {
    const own = timed.filter((x) => x.w.character_id === id).sort((a, b) => a.at - b.at);
    for (let k = 1; k < own.length; k += 1) {
      const [a, b] = [own[k - 1], own[k]];
      const m = walkMetres(s, a.w.location_id, b.w.location_id);
      const gap = b.at - a.at;
      if (m === null || Math.round(walkMinutes(m)) <= gap) continue;
      out.push(`far: truth.whereabouts[${a.i}] and truth.whereabouts[${b.i}] put ${id} in the ${placeName(a.w.location_id)} at ${a.w.time} and the ${placeName(b.w.location_id)} at ${b.w.time}, a ${tripTime(m)}, only ${gap} minute${gap === 1 ? '' : 's'} apart; change a place or a time.`);
    }
  }
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

const STORY_PATHS = [
  /^clues\.\d+\.(shows|does_not_prove|where|reveal_round|text|form|author|written_at|from_step)$/,
  /^players\.\d+\.(private_info|public_info|starting_knowledge|goal|goal_where|watch_threat|watch_stake)$/,
  /^npcs\.\d+\.(knows|secrets|lies|reveals_freely|reveals_under_pressure|agenda)$/,
  /^why_tonight$/,
  /^truth\.timeline$/,
  /^(setups|reframes|world_rules)$/,
  /^hint_ladder\.\d+\.text$/,
  /^public_timeline\.\d+\.event$/,
  /^truth\.whereabouts$/,
  /^suspects$/,
  /^red_herrings$/,
];
const LIST_PATHS = new Set(['truth.whereabouts', 'suspects', 'red_herrings', 'truth.culprit_ids', 'truth.timeline', 'setups', 'reframes', 'world_rules']);
const OBJECT_KEYS = new Set(['agenda']);
const INTEGER_KEYS = new Set(['reveal_round', 'answer_index']);

function patchValue(path, key, value) {
  if (LIST_PATHS.has(path)) {
    const list = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(list)) throw new Error('needs a list');
    return list;
  }
  if (OBJECT_KEYS.has(key)) {
    const o = typeof value === 'string' ? JSON.parse(value) : value;
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('needs an object');
    return o;
  }
  if (INTEGER_KEYS.has(key)) {
    const n = Number(value);
    if (!Number.isInteger(n)) throw new Error('needs a whole number');
    return n;
  }
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.trim().startsWith('[') && key === 'options') return JSON.parse(value).map(String);
  return String(value ?? '');
}

// Sets each allowed dotted path ("clues.3.shows") that already exists in the target. Everything else is skipped, with why.
export function applyPatches(target, patches, allowed) {
  let applied = 0;
  const skipped = [];
  for (const patch of Array.isArray(patches) ? patches : []) {
    const path = String(patch?.path ?? '').trim();
    if (!allowed(path)) {
      skipped.push(`${path || '(empty)'}: not a field that may change`);
      continue;
    }
    const parts = path.split('.');
    const key = parts.pop();
    const parent = parts.reduce((o, k) => (o == null ? o : o[/^\d+$/.test(k) ? Number(k) : k]), target);
    if (!parent || typeof parent !== 'object' || Array.isArray(parent)) {
      skipped.push(`${path}: no such place`);
      continue;
    }
    try {
      parent[key] = patchValue(path, key, patch.value);
      applied += 1;
    } catch (err) {
      skipped.push(`${path}: ${err.message}`);
    }
  }
  return { applied, skipped };
}

const structuralCount = (s, rules) => validateScenario(s, rules).length + clueWhereErrors(s).length;

// Applies patches one at a time with names turned into ids; a patch that leaves the world more broken is undone alone.
// target: { scenario() the world to fix ids in, snapshot() a copy of everything a patch may touch, restore(copy) }.
export function guardedPatches(target, patches, apply, count) {
  const out = { applied: 0, skipped: [] };
  let base = count();
  for (const patch of Array.isArray(patches) ? patches : []) {
    const copy = target.snapshot();
    const one = apply(patch);
    out.skipped.push(...one.skipped);
    if (!one.applied) continue;
    resolveStoryIds(target.scenario());
    const now = count();
    if (now > base) {
      target.restore(copy);
      out.skipped.push(`${patch?.path}: undone, it broke the world`);
      continue;
    }
    base = now;
    out.applied += one.applied;
  }
  return out;
}

const inPlace = (scenario) => ({
  scenario: () => scenario,
  snapshot: () => structuredClone(scenario),
  restore: (copy) => {
    for (const k of Object.keys(scenario)) delete scenario[k];
    Object.assign(scenario, copy);
  },
});

// The consistency check's patches, to the allowed fields only.
export function applyStoryPatches(scenario, patches, rules) {
  // A culprit who does not know it keeps an innocent's card: no check may write their crime onto it.
  const unaware = (path) => { const m = /^players\.(\d+)\./.exec(path); return Boolean(m && scenario.players?.[Number(m[1])]?.unaware); };
  const allowed = (path) => STORY_PATHS.some((re) => re.test(path)) && !unaware(path);
  return guardedPatches(inPlace(scenario), patches, (p) => applyPatches(scenario, [p], allowed), () => structuralCount(scenario, rules));
}

// A value shaped like the field it replaces: a number, a yes or no, a list or an object stay what they were.
function typedLike(existing, value) {
  const parsed = () => (typeof value === 'string' ? JSON.parse(value) : value);
  if (typeof existing === 'number') {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error('needs a number');
    return n;
  }
  if (typeof existing === 'boolean') {
    if (!['true', 'false', true, false].includes(value)) throw new Error('needs true or false');
    return value === true || value === 'true';
  }
  if (Array.isArray(existing)) {
    const list = parsed();
    if (!Array.isArray(list)) throw new Error('needs a list');
    return list;
  }
  if (existing && typeof existing === 'object') {
    const o = parsed();
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('needs an object');
    return o;
  }
  if (existing === undefined && typeof value === 'string' && /^\s*[[{]/.test(value)) return JSON.parse(value);
  return String(value ?? '');
}

// Patches for a draft that broke a few rules: any field, typed like what it replaces, a new list item at the end.
// A patch that leaves the world more broken is undone alone.
export function applyFixPatches(scenario, patches, rules) {
  const apply = (patch) => {
    const path = String(patch?.path ?? '').trim();
    const parts = path.split('.');
    const key = parts.pop();
    const parent = parts.reduce((o, k) => (o == null ? o : o[/^\d+$/.test(k) ? Number(k) : k]), scenario);
    const index = /^\d+$/.test(key ?? '') ? Number(key) : null;
    if (!path || !parent || typeof parent !== 'object' || (Array.isArray(parent) && (index === null || index > parent.length))) return { applied: 0, skipped: [`${path || '(empty)'}: no such place`] };
    const slot = Array.isArray(parent) ? index : key;
    try {
      parent[slot] = typedLike(parent[slot] ?? (Array.isArray(parent) ? parent[0] : undefined), patch.value);
      return { applied: 1, skipped: [] };
    } catch (err) {
      return { applied: 0, skipped: [`${path}: ${err.message}`] };
    }
  };
  return guardedPatches(inPlace(scenario), patches, apply, () => structuralCount(scenario, rules));
}
