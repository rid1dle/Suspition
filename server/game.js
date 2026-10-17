import { randomBytes } from 'node:crypto';
import { LENGTHS } from './prompts.js';
import { GENERATION_STEPS } from './progress.js';
import { sanitizeMusic } from '../public/music-theory.js';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const TONES = ['cozy', 'tense', 'dark', 'funny'];
export const HINT_VOTE_MS = 60_000;
export const ROUND_VOTE_MS = 90_000;
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
    positions: startPositions(scenario),
    mapEdits: {},
    brief: { step: 0 },
    roundVote: null,
    roundResults: [],
    timelineExtra: [],
    shared: [],
    publicPending: {},
    illustration: null,
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
  announceRound(game, 0, now);
}

function announceRound(game, index, now) {
  for (const t of game.scenario.public_timeline ?? []) {
    if (Number(t.reveal_round) === index + 1) addEvent(game, `New on the timeline: ${t.time ? `${t.time}, ` : ''}${t.event}`, 'timeline', now);
  }
  const q = roundQuestion(game, index);
  if (q) addEvent(game, `This round's goal: ${q.question}`, 'goal', now);
}

const phaseLine = (game, i) => `Round ${i + 1} of ${game.scenario.phases.length}: ${game.scenario.phases[i].name}`;

export function extendPhase(game, now = Date.now()) {
  if (game.status !== 'playing') fail('No phase is running.', 409);
  game.state.phaseEndsAt = Math.max(game.state.phaseEndsAt, now) + EXTEND_MS;
}

export const ASK_KINDS = ['question', 'self', 'action'];

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
  if (result.player_location && (ask.kind !== 'action' || result.move_is_public)) move(game, playerId, result.player_location);
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
    addEvent(game, 'Time is up. Everyone, pick who did it on your phone.', 'phase', now);
    return;
  }
  const next = st.phaseIndex + 1;
  destroy(game, result.clues_destroyed);
  for (const p of result.positions ?? []) move(game, p?.character_id, p?.location_id);
  st.suspicion = clamp(st.suspicion + clamp(Number(result.suspicion_change) || 0, -20, 20), 0, 100);
  enterPhase(game, next, now);
  addEvent(game, phaseLine(game, next), 'phase', now);
  addEvent(game, result.public_event, 'event', now);
  announceRound(game, next, now);
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
      };
    }),
  };
  game.status = 'reveal';
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
  return Boolean(roundQuestion(game, st.phaseIndex)) && !st.roundResults.some((r) => r.phaseIndex === st.phaseIndex);
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
  const result = { phaseIndex: vote.phaseIndex, question: q.question, picked, pickedText: picked === null ? null : q.options[picked], correct, counts };
  st.roundResults.push(result);
  st.roundVote = null;
  const said = picked === null ? 'The group could not agree.' : `The group picked: ${q.options[picked]}.`;
  if (correct) {
    addEvent(game, `${said} That is right! ${q.reward}`, 'round', now);
    if (q.reward) st.timelineExtra.push({ order: q.rewardOrder, time: q.rewardTime, event: q.reward });
    st.suspicion = clamp(st.suspicion + 10, 0, 100);
  } else {
    addEvent(game, `${said} Not quite. ${q.nudge}`, 'round', now);
    st.suspicion = clamp(st.suspicion - 10, 0, 100);
  }
  return result;
}

export function briefingSteps(game) {
  const sc = game.scenario;
  if (!sc) return [];
  const steps = [
    { kind: 'scene', title: sc.title, lines: [sc.setting_summary] },
    { kind: 'story', title: 'What just happened', lines: [sc.opening_scene] },
    { kind: 'background', title: 'What everyone knows', lines: sc.background ?? [] },
    { kind: 'map', title: 'The place', lines: ['This is the map. It shows every place and who is there.', 'Players are gold. People the GM plays are grey.'] },
  ];
  for (const c of sc.players) {
    const player = game.players.find((p) => p.id === c.id);
    steps.push({ kind: 'intro', playerId: c.id, title: `Meet ${c.character_name}`, lines: [`${player?.name ?? 'This player'}, stand up and say: "I am ${c.character_name}, ${c.role_title}. ${c.public_info}"`], icon: c.icon ?? '' });
  }
  steps.push({ kind: 'npcs', title: 'People the GM plays', lines: sc.npcs.map((n) => `${n.name}, ${n.role_title}. ${n.public_info}`) });
  steps.push({ kind: 'timeline', title: 'The timeline so far', lines: publicTimeline(game).map((t) => `${t.time ? `${t.time}: ` : ''}${t.event}`) });
  steps.push({ kind: 'goal', title: 'How to play', lines: [
    `There are ${sc.phases.length} rounds. Each round has one question.`,
    'Talk. Ask the GM on your phone. Look around. Share clues.',
    'At the end of each round, everyone votes on the answer.',
    'At the very end, everyone votes on who did it. Culprits vote too.',
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
  addEvent(game, `${name} shows a clue. ${clue.name}: ${clue.shows}`, 'clue', now);
}

export function beginPublicAsk(game, playerId, text) {
  if (!['reading', 'playing'].includes(game.status)) fail('You can ask about the world during the game.', 409);
  const clean = String(text ?? '').trim().slice(0, 200);
  if (!clean) fail('Write your question.');
  const st = game.state;
  if (st.publicPending[playerId]) fail('Wait for the answer to your last question.', 409);
  st.publicPending[playerId] = clean;
  return clean;
}

export function completePublicAsk(game, playerId, answer, now = Date.now()) {
  const st = game.state;
  const q = st.publicPending[playerId];
  if (!q) return;
  delete st.publicPending[playerId];
  const name = game.players.find((p) => p.id === playerId)?.name;
  st.events.push({ at: now, phase: st.phaseIndex, kind: 'qa', by: name, q, text: String(answer ?? '').trim() || 'Nobody knows that yet.' });
}

export function failPublicAsk(game, playerId) {
  delete game.state.publicPending[playerId];
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
    news: game.state.events.filter((e) => !['opening', 'qa'].includes(e.kind)).slice(-20).map((e) => e.text),
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

export function snapshotForGM(game) {
  const st = game.state;
  return {
    phase: st.phaseIndex >= 0 ? { number: st.phaseIndex + 1, of: game.scenario.phases.length, name: game.scenario.phases[st.phaseIndex]?.name } : null,
    suspicion: st.suspicion,
    destroyed_clues: st.destroyed,
    where_everyone_is: st.positions,
    round_results: st.roundResults,
    shared_clues: st.shared.map((x) => x.clueId),
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
      icon: c.icon ?? '',
    })),
    npcs: game.scenario.npcs.map((n) => ({ id: n.id, name: n.name, role: n.role_title, info: n.public_info, icon: n.icon ?? '' })),
    locations: game.scenario.locations.map((l) => ({ id: l.id, name: l.name, info: l.public_info, icon: l.icon ?? '' })),
  };
}

function roundView(game, now) {
  const st = game.state;
  const q = roundQuestion(game, st.phaseIndex);
  if (!q) return null;
  const vote = st.roundVote;
  return {
    question: q.question,
    options: q.options,
    done: st.roundResults.some((r) => r.phaseIndex === st.phaseIndex),
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
    timeline: publicTimeline(game),
    briefing: game.status === 'reading' && st ? { step: st.brief?.step ?? 0, steps: briefingSteps(game) } : null,
    round: st && game.status === 'playing' ? roundView(game, now) : null,
    roundResults: st?.roundResults ?? [],
    sharedClues: st ? st.shared.map((x) => {
      const c = sc.clues.find((k) => k.id === x.clueId);
      return { id: x.clueId, name: c.name, shows: c.shows, by: game.players.find((p) => p.id === x.by)?.name };
    }) : [],
    illustration: st?.illustration ?? null,
    music: sanitizeMusic(sc?.music, game.setup?.tone ?? 'cozy'),
    musicDescription: sc?.music?.description ?? null,
    setting: sc?.setting_summary ?? null,
    opening: sc?.opening_scene ?? null,
    cast: publicCast(game),
    map: sc ? { places: mapOf(sc, st?.mapEdits), positions: st?.positions ?? startPositions(sc) } : null,
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
    progress: game.status === 'generating' && game.progress ? {
      attempt: game.progress.attempt,
      draft: game.progress.draft,
      step: game.progress.step,
      seen: game.progress.seen,
      counts: game.progress.counts,
      startedAt: game.progress.startedAt,
      steps: GENERATION_STEPS.map(({ id, label }) => ({ id, label })),
    } : null,
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
  view.pending = st.pending[playerId] ?? null;
  view.clues = st.found[playerId].map((id) => {
    const c = game.scenario.clues.find((x) => x.id === id);
    return { id, name: c.name, shows: c.shows, destroyed: st.destroyed.includes(id) };
  });
  view.myVote = st.hintVote ? st.hintVote.votes[playerId] ?? null : null;
  view.myRoundVote = st.roundVote ? st.roundVote.votes[playerId] ?? null : null;
  view.publicPending = st.publicPending?.[playerId] ?? null;
  view.submission = st.submissions[playerId] ?? null;
  view.reveal = game.status === 'reveal' ? revealView(game) : null;
  return view;
}
