// @ts-nocheck -- legacy JS, typed file by file later
import { randomBytes } from 'node:crypto';
import { formForGM, quoteRaw } from './reader.ts';
import { scoreMoves, playTotal, playEarned, skillSplit, PLAY_MAX } from './skills.ts';
import { rulesLines } from '../src/lib/rules.ts';
import { LENGTHS, PLAN_SECTIONS } from './prompts.ts';
import { roomTheme, guessRoom } from './room.ts';
import { GENERATION_STEPS } from './progress.ts';
import { sanitizeMusic } from '../src/lib/music-theory.ts';
import { DECK, drawIdea } from '../src/lib/settings-deck.ts';
import { ART_CHOICES, DEFAULT_STYLE } from '../src/lib/art-styles.ts';
import { difficultyOf } from '../src/lib/difficulty.ts';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const TONES = ['cozy', 'tense', 'dark', 'funny'];
export const HINT_VOTE_MS = 60_000;
export const ROUND_VOTE_MS = 90_000;
export const MOMENT_READY_MS = 60_000;
export const EXTEND_MS = 5 * 60_000;
export const SEAT_FIRST_MS = 60_000;
export const SEAT_READY_MS = 15_000;
export const SEAT_LIVE_MS = 90_000;
const SEAT_ASKERS = 3;
export const POINT_DEFEND_MS = 20_000;
export const POINT_COOLDOWN_MS = 60_000;
const POINT_QUEUE = 2;

export class GameError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const token = () => randomBytes(16).toString('hex');
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const fail = (msg, status) => {
  throw new GameError(msg, status);
};

export function createGame(now = Date.now()) {
  const surprise = drawIdea([]);
  return {
    id: token().slice(0, 12),
    createdAt: now,
    hostToken: token(),
    status: 'lobby',
    players: [],
    setup: null,
    scenario: null,
    state: null,
    error: null,
    lobby: { surprise, shown: [surprise.id] },
  };
}

// A new setting idea for an empty setting box, away from recent worlds and from ideas shown in this lobby.
export function shuffleSurprise(game, recent = [], random = Math.random) {
  game.lobby ??= { surprise: null, shown: [] };
  const idea = drawIdea(recent.map((r) => String(r).toLowerCase()), random, game.lobby.shown);
  game.lobby.surprise = idea;
  game.lobby.shown = game.lobby.shown.length >= DECK.length ? [idea.id] : [...game.lobby.shown, idea.id];
  return idea;
}

export function addPlayer(game, { name, wish, username } = {}) {
  if (game.status !== 'lobby') fail('The game has already started.', 409);
  const clean = String(name ?? '').trim().slice(0, 24);
  if (!clean) fail('Enter a name.');
  if (game.players.length >= MAX_PLAYERS) fail(`The game is full (${MAX_PLAYERS} players).`, 409);
  if (game.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    fail('Someone already has that name.', 409);
  }
  if (username && game.players.some((p) => p.username === username)) fail('Someone in this game already uses that username.', 409);
  const player = {
    id: `p${game.players.length + 1}`,
    token: token(),
    name: clean,
    wish: String(wish ?? '').trim().slice(0, 200),
    ...(username ? { username } : {}),
  };
  game.players.push(player);
  return player;
}

export function playerByToken(game, tok) {
  const player = tok && game.players.find((p) => p.token === tok);
  if (!player) fail('Unknown player. Join the game again.', 401);
  return player;
}

export function applySetup(game, input = {}) {
  if (!['lobby', 'failed'].includes(game.status)) fail('Setup is already done.', 409);
  if (game.players.length < MIN_PLAYERS) fail(`Need at least ${MIN_PLAYERS} players.`, 409);
  const tone = TONES.includes(input.tone) ? input.tone : null;
  if (!tone) fail('Pick a tone.');
  if (!LENGTHS[input.length]) fail('Pick a game length.');
  const hints = Number(input.hints);
  if (!Number.isInteger(hints) || hints < 1 || hints > 5) fail('Hints must be between 1 and 5.');
  const overrides = input.overrides === undefined ? 3 : Number(input.overrides);
  if (!Number.isInteger(overrides) || overrides < 0 || overrides > 5) fail('Overrides must be between 0 and 5.');
  const npcs = input.npcs === undefined ? 3 : Number(input.npcs);
  if (!Number.isInteger(npcs) || npcs < 0 || npcs > 6) fail('GM characters must be between 0 and 6.');
  const replays = input.replays === undefined ? 2 : Number(input.replays);
  if (!Number.isInteger(replays) || replays < 0 || replays > MAX_REPLAYS) fail(`Replays must be between 0 and ${MAX_REPLAYS}.`);
  const roundStyle = input.roundStyle === 'hotseats' ? 'hotseats' : 'classic';
  const questions = input.questions === undefined ? (roundStyle === 'hotseats' ? 2 : LENGTHS[input.length].questions) : Number(input.questions);
  if (!Number.isInteger(questions) || questions < 1 || questions > 6) fail('Private questions must be between 1 and 6.');
  const npcRole = input.npcRole ?? 'mixed';
  if (!NPC_ROLES.includes(npcRole)) fail('Pick what the GM characters do.');
  game.setup = {
    setting: String(input.setting ?? '').trim().slice(0, 200),
    tone,
    length: input.length,
    hints,
    overrides,
    npcs,
    npcRole,
    replays,
    questions,
    roundStyle,
    difficulty: difficultyOf(input.difficulty),
    notes: String(input.notes ?? '').trim().slice(0, 500),
    artStyle: ART_CHOICES.includes(input.artStyle) ? input.artStyle : DEFAULT_STYLE,
  };
  if (!game.setup.setting && game.lobby?.surprise) game.setup.surprise = { ...game.lobby.surprise };
  game.status = 'generating';
  game.error = null;
  return game.setup;
}

export const isMinor = (npc) => npc?.importance === 'minor';

export function applyAudit(scenario, audit) {
  let changes = 0;
  for (const entry of audit?.players ?? []) {
    const p = scenario.players.find((x) => x.id === entry?.player_id);
    if (!p) continue;
    const known = [p.public_info, p.private_info, p.starting_knowledge].join(' ').toLowerCase();
    const moved = (p.hidden_facts ?? []).filter((h) => (entry.known_hidden_fact_ids ?? []).includes(h.id));
    p.hidden_facts = (p.hidden_facts ?? []).filter((h) => !moved.includes(h));
    const adds = [...(entry.add ?? []), ...moved.map((h) => h.fact)]
      .map((t) => String(t ?? '').trim())
      .filter((t, i, all) => t && all.indexOf(t) === i && !known.includes(t.toLowerCase()));
    if (adds.length) p.starting_knowledge = [String(p.starting_knowledge ?? '').trim(), ...adds].filter(Boolean).join(' ');
    changes += adds.length;
    const hook = String(entry.hook ?? '').trim().slice(0, 200);
    if (hook && !p.hook) p.hook = hook;
    const distrusts = String(entry.distrusts ?? '').trim();
    if (!p.distrusts && distrusts !== p.id && scenario.players.some((x) => x.id === distrusts)) {
      p.distrusts = distrusts;
      p.distrust_why = String(entry.distrust_why ?? '').trim().slice(0, 200);
    }
    const others = { ...scenario, truth: { ...scenario.truth, culprit_ids: (scenario.truth?.culprit_ids ?? []).filter((id) => id !== p.id) } };
    const reveals = (entry.reveals ?? []).map((t) => String(t ?? '').trim().slice(0, 200)).filter((t) => t && !namesCulprit(others, [], t)).slice(0, 3);
    if (reveals.length && !p.reveals?.length) p.reveals = reveals;
    for (const key of ['wants', 'fears', 'goal_why']) {
      const text = String(entry[key] ?? '').trim();
      if (text && !String(p[key] ?? '').trim()) {
        p[key] = text;
        changes += 1;
      }
    }
    const reasons = (entry.reasons ?? []).map((t) => String(t ?? '').trim()).filter((t) => t && !(p.reasons ?? []).includes(t));
    if (reasons.length) p.reasons = [...(p.reasons ?? []), ...reasons];
    changes += reasons.length;
    const reminders = remindersFor({ reminders: entry.reminders ?? [] });
    if (reminders.length && !(p.reminders ?? []).length) {
      p.reminders = reminders;
      changes += 1;
    }
    const night = cleanSlots(entry.night, ['time', 'where', 'doing']);
    if (night.length && !p.night?.length) {
      p.night = night;
      changes += 1;
    }
  }
  const times = cleanSlots(audit?.key_times, ['time', 'what']);
  if (times.length && !scenario.key_times?.length) {
    scenario.key_times = times;
    changes += 1;
  }
  for (const entry of audit?.alibis ?? []) {
    const c = [...scenario.players, ...scenario.npcs].find((x) => x.id === entry?.id);
    const alibi = cleanSlots(entry?.alibi, ['time', 'where']);
    if (c && alibi.length && !c.alibi?.length) {
      c.alibi = alibi;
      changes += 1;
    }
  }
  changes += nightsFromWhereabouts(scenario);
  for (const r of audit?.rounds ?? []) {
    const ph = scenario.phases?.[r?.index];
    if (!ph) continue;
    if (String(r.objective ?? '').trim() && !String(ph.objective ?? '').trim()) {
      ph.objective = String(r.objective).trim();
      changes += 1;
    }
    const tips = (r.try ?? []).map((t) => String(t ?? '').trim()).filter(Boolean).slice(0, 3);
    if (tips.length && !ph.try?.length) ph.try = tips;
  }
  return changes;
}

// Minutes after noon-ish so a night sorts in order across midnight ("11 pm" before "12:30 am"); null when unreadable.
function nightMinutes(time) {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i.exec(String(time ?? ''));
  if (!m) return null;
  const pm = /^p/i.test(m[3] ?? '');
  const h = m[3] ? (Number(m[1]) % 12) + (pm ? 12 : 0) : Number(m[1]);
  const minutes = h * 60 + Number(m[2] ?? 0);
  return minutes < 360 ? minutes + 1440 : minutes;
}
export const sameTime = (a, b) => String(a ?? '').replace(/\s+/g, '').toLowerCase() === String(b ?? '').replace(/\s+/g, '').toLowerCase();

// A player's night is copied from the truth's whereabouts; the card check's own lines only fill the times between.
function nightsFromWhereabouts(scenario) {
  let changes = 0;
  const placeName = (id) => (scenario.locations ?? []).find((l) => l.id === id)?.name ?? id;
  for (const p of scenario.players ?? []) {
    const own = (scenario.truth?.whereabouts ?? []).filter((w) => w?.character_id === p.id);
    if (!own.length) continue;
    const truth = cleanSlots(own.map((w) => ({ time: w.time, where: placeName(w.location_id), doing: w.doing })), ['time', 'where', 'doing']);
    const extra = (p.night ?? []).filter((n) => !truth.some((t) => sameTime(t.time, n.time)));
    const key = (n) => nightMinutes(n.time) ?? Infinity;
    p.night = [...truth, ...extra].sort((a, b) => key(a) - key(b));
    changes += 1;
  }
  return changes;
}

function cleanSlots(list, keys) {
  return (Array.isArray(list) ? list : [])
    .map((x) => Object.fromEntries(keys.map((k) => [k, String(x?.[k] ?? '').trim().slice(0, 120)])))
    .filter((x) => x[keys[0]] && x[keys[1]]);
}

const sentences = (text) => {
  const t = String(text ?? '').trim();
  return t ? (t.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) ?? [t]).map((s) => s.trim()).filter(Boolean) : [];
};

// Short reminders of who a player is, shown one at a time during play.
export function pelletsFor(c) {
  return [
    `You are ${c.character_name}, ${c.role_title}.`,
    ...sentences(c.public_info).map((s) => `Everyone knows: ${s}`),
    c.goal ? `Your secret goal: ${c.goal}` : '',
    ...sentences(c.wants),
    ...sentences(c.fears),
    ...sentences(c.private_info),
    ...(c.reasons ?? []),
    ...(c.night ?? []).map((n) => `At ${n.time} you were at ${n.where}. ${n.doing}`),
  ].map((s) => String(s).trim().slice(0, 180)).filter(Boolean);
}

const SECOND_PERSON = /^\s*(you|your|you're|yours)\b/i;

// Short third-person lines that remind a player who their character is. The GM writes them;
// old worlds build them from the card. Never "You ...".
export function remindersFor(c) {
  const clean = (list) => list.map((t) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)).filter((t) => t && !SECOND_PERSON.test(t));
  const written = clean(Array.isArray(c.reminders) ? c.reminders : []);
  if (written.length) return written;
  const name = c.character_name;
  const role = String(c.role_title ?? '').trim();
  return clean([
    role ? `${name} is ${/^(a|an|the)\s/i.test(role) ? role : `the ${role}`}.` : '',
    ...sentences(c.public_info),
    ...(c.night ?? []).map((n) => `At ${n.time}, ${name} was in the ${String(n.where).replace(/^the\s+/i, '')}.`),
  ]);
}

export function peopleView(game) {
  const sc = game.scenario;
  const facts = game.state?.facts ?? [];
  const person = (c, extra) => ({
    id: c.id,
    icon: c.icon ?? '',
    role: c.role_title,
    info: c.public_info,
    alibi: (c.alibi ?? []).map((a) => ({ time: a.time, where: a.where })),
    facts: facts.filter((f) => f.id === c.id).map((f) => ({ fact: f.fact, round: f.round, at: f.at })).reverse(),
    ...extra,
  });
  return [
    ...sc.players.map((c) => person(c, { name: c.character_name, player: game.players.find((p) => p.id === c.id)?.name ?? '', kind: 'player', minor: false })),
    ...[...sc.npcs].sort((a, b) => isMinor(a) - isMinor(b)).map((n) => person(n, { name: n.name, player: '', kind: 'npc', minor: isMinor(n) })),
  ];
}

export function alibiTable(scenario) {
  const times = scenario?.key_times ?? [];
  if (!times.length) return null;
  const row = (c, name, kind) => ({ name, kind, minor: isMinor(c), cells: times.map((t) => c.alibi?.find((a) => a.time === t.time)?.where ?? '') });
  const rows = [
    ...scenario.players.map((c) => row(c, c.character_name, 'player')),
    ...[...scenario.npcs].sort((a, b) => isMinor(a) - isMinor(b)).map((n) => row(n, n.name, 'npc')),
  ].filter((r) => r.cells.some(Boolean));
  return rows.length ? { times: times.map((t) => ({ time: t.time, what: t.what })), rows } : null;
}
export const NPC_ROLES = ['mixed', 'background'];

export function validateScenario(s, { playerCount, phases, hints, npcs, npcRole = 'mixed', culprits }) {
  const errors = [];
  if (!s || typeof s !== 'object') return ['Scenario is not an object.'];
  const ids = (list) => (Array.isArray(list) ? list.map((x) => x?.id) : []);
  const players = Array.isArray(s.players) ? s.players : [];

  const expected = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
  const got = ids(players);
  if (got.length !== playerCount || expected.some((id) => !got.includes(id))) {
    errors.push(`players must be exactly ${expected.join(', ')}; got ${got.join(', ') || 'none'}.`);
  }

  const npcIds = ids(s.npcs);
  if (npcs !== undefined && (npcIds.length > npcs || npcIds.length < npcs - 1)) errors.push(`Need exactly ${npcs} GM characters; got ${npcIds.length}.`);
  if (npcRole === 'background') {
    if (!(s.npcs ?? []).every(isMinor)) errors.push('Every GM character must be minor (background only).');
    const names = (s.npcs ?? []).map((n) => String(n.name ?? '').split(/\s+/).find((w) => w.length > 3 && !/^(dr|mr|mrs|ms)\.?$/i.test(w))).filter(Boolean);
    for (const c of s.clues ?? []) {
      const where = String(c.where ?? '');
      if (npcIds.includes(where.trim()) || names.some((n) => where.includes(n))) errors.push(`Clue ${c.id} sits with a GM character; background GM characters hold no clues.`);
    }
  } else if (npcIds.length && (s.npcs ?? []).every(isMinor)) {
    errors.push('At least one GM character must be important.');
  }
  const clueIds = ids(s.clues);
  for (const [label, list] of [['npc', npcIds], ['clue', clueIds], ['location', ids(s.locations)]]) {
    if (new Set(list).size !== list.length) errors.push(`Duplicate ${label} ids.`);
  }
  const factIds = players.flatMap((p) => ids(p.hidden_facts));
  if (new Set(factIds).size !== factIds.length) errors.push('Hidden fact ids must be unique across players.');
  for (const p of players) {
    if (!Array.isArray(p.hidden_facts) || p.hidden_facts.length < 1) {
      errors.push(`${p.id} needs at least one hidden fact.`);
    }
  }

  const named = s.truth?.culprit_ids ?? [];
  if (!named.length) errors.push('truth.culprit_ids is empty.');
  if (culprits && [...named].filter((id) => got.includes(id)).sort().join() !== [...culprits].sort().join()) {
    errors.push(`The culprits among the players must be exactly ${culprits.join(' and ')}.`);
  }
  for (const id of named) {
    const npc = (s.npcs ?? []).find((n) => n.id === id);
    if (npc && (isMinor(npc) || npcRole === 'background')) errors.push(`${id} is a background GM character and cannot be a culprit.`);
  }
  const known = new Set([...got, ...npcIds]);
  for (const id of named) if (!known.has(id)) errors.push(`Culprit ${id} is not a character.`);
  const playerCulprits = players.filter((p) => p.side === 'culprit').map((p) => p.id);
  if (!playerCulprits.length) errors.push('At least one player character must be a culprit.');
  for (const id of playerCulprits) {
    if (!named.includes(id)) errors.push(`${id} has side culprit but is not in truth.culprit_ids.`);
  }
  for (const id of named.filter((c) => got.includes(c))) {
    if (!playerCulprits.includes(id)) errors.push(`${id} is a culprit but its side is not culprit.`);
  }

  const deductions = Array.isArray(s.key_deductions) ? s.key_deductions : [];
  if (deductions.length < 3) errors.push('Need at least 3 key deductions.');
  for (const k of deductions) {
    const backing = (k.clue_ids ?? []).filter((c) => clueIds.includes(c));
    if (backing.length < 2) errors.push(`Deduction ${k.id} needs at least 2 existing clues.`);
  }

  if (!Array.isArray(s.phases) || s.phases.length !== phases) errors.push(`Need exactly ${phases} phases.`);
  const ladder = Array.isArray(s.hint_ladder) ? s.hint_ladder : [];
  if (ladder.filter((h) => !h.is_false).length < hints) errors.push(`Need at least ${hints} true hints.`);
  if (ladder.filter((h) => h.is_false).length > 1) errors.push('At most one false hint.');
  if (Array.isArray(s.suspects)) errors.push(...storyFieldErrors(s, { players: got, npcIds, clueIds, placeIds: ids(s.locations), phases }));
  return errors;
}

// The GM often writes a name where an id belongs ("Asha Varma" for p1, "the Shed" for l3). Exact names become ids;
// anything else is left for the checks to catch.
export function resolveStoryIds(s) {
  if (!s || typeof s !== 'object') return s;
  const key = (t) => String(t ?? '').trim().toLowerCase().replace(/^the\s+/, '');
  const people = new Map([...(s.players ?? []).map((p) => [key(p.character_name), p.id]), ...(s.npcs ?? []).map((n) => [key(n.name), n.id])]);
  const places = new Map((s.locations ?? []).map((l) => [key(l.name), l.id]));
  const ids = new Set([...(s.players ?? []), ...(s.npcs ?? []), ...(s.locations ?? [])].map((x) => x.id));
  const fix = (map) => (v) => (ids.has(String(v ?? '').trim()) ? String(v).trim() : map.get(key(v)) ?? v);
  const person = fix(people);
  const place = fix(places);
  const anywhere = fix(new Map([...places, ...people]));
  for (const h of s.red_herrings ?? []) if (h) h.points_at = person(h.points_at);
  for (const x of s.suspects ?? []) if (x) x.character_id = person(x.character_id);
  for (const w of s.truth?.whereabouts ?? []) {
    if (!w) continue;
    w.character_id = person(w.character_id);
    w.location_id = place(w.location_id);
    if (Array.isArray(w.seen_by)) w.seen_by = w.seen_by.map(person);
  }
  if (s.truth?.crime) s.truth.crime.location_id = place(s.truth.crime.location_id);
  for (const c of s.clues ?? []) if (c) c.where = anywhere(c.where);
  return s;
}

// Clues whose where is not a place or character id. A story problem the check can patch, not a reason to fail a draft.
export function clueWhereErrors(s) {
  const known = new Set([...(s?.locations ?? []), ...(s?.players ?? []), ...(s?.npcs ?? [])].map((x) => x?.id));
  return (s?.clues ?? []).filter((c) => !known.has(String(c.where ?? '').trim())).map((c) => `Clue ${c.id} sits nowhere real; where must be a place or character id.`);
}

// The story fields of a world written since difficulty came in. Old worlds have none and skip this.
function storyFieldErrors(s, { players, npcIds, clueIds, placeIds, phases }) {
  const errors = [];
  const people = new Set([...players, ...npcIds]);
  const clues = new Set(clueIds);
  const places = new Set(placeIds);
  const unknownClues = (label, list) => (list ?? []).filter((c) => !clues.has(c)).forEach((c) => errors.push(`${label} names unknown clue ${c}.`));
  for (const id of players) if (!s.suspects.some((x) => x?.character_id === id)) errors.push(`${id} needs a suspects entry.`);
  for (const x of s.suspects) {
    if (!people.has(x?.character_id)) errors.push(`suspects names unknown character ${x?.character_id}.`);
    unknownClues(`suspects entry for ${x?.character_id}`, [...(x?.pointer_clue_ids ?? []), ...(x?.cleared_by_clue_ids ?? [])]);
  }
  for (const [i, h] of (s.red_herrings ?? []).entries()) {
    if (!people.has(h?.points_at)) errors.push(`red_herrings ${i + 1} points at unknown character ${h?.points_at}.`);
    unknownClues(`red_herrings ${i + 1}`, [...(h?.clue_ids ?? []), ...(h?.refuted_by_clue_ids ?? [])]);
  }
  if (!places.has(s.truth?.crime?.location_id)) errors.push('truth.crime.location_id must be a place.');
  for (const w of s.truth?.whereabouts ?? []) {
    if (!people.has(w?.character_id)) errors.push(`truth.whereabouts names unknown character ${w?.character_id}.`);
    if (!places.has(w?.location_id)) errors.push(`truth.whereabouts for ${w?.character_id} names unknown place ${w?.location_id}.`);
  }
  for (const c of s.clues ?? []) {
    if (!Number.isInteger(c.reveal_round) || c.reveal_round < 1 || c.reveal_round > phases) errors.push(`Clue ${c.id} opens in round ${c.reveal_round}; the game has ${phases} rounds.`);
  }
  for (const about of ['culprit', 'method', 'motive']) {
    if (!(s.key_deductions ?? []).some((k) => k.about === about)) errors.push(`Need a key deduction about the ${about}.`);
  }
  return errors;
}

// A round reward or nudge that names a culprit would give the case away: it is blanked, never a reason to fail the world.
// Runs when a world is attached and when a saved game loads, so old worlds are cleaned too.
export function cleanScenario(game) {
  for (const ph of game.scenario?.phases ?? []) {
    if (namesCulprit(game.scenario, game.players, ph?.reward)) ph.reward = '';
    if (namesCulprit(game.scenario, game.players, ph?.wrong_nudge)) ph.wrong_nudge = '';
  }
}

// True when a text names a culprit: by full character or player name, or by a name word only they have.
// Stricter than mentions: a lone number ("1" in "Character 1") never counts, so "At 1 am" stays safe.
export function namesCulprit(scenario, players, text) {
  return namesAnyOf(scenario, players, scenario?.truth?.culprit_ids ?? [], text);
}

// Strict: a whole name, or a name word only that one person has; never a lone number or a title.
export function namesAnyOf(scenario, players, ids, text) {
  const culprits = ids ?? [];
  if (!text || !culprits.length || !scenario?.players) return false;
  const words = wordsOf(text);
  const joined = ` ${words.join(' ')} `;
  const people = [...scenario.players, ...(scenario.npcs ?? [])].map((c) => {
    const names = [c.character_name ?? c.name, (players ?? []).find((p) => p.id === c.id)?.name].filter(Boolean);
    return { id: c.id, full: names.map((n) => wordsOf(n).join(' ')).filter(Boolean), words: names.flatMap(nameWords).filter((w) => !/^\d+$/.test(w) && !TITLES.has(w)) };
  });
  const owners = {};
  for (const p of people) for (const w of new Set(p.words)) owners[w] = (owners[w] ?? 0) + 1;
  return people.some((p) => culprits.includes(p.id)
    && (p.full.some((f) => joined.includes(` ${f} `)) || p.words.some((w) => owners[w] === 1 && words.includes(w))));
}

export function mapOf(scenario, edits = {}) {
  const locs = scenario?.locations ?? [];
  const ids = locs.map((l) => l.id);
  const hasLayout = locs.length && locs.every((l) => Number.isFinite(l.x) && Number.isFinite(l.y));
  return locs.map((l, i) => {
    const angle = (2 * Math.PI * i) / locs.length - Math.PI / 2;
    const e = edits[l.id] ?? {};
    return {
      id: l.id,
      name: l.name,
      x: Number.isFinite(e.x) ? e.x : hasLayout ? clamp(Math.round(l.x), 6, 94) : Math.round(50 + 38 * Math.cos(angle)),
      y: Number.isFinite(e.y) ? e.y : hasLayout ? clamp(Math.round(l.y), 8, 92) : Math.round(50 + 38 * Math.sin(angle)),
      room: e.room ?? '',
      icon: l.icon ?? '',
      neighbors: (l.neighbors ?? []).filter((n) => ids.includes(n) && n !== l.id),
    };
  });
}

export function startPositions(scenario) {
  const ids = (scenario.locations ?? []).map((l) => l.id);
  const people = [...scenario.players, ...scenario.npcs];
  return Object.fromEntries(people.map((c, i) => [c.id, ids.includes(c.start_location) ? c.start_location : ids[i % ids.length]]).filter(([, l]) => l));
}

function move(game, characterId, locationId) {
  const valid = game.scenario.locations.some((l) => l.id === locationId)
    && [...game.scenario.players, ...game.scenario.npcs].some((c) => c.id === characterId);
  if (valid) game.state.positions[characterId] = locationId;
}

export function editPlace(game, input = {}) {
  if (!game.scenario || !['reading', 'playing', 'final'].includes(game.status)) fail('The map can only be changed during a game.', 409);
  if (!game.scenario.locations.some((l) => l.id === input.id)) fail('Unknown place.');
  game.state.mapEdits ??= {};
  const e = { ...(game.state.mapEdits[input.id] ?? {}) };
  if (input.x !== undefined || input.y !== undefined) {
    const x = Number(input.x);
    const y = Number(input.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) fail('Bad position.');
    e.x = clamp(Math.round(x), 6, 94);
    e.y = clamp(Math.round(y), 8, 92);
  }
  if (input.room !== undefined) e.room = String(input.room ?? '').trim().slice(0, 40);
  game.state.mapEdits[input.id] = e;
  return e;
}

export function attachScenario(game, scenario, now = Date.now()) {
  const length = LENGTHS[game.setup.length];
  game.scenario = scenario;
  cleanScenario(game);
  game.status = 'reading';
  game.state = {
    phaseIndex: -1,
    basePhases: scenario.phases.length,
    phaseEndsAt: null,
    questionsPerPhase: game.setup.questions ?? length.questions,
    phaseMinutes: length.minutes,
    hintsLeft: game.setup.hints,
    hintCursor: 0,
    hintsGiven: [],
    hintVote: null,
    suspicion: 20,
    events: [{ at: now, phase: null, text: scenario.opening_scene, kind: 'opening' }],
    threads: Object.fromEntries(game.players.map((p) => [p.id, []])),
    questionsLeft: Object.fromEntries(game.players.map((p) => [p.id, 0])),
    pending: {},
    found: Object.fromEntries(game.players.map((p) => [p.id, []])),
    destroyed: [],
    revealed: Object.fromEntries(game.players.map((p) => [p.id, []])),
    ready: {},
    positions: startPositions(scenario),
    mapEdits: {},
    brief: { step: 0 },
    roundVote: null,
    roundResults: [],
    timelineExtra: [],
    shared: [],
    publicPending: {},
    illustration: null,
    knowledge: [],
    moments: [],
    canon: [],
    continuity: { lastAt: 0, answers: 0, log: [] },
    unlocked: {},
    overridesLeft: Object.fromEntries(game.players.map((p) => [p.id, game.setup.overrides ?? 3])),
    submissions: {},
    transitioning: false,
    result: null,
  };
}

export function markReady(game, playerId) {
  if (game.status !== 'reading') fail('Not in the reading phase.', 409);
  game.state.ready[playerId] = true;
}

function enterPhase(game, index, now) {
  const st = game.state;
  st.phaseIndex = index;
  st.phaseEndsAt = now + st.phaseMinutes * 60_000;
  for (const p of game.players) st.questionsLeft[p.id] = st.questionsPerPhase;
}

export function startPlay(game, now = Date.now()) {
  if (game.status !== 'reading') fail('The game is not ready to start.', 409);
  game.status = 'playing';
  game.state.roundNumber = 1;
  game.state.replays = 0;
  enterPhase(game, 0, now);
  planSeats(game, now);
  game.state.events.push({ at: now, phase: 0, kind: 'phase', text: phaseLine(game, 0) });
  announceRound(game, 0, now);
}

function announceRound(game, index, now, again = false) {
  for (const t of again ? [] : game.scenario.public_timeline ?? []) {
    if (Number(t.reveal_round) === index + 1) addEvent(game, `New on the timeline: ${t.time ? `${t.time}, ` : ''}${t.event}`, 'timeline', now);
  }
  const job = game.state.job?.round === game.state.roundNumber ? game.state.job.objective : '';
  const objective = job || String(game.scenario.phases[index]?.objective ?? '').trim();
  if (objective) addEvent(game, `This round, your job: ${objective}`, 'goal', now);
  const q = roundQuestion(game, index);
  if (q) addEvent(game, `This round's goal: ${q.question}`, 'goal', now);
}

const phaseLine = (game, i, again = false) => `Round ${game.state.roundNumber ?? i + 1} of ${totalRounds(game)}: ${game.scenario.phases[i].name}${again ? ' (second try)' : ''}`;

function setJob(game, result) {
  const objective = String(result.job ?? '').trim();
  const tips = (result.job_tips ?? []).map((t) => String(t ?? '').trim()).filter(Boolean).slice(0, 3);
  game.state.job = objective ? { round: game.state.roundNumber, objective, tips } : null;
}

function setRecap(game, result, now) {
  const lines = (result.recap ?? []).map((t) => dropPuppeting(game, null, String(t ?? '').trim()).text).filter(Boolean).slice(0, 4);
  const open = (result.open_questions ?? []).map((t) => String(t ?? '').trim()).filter(Boolean).slice(0, 3);
  if (!lines.length) return;
  game.state.recap = { round: game.state.roundNumber, lines, open };
  addEvent(game, `Where we are now. ${lines.join(' ')}`, 'recap', now);
}

export function extendPhase(game, now = Date.now()) {
  if (game.status !== 'playing') fail('No phase is running.', 409);
  game.state.phaseEndsAt = Math.max(game.state.phaseEndsAt, now) + EXTEND_MS;
}

export const ASK_KINDS = ['chat', 'question', 'self', 'action'];
const ANSWER_KINDS = ['question', 'self', 'action'];

export function beginAsk(game, playerId, { kind, text }) {
  if (game.status !== 'playing') fail('You can only ask during a round.', 409);
  if (game.state.transitioning) fail('Things are changing. Try again in a moment.', 409);
  if (game.state.roundVote) fail('Voting now. Ask again after the vote.', 409);
  if (!ASK_KINDS.includes(kind)) fail('Unknown request type.');
  const clean = String(text ?? '').trim().slice(0, 500);
  if (!clean) fail('Write what you want to do.');
  const st = game.state;
  if (st.pending[playerId]) fail('The GM is still answering your last question.', 409);
  if (st.questionsLeft[playerId] < 1) fail('No questions left this round.', 409);
  st.questionsLeft[playerId] -= 1;
  st.pending[playerId] = { kind, text: clean };
  return { kind, text: clean };
}

export function failAsk(game, playerId) {
  const st = game.state;
  if (!st.pending[playerId]) return;
  delete st.pending[playerId];
  st.questionsLeft[playerId] += 1;
}

function addEvent(game, text, kind, now, extra = {}) {
  const clean = String(text ?? '').trim();
  if (clean) game.state.events.push({ at: now, phase: game.state.phaseIndex, kind, text: clean, ...extra });
}

export const RIPPLE_PLAYER_MS = 180_000;
export const RIPPLE_TABLE_MS = 45_000;
export const RIPPLE_WORDS = 20;

// A small change the whole room notices because of one player's move. It never says whose secret move it was,
// and the table gets at most one every 45 s and one per player every 3 minutes, so it never floods.
export function addRipple(game, playerId, text, now = Date.now(), { hideActor = false, loud = false } = {}) {
  const st = game.state;
  let clean = String(text ?? '').trim();
  if (hideActor) {
    clean = clean.split(/(?<=[.!?])\s+/).filter((s) => s && !namesAnyOf(game.scenario, game.players, [playerId], s)).join(' ');
  }
  clean = capWords(clean, RIPPLE_WORDS);
  if (!clean) return false;
  st.rippleAt ??= {};
  // A loud move (evidence destroyed, a big stir) always reaches the room; the gaps only thin out small ones.
  const why = loud ? null : now - (st.rippleAt[playerId] ?? -Infinity) < RIPPLE_PLAYER_MS ? 'player' : now - (st.rippleLast ?? -Infinity) < RIPPLE_TABLE_MS ? 'table' : null;
  if (why) {
    st.rippleDrops = [...(st.rippleDrops ?? []), { at: now, why }].slice(-50);
    return false;
  }
  st.rippleAt[playerId] = now;
  st.rippleLast = now;
  addEvent(game, clean, 'ripple', now);
  return true;
}

function whisper(game, messages, now) {
  for (const m of messages ?? []) {
    const thread = game.state.threads[m?.player_id];
    const text = String(m?.text ?? '').trim();
    if (thread && text) thread.push({ from: 'whisper', text, at: now });
  }
}

function learn(game, entries, source, now) {
  const npcIds = new Set(game.scenario.npcs.map((n) => n.id));
  for (const e of (entries ?? []).slice(0, 6)) {
    const fact = String(e?.fact ?? '').trim().slice(0, 300);
    if (!npcIds.has(e?.character_id) || !fact) continue;
    game.state.knowledge.push({ character_id: e.character_id, fact, how: String(e?.how ?? '').trim().slice(0, 200), round: game.state.phaseIndex + 1, source, at: now });
  }
}

function destroy(game, clueIds) {
  const destroyable = new Set(game.scenario.clues.filter((c) => c.can_be_destroyed).map((c) => c.id));
  for (const id of clueIds ?? []) {
    if (destroyable.has(id) && !game.state.destroyed.includes(id)) game.state.destroyed.push(id);
  }
}

const PUPPET_VERBS = new Set(['said', 'says', 'argued', 'argues', 'agreed', 'agrees', 'asked', 'asks', 'told', 'tells', 'nodded', 'nods', 'nod', 'admitted', 'admits', 'pushed', 'pushes', 'believes', 'believed', 'backed', 'backs', 'accused', 'accuses', 'thinks', 'thought', 'swore', 'insisted', 'insists', 'claimed', 'claims', 'suggested', 'suggests', 'supported', 'supports', 'smiles', 'smiled', 'shrugs', 'shrugged', 'laughs', 'laughed', 'frowns', 'frowned', 'agree', 'trusts', 'trusted']);

function recordPlay(game, playerId, play, read, from) {
  const round = game.state.roundNumber ?? game.state.phaseIndex + 1;
  const scored = scoreMoves(play, read, { from }).map((m) => ({ ...m, round }));
  game.state.play ??= {};
  (game.state.play[playerId] ??= []).push(...scored);
  return scored;
}

const TITLES = new Set(['lady', 'lord', 'captain', 'capt', 'inspector', 'professor', 'prof', 'doctor', 'colonel', 'major', 'sergeant', 'officer', 'uncle', 'aunt', 'aunty', 'auntie', 'father', 'mother', 'sister', 'brother', 'madam', 'master', 'young', 'old', 'chef', 'nurse', 'judge', 'detective', 'mister', 'ms']);

const ASKING = new Set(['ask', 'asks', 'asked', 'tell', 'tells', 'find', 'question']);
const REPORT_VERBS = new Set(['say', 'says', 'said', 'claim', 'claims', 'claimed', 'told', 'tells', 'swears', 'swore', 'insists', 'insisted', 'admits', 'admitted', 'heard', 'mentions', 'mentioned', 'confirms', 'confirmed']);

// What a player really said out loud: their spoken moment lines and their questions asked out loud.
export function saidOutLoud(game, playerId) {
  const st = game.state;
  const name = game.players.find((p) => p.id === playerId)?.name;
  const spoken = (st?.facts ?? []).filter((f) => f.id === playerId && f.fact.startsWith('Said out loud: "')).map((f) => f.fact.slice(16).replace(/"$/, ''));
  const asked = (st?.events ?? []).filter((e) => e.kind === 'qa' && e.by === name).map((e) => e.q);
  return [...spoken, ...asked].map((t) => String(t).toLowerCase());
}

const ACT_VERBS = new Set(['went', 'goes', 'go', 'walked', 'walks', 'ran', 'runs', 'rushed', 'rushes', 'entered', 'enters', 'left', 'leaves', 'took', 'takes', 'hid', 'hides', 'grabbed', 'grabs', 'opened', 'opens', 'locked', 'locks', 'unlocked', 'followed', 'follows', 'slipped', 'slips', 'sneaked', 'sneaks', 'snuck', 'picked', 'picks', 'came', 'comes', 'returned', 'returns', 'climbed', 'climbs', 'carried', 'carries', 'dropped', 'drops', 'stole', 'steals', 'burned', 'burns', 'broke', 'breaks', 'pushed', 'pushes', 'jumped', 'jumps', 'moved', 'moves', 'stood', 'stands', 'sat', 'sits', 'waited', 'waits', 'stayed', 'stays', 'touched', 'touches', 'searched', 'searches', 'hurried', 'hurries']);
const GESTURES = new Set(['flinches', 'flinched', 'flinch', 'smiles', 'smiled', 'frowns', 'frowned', 'shrugs', 'shrugged', 'nods', 'nodded', 'blushes', 'blushed', 'sighs', 'sighed', 'pales', 'paled', 'trembles', 'trembled', 'freezes', 'froze', 'stiffens', 'stiffened', 'glares', 'glared', 'winces', 'winced', 'gasps', 'gasped', 'laughs', 'laughed', 'cries', 'cried', 'stares', 'stared', 'looks', 'looked', 'turns', 'turned', 'shakes', 'shook', 'grins', 'grinned', 'swallows', 'swallowed']);
const SAW = new Set(['saw', 'seen', 'watched', 'spotted', 'noticed']);
const PLACE_PREPS = new Set(['in', 'at', 'by', 'near', 'inside', 'outside', 'behind', 'on', 'under', 'beside']);
const STOP = new Set(['the', 'and', 'that', 'this', 'there', 'then', 'with', 'from', 'into', 'onto', 'for', 'was', 'were', 'his', 'her', 'their', 'them', 'they', 'him', 'she', 'just', 'back', 'again', 'out', 'down', 'toward', 'towards', 'over', 'after', 'before', 'around', 'about', 'very', 'still', 'too', 'also', 'what', 'when', 'who', 'saw', 'you', 'your', 'had', 'has', 'have', 'not', 'all', 'one', 'some', ...PLACE_PREPS]);
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');

// What a player's own card says and what they did or said in play: the only sources for their character's actions.
export function playerFacts(game, pid) {
  const c = game.scenario.players.find((p) => p.id === pid);
  if (!c) return [];
  const st = game.state ?? {};
  const revealed = st.revealed?.[pid] ?? [];
  return [
    c.role_title, c.public_info, c.private_info, c.starting_knowledge, c.goal,
    ...(c.night ?? []).map((n) => `${n.time} ${n.where} ${n.doing}`),
    ...(c.alibi ?? []).map((a) => `${a.time} ${a.where}`),
    ...(c.hidden_facts ?? []).filter((h) => revealed.includes(h.id)).map((h) => h.fact),
    ...(st.threads?.[pid] ?? []).filter((m) => m.from === 'you').flatMap((m) => [m.text, m.read?.attempt, m.read?.place, m.read?.said_aloud]),
    ...(st.moments ?? []).filter((m) => m.player_id === pid && ['said', 'own'].includes(m.status)).map((m) => (m.status === 'said' ? m.line : m.saidInstead)),
    ...saidOutLoud(game, pid),
  ].map((t) => String(t ?? '').trim()).filter(Boolean);
}

// A sentence about a player character's action is backed when its place, or most of its words, are in that player's facts.
export function backed(game, pid, sentence) {
  const sc = game.scenario;
  const names = new Set([...sc.players.flatMap((c) => [...nameWords(c.character_name), ...nameWords(game.players.find((p) => p.id === c.id)?.name)]), ...sc.npcs.flatMap((n) => nameWords(n.name))]);
  const known = new Set(wordsOf(playerFacts(game, pid).join(' ')).map(stem));
  const places = new Set((sc.locations ?? []).flatMap((l) => wordsOf(l.name)).map(stem));
  const content = wordsOf(sentence).filter((w) => w.length >= 3 && !STOP.has(w) && !names.has(w) && !ACT_VERBS.has(w) && !GESTURES.has(w) && !SAW.has(w)).map(stem);
  if (!content.length) return false;
  const hits = content.filter((w) => known.has(w));
  return hits.some((w) => places.has(w)) || hits.length / content.length >= 0.5;
}

// In a reply to one player's move, a sentence led by another player's name that has them speak or react was invented.
// Only words that name exactly one person count, so a shared title ("Lady", "Captain") never matches.
// Anywhere in any GM text, reporting what a player said or heard ("Rishabh says...", "Himanshu, who heard...") was invented,
// unless it quotes words that player really said out loud. A null actor (recaps, round events) skips the first rule.
export function dropPuppeting(game, actorId, text, { to = null, others = false, reportOnly = false } = {}) {
  const sc = game.scenario;
  const people = [
    ...(sc?.players ?? []).map((c) => ({ id: c.id, player: true, full: wordsOf(c.character_name), names: new Set([...nameWords(c.character_name), ...nameWords(game.players.find((p) => p.id === c.id)?.name)].filter((w) => !TITLES.has(w))) })),
    ...(sc?.npcs ?? []).map((n) => ({ id: n.id, player: false, full: wordsOf(n.name), names: new Set(nameWords(n.name).filter((w) => !TITLES.has(w))) })),
  ];
  const owners = {};
  for (const p of people) for (const w of p.names) owners[w] = (owners[w] ?? 0) + 1;
  const leadOf = (words) => people.find((p) => (p.full.length && p.full.every((w, k) => words[k] === w)) || (p.names.has(words[0]) && owners[words[0]] === 1)) ?? null;
  const sentences = String(text ?? '').split(/(?<=[.!?])\s+/).filter(Boolean);
  // A name opening the sentence and followed by a comma addresses that person ("Rishabh, the cook said...").
  const vocative = (p, sentence) => /^[^,.!?]{1,40},/.test(sentence.trim()) && leadOf(wordsOf(sentence))?.id === p.id;
  const quotesOf = (sentence) => [...sentence.matchAll(/["“]([^"”]{3,})["”]/g)].map((m) => m[1].toLowerCase());
  const realQuote = (p, sentence) => {
    const said = saidOutLoud(game, p.id);
    return quotesOf(sentence).some((q) => said.some((s) => s.includes(q)));
  };
  const reports = (sentence) => {
    if (sentence.trim().endsWith('?')) return false;
    const words = wordsOf(sentence);
    return people.filter((p) => p.player && (others || p.id !== actorId) && !vocative(p, sentence)).some((p) => {
      const at = words.flatMap((w, i) => (((p.full.length && p.full.every((f, k) => words[i + k] === f)) || (p.names.has(w) && owners[w] === 1)) && !ASKING.has(words[i - 1]) ? [i + (p.full.every((f, k) => words[i + k] === f) ? p.full.length - 1 : 0)] : []));
      if (!at.some((i) => words.slice(i + 1, i + 5).some((w) => REPORT_VERBS.has(w)))) return false;
      return !realQuote(p, sentence);
    });
  };
  // A player character moving, acting or reacting ("Nikhil went", "Ben flinches", "I saw Asha by the shed") came from them, or it was invented.
  const acts = (sentence) => {
    if (sentence.trim().endsWith('?')) return false;
    const words = wordsOf(sentence);
    return people.filter((p) => p.player && (others || p.id !== actorId) && !vocative(p, sentence)).some((p) => {
      const at = words.flatMap((w, i) => {
        const full = p.full.length && p.full.every((f, k) => words[i + k] === f);
        return full || (p.names.has(w) && owners[w] === 1) ? [[i, i + (full ? p.full.length - 1 : 0)]] : [];
      });
      const claims = at.some(([start, end]) => {
        const next = words.slice(end + 1, end + 4);
        return next.some((w) => ACT_VERBS.has(w) || GESTURES.has(w))
          || (['was', 'were'].includes(next[0]) && PLACE_PREPS.has(next[1]))
          || words.slice(Math.max(0, start - 2), start).some((w) => SAW.has(w));
      });
      return claims && !backed(game, p.id, sentence);
    });
  };
  const kept = sentences.filter((sentence) => {
    if (reports(sentence) || acts(sentence)) return false;
    const words = wordsOf(sentence);
    const lead = leadOf(words);
    if (reportOnly || actorId === null || !lead || !lead.player || lead.id === actorId) return true;
    if (lead.id === to && /^[^,.!?]{1,40},/.test(sentence.trim())) return true;
    if (realQuote(lead, sentence)) return true;
    return !words.some((w) => PUPPET_VERBS.has(w));
  });
  return { text: kept.join(' '), dropped: sentences.length - kept.length };
}

// A GM reply as a page of a novel: narration (no speaker) and GM characters' spoken words.
// The GM never speaks for a human player: the asker's own lines become "You say", anyone else's are dropped.
export function novelLines(game, raw, { you = null, unpuppet = (t) => t, unpuppetSpeech = (t) => t } = {}) {
  const myName = game.scenario.players.find((p) => p.id === you)?.character_name?.toLowerCase();
  const players = new Set(game.scenario.players.map((p) => p.character_name.toLowerCase()));
  const names = Object.fromEntries([
    ...game.scenario.players.map((p) => [p.id, p.character_name]),
    ...game.scenario.npcs.map((n) => [n.id, n.name]),
  ]);
  return (Array.isArray(raw) ? raw : [])
    .map((l) => {
      const who = String(l?.speaker ?? '').trim();
      return { speaker: (names[who] ?? who).slice(0, 40), text: String(l?.text ?? '').trim().replace(/^["“]|["”]$/g, '') };
    })
    .map((l) => ({ ...l, text: l.speaker ? unpuppetSpeech(l.text) : unpuppet(l.text) }))
    .filter((l) => l.text)
    .flatMap((l) => {
      const who = l.speaker.toLowerCase();
      if (who && who === myName) return [{ speaker: '', text: `You say: "${l.text}"` }];
      if (who && players.has(who)) return [];
      return [l];
    });
}

const linesText = (lines) => lines.map((l) => (l.speaker ? `${l.speaker}: "${l.text}"` : l.text)).join('\n');

export function completeAsk(game, playerId, result, now = Date.now()) {
  const st = game.state;
  const ask = st.pending[playerId];
  if (!ask) fail('No request is waiting for an answer.', 409);
  delete st.pending[playerId];
  const kind = ask.kind === 'chat' ? (ANSWER_KINDS.includes(result.kind) ? result.kind : 'question') : ask.kind;
  const thread = st.threads[playerId];
  thread.push({ from: 'you', kind, text: ask.text, ...(ask.read ? { read: ask.read } : {}), at: now });
  const unpuppet = (text, to = null, opts = {}) => {
    const out = dropPuppeting(game, playerId, text, { to, ...opts });
    st.puppetDrops = (st.puppetDrops ?? 0) + out.dropped;
    return out.text;
  };
  const short = game.setup?.roundStyle === 'hotseats';
  const lines = novelLines(game, result.lines, { you: playerId, unpuppet, unpuppetSpeech: (t) => unpuppet(t, null, { reportOnly: true }) })
    .slice(0, short ? 2 : undefined)
    .map((l) => (short ? { ...l, text: capWords(l.text, 30) } : l));
  const text = lines.length ? linesText(lines) : String(result.answer ?? '').trim();
  const ideas = (result.ideas ?? []).map((t) => String(t ?? '').trim().slice(0, 80)).filter(Boolean).slice(0, 3);
  readPlayer(game, playerId, result.player_read, 'private', now);
  const [scored, penalty] = recordPlay(game, playerId, result.play, ask.read, 'private');
  const shown = (m) => ({ points: m.points, skill: m.skill, why: m.why });
  thread.push({ from: 'gm', text: text || '(No answer.)', ...(lines.length ? { lines } : {}), ...(ideas.length ? { ideas } : {}), play: shown(scored), ...(penalty ? { penalty: shown(penalty) } : {}), at: now });
  // A move that would contradict the story does not happen: no clue, no move, no stir. The player is told why.
  const why = refusedWhy(result);
  if (why) {
    thread.push({ from: 'system', text: `That can't happen: ${why}`, at: now });
    logRefused(game, playerId, why, false, now);
    return;
  }

  const clueIds = new Set(openClues(game));
  for (const id of result.clues_found ?? []) {
    if (clueIds.has(id) && !st.destroyed.includes(id) && !st.found[playerId].includes(id)) {
      st.found[playerId].push(id);
    }
  }
  const own = game.scenario.players.find((p) => p.id === playerId);
  const fact = result.hidden_fact_revealed;
  if (fact && own.hidden_facts.some((h) => h.id === fact) && !st.revealed[playerId].includes(fact)) {
    st.revealed[playerId].push(fact);
  }
  destroy(game, result.clues_destroyed);
  learn(game, result.learned, playerId, now);
  if (result.player_location && (kind !== 'action' || result.move_is_public)) move(game, playerId, result.player_location);
  st.suspicion = clamp(st.suspicion + clamp(Number(result.suspicion_change) || 0, -10, 25), 0, 100);
  const loud = (result.clues_destroyed ?? []).length > 0 || Number(result.suspicion_change) >= 10;
  addRipple(game, playerId, unpuppet(result.public_event, null, { others: true }), now, { hideActor: !result.move_is_public, loud });
  whisper(game, (result.messages_to_players ?? []).map((m) => ({ ...m, text: unpuppet(m?.text, m?.player_id, { others: m?.player_id !== playerId }) })), now);
}

// Clues that can be found now: each opens in its reveal_round. A clue without one (older worlds) is always open.
export function openClues(game) {
  const st = game.state;
  const round = ['final', 'reveal'].includes(game.status) ? Infinity : (st?.phaseIndex ?? -1) + 1;
  return game.scenario.clues.filter((c) => !Number.isInteger(c.reveal_round) || c.reveal_round <= round).map((c) => c.id);
}

const refusedWhy = (result) => (result?.refused?.refused === true ? String(result.refused.why ?? '').trim().slice(0, 200) || 'It would break the story.' : '');

function logRefused(game, playerId, why, outLoud, now) {
  const st = game.state;
  st.refused = [...(st.refused ?? []), { round: st.roundNumber ?? st.phaseIndex + 1, player_id: playerId, why, out_loud: outLoud, at: now }].slice(-100);
}

export function isLastPhase(game) {
  return game.state.phaseIndex >= game.scenario.phases.length - 1;
}

export const MAX_REPLAYS = 2;
export const roundNumber = (game) => game.state.roundNumber ?? game.state.phaseIndex + 1;
export const totalRounds = (game) => game.scenario.phases.length + (game.state.replays ?? 0);
const resultsThisRound = (game) => game.state.roundResults.filter((r) => r.phaseIndex === game.state.phaseIndex && (r.round ?? r.phaseIndex + 1) === roundNumber(game));

// A round the group voted on and got wrong is played again, up to the number of replays chosen at setup.
export function willReplay(game) {
  if (game.setup?.roundStyle === 'hotseats') return false;
  const last = resultsThisRound(game).at(-1);
  const voted = (last?.counts ?? []).some((n) => n > 0);
  return Boolean(last && !last.correct && voted && (game.state.replays ?? 0) < (game.setup?.replays ?? 0) && totalRounds(game) < roundCap(game));
}

// Rounds grow with the story, never past the rounds the game started with plus EXTRA_ROUNDS (replays count too).
export const EXTRA_ROUNDS = 2;
export const roundCap = (game) => (game.state.basePhases ?? game.scenario.phases.length - (game.state.addedRounds ?? 0)) + EXTRA_ROUNDS;

// A new round goes before the last one, so the last stays the closing round, and never into the round being played.
export function addRound(game, round, now = Date.now()) {
  const st = game.state;
  const sc = game.scenario;
  const name = String(round?.name ?? '').trim().slice(0, 60);
  if (!name || totalRounds(game) >= roundCap(game)) return false;
  const text = (k) => String(round?.[k] ?? '').trim();
  const options = Array.isArray(round?.options) ? round.options.map((o) => String(o ?? '').trim()).filter(Boolean).slice(0, 4) : [];
  const ph = { name, objective: text('objective'), try: [], planned_beat: text('planned_beat') };
  if (text('question') && options.length >= 2) {
    const answer = Number(round.answer_index);
    Object.assign(ph, { question: text('question'), options, answer_index: Number.isInteger(answer) && answer >= 0 && answer < options.length ? answer : 0, reward: text('reward'), reward_time: '', reward_order: 0, wrong_nudge: text('wrong_nudge') });
    if (namesCulprit(sc, game.players, ph.reward)) ph.reward = '';
    if (namesCulprit(sc, game.players, ph.wrong_nudge)) ph.wrong_nudge = '';
  }
  // During a round change the next round is already being prepared, and the final vote never gains a round.
  if (st.transitioning && isLastPhase(game)) return false;
  const at = Math.max(st.phaseIndex + (st.transitioning ? 2 : 1), sc.phases.length - 1);
  sc.phases.splice(at, 0, ph);
  for (const c of sc.clues ?? []) if (Number.isInteger(c.reveal_round) && c.reveal_round >= at + 1) c.reveal_round += 1;
  for (const t of sc.public_timeline ?? []) if (Number(t.reveal_round) >= at + 1) t.reveal_round = Number(t.reveal_round) + 1;
  st.addedRounds = (st.addedRounds ?? 0) + 1;
  addEvent(game, `The story needs one more round. There are now ${totalRounds(game)} rounds.`, 'phase', now);
  return true;
}

export function goesToFinal(game) {
  return isLastPhase(game) && !willReplay(game);
}

const STAGES = [
  ['opening', 'Meet the problem. Give the first clear leads.'],
  ['digging', 'Alibis start to crack and motives show.'],
  ['turn', 'Something comes out that changes how things look.'],
  ['closing', 'Everything needed to name the culprit, and how and why, is within reach.'],
];

export function storyStage(game, index) {
  const count = game.scenario.phases.length;
  const at = count <= 1 ? 3 : index >= count - 1 ? 3 : index === 0 ? 0 : index >= count - 2 && count > 3 ? 2 : 1;
  return { name: STAGES[at][0], aim: STAGES[at][1] };
}

export function nextPhaseInfo(game) {
  if (willReplay(game)) {
    const index = game.state.phaseIndex;
    return { ...game.scenario.phases[index], again: true, stage: storyStage(game, index) };
  }
  if (isLastPhase(game)) return null;
  const index = game.state.phaseIndex + 1;
  return { ...game.scenario.phases[index], stage: storyStage(game, index) };
}

export function beginPhaseChange(game) {
  if (game.status !== 'playing') fail('No phase is running.', 409);
  if (game.state.transitioning) fail('The phase is already changing.', 409);
  game.state.transitioning = true;
  game.state.hintVote = null;
  game.state.voteAsk = null;
}

export function cancelPhaseChange(game) {
  if (game.state) game.state.transitioning = false;
}

export function completePhase(game, result, now = Date.now()) {
  if (game.status !== 'playing') fail('No phase is running.', 409);
  const st = game.state;
  st.transitioning = false;
  const replay = willReplay(game);
  if (game.setup?.roundStyle === 'hotseats') postRoundReward(game, now);
  if (isLastPhase(game) && !replay) {
    game.status = 'final';
    st.phaseEndsAt = null;
    closeSeats(game);
    st.seats = null;
    st.hintVote = null;
    addEvent(game, 'Time is up. Everyone, pick who did it on your phone.', 'phase', now);
    return;
  }
  const next = replay ? st.phaseIndex : st.phaseIndex + 1;
  destroy(game, result.clues_destroyed);
  for (const p of result.positions ?? []) move(game, p?.character_id, p?.location_id);
  learn(game, result.learned, 'round change', now);
  closeOpenMoments(game, now);
  st.suspicion = clamp(st.suspicion + clamp(Number(result.suspicion_change) || 0, -20, 20), 0, 100);
  if (replay) st.replays = (st.replays ?? 0) + 1;
  st.roundNumber = roundNumber(game) + 1;
  const carry = closeSeats(game);
  enterPhase(game, next, now);
  planSeats(game, now, carry);
  setJob(game, result);
  addEvent(game, phaseLine(game, next, replay), 'phase', now);
  addEvent(game, dropPuppeting(game, null, result.public_event).text, 'event', now);
  setRecap(game, result, now);
  addFacts(game, result.public_facts, 'round change', now);
  announceRound(game, next, now, replay);
  addMoments(game, result.moments, now);
  whisper(game, result.messages_to_players, now);
}

export function proposeHint(game, playerId, now = Date.now()) {
  if (game.status !== 'playing') fail('Hints only work during a round.', 409);
  const st = game.state;
  if (st.hintsLeft < 1) fail('No hints left.', 409);
  if (st.hintVote && st.hintVote.endsAt > now) fail('A hint vote is already running.', 409);
  st.hintVote = { proposer: playerId, votes: { [playerId]: true }, endsAt: now + HINT_VOTE_MS };
  return resolveHintVote(game, now);
}

export function voteHint(game, playerId, yes, now = Date.now()) {
  const vote = game.state?.hintVote;
  if (!vote || vote.endsAt <= now) fail('There is no hint vote running.', 409);
  vote.votes[playerId] = Boolean(yes);
  return resolveHintVote(game, now);
}

export function resolveHintVote(game, now = Date.now()) {
  const st = game.state;
  const vote = st?.hintVote;
  if (!vote) return null;
  const n = game.players.length;
  const need = Math.floor(n / 2) + 1;
  const yes = Object.values(vote.votes).filter(Boolean).length;
  const no = Object.values(vote.votes).filter((v) => !v).length;
  if (yes >= need) {
    st.hintVote = null;
    const hint = game.scenario.hint_ladder[st.hintCursor] ?? { text: 'The GM has nothing more to give.' };
    st.hintCursor += 1;
    st.hintsLeft -= 1;
    st.hintsGiven.push({ text: hint.text, at: now });
    addEvent(game, `Hint: ${hint.text}`, 'hint', now);
    return 'spent';
  }
  if (no > n - need || vote.endsAt <= now) {
    st.hintVote = null;
    addEvent(game, 'The group kept its hint.', 'hint', now);
    return 'saved';
  }
  return 'open';
}

// Any player can ask to vote now. Every other player must say yes; one no or a quiet minute ends it.
// Two requests nobody else took, within five minutes, block that player until the next round.
export const VOTE_ASK_MS = 60_000;
const VOTE_ASK_WINDOW_MS = 5 * 60_000;

export function askVote(game, playerId, now = Date.now()) {
  if (game.status !== 'playing') fail('You can ask for a vote during a round.', 409);
  const st = game.state;
  if (st.transitioning) fail('The round is changing.', 409);
  if (st.roundVote) fail('A vote is open now.', 409);
  if (!needsRoundVote(game)) fail('This round has no question to vote on.', 409);
  if (st.voteAsk) fail('Someone already asked. Say yes or no on your phone.', 409);
  if (st.voteAskBlocked?.[playerId] === roundNumber(game)) fail('Nobody took your last two requests. You can ask again next round.', 409);
  st.voteAsk = { by: playerId, votes: { [playerId]: true }, at: now, endsAt: now + VOTE_ASK_MS };
  addEvent(game, `${nameOf(game, playerId)} wants to vote now. Everyone else has to say yes.`, 'voteask', now);
  return resolveVoteAsk(game, now);
}

export function answerVoteAsk(game, playerId, yes, now = Date.now()) {
  const ask = game.state?.voteAsk;
  if (!ask || ask.endsAt <= now) fail('Nobody is asking to vote right now.', 409);
  ask.votes[playerId] = Boolean(yes);
  return resolveVoteAsk(game, now);
}

export function resolveVoteAsk(game, now = Date.now()) {
  const st = game.state;
  const ask = st?.voteAsk;
  if (!ask) return null;
  const answers = Object.entries(ask.votes);
  if (game.players.every((p) => ask.votes[p.id] === true)) {
    st.voteAsk = null;
    beginRoundVote(game, now);
    return 'started';
  }
  if (answers.some(([, v]) => v === false) || ask.endsAt <= now) {
    st.voteAsk = null;
    const takers = answers.filter(([id, v]) => v && id !== ask.by).length;
    if (!takers) {
      const round = roundNumber(game);
      st.voteAskMisses ??= {};
      const misses = [...(st.voteAskMisses[ask.by] ?? []), { at: ask.at, round }].filter((m) => m.round === round && ask.at - m.at <= VOTE_ASK_WINDOW_MS);
      st.voteAskMisses[ask.by] = misses;
      if (misses.length >= 2) (st.voteAskBlocked ??= {})[ask.by] = round;
    }
    addEvent(game, 'Not everyone was ready. The round goes on.', 'voteask', now);
    return 'dropped';
  }
  return 'open';
}

export function submitFinal(game, playerId, input = {}) {
  if (game.status !== 'final') fail('You can pick after the last round.', 409);
  if (game.state.scoring) fail('Too late. The GM is already checking the answers.', 409);
  const cast = castIds(game);
  const culprits = [...new Set(input.culprit_ids ?? [])].filter((id) => cast.includes(id));
  if (!culprits.length) fail('Pick at least one person.');
  game.state.submissions[playerId] = {
    culprit_ids: culprits,
    how: String(input.how ?? '').trim().slice(0, 600),
    why: String(input.why ?? '').trim().slice(0, 600),
    goal: String(input.goal ?? '').trim().slice(0, 400),
  };
}

const castIds = (game) => [...game.scenario.players.map((p) => p.id), ...game.scenario.npcs.map((n) => n.id)];

export function allSubmitted(game) {
  return game.players.every((p) => game.state.submissions[p.id]);
}

export function computeVerdict(game) {
  const truth = [...game.scenario.truth.culprit_ids].sort();
  const subs = game.state.submissions;
  const correct = game.players.filter((p) => {
    const named = [...(subs[p.id]?.culprit_ids ?? [])].sort();
    return named.length === truth.length && named.every((id, i) => id === truth[i]);
  });
  const majority = correct.length > game.players.length / 2;
  const tally = {};
  for (const s of Object.values(subs)) for (const id of s.culprit_ids) tally[id] = (tally[id] ?? 0) + 1;
  return {
    culprit_ids: truth,
    correct_player_ids: correct.map((p) => p.id),
    majority_correct: majority,
    winner: majority ? 'investigators' : 'culprits',
    tally,
  };
}

export function applyScore(game, verdict, score) {
  const byId = Object.fromEntries((score.players ?? []).map((p) => [p.player_id, p]));
  game.state.result = {
    verdict,
    reveal_story: String(score.reveal_story ?? ''),
    players: game.players.map((p) => {
      const s = byId[p.id] ?? {};
      return {
        player_id: p.id,
        culprit_correct: verdict.correct_player_ids.includes(p.id),
        method_score: clamp(Number(s.method_score) || 0, 0, 2),
        motive_score: clamp(Number(s.motive_score) || 0, 0, 2),
        goal_achieved: Boolean(s.goal_achieved),
        goal_outcome: String(s.goal_outcome ?? ''),
        comment: String(s.comment ?? ''),
        coaching: String(s.coaching ?? '').slice(0, 200),
        play: playTotal(game.state.play?.[p.id]),
        play_earned: playEarned(game.state.play?.[p.id]),
        skills: skillSplit(game.state.play?.[p.id]),
      };
    }),
  };
  game.status = 'reveal';
}

// Hot seats: one player on the spot at a time, a fair rotation across the game.
export const seatsPerRound = (players, rounds) => Math.min(3, Math.max(1, Math.ceil(players / Math.max(1, rounds))));

export function planSeats(game, now, carry = []) {
  const st = game.state;
  if (game.setup?.roundStyle !== 'hotseats' || game.status !== 'playing') return;
  if (!st.seatOrder) {
    st.seatOrder = game.players.map((p) => p.id).sort(() => Math.random() - 0.5);
    st.seatCursor = 0;
    st.seatCounts = {};
  }
  const n = seatsPerRound(game.players.length, game.scenario.phases.length);
  const pids = carry.filter((pid) => game.players.some((p) => p.id === pid)).slice(0, n);
  for (let guard = 0; pids.length < n && guard < st.seatOrder.length * 2; guard += 1) {
    const pid = st.seatOrder[st.seatCursor % st.seatOrder.length];
    st.seatCursor += 1;
    if (!pids.includes(pid)) pids.push(pid);
  }
  const slot = (Math.max(st.phaseEndsAt - now, SEAT_FIRST_MS) - SEAT_FIRST_MS) / pids.length;
  let askCursor = 0;
  const list = pids.map((pid, k) => {
    const askers = [];
    for (let i = 0; askers.length < SEAT_ASKERS && i < st.seatOrder.length; i += 1) {
      const who = st.seatOrder[(askCursor + i) % st.seatOrder.length];
      if (who !== pid && !askers.includes(who)) askers.push(who);
    }
    askCursor += SEAT_ASKERS;
    const plain = fallbackSeat(game, pid, askers);
    return { pid, status: 'waiting', readyAt: Math.round(now + SEAT_FIRST_MS + k * slot), liveAt: null, endsAt: null, ...plain, written: false };
  });
  st.seats = { round: roundNumber(game), list };
}

const capWords = (text, n) => String(text ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).slice(0, n).join(' ');

// Before (or without) the GM: plain alibi questions and the player's own hook as the whisper.
export function fallbackSeat(game, pid, askers) {
  const card = game.scenario.players.find((p) => p.id === pid) ?? {};
  const times = (card.alibi ?? []).map((a) => a.time).filter(Boolean);
  const question = (k) => (times.length ? `Where were you at ${times[k % times.length]}?` : 'Where were you tonight, and who saw you?');
  const hook = card.hook || String(card.private_info ?? '').split(/(?<=[.!?])\s/)[0];
  return { askers: askers.map((a, k) => ({ pid: a, question: question(k), followup: '' })), whisper: hook ? [capWords(hook, 30)] : [] };
}

// The GM's writing for this round's seats; output for a round that already ended is ignored.
export function applySeatWriting(game, round, result) {
  const st = game.state;
  if (!st?.seats || st.seats.round !== round) return false;
  for (const w of result?.seats ?? []) {
    const seat = st.seats.list.find((s) => s.pid === w?.player_id && s.status === 'waiting');
    if (!seat) continue;
    const whisper = (w.whisper ?? []).map((l) => capWords(l, 12)).filter(Boolean).slice(0, 3);
    if (whisper.length) seat.whisper = whisper;
    for (const a of w.askers ?? []) {
      const asker = seat.askers.find((x) => x.pid === a?.player_id);
      if (!asker) continue;
      const question = capWords(a.question, 15);
      if (question) asker.question = question;
      const followup = String(a.followup ?? '').trim();
      asker.followup = /^if\b/i.test(followup) ? capWords(followup, 25) : '';
    }
    seat.written = true;
  }
  return true;
}

function startSeat(seat, now) {
  seat.status = 'getready';
  seat.liveAt = now + SEAT_READY_MS;
  seat.endsAt = seat.liveAt + SEAT_LIVE_MS;
}

function finishSeat(game, seat) {
  const st = game.state;
  seat.status = 'done';
  st.seatCounts[seat.pid] = (st.seatCounts[seat.pid] ?? 0) + 1;
  unlockCard(game, seat.pid, 'drives');
  if (st.seatCounts[seat.pid] >= 2) unlockCard(game, seat.pid, 'reasons');
}

export function tickSeats(game, now = Date.now()) {
  const st = game.state;
  if (!st?.seats || st.transitioning || game.status !== 'playing') return false;
  let changed = false;
  for (let guard = 0; guard < 10; guard += 1) {
    const active = st.seats.list.find((s) => s.status === 'getready' || s.status === 'live');
    if (active?.status === 'getready' && now >= active.liveAt) {
      active.status = 'live';
      addEvent(game, `Hot seat: ${nameOf(game, active.pid)}. 90 seconds.`, 'seat', now);
    } else if (active?.status === 'live' && now >= active.endsAt) finishSeat(game, active);
    else if (!active) {
      if (st.roundVote || (st.phaseEndsAt && now >= st.phaseEndsAt)) break;
      const next = st.seats.list.find((s) => s.status === 'waiting' && s.readyAt <= now);
      if (!next) break;
      startSeat(next, now);
    } else break;
    changed = true;
  }
  return changed;
}

export function seatNow(game, now = Date.now()) {
  const st = game.state;
  if (game.status !== 'playing' || !st.seats) fail('There are no hot seats this round.', 409);
  if (st.seats.list.some((s) => s.status === 'getready' || s.status === 'live')) fail('Someone is already in the hot seat.', 409);
  if (st.roundVote) fail('Finish the vote first.', 409);
  const next = st.seats.list.find((s) => s.status === 'waiting');
  if (!next) fail('Everyone has had their seat this round.', 409);
  startSeat(next, now);
}

// At round end a seat in progress counts as sat; seats that never ran go first next round.
function closeSeats(game) {
  const st = game.state;
  if (!st.seats) return [];
  for (const s of st.seats.list) if (s.status === 'getready' || s.status === 'live') finishSeat(game, s);
  return st.seats.list.filter((s) => s.status === 'waiting').map((s) => s.pid);
}

// Point: free, loud and short. One banner at a time; never during a hot seat.
export function point(game, from, to, now = Date.now()) {
  if (game.status !== 'playing') fail('You can point at someone during a round.', 409);
  const st = game.state;
  if (from === to) fail('You cannot point at yourself.');
  const target = [...game.scenario.players, ...game.scenario.npcs].find((c) => c.id === to);
  if (!target) fail('Point at someone in the story.');
  if (activeSeat(game)) fail('Wait for the hot seat to end.', 409);
  st.points ??= { current: null, queue: [], last: {} };
  if ((st.points.last[from] ?? -Infinity) + POINT_COOLDOWN_MS > now) fail('Wait a minute before you point again.', 409);
  const entry = { from, to, endsAt: now + POINT_DEFEND_MS };
  if (st.points.current) {
    if (st.points.queue.length >= POINT_QUEUE) fail('Two points are already waiting. Try again in a moment.', 409);
    st.points.queue.push(entry);
  } else st.points.current = entry;
  st.points.last[from] = now;
  addEvent(game, `${nameOf(game, from)} suspects ${target.character_name ?? target.name}!`, 'point', now);
}

export function tickPoints(game, now = Date.now()) {
  const p = game.state?.points;
  if (!p?.current) return false;
  if (activeSeat(game)) {
    p.current.endsAt = Math.max(p.current.endsAt, (activeSeat(game).endsAt ?? now) + POINT_DEFEND_MS);
    return false;
  }
  if (p.current.endsAt > now) return false;
  const next = p.queue.shift() ?? null;
  p.current = next && { ...next, endsAt: now + POINT_DEFEND_MS };
  return true;
}

function pointPublic(game) {
  const p = game.state?.points;
  if (!p) return null;
  const name = (id) => { const c = [...game.scenario.players, ...game.scenario.npcs].find((x) => x.id === id); return c?.character_name ?? c?.name ?? ''; };
  return { current: p.current && { from: nameOf(game, p.current.from), to: name(p.current.to), endsAt: p.current.endsAt }, waiting: p.queue.length };
}

const activeSeat = (game) => game.state?.seats?.list.find((s) => s.status === 'getready' || s.status === 'live') ?? null;

// What every screen may see of the hot seat: who, and the timer. Never a question or a whisper.
function seatPublic(game) {
  const seats = game.state?.seats;
  if (!seats || game.status !== 'playing') return null;
  const s = activeSeat(game);
  const waiting = seats.list.filter((x) => x.status === 'waiting').length;
  return s ? { name: nameOf(game, s.pid), status: s.status, liveAt: s.liveAt, endsAt: s.endsAt, waiting } : { waiting };
}

// One phone's own part: the seated player gets the whisper, each asker only their own question.
function seatMine(game, playerId) {
  const s = activeSeat(game);
  if (!s) return null;
  if (s.pid === playerId) return { role: 'seated', whisper: s.whisper };
  const a = s.askers.find((x) => x.pid === playerId);
  return a ? { role: 'asker', question: a.question, followup: a.followup } : { role: 'listener' };
}

const OPEN = ['getready', 'called'];
const nameOf = (game, pid) => game.players.find((p) => p.id === pid)?.name ?? 'Someone';

export function addMoments(game, moments, now = Date.now()) {
  const st = game.state;
  st.moments ??= [];
  let added = 0;
  for (const m of moments ?? []) {
    const line = String(m?.line ?? '').trim().replace(/^["“]|["”]$/g, '').slice(0, 200);
    const pid = m?.player_id;
    if (added >= 2 || !line || !game.players.some((p) => p.id === pid)) continue;
    if (st.moments.some((x) => x.player_id === pid && OPEN.includes(x.status))) continue;
    st.moments.push({ id: `m${st.moments.length + 1}`, player_id: pid, line, why: String(m?.why ?? '').trim().slice(0, 200), round: st.phaseIndex + 1, status: 'getready', readyAt: now + MOMENT_READY_MS, at: now });
    added += 1;
  }
  return added;
}

function callMoment(game, m, now) {
  m.status = 'called';
  m.calledAt = now;
  addEvent(game, `${nameOf(game, m.player_id)}, the story turns to you.`, 'moment', now);
}

export function tickMoments(game, now = Date.now()) {
  let changed = false;
  for (const m of game.state?.moments ?? []) {
    if (m.status === 'getready' && m.readyAt <= now) {
      callMoment(game, m, now);
      changed = true;
    }
  }
  return changed;
}

function ownMoment(game, playerId, momentId) {
  const m = game.state.moments?.find((x) => x.id === momentId && x.player_id === playerId);
  if (!m) fail('That moment is not yours.', 403);
  if (!OPEN.includes(m.status)) fail('That moment is already done.', 409);
  return m;
}

export function readyMoment(game, playerId, momentId, now = Date.now()) {
  const m = ownMoment(game, playerId, momentId);
  if (m.status === 'getready') callMoment(game, m, now);
}

export function answerMoment(game, playerId, momentId, choice, now = Date.now(), { text = '', read = null } = {}) {
  const m = ownMoment(game, playerId, momentId);
  const st = game.state;
  const name = nameOf(game, playerId);
  const own = String(text ?? '').trim().replace(/^["“]|["”]$/g, '').slice(0, 200);
  if (choice === 'said') {
    if (m.status !== 'called') callMoment(game, m, now);
    m.status = 'said';
    addEvent(game, `${name} said: "${m.line}"`, 'said', now);
    addFacts(game, [{ person: playerId, fact: `Said out loud: "${m.line}"` }], 'said', now);
  } else if (choice === 'quiet' || choice === 'own') {
    if ((st.overridesLeft[playerId] ?? 0) < 1) fail('No overrides left. You have to say it.', 409);
    st.overridesLeft[playerId] -= 1;
    m.status = choice;
    if (choice === 'own' && own) {
      m.saidInstead = own;
      if (read) m.readInstead = read;
      addEvent(game, `${name}, in their own words: "${own}"`, 'said', now, read ? { by: name, read } : {});
      if (read) {
        const culprit = game.scenario.players.find((c) => c.id === playerId)?.side === 'culprit';
        recordPlay(game, playerId, read.sways_gm ? null : { points: 1, skill: culprit ? 'bluffing' : 'persuading', why: 'Said it in their own words, in character.' }, read, 'out loud');
      }
      addFacts(game, [{ person: playerId, fact: `Said out loud: "${own}"` }], 'said', now);
    } else {
      addEvent(game, choice === 'quiet' ? `${name} chose to stay quiet.` : `${name} told it their own way.`, 'override', now);
    }
  } else {
    fail('Pick: I said it, stay quiet, or say it my way.');
  }
  m.resolvedAt = now;
  return m;
}

// A player who made a move this round is not charged for a moment they missed: they were busy playing.
export function actedThisRound(game, playerId) {
  const st = game.state;
  const round = st.roundNumber ?? st.phaseIndex + 1;
  const name = nameOf(game, playerId);
  return (st.play?.[playerId] ?? []).some((m) => m.round === round)
    || st.events.some((e) => e.kind === 'qa' && e.by === name && e.phase === st.phaseIndex);
}

export function closeOpenMoments(game, now = Date.now()) {
  const st = game.state;
  for (const m of st.moments ?? []) {
    if (!OPEN.includes(m.status)) continue;
    const name = nameOf(game, m.player_id);
    if (actedThisRound(game, m.player_id) && (st.overridesLeft[m.player_id] ?? 0) > 0) {
      m.status = 'missed';
    } else if ((st.overridesLeft[m.player_id] ?? 0) > 0) {
      st.overridesLeft[m.player_id] -= 1;
      m.status = 'quiet';
      addEvent(game, `${name} stayed quiet. It cost an override.`, 'override', now);
    } else {
      m.status = 'forced';
      addEvent(game, `${name} could not keep it in: "${m.line}"`, 'forced', now);
      addFacts(game, [{ person: m.player_id, fact: `Said out loud: "${m.line}"` }], 'said', now);
    }
    m.resolvedAt = now;
  }
}

export const SPOTLIGHT_QUESTION = 'Who should the room look at?';

export function roundQuestion(game, index) {
  const ph = game.scenario?.phases?.[index];
  if (game.setup?.roundStyle === 'hotseats') {
    if (!ph) return null;
    return { kind: 'spotlight', question: SPOTLIGHT_QUESTION, options: game.scenario.players.map((p) => p.character_name), answer: -1, reward: String(ph.reward ?? ''), rewardTime: String(ph.reward_time ?? ''), rewardOrder: Number(ph.reward_order) || 0, nudge: '' };
  }
  const options = (ph?.options ?? []).map((o) => String(o ?? '').trim()).filter(Boolean).slice(0, 4);
  const answer = Number(ph?.answer_index);
  if (!ph?.question || options.length < 2 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
  return { question: String(ph.question), options, answer, reward: String(ph.reward ?? ''), rewardTime: String(ph.reward_time ?? ''), rewardOrder: Number(ph.reward_order) || 0, nudge: String(ph.wrong_nudge ?? '') };
}

export function needsRoundVote(game) {
  const st = game.state;
  return Boolean(roundQuestion(game, st.phaseIndex)) && !resultsThisRound(game).length;
}

export function beginRoundVote(game, now = Date.now()) {
  const st = game.state;
  if (game.status !== 'playing') fail('No round is running.', 409);
  if (st.roundVote) return st.roundVote;
  if (!needsRoundVote(game)) fail('This round has no question to vote on.', 409);
  st.hintVote = null;
  st.voteAsk = null;
  st.roundVote = { phaseIndex: st.phaseIndex, votes: {}, endsAt: now + ROUND_VOTE_MS };
  addEvent(game, `Time to vote: ${roundQuestion(game, st.phaseIndex).question}`, 'vote', now);
  return st.roundVote;
}

export function voteRound(game, playerId, choice, now = Date.now()) {
  const vote = game.state.roundVote;
  if (!vote) fail('There is no vote right now.', 409);
  const q = roundQuestion(game, vote.phaseIndex);
  const pick = Number(choice);
  if (!Number.isInteger(pick) || pick < 0 || pick >= q.options.length) fail('Pick one of the answers.');
  if (q.kind === 'spotlight' && game.scenario.players[pick]?.id === playerId) fail('You cannot vote for yourself.');
  vote.votes[playerId] = pick;
  return resolveRoundVote(game, now);
}

export function resolveRoundVote(game, now = Date.now(), force = false) {
  const st = game.state;
  const vote = st.roundVote;
  if (!vote) return null;
  const everyone = game.players.every((p) => vote.votes[p.id] !== undefined);
  if (!everyone && !force && vote.endsAt > now) return null;
  const q = roundQuestion(game, vote.phaseIndex);
  if (namesCulprit(game.scenario, game.players, q.reward)) q.reward = '';
  if (namesCulprit(game.scenario, game.players, q.nudge)) q.nudge = '';
  const counts = q.options.map((_, i) => Object.values(vote.votes).filter((v) => v === i).length);
  const top = Math.max(...counts);
  const winners = counts.flatMap((c, i) => (c === top && top > 0 ? [i] : []));
  const picked = winners.length === 1 ? winners[0] : null;
  if (q.kind === 'spotlight') return resolveSpotlight(game, vote, q, picked, counts, now);
  const correct = picked === q.answer;
  const result = { phaseIndex: vote.phaseIndex, round: roundNumber(game), question: q.question, picked, pickedText: picked === null ? null : q.options[picked], correct, counts };
  st.roundResults.push(result);
  st.roundVote = null;
  const said = picked === null ? 'The group could not agree.' : `The group picked: ${q.options[picked]}.`;
  if (correct) {
    addEvent(game, `${said} That is right!${q.reward ? ` ${q.reward}` : ''}`, 'round', now);
    if (q.reward) st.timelineExtra.push({ order: q.rewardOrder, time: q.rewardTime, event: q.reward });
    addFacts(game, mentions(game, q.reward).map((id) => ({ person: id, fact: q.reward })), 'round', now);
    st.suspicion = clamp(st.suspicion + 10, 0, 100);
  } else {
    addEvent(game, `${said} Not quite. ${q.nudge}`, 'round', now);
    st.suspicion = clamp(st.suspicion - 10, 0, 100);
  }
  return result;
}

// The spotlight never removes anyone: the top player's next safe line goes public, and an innocent pick covers the culprit.
// In hot seats style the round's reward closes the round as its cliffhanger.
function postRoundReward(game, now) {
  const st = game.state;
  const q = roundQuestion(game, st.phaseIndex);
  if (!q?.reward || namesCulprit(game.scenario, game.players, q.reward)) return;
  addEvent(game, q.reward, 'event', now);
  st.timelineExtra.push({ order: q.rewardOrder, time: q.rewardTime, event: q.reward });
}

function resolveSpotlight(game, vote, q, picked, counts, now) {
  const st = game.state;
  const target = picked === null ? null : game.scenario.players[picked];
  const result = { kind: 'spotlight', phaseIndex: vote.phaseIndex, round: roundNumber(game), question: q.question, picked, pickedText: target?.character_name ?? null, top: target?.id ?? null, line: null, correct: null, counts };
  st.roundResults.push(result);
  st.roundVote = null;
  if (!target) {
    addEvent(game, 'The room is split.', 'round', now);
    return result;
  }
  st.revealsUsed ??= {};
  const used = st.revealsUsed[target.id] ?? 0;
  const line = (target.reveals ?? [])[used] ?? null;
  if (line) {
    st.revealsUsed[target.id] = used + 1;
    result.line = line;
    addEvent(game, `The room looks at ${target.character_name}. ${line}`, 'round', now);
    addFacts(game, [{ person: target.id, fact: line }], 'round', now);
  } else addEvent(game, `Nothing new about ${target.character_name}.`, 'round', now);
  unlockCard(game, target.id, 'reasons');
  if (target.side !== 'culprit') {
    st.suspicion = clamp(st.suspicion - 10, 0, 100);
    const culprits = game.scenario.players.filter((p) => p.side === 'culprit');
    whisper(game, culprits.map((c) => ({ player_id: c.id, text: `The room is looking at ${target.character_name}, not you.` })), now);
  }
  return result;
}

export const MAX_POINTS = 6;

export function caseQuestion(sc) {
  return String(sc?.case_question ?? '').trim() || 'Who did it, how, and why?';
}

const WIN = {
  investigator: 'You win if most players name the right culprit at the end.',
  culprit: 'You win if most players name the wrong person. Do not get caught.',
  wildcard: 'You win by reaching your own goal, whoever gets caught.',
};

export function briefingSteps(game) {
  const sc = game.scenario;
  if (!sc) return [];
  const steps = [
    { kind: 'scene', title: sc.title, lines: [sc.setting_summary] },
    { kind: 'story', title: 'What just happened', lines: [sc.opening_scene, `The big question: ${caseQuestion(sc)}`] },
    { kind: 'background', title: 'What everyone knows', lines: sc.background ?? [] },
    { kind: 'map', title: 'The place', lines: ['This is the map. It shows every place and who is there.', 'Players are gold. People the GM plays are grey.'] },
  ];
  for (const c of sc.players) {
    const player = game.players.find((p) => p.id === c.id);
    const line = c.intro_line?.trim() || `I am ${c.character_name}, ${c.role_title}. ${c.public_info}`;
    steps.push({ kind: 'intro', playerId: c.id, title: `Meet ${c.character_name}`, lines: [`${player?.name ?? 'This player'}, stand up and say: "${line}"`], icon: c.icon ?? '' });
  }
  const minor = sc.npcs.filter(isMinor);
  steps.push({ kind: 'npcs', title: 'People the GM plays', lines: [
    ...sc.npcs.filter((n) => !isMinor(n)).map((n) => `${n.name}, ${n.role_title}. ${n.public_info}`),
    ...(minor.length ? [`Minor people: ${minor.map((n) => `${n.name} (${n.role_title})`).join(', ')}. They are part of the place, but they hold nothing big.`] : []),
  ] });
  steps.push({ kind: 'timeline', title: 'The timeline so far', lines: publicTimeline(game).map((t) => `${t.time ? `${t.time}: ` : ''}${t.event}`) });
  steps.push({ kind: 'goal', title: 'Your goals and how to win', lines: [
    caseQuestion(sc),
    'Each of you also has a secret goal of your own. It is on your phone.',
    `There are ${sc.phases.length} rounds. Each round has one question to answer together. Talk, ask the GM on your phone, and share clues.`,
    'At the end, everyone names who did it, how and why. Culprits vote too.',
    'Detectives win if most players name the right culprit. Culprits win if they do not.',
    `Points: 1 for the right culprit, up to 2 for how, up to 2 for why, and 1 for your own goal. ${MAX_POINTS} in all.`,
    `Plus up to ${PLAY_MAX} play points each round for good moves.`,
  ] });
  return steps.filter((st) => st.lines.length);
}

export function moveBrief(game, delta) {
  if (game.status !== 'reading') fail('The intro is over.', 409);
  const count = briefingSteps(game).length;
  game.state.brief.step = clamp(game.state.brief.step + Number(delta || 0), 0, count - 1);
  return game.state.brief.step;
}

export function publicTimeline(game) {
  const sc = game.scenario;
  const st = game.state;
  if (!sc || !st) return [];
  const round = ['final', 'reveal'].includes(game.status) ? Infinity : game.status === 'playing' ? st.phaseIndex + 1 : 0;
  return [
    ...(sc.public_timeline ?? []).filter((t) => Number(t.reveal_round ?? 0) <= round),
    ...st.timelineExtra,
  ].map((t) => ({ order: Number(t.order) || 0, time: String(t.time ?? ''), event: String(t.event ?? '') }))
    .filter((t) => t.event)
    .sort((a, b) => a.order - b.order);
}

export function shareClue(game, playerId, clueId, now = Date.now()) {
  if (!['playing', 'final'].includes(game.status)) fail('You can share clues during the game.', 409);
  const st = game.state;
  if (!st.found[playerId]?.includes(clueId)) fail('You have not found that clue.', 403);
  if (st.shared.some((x) => x.clueId === clueId)) fail('Everyone can already see that clue.', 409);
  const clue = game.scenario.clues.find((c) => c.id === clueId);
  const name = game.players.find((p) => p.id === playerId)?.name;
  st.shared.push({ clueId, by: playerId, at: now });
  const round = st.roundNumber ?? st.phaseIndex + 1;
  if ((st.shareRewarded ??= {})[playerId] !== round) {
    st.shareRewarded[playerId] = round;
    recordPlay(game, playerId, { points: 1, skill: 'teamwork', why: `Showed everyone ${clue.name}.` }, null, 'out loud');
  }
  addEvent(game, `${name} shows a clue. ${clue.name}: ${clue.shows}`, 'clue', now, { by: name, name: clue.name });
  addFacts(game, mentions(game, `${clue.name} ${clue.shows}`).map((id) => ({ person: id, fact: `Clue, ${clue.name}: ${clue.shows}` })), 'clue', now);
}

export function beginPublicAsk(game, playerId, text) {
  if (!['reading', 'playing'].includes(game.status)) fail('You can ask about the world during the game.', 409);
  const clean = String(text ?? '').trim().slice(0, 200);
  if (!clean) fail('Write your question.');
  const st = game.state;
  if (st.publicPending[playerId]) fail('Wait for the answer to your last question.', 409);
  st.publicPending[playerId] = clean;
  if (st.publicErrors) delete st.publicErrors[playerId];
  return clean;
}

// When the story needs something new from a player's character, that player is asked privately first.
export function offerToPlayer(game, pid, text, choice, now = Date.now()) {
  const st = game.state;
  const clean = String(text ?? '').trim().slice(0, 200);
  if (!st.threads[pid] || !clean) return null;
  st.offers ??= [];
  const offer = { id: `o${st.offers.length + 1}`, player_id: pid, text: clean, choice: String(choice ?? '').trim().slice(0, 120), status: 'open', at: now };
  st.offers.push(offer);
  return offer;
}

export function answerOffer(game, pid, id, { take = false, text = '', read = null } = {}, now = Date.now()) {
  const offer = (game.state.offers ?? []).find((o) => o.id === id && o.player_id === pid);
  if (!offer) fail('That question is not yours.', 404);
  if (offer.status !== 'open') fail('You already answered that.', 409);
  const answer = take ? offer.choice : String(text ?? '').trim().slice(0, 200);
  if (!answer) fail('Write your answer, or tap the suggestion.');
  offer.status = 'answered';
  offer.answer = answer;
  offer.answeredAt = now;
  game.state.threads[pid].push({ from: 'you', kind: 'self', text: answer, ...(read ? { read } : {}), offer: id, at: now });
  return offer;
}

export function readPlayer(game, playerId, read, from, now = Date.now()) {
  const intent = String(read?.intent ?? '').trim().slice(0, 160);
  const persona = String(read?.persona ?? '').trim().slice(0, 160);
  if (!intent && !persona) return;
  const st = game.state;
  st.persona ??= {};
  const before = st.persona[playerId] ?? {};
  st.persona[playerId] = { intent: intent || before.intent || '', persona: persona || before.persona || '', from, round: st.roundNumber ?? st.phaseIndex + 1, at: now };
}

export function addNote(game, text, now = Date.now()) {
  if (!['reading', 'playing'].includes(game.status)) fail('You can add notes during the game.', 409);
  const clean = String(text ?? '').trim().slice(0, 200);
  if (!clean) fail('Write what the room thinks.');
  addEvent(game, `The room thinks: ${clean}`, 'note', now);
}

export function completePublicAsk(game, playerId, answer, now = Date.now(), read = null, words = null, ripple = '', refused = null) {
  const st = game.state;
  const q = st.publicPending[playerId];
  if (!q) return;
  delete st.publicPending[playerId];
  readPlayer(game, playerId, read, 'out loud', now);
  if (read?.play || words) recordPlay(game, playerId, read?.play, words, 'out loud');
  const why = refusedWhy({ refused });
  if (!why) addFacts(game, read?.facts, 'asked out loud', now);
  const name = game.players.find((p) => p.id === playerId)?.name;
  const clean = (t) => dropPuppeting(game, playerId, t, { others: true }).text;
  const lines = Array.isArray(answer) ? novelLines(game, answer, { unpuppet: clean, unpuppetSpeech: clean }) : null;
  const text = (lines ? linesText(lines) : clean(String(answer ?? '').trim())) || 'Nobody knows that yet.';
  st.events.push({ at: now, phase: st.phaseIndex, kind: 'qa', by: name, q, text, ...(lines?.length ? { lines } : {}), ...(words ? { read: words } : {}) });
  if (why) {
    addEvent(game, `That can't happen: ${why}`, 'refused', now);
    logRefused(game, playerId, why, true, now);
    return;
  }
  addRipple(game, playerId, clean(String(ripple ?? '')), now);
}

export function failPublicAsk(game, playerId, message = '') {
  delete game.state.publicPending[playerId];
  if (message) (game.state.publicErrors ??= {})[playerId] = message;
}

const wordsOf = (text) => String(text ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
const nameWords = (name) => wordsOf(name).filter((w) => (w.length >= 3 || /^\d+$/.test(w)) && !['the', 'dr', 'mr', 'mrs', 'miss', 'sir'].includes(w));

// Ids of the characters a text names, by their character name or the player's own name.
export function mentions(game, text) {
  const words = wordsOf(text);
  const sc = game.scenario;
  const people = [
    ...sc.players.map((c) => [c.id, new Set([...nameWords(c.character_name), ...nameWords(game.players.find((p) => p.id === c.id)?.name)])]),
    ...sc.npcs.map((n) => [n.id, new Set(nameWords(n.name))]),
  ];
  const owners = {};
  for (const [, names] of people) for (const w of names) owners[w] = (owners[w] ?? 0) + 1;
  const spoken = words.join(' ');
  return people.filter(([id, names]) => {
    const full = [...names].join(' ');
    return (full && spoken.includes(full)) || [...names].some((w) => owners[w] === 1 && words.includes(w));
  }).map(([id]) => id);
}

// A copy safe to keep in the dataset: everything except the tokens that let someone act as the host or a player.
export function forDataset(game) {
  const copy = structuredClone(game);
  delete copy.hostToken;
  if (copy.setup) delete copy.setup.recent;
  for (const p of copy.players ?? []) delete p.token;
  return copy;
}

const SAID = [/^(.+?) said: "(.*)"$/, /^(.+?), in their own words: "(.*)"$/, /^(.+?) could not keep it in: "(.*)"$/];

// Older saves: rebuild the facts list from lines players said out loud.
export function backfillFacts(game) {
  if (!game.state || game.state.facts?.length) return;
  for (const e of game.state.events ?? []) {
    if (!['said', 'forced'].includes(e.kind)) continue;
    const m = SAID.map((re) => re.exec(e.text)).find(Boolean);
    const player = m && game.players.find((p) => p.name === m[1]);
    if (player) addFacts(game, [{ person: player.id, fact: `Said out loud: "${m[2]}"` }], 'said', e.at);
  }
}

export function addFacts(game, items, source, now = Date.now()) {
  const st = game.state;
  st.facts ??= [];
  const ids = new Set([...game.scenario.players, ...game.scenario.npcs].map((c) => c.id));
  for (const item of items ?? []) {
    const fact = String(item?.fact ?? '').trim().slice(0, 200);
    const who = String(item?.person ?? item?.person_id ?? '').trim();
    const id = ids.has(who) ? who : mentions(game, who)[0];
    if (!fact || !id || st.facts.some((f) => f.id === id && f.fact === fact)) continue;
    st.facts.push({ id, fact, source, round: st.roundNumber ?? st.phaseIndex + 1, at: now });
  }
}

export function peopleAsked(game, text) {
  const words = wordsOf(text);
  return game.scenario.npcs.filter((n) => nameWords(n.name).some((w) => words.includes(w))).map((n) => ({
    name: n.name,
    role: n.role_title,
    importance: n.importance ?? 'important',
    knows: n.knows,
    lies: n.lies,
    reveals_freely: n.reveals_freely,
    reveals_under_pressure: n.reveals_under_pressure,
    says_they_were: n.alibi ?? [],
    has_learned: (game.state.knowledge ?? []).filter((k) => k.character_id === n.id).map((k) => k.fact),
  }));
}

export function publicKnowledge(game) {
  const sc = game.scenario;
  return {
    title: sc.title,
    setting: sc.setting_summary,
    background: sc.background ?? [],
    opening: sc.opening_scene,
    people: [
      ...sc.players.map((c) => ({ name: c.character_name, role: c.role_title, about: c.public_info })),
      ...sc.npcs.map((n) => ({ name: n.name, role: n.role_title, about: n.public_info })),
    ],
    places: sc.locations.map((l) => ({ name: l.name, about: l.public_info })),
    timeline: publicTimeline(game),
    news: game.state.events.filter((e) => !['opening', 'qa'].includes(e.kind)).slice(-20).map(eventForGM),
    asked_out_loud_before: game.state.events.filter((e) => e.kind === 'qa').slice(-15).map((e) => `${e.by} asked: ${e.read ? playerWords(e.read, e.q, 'public') : e.q} Answer: ${e.text}`),
    where_people_say_they_were: alibiTable(sc),
    canon: (game.state.canon ?? []).filter((c) => c.public).map((c) => c.fact),
    shared_clues: game.state.shared.map((x) => {
      const c = sc.clues.find((k) => k.id === x.clueId);
      return `${c.name}: ${c.shows}`;
    }),
  };
}

const SVG_BAD = /<script|<foreignObject|\son\w+\s*=|(?:href|src)\s*=\s*["'](?!#)|javascript:|<iframe|<image/i;

export function cleanSvg(svg) {
  const text = String(svg ?? '').trim();
  if (!text.startsWith('<svg') || !text.endsWith('</svg>') || text.length > 20_000 || SVG_BAD.test(text)) return null;
  return text;
}

// Player-written text reaches an agent with secrets only as the reader's form, or quoted as data.
export const playerWords = (read, text, mode = 'move') => (read ? formForGM(read, mode).replace(/\n/g, ' | ') : quoteRaw(text));

// Own-words lines go to the GM as the reader's form; host notes are player-written, so they are quoted.
export function eventForGM(e) {
  if (e.kind === 'said' && e.read) return `${e.by} said out loud in their own words: ${playerWords(e.read, '', 'said')}`;
  if (e.kind === 'note') return `The room thinks: ${quoteRaw(e.text.replace(/^The room thinks: /, ''))}`;
  return e.text;
}

// Final answers as the scorer may see them: the reader's cleaned text, never the raw words.
export function forScore(game) {
  return Object.fromEntries(Object.entries(game.state.submissions).map(([pid, s]) => [pid, {
    culprit_ids: s.culprit_ids,
    ...(s.read ? { how: s.read.how, why: s.read.why, goal: s.read.goal } : { how: quoteRaw(s.how), why: quoteRaw(s.why), goal: quoteRaw(s.goal) }),
  }]));
}

export function quietPlayers(game) {
  const st = game.state;
  const since = st.events.filter((e) => e.kind === 'phase').at(-1)?.at ?? 0;
  return game.players.map((p) => p.id).filter((pid) => !(st.threads[pid] ?? []).some((m) => m.from === 'you' && m.at >= since));
}

export function snapshotForGM(game) {
  const st = game.state;
  const open = openClues(game);
  return {
    phase: st.phaseIndex >= 0 ? { number: roundNumber(game), of: totalRounds(game), name: game.scenario.phases[st.phaseIndex]?.name, stage: storyStage(game, st.phaseIndex) } : null,
    where_we_are: st.recap ?? null,
    players_now: st.persona ?? {},
    quiet_players: quietPlayers(game),
    play_by_player: Object.fromEntries(game.players.map((p) => [p.id, skillSplit(st.play?.[p.id])])),
    suspicion: st.suspicion,
    destroyed_clues: st.destroyed,
    where_everyone_is: st.positions,
    round_results: st.roundResults,
    moments_so_far: (st.moments ?? []).map((m) => ({ player_id: m.player_id, line: m.line, round: m.round, result: m.status, ...(m.saidInstead ? { said_instead: m.readInstead ? playerWords(m.readInstead, m.saidInstead, 'said') : m.saidInstead } : {}) })),
    overrides_left: st.overridesLeft,
    what_gm_characters_have_learned: Object.fromEntries(game.scenario.npcs.map((n) => [n.id, (st.knowledge ?? []).filter((k) => k.character_id === n.id).map((k) => `Round ${k.round}: ${k.fact} (${k.how})`)])),
    canon: (st.canon ?? []).map((c) => ({ fact: c.fact, round: c.round })),
    offers_waiting: (st.offers ?? []).filter((o) => o.status === 'open').map((o) => ({ player_id: o.player_id, asked: o.text })),
    shared_clues: st.shared.map((x) => x.clueId),
    clues_open_now: open,
    clues_later: game.scenario.clues.filter((c) => !open.includes(c.id)).map((c) => ({ id: c.id, round: c.reveal_round })),
    clues_found_by_player: st.found,
    revealed_hidden_facts: st.revealed,
    public_events: st.events.filter((e) => e.kind !== 'opening').map((e) => (e.kind === 'qa' ? `${e.by} asked out loud: ${e.read ? playerWords(e.read, e.q, 'public') : e.q} Answer: ${e.text}` : eventForGM(e))),
    record: Object.fromEntries(
      Object.entries(st.threads).map(([pid, msgs]) => [pid, msgs.map((m) => `${m.from}${m.kind ? `(${m.kind})` : ''}: ${m.from === 'you' ? playerWords(m.read, m.text, 'move') : m.text}`)]),
    ),
  };
}

function publicCast(game) {
  if (!game.scenario) return null;
  return {
    players: game.scenario.players.map((c) => ({
      id: c.id,
      player: game.players.find((p) => p.id === c.id)?.name,
      name: c.character_name,
      role: c.role_title,
      info: c.public_info,
      icon: c.icon ?? '',
    })),
    npcs: [...game.scenario.npcs].sort((a, b) => isMinor(a) - isMinor(b)).map((n) => ({ id: n.id, name: n.name, role: n.role_title, info: n.public_info, icon: n.icon ?? '', minor: isMinor(n) })),
    locations: game.scenario.locations.map((l) => ({ id: l.id, name: l.name, info: l.public_info, icon: l.icon ?? '' })),
  };
}

function roundView(game, now) {
  const st = game.state;
  const q = roundQuestion(game, st.phaseIndex);
  const ph = game.scenario.phases[st.phaseIndex] ?? {};
  const job = st.job?.round === roundNumber(game) ? st.job : null;
  const objective = job?.objective ?? String(ph.objective ?? '').trim();
  if (!q && !objective) return null;
  const vote = q ? st.roundVote : null;
  return {
    objective,
    tips: (job?.tips?.length ? job.tips : ph.try ?? []).map(String).filter(Boolean).slice(0, 3),
    question: q?.question ?? null,
    options: q?.options ?? [],
    done: resultsThisRound(game).length > 0,
    vote: vote ? { endsAt: vote.endsAt, voted: Object.keys(vote.votes).length, of: game.players.length } : null,
  };
}

const rooms = new Map();
function roomFor(game) {
  const room = game.scenario.room ?? guessRoom(game.setup?.setting || game.scenario.setting_summary, game.setup?.tone);
  const key = JSON.stringify(room);
  if (!rooms.has(key)) rooms.set(key, roomTheme(room));
  return rooms.get(key);
}

function publicCore(game, now) {
  const st = game.state;
  const sc = game.scenario;
  // Past world titles help the world writer only; they stay on the server.
  const { recent, ...setup } = game.setup ?? {};
  const vote = st?.hintVote && st.hintVote.endsAt > now ? st.hintVote : null;
  const ask = st?.voteAsk && st.voteAsk.endsAt > now ? st.voteAsk : null;
  return {
    gameId: game.id,
    status: game.status,
    room: sc ? roomFor(game) : null,
    error: game.error,
    players: game.players.map((p) => ({ id: p.id, name: p.name })),
    setup: game.setup ? setup : null,
    surprise: ['lobby', 'failed'].includes(game.status) ? game.lobby?.surprise ?? null : null,
    title: sc?.title ?? null,
    background: sc?.background ?? [],
    caseQuestion: sc ? caseQuestion(sc) : null,
    alibis: game.state ? alibiTable(sc) : null,
    timeline: publicTimeline(game),
    briefing: game.status === 'reading' && st ? { step: st.brief?.step ?? 0, steps: briefingSteps(game) } : null,
    round: st && game.status === 'playing' ? roundView(game, now) : null,
    roundResults: st?.roundResults ?? [],
    sharedClues: st ? st.shared.map((x) => {
      const c = sc.clues.find((k) => k.id === x.clueId);
      return { id: x.clueId, name: c.name, shows: c.shows, by: game.players.find((p) => p.id === x.by)?.name };
    }) : [],
    illustration: st?.illustration ?? null,
    calling: st ? (st.moments ?? []).filter((m) => m.status === 'called').map((m) => game.players.find((p) => p.id === m.player_id)?.name) : [],
    overridesTotal: game.setup?.overrides ?? null,
    music: sanitizeMusic(sc?.music, game.setup?.tone ?? 'cozy'),
    musicDescription: sc?.music?.description ?? null,
    setting: sc?.setting_summary ?? null,
    opening: sc?.opening_scene ?? null,
    cast: publicCast(game),
    map: sc ? { places: mapOf(sc, st?.mapEdits), positions: st?.positions ?? startPositions(sc) } : null,
    phase: st && st.phaseIndex >= 0 ? { index: st.phaseIndex, number: roundNumber(game), count: totalRounds(game), name: sc.phases[st.phaseIndex].name, endsAt: st.phaseEndsAt } : null,
    recap: st?.recap ?? null,
    people: sc && st ? peopleView(game) : null,
    hintsLeft: st?.hintsLeft ?? null,
    hintsTotal: game.setup?.hints ?? null,
    hintVote: vote && {
      proposer: game.players.find((p) => p.id === vote.proposer)?.name,
      yes: Object.values(vote.votes).filter(Boolean).length,
      no: Object.values(vote.votes).filter((v) => !v).length,
      need: Math.floor(game.players.length / 2) + 1,
      endsAt: vote.endsAt,
    },
    seat: seatPublic(game),
    point: pointPublic(game),
    voteAsk: ask && {
      proposer: nameOf(game, ask.by),
      yes: Object.values(ask.votes).filter(Boolean).length,
      need: game.players.length,
      endsAt: ask.endsAt,
    },
    suspicion: st?.suspicion ?? null,
    events: (st?.events ?? []).map(({ read, ...e }) => e),
    ready: st ? game.players.filter((p) => st.ready[p.id]).map((p) => p.id) : [],
    submitted: st ? game.players.filter((p) => st.submissions[p.id]).map((p) => p.id) : [],
    transitioning: st?.transitioning ?? false,
    scoring: st?.scoring ?? false,
    progress: game.status === 'generating' && game.progress ? {
      attempt: game.progress.attempt,
      draft: game.progress.draft,
      step: game.progress.step,
      seen: game.progress.seen,
      counts: game.progress.counts,
      startedAt: game.progress.startedAt,
      steps: GENERATION_STEPS.map(({ id, label }) => ({ id, label })),
      ...planView(game.progress),
    } : null,
  };
}

const SECTION_WORDS = { players: 'characters', npcs: 'people', locations: 'places', clues: 'clues', key_deductions: 'links', phases: 'rounds', hint_ladder: 'hints', twists: 'twists' };
const PLAN_WORDS = 7;
export const CARD_STEP = 'Making sure everyone knows their own story';
export const STORY_STEP = 'Checking the story for holes';

// The GM's own steps, cleaned: 3 to 7 short titles, each pointing at real sections. null if it is unusable.
export function cleanPlan(steps, sections = PLAN_SECTIONS) {
  if (!Array.isArray(steps)) return null;
  const known = new Set(sections);
  const plan = steps
    .map((st) => ({
      title: String(st?.title ?? '').replace(/\s+/g, ' ').trim().split(' ').slice(0, PLAN_WORDS).join(' '),
      covers: (Array.isArray(st?.covers) ? st.covers : []).map(String).filter((k) => known.has(k)),
    }))
    .filter((st) => st.title && st.covers.length)
    .slice(0, 7);
  return plan.length >= 3 ? plan : null;
}

function planView(p) {
  const redraft = (p.attempt ?? 1) > 1 || (p.draft ?? 0) > 1;
  const retry = p.retry ? { reason: p.retry.reason, broke: p.retry.broke, tookMs: p.retry.tookMs, at: p.retry.at } : null;
  if (!p.plan) return { plan: null, thinking: true, redraft, retry };
  const keys = new Set(p.keys ?? []);
  const finishing = ['checking', 'story', 'cards'].includes(p.step);
  const plan = p.plan.map((st) => {
    const active = !finishing && st.covers.includes(p.key);
    const done = finishing || (!active && st.covers.every((k) => keys.has(k)));
    const counted = active ? st.covers.find((k) => SECTION_WORDS[k] && p.counts?.[k]) : null;
    return { title: st.title, state: active ? 'active' : done ? 'done' : 'todo', ...(counted ? { count: `${p.counts[counted]} ${SECTION_WORDS[counted]} so far` } : {}) };
  });
  if (p.step === 'story') plan.push({ title: STORY_STEP, state: 'active' });
  if (p.step === 'cards') plan.push({ title: CARD_STEP, state: 'active' });
  return { plan, thinking: false, redraft, retry };
}

function bestPlay(result) {
  const top = Math.max(0, ...(result?.players ?? []).map((p) => p.play ?? 0));
  return top > 0 ? result.players.filter((p) => p.play === top).map((p) => p.player_id) : [];
}

function revealView(game) {
  const sc = game.scenario;
  const st = game.state;
  return {
    ...st.result,
    bestPlay: bestPlay(st.result),
    truth: sc.truth,
    twists: sc.twists,
    false_hint: sc.hint_ladder.find((h) => h.is_false)?.text ?? null,
    learned: (st.knowledge ?? []).map((k) => ({ who: sc.npcs.find((n) => n.id === k.character_id)?.name, fact: k.fact, how: k.how, round: k.round })),
    cards: sc.players.map((c) => ({
      id: c.id,
      player: game.players.find((p) => p.id === c.id)?.name,
      name: c.character_name,
      role: c.role_title,
      side: c.side,
      private_info: c.private_info,
      goal: c.goal,
      hidden_facts: c.hidden_facts.map((h) => h.fact),
      submission: st.submissions[c.id] ?? null,
    })),
  };
}

export function tableView(game, now = Date.now()) {
  return { ...publicCore(game, now), picture: roundPicture(game), reveal: game.status === 'reveal' ? revealView(game) : null };
}

// This round's own picture, table only; null until it is drawn (the scene picture stands in).
// The final vote and the reveal keep the newest round picture.
export function roundPicture(game) {
  const st = game.state;
  if (!st) return null;
  if (game.status === 'playing') return st.roundArt?.[roundNumber(game)] ?? null;
  if (!['final', 'reveal'].includes(game.status)) return null;
  const newest = Object.keys(st.roundArt ?? {}).map(Number).sort((a, b) => b - a)[0];
  return newest ? st.roundArt[newest] : null;
}

export function setRoundPicture(game, round, svg) {
  const clean = cleanSvg(svg);
  if (!clean) return false;
  (game.state.roundArt ??= {})[round] = clean;
  return true;
}

// Hot seats style opens each card on its hook; "drives" and "reasons" unlock during play. Classic and older games never lock.
const CARD_SECTIONS = ['drives', 'reasons'];
function lockedSections(game, playerId) {
  const st = game.state;
  if (game.setup?.roundStyle !== 'hotseats' || !st?.unlocked) return [];
  return CARD_SECTIONS.filter((s) => !(st.unlocked[playerId] ?? []).includes(s));
}

export function unlockCard(game, playerId, section) {
  const st = game.state;
  if (!st || !CARD_SECTIONS.includes(section)) return;
  st.unlocked ??= {};
  const list = (st.unlocked[playerId] ??= []);
  if (!list.includes(section)) list.push(section);
}

export function playerView(game, playerId, now = Date.now()) {
  const me = game.players.find((p) => p.id === playerId);
  const view = { ...publicCore(game, now), me: { id: me.id, name: me.name } };
  const st = game.state;
  if (!st) return view;
  const card = game.scenario.players.find((p) => p.id === playerId);
  const revealed = st.revealed[playerId];
  const locked = lockedSections(game, playerId);
  view.card = {
    name: card.character_name,
    role: card.role_title,
    public_info: card.public_info,
    private_info: card.private_info,
    goal: card.goal,
    win: WIN[card.side] ?? '',
    side: card.side,
    side_explanation: card.side_explanation,
    starting_knowledge: card.starting_knowledge,
    hook: card.hook ?? '',
    distrusts: game.scenario.players.find((p) => p.id === card.distrusts)?.character_name ?? '',
    distrust_why: card.distrusts ? card.distrust_why ?? '' : '',
    locked,
    wants: locked.includes('drives') ? '' : card.wants ?? '',
    fears: locked.includes('drives') ? '' : card.fears ?? '',
    goal_why: card.goal_why ?? '',
    reasons: locked.includes('reasons') ? [] : card.reasons ?? [],
    pellets: pelletsFor({ ...card, wants: locked.includes('drives') ? '' : card.wants, fears: locked.includes('drives') ? '' : card.fears, reasons: locked.includes('reasons') ? [] : card.reasons }),
    reminders: remindersFor(card),
    night: card.night ?? [],
    alibi: card.alibi ?? [],
    hidden_known: card.hidden_facts.filter((h) => revealed.includes(h.id)).map((h) => h.fact),
    hidden_unknown: card.hidden_facts.filter((h) => !revealed.includes(h.id)).length,
  };
  view.rules = rulesLines({ rounds: game.scenario.phases.length, questions: st.questionsPerPhase, overrides: game.setup?.overrides ?? 0, hints: game.setup?.hints ?? 0 });
  view.thread = st.threads[playerId].map(({ read, ...m }) => m);
  view.questionsLeft = st.questionsLeft[playerId];
  view.pending = st.pending[playerId] ? { kind: st.pending[playerId].kind, text: st.pending[playerId].text } : null;
  view.clues = st.found[playerId].map((id) => {
    const c = game.scenario.clues.find((x) => x.id === id);
    return { id, name: c.name, shows: c.shows, destroyed: st.destroyed.includes(id) };
  });
  view.myVote = st.hintVote ? st.hintVote.votes[playerId] ?? null : null;
  view.myVoteAsk = st.voteAsk ? st.voteAsk.votes[playerId] ?? null : null;
  if (view.seat?.status) view.seat = { ...view.seat, mine: seatMine(game, playerId) };
  view.voteAskBlocked = st.voteAskBlocked?.[playerId] === roundNumber(game);
  view.myRoundVote = st.roundVote ? st.roundVote.votes[playerId] ?? null : null;
  view.publicPending = st.publicPending?.[playerId] ?? null;
  view.publicError = st.publicErrors?.[playerId] ?? null;
  view.persona = st.persona?.[playerId] ?? null;
  view.playTotal = playTotal(st.play?.[playerId]);
  view.moments = (st.moments ?? []).filter((m) => m.player_id === playerId && OPEN.includes(m.status))
    .map((m) => ({ id: m.id, line: m.line, why: m.why, status: m.status, readyAt: m.readyAt }));
  view.offers = (st.offers ?? []).filter((o) => o.player_id === playerId && o.status === 'open').map((o) => ({ id: o.id, text: o.text, choice: o.choice }));
  view.overridesLeft = st.overridesLeft?.[playerId] ?? 0;
  view.submission = st.submissions[playerId] ?? null;
  view.reveal = game.status === 'reveal' ? revealView(game) : null;
  return view;
}
