import { randomBytes } from 'node:crypto';
import { LENGTHS } from './prompts.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const TONES = ['cozy', 'tense', 'dark', 'funny'];
export const HINT_VOTE_MS = 60_000;
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

export function addPlayer(game, { name, wish } = {}) {
  if (game.status !== 'lobby') fail('The game has already started.', 409);
  const clean = String(name ?? '').trim().slice(0, 24);
  if (!clean) fail('Enter a name.');
  if (game.players.length >= MAX_PLAYERS) fail(`The game is full (${MAX_PLAYERS} players).`, 409);
  if (game.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    fail('Someone already has that name.', 409);
  }
  const player = {
    id: `p${game.players.length + 1}`,
    token: token(),
    name: clean,
    wish: String(wish ?? '').trim().slice(0, 200),
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
  game.setup = {
    setting: String(input.setting ?? '').trim().slice(0, 200),
    tone,
    length: input.length,
    hints,
    notes: String(input.notes ?? '').trim().slice(0, 500),
  };
  game.status = 'generating';
  game.error = null;
  return game.setup;
}

export function validateScenario(s, { playerCount, phases, hints }) {
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

  const culprits = s.truth?.culprit_ids ?? [];
  if (!culprits.length) errors.push('truth.culprit_ids is empty.');
  const known = new Set([...got, ...npcIds]);
  for (const id of culprits) if (!known.has(id)) errors.push(`Culprit ${id} is not a character.`);
  const playerCulprits = players.filter((p) => p.side === 'culprit').map((p) => p.id);
  if (!playerCulprits.length) errors.push('At least one player character must be a culprit.');
  for (const id of playerCulprits) {
    if (!culprits.includes(id)) errors.push(`${id} has side culprit but is not in truth.culprit_ids.`);
  }
  for (const id of culprits.filter((c) => got.includes(c))) {
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

export function attachScenario(game, scenario, now = Date.now()) {
  const length = LENGTHS[game.setup.length];
  game.scenario = scenario;
  game.status = 'reading';
  game.state = {
    phaseIndex: -1,
    phaseEndsAt: null,
    questionsPerPhase: length.questions,
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
  enterPhase(game, 0, now);
  game.state.events.push({ at: now, phase: 0, kind: 'phase', text: phaseLine(game, 0) });
}

const phaseLine = (game, i) => `Phase ${i + 1} of ${game.scenario.phases.length}: ${game.scenario.phases[i].name}`;

export function extendPhase(game, now = Date.now()) {
  if (game.status !== 'playing') fail('No phase is running.', 409);
  game.state.phaseEndsAt = Math.max(game.state.phaseEndsAt, now) + EXTEND_MS;
}

export const ASK_KINDS = ['question', 'self', 'action'];

export function beginAsk(game, playerId, { kind, text }) {
  if (game.status !== 'playing') fail('You can only ask during a phase.', 409);
  if (game.state.transitioning) fail('The world is changing. Try again in a moment.', 409);
  if (!ASK_KINDS.includes(kind)) fail('Unknown request type.');
  const clean = String(text ?? '').trim().slice(0, 500);
  if (!clean) fail('Write what you want to do.');
  const st = game.state;
  if (st.pending[playerId]) fail('The GM is still answering your last request.', 409);
  if (st.questionsLeft[playerId] < 1) fail('No questions left this phase.', 409);
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

function addEvent(game, text, kind, now) {
  const clean = String(text ?? '').trim();
  if (clean) game.state.events.push({ at: now, phase: game.state.phaseIndex, kind, text: clean });
}

function whisper(game, messages, now) {
  for (const m of messages ?? []) {
    const thread = game.state.threads[m?.player_id];
    const text = String(m?.text ?? '').trim();
    if (thread && text) thread.push({ from: 'whisper', text, at: now });
  }
}

function destroy(game, clueIds) {
  const destroyable = new Set(game.scenario.clues.filter((c) => c.can_be_destroyed).map((c) => c.id));
  for (const id of clueIds ?? []) {
    if (destroyable.has(id) && !game.state.destroyed.includes(id)) game.state.destroyed.push(id);
  }
}

export function completeAsk(game, playerId, result, now = Date.now()) {
  const st = game.state;
  const ask = st.pending[playerId];
  if (!ask) fail('No request is waiting for an answer.', 409);
  delete st.pending[playerId];
  const thread = st.threads[playerId];
  thread.push({ from: 'you', kind: ask.kind, text: ask.text, at: now });
  thread.push({ from: 'gm', text: String(result.answer ?? '').trim() || '(No answer.)', at: now });

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
  st.suspicion = clamp(st.suspicion + clamp(Number(result.suspicion_change) || 0, -10, 25), 0, 100);
  addEvent(game, result.public_event, 'event', now);
  whisper(game, result.messages_to_players, now);
}

export function isLastPhase(game) {
  return game.state.phaseIndex >= game.scenario.phases.length - 1;
}

export function nextPhaseInfo(game) {
  return isLastPhase(game) ? null : game.scenario.phases[game.state.phaseIndex + 1];
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
  if (isLastPhase(game)) {
    game.status = 'final';
    st.phaseEndsAt = null;
    st.hintVote = null;
    addEvent(game, 'Time is up. Everyone: submit your final reconstruction on your phone.', 'phase', now);
    return;
  }
  const next = st.phaseIndex + 1;
  destroy(game, result.clues_destroyed);
  st.suspicion = clamp(st.suspicion + clamp(Number(result.suspicion_change) || 0, -20, 20), 0, 100);
  enterPhase(game, next, now);
  addEvent(game, phaseLine(game, next), 'phase', now);
  addEvent(game, result.public_event, 'event', now);
  whisper(game, result.messages_to_players, now);
}

export function proposeHint(game, playerId, now = Date.now()) {
  if (game.status !== 'playing') fail('Hints can only be spent during a phase.', 409);
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
    addEvent(game, 'The group decided to save its hint.', 'hint', now);
    return 'saved';
  }
  return 'open';
}

export function submitFinal(game, playerId, input = {}) {
  if (game.status !== 'final') fail('Final answers open after the last phase.', 409);
  const cast = castIds(game);
  const culprits = [...new Set(input.culprit_ids ?? [])].filter((id) => cast.includes(id));
  if (!culprits.length) fail('Name at least one culprit.');
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
      };
    }),
  };
  game.status = 'reveal';
}

export function snapshotForGM(game) {
  const st = game.state;
  return {
    phase: st.phaseIndex >= 0 ? { number: st.phaseIndex + 1, of: game.scenario.phases.length, name: game.scenario.phases[st.phaseIndex]?.name } : null,
    suspicion: st.suspicion,
    destroyed_clues: st.destroyed,
    clues_found_by_player: st.found,
    revealed_hidden_facts: st.revealed,
    public_events: st.events.filter((e) => e.kind !== 'opening').map((e) => e.text),
    record: Object.fromEntries(
      Object.entries(st.threads).map(([pid, msgs]) => [pid, msgs.map((m) => `${m.from}${m.kind ? `(${m.kind})` : ''}: ${m.text}`)]),
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
    })),
    npcs: game.scenario.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role_title, info: n.public_info })),
    locations: game.scenario.locations.map((l) => ({ id: l.id, name: l.name, info: l.public_info })),
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
    setting: sc?.setting_summary ?? null,
    opening: sc?.opening_scene ?? null,
    cast: publicCast(game),
    phase: st && st.phaseIndex >= 0 ? { index: st.phaseIndex, count: sc.phases.length, name: sc.phases[st.phaseIndex].name, endsAt: st.phaseEndsAt } : null,
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
    events: st?.events ?? [],
    ready: st ? game.players.filter((p) => st.ready[p.id]).map((p) => p.id) : [],
    submitted: st ? game.players.filter((p) => st.submissions[p.id]).map((p) => p.id) : [],
    transitioning: st?.transitioning ?? false,
    scoring: st?.scoring ?? false,
  };
}

function revealView(game) {
  const sc = game.scenario;
  const st = game.state;
  return {
    ...st.result,
    truth: sc.truth,
    twists: sc.twists,
    false_hint: sc.hint_ladder.find((h) => h.is_false)?.text ?? null,
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
    side: card.side,
    side_explanation: card.side_explanation,
    starting_knowledge: card.starting_knowledge,
    hidden_known: card.hidden_facts.filter((h) => revealed.includes(h.id)).map((h) => h.fact),
    hidden_unknown: card.hidden_facts.filter((h) => !revealed.includes(h.id)).length,
  };
  view.thread = st.threads[playerId];
  view.questionsLeft = st.questionsLeft[playerId];
  view.pending = Boolean(st.pending[playerId]);
  view.clues = st.found[playerId].map((id) => {
    const c = game.scenario.clues.find((x) => x.id === id);
    return { id, name: c.name, shows: c.shows, destroyed: st.destroyed.includes(id) };
  });
  view.myVote = st.hintVote ? st.hintVote.votes[playerId] ?? null : null;
  view.submission = st.submissions[playerId] ?? null;
  view.reveal = game.status === 'reveal' ? revealView(game) : null;
  return view;
}
