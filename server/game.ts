// @ts-nocheck -- legacy JS, typed file by file later
import { randomBytes } from 'node:crypto';
import { formForGM, quoteRaw } from './reader.ts';
import { scoreMoves, playTotal, skillSplit, PLAY_MAX } from './skills.ts';
import { LENGTHS, PLAN_SECTIONS } from './prompts.ts';
import { GENERATION_STEPS } from './progress.ts';
import { sanitizeMusic } from '../public/music-theory.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const TONES = ['cozy', 'tense', 'dark', 'funny'];
export const HINT_VOTE_MS = 60_000;
export const ROUND_VOTE_MS = 90_000;
export const MOMENT_READY_MS = 60_000;
export const EXTEND_MS = 5 * 60_000;

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
  };
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
  const questions = input.questions === undefined ? LENGTHS[input.length].questions : Number(input.questions);
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
    notes: String(input.notes ?? '').trim().slice(0, 500),
  };
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
  return errors;
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
  game.status = 'reading';
  game.state = {
    phaseIndex: -1,
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
  const lines = (result.recap ?? []).map((t) => String(t ?? '').trim()).filter(Boolean).slice(0, 4);
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

// In a reply to one player's move, a sentence led by another player's name that has them speak or react was invented.
// Only words that name exactly one person count, so a shared title ("Lady", "Captain") never matches.
export function dropPuppeting(game, actorId, text, { to = null } = {}) {
  const sc = game.scenario;
  const people = [
    ...(sc?.players ?? []).map((c) => ({ id: c.id, player: true, full: wordsOf(c.character_name), names: new Set([...nameWords(c.character_name), ...nameWords(game.players.find((p) => p.id === c.id)?.name)].filter((w) => !TITLES.has(w))) })),
    ...(sc?.npcs ?? []).map((n) => ({ id: n.id, player: false, full: wordsOf(n.name), names: new Set(nameWords(n.name).filter((w) => !TITLES.has(w))) })),
  ];
  const owners = {};
  for (const p of people) for (const w of p.names) owners[w] = (owners[w] ?? 0) + 1;
  const leadOf = (words) => people.find((p) => (p.full.length && p.full.every((w, k) => words[k] === w)) || (p.names.has(words[0]) && owners[words[0]] === 1)) ?? null;
  const sentences = String(text ?? '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const kept = sentences.filter((sentence) => {
    const words = wordsOf(sentence);
    const lead = leadOf(words);
    if (!lead || !lead.player || lead.id === actorId) return true;
    if (lead.id === to && /^[^,.!?]{1,40},/.test(sentence.trim())) return true;
    return !words.some((w) => PUPPET_VERBS.has(w));
  });
  return { text: kept.join(' '), dropped: sentences.length - kept.length };
}

export function completeAsk(game, playerId, result, now = Date.now()) {
  const st = game.state;
  const ask = st.pending[playerId];
  if (!ask) fail('No request is waiting for an answer.', 409);
  delete st.pending[playerId];
  const kind = ask.kind === 'chat' ? (ANSWER_KINDS.includes(result.kind) ? result.kind : 'question') : ask.kind;
  const thread = st.threads[playerId];
  thread.push({ from: 'you', kind, text: ask.text, ...(ask.read ? { read: ask.read } : {}), at: now });
  const unpuppet = (text, to = null) => {
    const out = dropPuppeting(game, playerId, text, { to });
    st.puppetDrops = (st.puppetDrops ?? 0) + out.dropped;
    return out.text;
  };
  const myName = game.scenario.players.find((p) => p.id === playerId)?.character_name?.toLowerCase();
  const players = new Set(game.scenario.players.map((p) => p.character_name.toLowerCase()));
  const names = Object.fromEntries([
    ...game.scenario.players.map((p) => [p.id, p.character_name]),
    ...game.scenario.npcs.map((n) => [n.id, n.name]),
  ]);
  const lines = (Array.isArray(result.lines) ? result.lines : [])
    .map((l) => {
      const raw = String(l?.speaker ?? '').trim();
      return { speaker: (names[raw] ?? raw).slice(0, 40), text: String(l?.text ?? '').trim().replace(/^["“]|["”]$/g, '') };
    })
    .map((l) => (l.speaker ? l : { ...l, text: unpuppet(l.text) }))
    .filter((l) => l.text)
    .flatMap((l) => {
      const who = l.speaker.toLowerCase();
      if (who && who === myName) return [{ speaker: '', text: `You say: "${l.text}"` }];
      if (who && players.has(who)) return [];
      return [l];
    });
  const text = lines.length ? lines.map((l) => (l.speaker ? `${l.speaker}: "${l.text}"` : l.text)).join('\n') : String(result.answer ?? '').trim();
  const ideas = (result.ideas ?? []).map((t) => String(t ?? '').trim().slice(0, 80)).filter(Boolean).slice(0, 3);
  readPlayer(game, playerId, result.player_read, 'private', now);
  const [scored, penalty] = recordPlay(game, playerId, result.play, ask.read, 'private');
  const shown = (m) => ({ points: m.points, skill: m.skill, why: m.why });
  thread.push({ from: 'gm', text: text || '(No answer.)', ...(lines.length ? { lines } : {}), ...(ideas.length ? { ideas } : {}), play: shown(scored), ...(penalty ? { penalty: shown(penalty) } : {}), at: now });

  const clueIds = new Set(game.scenario.clues.map((c) => c.id));
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
  addEvent(game, unpuppet(result.public_event), 'event', now);
  whisper(game, (result.messages_to_players ?? []).map((m) => ({ ...m, text: unpuppet(m?.text, m?.player_id) })), now);
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
  const last = resultsThisRound(game).at(-1);
  const voted = (last?.counts ?? []).some((n) => n > 0);
  return Boolean(last && !last.correct && voted && (game.state.replays ?? 0) < (game.setup?.replays ?? 0));
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
}

export function cancelPhaseChange(game) {
  if (game.state) game.state.transitioning = false;
}

export function completePhase(game, result, now = Date.now()) {
  if (game.status !== 'playing') fail('No phase is running.', 409);
  const st = game.state;
  st.transitioning = false;
  const replay = willReplay(game);
  if (isLastPhase(game) && !replay) {
    game.status = 'final';
    st.phaseEndsAt = null;
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
  enterPhase(game, next, now);
  setJob(game, result);
  addEvent(game, phaseLine(game, next, replay), 'phase', now);
  addEvent(game, result.public_event, 'event', now);
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
        skills: skillSplit(game.state.play?.[p.id]),
      };
    }),
  };
  game.status = 'reveal';
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

export function closeOpenMoments(game, now = Date.now()) {
  const st = game.state;
  for (const m of st.moments ?? []) {
    if (!OPEN.includes(m.status)) continue;
    const name = nameOf(game, m.player_id);
    if ((st.overridesLeft[m.player_id] ?? 0) > 0) {
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

export function roundQuestion(game, index) {
  const ph = game.scenario?.phases?.[index];
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
  const counts = q.options.map((_, i) => Object.values(vote.votes).filter((v) => v === i).length);
  const top = Math.max(...counts);
  const winners = counts.flatMap((c, i) => (c === top && top > 0 ? [i] : []));
  const picked = winners.length === 1 ? winners[0] : null;
  const correct = picked === q.answer;
  const result = { phaseIndex: vote.phaseIndex, round: roundNumber(game), question: q.question, picked, pickedText: picked === null ? null : q.options[picked], correct, counts };
  st.roundResults.push(result);
  st.roundVote = null;
  const said = picked === null ? 'The group could not agree.' : `The group picked: ${q.options[picked]}.`;
  if (correct) {
    addEvent(game, `${said} That is right! ${q.reward}`, 'round', now);
    if (q.reward) st.timelineExtra.push({ order: q.rewardOrder, time: q.rewardTime, event: q.reward });
    addFacts(game, mentions(game, q.reward).map((id) => ({ person: id, fact: q.reward })), 'round', now);
    st.suspicion = clamp(st.suspicion + 10, 0, 100);
  } else {
    addEvent(game, `${said} Not quite. ${q.nudge}`, 'round', now);
    st.suspicion = clamp(st.suspicion - 10, 0, 100);
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
    `Plus up to ${PLAY_MAX} play points for good moves.`,
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

export function completePublicAsk(game, playerId, answer, now = Date.now(), read = null, words = null) {
  const st = game.state;
  const q = st.publicPending[playerId];
  if (!q) return;
  delete st.publicPending[playerId];
  readPlayer(game, playerId, read, 'out loud', now);
  if (read?.play || words) recordPlay(game, playerId, read?.play, words, 'out loud');
  addFacts(game, read?.facts, 'asked out loud', now);
  const name = game.players.find((p) => p.id === playerId)?.name;
  st.events.push({ at: now, phase: st.phaseIndex, kind: 'qa', by: name, q, text: String(answer ?? '').trim() || 'Nobody knows that yet.', ...(words ? { read: words } : {}) });
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
function eventForGM(e) {
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
    shared_clues: st.shared.map((x) => x.clueId),
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

function publicCore(game, now) {
  const st = game.state;
  const sc = game.scenario;
  const vote = st?.hintVote && st.hintVote.endsAt > now ? st.hintVote : null;
  return {
    gameId: game.id,
    status: game.status,
    error: game.error,
    players: game.players.map((p) => ({ id: p.id, name: p.name })),
    setup: game.setup,
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
  if (!p.plan) return { plan: null, thinking: true, redraft };
  const keys = new Set(p.keys ?? []);
  const finishing = ['checking', 'cards'].includes(p.step);
  const plan = p.plan.map((st) => {
    const active = !finishing && st.covers.includes(p.key);
    const done = finishing || (!active && st.covers.every((k) => keys.has(k)));
    const counted = active ? st.covers.find((k) => SECTION_WORDS[k] && p.counts?.[k]) : null;
    return { title: st.title, state: active ? 'active' : done ? 'done' : 'todo', ...(counted ? { count: `${p.counts[counted]} ${SECTION_WORDS[counted]} so far` } : {}) };
  });
  if (p.step === 'cards') plan.push({ title: CARD_STEP, state: 'active' });
  return { plan, thinking: false, redraft };
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
  return { ...publicCore(game, now), reveal: game.status === 'reveal' ? revealView(game) : null };
}

export function playerView(game, playerId, now = Date.now()) {
  const me = game.players.find((p) => p.id === playerId);
  const view = { ...publicCore(game, now), me: { id: me.id, name: me.name } };
  const st = game.state;
  if (!st) return view;
  const card = game.scenario.players.find((p) => p.id === playerId);
  const revealed = st.revealed[playerId];
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
    wants: card.wants ?? '',
    fears: card.fears ?? '',
    goal_why: card.goal_why ?? '',
    reasons: card.reasons ?? [],
    pellets: pelletsFor(card),
    night: card.night ?? [],
    alibi: card.alibi ?? [],
    hidden_known: card.hidden_facts.filter((h) => revealed.includes(h.id)).map((h) => h.fact),
    hidden_unknown: card.hidden_facts.filter((h) => !revealed.includes(h.id)).length,
  };
  view.thread = st.threads[playerId].map(({ read, ...m }) => m);
  view.questionsLeft = st.questionsLeft[playerId];
  view.pending = st.pending[playerId] ? { kind: st.pending[playerId].kind, text: st.pending[playerId].text } : null;
  view.clues = st.found[playerId].map((id) => {
    const c = game.scenario.clues.find((x) => x.id === id);
    return { id, name: c.name, shows: c.shows, destroyed: st.destroyed.includes(id) };
  });
  view.myVote = st.hintVote ? st.hintVote.votes[playerId] ?? null : null;
  view.myRoundVote = st.roundVote ? st.roundVote.votes[playerId] ?? null : null;
  view.publicPending = st.publicPending?.[playerId] ?? null;
  view.publicError = st.publicErrors?.[playerId] ?? null;
  view.persona = st.persona?.[playerId] ?? null;
  view.playTotal = playTotal(st.play?.[playerId]);
  view.moments = (st.moments ?? []).filter((m) => m.player_id === playerId && OPEN.includes(m.status))
    .map((m) => ({ id: m.id, line: m.line, why: m.why, status: m.status, readyAt: m.readyAt }));
  view.overridesLeft = st.overridesLeft?.[playerId] ?? 0;
  view.submission = st.submissions[playerId] ?? null;
  view.reveal = game.status === 'reveal' ? revealView(game) : null;
  return view;
}
