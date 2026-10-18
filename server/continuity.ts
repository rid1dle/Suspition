// @ts-nocheck -- legacy JS, typed file by file later
import { roundNumber, totalRounds, roundCap, addRound, dropPuppeting, validateScenario, clueWhereErrors, playerWords, eventForGM, offerToPlayer, playerFacts } from './game.ts';
import { applyPatches, guardedPatches } from './story.ts';
import { CONTINUITY_RULES, FAIR_PLAY, PLAIN_STYLE } from './prompts.ts';

export const CANON_MAX = 60;
export const CHECK_AFTER_ANSWERS = 8;
const CORRECTION_WORDS = 40;

export function continuityState(game) {
  const st = game.state;
  st.canon ??= [];
  st.continuity ??= { lastAt: 0, answers: 0, log: [] };
  return st.continuity;
}

const foundClues = (game) => new Set([...Object.values(game.state.found ?? {}).flat(), ...(game.state.shared ?? []).map((x) => x.clueId)]);

// Patches during play may only touch what is still to come: later rounds, unfound clues, unused hints, GM characters' knowledge.
function futurePath(game, path) {
  const st = game.state;
  let m = /^phases\.(\d+)\.(planned_beat|question|options|answer_index|reward|wrong_nudge)$/.exec(path);
  // During a round change the next round's opening is already being written, so it is not "future" any more.
  if (m) return Number(m[1]) > st.phaseIndex + (st.transitioning ? 1 : 0);
  m = /^clues\.(\d+)\.(where|reveal_round|shows)$/.exec(path);
  if (m) {
    const clue = game.scenario.clues[Number(m[1])];
    return Boolean(clue) && !foundClues(game).has(clue.id) && !st.destroyed.includes(clue.id);
  }
  m = /^hint_ladder\.(\d+)\.text$/.exec(path);
  if (m) return Number(m[1]) >= (st.hintCursor ?? 0);
  return /^npcs\.\d+\.(knows|lies)$/.test(path);
}

function addBackupClue(game, value, now) {
  const sc = game.scenario;
  const st = game.state;
  const c = typeof value === 'string' ? JSON.parse(value) : value;
  const lost = sc.clues.find((x) => x.id === c?.replaces);
  if (!lost || lost.importance !== 'essential' || !st.destroyed.includes(lost.id)) throw new Error('only an essential clue that was destroyed gets a backup');
  const backups = (st.continuity.backups ??= {});
  if (backups[lost.id]) throw new Error('that clue already has a backup');
  const next = Math.max(0, ...sc.clues.map((x) => Number(/^c(\d+)$/.exec(x.id)?.[1] ?? 0))) + 1;
  const id = `c${next}`;
  const round = Math.max(Number(c.reveal_round) || 0, st.phaseIndex + 1);
  sc.clues.push({ id, name: String(c.name ?? '').slice(0, 80), where: String(c.where ?? '').trim(), shows: String(c.shows ?? '').trim(), does_not_prove: String(c.does_not_prove ?? '').trim(), importance: 'essential', can_be_destroyed: false, reveal_round: round });
  for (const k of sc.key_deductions ?? []) if (k.clue_ids?.includes(lost.id)) k.clue_ids.push(id);
  backups[lost.id] = { id, at: now };
}

const structural = (game) => {
  const sc = game.scenario;
  return validateScenario(sc, { playerCount: game.players.length, phases: sc.phases.length, hints: 0 }).length + clueWhereErrors(sc).length;
};

function patchPlan(game, patches, now) {
  const c = game.state.continuity;
  // The world and the backup record are undone together.
  const target = {
    scenario: () => game.scenario,
    snapshot: () => structuredClone({ scenario: game.scenario, backups: c.backups ?? {} }),
    restore: (copy) => {
      game.scenario = copy.scenario;
      c.backups = copy.backups;
    },
  };
  const apply = (p) => {
    if (String(p?.path ?? '').trim() !== 'clues.+') return applyPatches(game.scenario, [p], (path) => futurePath(game, path));
    try {
      addBackupClue(game, p.value, now);
      return { applied: 1, skipped: [] };
    } catch (err) {
      return { applied: 0, skipped: [`clues.+: ${err.message}`] };
    }
  };
  return guardedPatches(target, patches, apply, () => structural(game));
}

function addCanon(game, items, now) {
  const st = game.state;
  const ids = new Set([...game.scenario.players, ...game.scenario.npcs].map((c) => c.id));
  let added = 0;
  for (const item of items ?? []) {
    const fact = String(item?.fact ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!fact || st.canon.some((c) => c.fact === fact)) continue;
    st.canon.push({ fact, about: (item.about ?? []).filter((id) => ids.has(id)), public: item.public === true, round: roundNumber(game), at: now });
    added += 1;
  }
  while (st.canon.length > CANON_MAX) {
    const [a, b] = st.canon.splice(0, 2);
    st.canon.unshift({ fact: `${a.fact} ${b.fact}`, about: [...new Set([...a.about, ...b.about])], public: a.public && b.public, round: a.round, at: a.at });
  }
  return added;
}

// A GM character fixes their own mistake inside the story: out loud as a ripple, or as a whisper to one player.
function correct(game, items, now) {
  const st = game.state;
  let sent = 0;
  for (const c of items ?? []) {
    const npc = game.scenario.npcs.find((n) => n.id === c?.speaker);
    const words = String(c?.text ?? '').trim().replace(/^["“]|["”]$/g, '');
    const clean = dropPuppeting(game, null, words, { others: true }).text.split(/\s+/).slice(0, CORRECTION_WORDS).join(' ');
    if (!npc || !clean) continue;
    const line = `${npc.name}: "${clean}"`;
    if (c.to === 'table') st.events.push({ at: now, phase: st.phaseIndex, kind: 'ripple', text: line });
    else if (st.threads[c.to]) st.threads[c.to].push({ from: 'whisper', text: line, at: now });
    else continue;
    sent += 1;
  }
  return sent;
}

export function applyContinuity(game, result, now = Date.now()) {
  continuityState(game);
  const canon = addCanon(game, result?.canon_add, now);
  const corrections = correct(game, result?.corrections, now);
  const { applied, skipped } = patchPlan(game, result?.patches, now);
  const offers = (result?.offers ?? []).filter((o) => offerToPlayer(game, o?.player_id, o?.text, o?.choice, now)).length;
  const extra = (result?.extra_rounds ?? [])[0];
  const rounds = extra && addRound(game, extra, now) ? 1 : 0;
  return { canon, corrections, applied, skipped, offers, rounds };
}

// The truth, what is still to come, the canon, and everything said since the last check.
export function continuityPrompt(game) {
  const sc = game.scenario;
  const st = game.state;
  const since = continuityState(game).lastAt;
  const found = foundClues(game);
  const plan = {
    round_now: roundNumber(game),
    rounds_in_all: totalRounds(game),
    rounds_you_may_add: game.status === 'playing' ? Math.max(0, roundCap(game) - totalRounds(game)) : 0,
    rounds_to_come: sc.phases.map((ph, index) => ({ index, ...ph })).filter((ph) => ph.index > st.phaseIndex),
    clues_not_found: sc.clues.map((c, index) => ({ index, ...c })).filter((c) => !found.has(c.id) && !st.destroyed.includes(c.id)),
    clues_destroyed: st.destroyed,
    hints_not_given: sc.hint_ladder.map((h, index) => ({ index, text: h.text })).filter((h) => h.index >= (st.hintCursor ?? 0)),
    gm_characters: sc.npcs.map((n, index) => ({ index, id: n.id, name: n.name, knows: n.knows, lies: n.lies })),
    key_deductions: sc.key_deductions,
  };
  const said = {
    in_the_room: st.events.filter((e) => e.at > since && e.kind !== 'opening').map((e) => (e.kind === 'qa' ? `${e.by} asked out loud: ${e.read ? playerWords(e.read, e.q, 'public') : e.q} Answer: ${e.text}` : eventForGM(e))),
    private: Object.fromEntries(Object.entries(st.threads).map(([pid, msgs]) => [pid, msgs.filter((m) => m.at > since).map((m) => `${m.from}: ${m.from === 'you' ? playerWords(m.read, m.text, 'move') : m.text}`)])),
    moments: (st.moments ?? []).filter((m) => (m.at ?? 0) > since).map((m) => ({ player_id: m.player_id, line: m.line, result: m.status })),
  };
  return `${CONTINUITY_RULES}

${FAIR_PLAY}

${PLAIN_STYLE}

THE TRUTH (secret):
${JSON.stringify(sc.truth)}

ESTABLISHED FACTS (canon):
${JSON.stringify(st.canon.map((c) => c.fact))}

THE PLAN STILL TO COME:
${JSON.stringify(plan)}

SAID AND DONE SINCE THE LAST CHECK:
${JSON.stringify(said)}

PLAYER FACTS (each player's own card and what they did or said; the only sources for what their character did):
${JSON.stringify(Object.fromEntries(game.players.map((p) => [p.id, playerFacts(game, p.id, { forGM: true })])))}

QUESTIONS WAITING FOR A PLAYER (nobody may mention these yet):
${JSON.stringify((st.offers ?? []).filter((o) => o.status === 'open').map((o) => ({ player_id: o.player_id, text: o.text })))}`;
}
