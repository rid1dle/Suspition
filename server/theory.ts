// @ts-nocheck -- legacy JS, typed file by file later
// A wrong answer to a round question is the room's theory. Before the next round the GM either folds it into the
// story (it becomes true, changing only what nobody has seen) or leads the room back to what really happened.
// Code holds the line on both: a fold that touches anything known, any person, or breaks the world becomes a lead.
import { roundQuestion, addRound, addEvent, addFacts, mentions, namesCulprit, namesAnyOf, retells, validateScenario, clueWhereErrors, playerFacts, publicTimeline, resolveStoryIds } from './game.ts';
import { applyPatches, storyIssues } from './story.ts';
import { futurePath, addCanon, continuityState } from './continuity.ts';
import { THEORY_RULES, FAIR_PLAY, PLAIN_STYLE } from './prompts.ts';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export const pendingTheory = (game) => (game.state?.roundResults ?? []).find((r) => r.theory === 'open') ?? null;

// Everything any player has seen, heard or been told: the public feed, the timeline, found clues, every card and every private thread.
function knownTexts(game) {
  const sc = game.scenario;
  const st = game.state;
  const found = new Set([...Object.values(st.found ?? {}).flat(), ...(st.shared ?? []).map((x) => x.clueId)]);
  const cards = sc.players.flatMap((p) => [p.public_info, p.private_info, p.starting_knowledge, p.backstory, p.alibi_statement, ...(p.night ?? []).map((n) => `${n.time} ${n.where} ${n.doing}`)]);
  return [
    sc.opening_scene, ...(sc.background ?? []),
    ...(st.events ?? []).map((e) => e.text),
    ...publicTimeline(game).map((t) => `${t.time ?? ''} ${t.event}`),
    ...(st.canon ?? []).map((c) => c.fact),
    ...(sc.clues ?? []).filter((c) => found.has(c.id)).map((c) => c.shows),
    ...cards,
    ...sc.npcs.flatMap((n) => [n.public_info, n.alibi_statement]),
    ...Object.values(st.threads ?? {}).flat().map((m) => m.text),
  ].map((t) => String(t ?? '')).filter(Boolean);
}

// A step of the true night may change only while nobody has heard of it.
function hiddenTruth(game, path, known) {
  const m = /^truth\.(timeline|whereabouts)\.(\d+)\.(time|event|location_id|doing)$/.exec(path);
  if (!m) return false;
  const entry = game.scenario.truth?.[m[1]]?.[Number(m[2])];
  if (!entry) return false;
  const text = String(entry.event ?? entry.doing ?? '');
  return !known.some((k) => retells(k, text));
}

const broken = (game) => {
  const sc = game.scenario;
  return validateScenario(sc, { playerCount: game.players.length, phases: sc.phases.length, hints: 0 }).length + clueWhereErrors(sc).length
    + storyIssues(sc, { players: game.players, difficulty: game.setup?.difficulty }).length;
};

const cleanLine = (game, text) => {
  const line = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
  return line && !namesCulprit(game.scenario, game.players, line) ? line : '';
};

function tryFold(game, r, q, v) {
  const sc = game.scenario;
  const facts = Array.isArray(v?.known_facts) ? v.known_facts : [];
  if (v?.mode !== 'fold' || facts.length < 2 || !facts.every((f) => f?.agrees === true)) return false;
  // A question about people never folds, whoever its options name: folding only some would mark the culprit's.
  const everyone = [...sc.players, ...sc.npcs].map((c) => c.id);
  if ([q.question, ...q.options].some((t) => namesAnyOf(sc, game.players, everyone, t))) return false;
  const copy = structuredClone(sc);
  const base = broken(game);
  const known = knownTexts(game);
  const { applied, skipped } = applyPatches(sc, v.patches, (path) => futurePath(game, path) || hiddenTruth(game, path, known));
  if (applied) resolveStoryIds(sc);
  if (skipped.length || broken(game) > base) {
    for (const k of Object.keys(sc)) delete sc[k];
    Object.assign(sc, copy);
    return false;
  }
  return true;
}

export function applyTheory(game, verdict, now = Date.now()) {
  const st = game.state;
  const sc = game.scenario;
  const r = pendingTheory(game);
  st.theorizing = false;
  if (!r) return null;
  const q = roundQuestion(game, r.phaseIndex);
  if (q && tryFold(game, r, q, verdict)) {
    const ph = sc.phases[r.phaseIndex];
    const at = (ph.options ?? []).map((o) => String(o ?? '').trim()).indexOf(r.pickedText);
    if (at >= 0) ph.answer_index = at;
    continuityState(game);
    addCanon(game, verdict.canon_add, now);
    const line = cleanLine(game, verdict.line);
    Object.assign(r, { correct: true, theory: 'folded' });
    addEvent(game, `That is right!${line ? ` ${line}` : ''}`, 'round', now);
    if (line) addFacts(game, mentions(game, line).map((id) => ({ person: id, fact: line })), 'round', now);
    st.suspicion = clamp(st.suspicion + 10, 0, 100);
    return r;
  }
  r.theory = 'led';
  st.suspicion = clamp(st.suspicion - 10, 0, 100);
  const lr = verdict?.lead_round;
  const options = (lr?.options ?? []).map((o) => String(o ?? '').trim()).filter(Boolean);
  if (String(lr?.name ?? '').trim() && (String(lr?.objective ?? '').trim() || (lr.question && options.length >= 2))) {
    const added = addRound(game, { name: lr.name, objective: lr.objective, planned_beat: `Lead the room back to what really happened. ${String(lr.objective ?? '').trim()}`.trim(), question: lr.question, options, answer_index: lr.answer_index, reward: '', wrong_nudge: '' }, now, { next: true });
    if (added) r.roundAdded = true;
  }
  // The clue that shows the real answer opens in the very next round.
  const clue = (sc.clues ?? []).find((c) => c.id === verdict?.lead_clue_id);
  const found = new Set(Object.values(st.found ?? {}).flat());
  const next = r.phaseIndex + 2;
  if (clue && !found.has(clue.id) && !(st.destroyed ?? []).includes(clue.id) && Number(clue.reveal_round) > next) clue.reveal_round = next;
  addEvent(game, cleanLine(game, verdict?.line) || `Something does not fit yet.${q?.nudge ? ` ${q.nudge}` : ''}`, 'round', now);
  return r;
}

export function theoryPrompt(game) {
  const sc = game.scenario;
  const st = game.state;
  const r = pendingTheory(game);
  const q = r ? roundQuestion(game, r.phaseIndex) : null;
  const found = new Set([...Object.values(st.found ?? {}).flat(), ...(st.shared ?? []).map((x) => x.clueId)]);
  const hidden = {
    truth_timeline: (sc.truth?.timeline ?? []).map((t, index) => ({ index, ...t })),
    truth_whereabouts: (sc.truth?.whereabouts ?? []).map((w, index) => ({ index, ...w })),
    clues_nobody_found: (sc.clues ?? []).map((c, index) => ({ index, ...c })).filter((c) => !found.has(c.id) && !(st.destroyed ?? []).includes(c.id)),
    gm_characters: sc.npcs.map((n, index) => ({ index, id: n.id, name: n.name, knows: n.knows, lies: n.lies })),
    rounds_to_come: sc.phases.map((ph, index) => ({ index, ...ph })).filter((ph) => ph.index > st.phaseIndex),
  };
  return `${THEORY_RULES}

${FAIR_PLAY}

${PLAIN_STYLE}

THE ROUND QUESTION: ${q?.question ?? ''}
OPTIONS: ${JSON.stringify(q?.options ?? [])}
THE TRUE ANSWER (secret): ${q?.options?.[q.answer] ?? ''}
THE ROOM'S ANSWER: ${r?.pickedText ?? ''}

THE TRUTH (secret; who did it, how and why never change):
${JSON.stringify({ culprit_ids: sc.truth?.culprit_ids, method: sc.truth?.method, motive: sc.truth?.motive, crime: sc.truth?.crime, summary: sc.truth?.summary })}

KNOWN (what players have seen, heard or been told; never contradict any of it):
${JSON.stringify({
    said_and_seen: (st.events ?? []).filter((e) => e.kind !== 'opening').map((e) => e.text),
    timeline: publicTimeline(game),
    canon: (st.canon ?? []).map((c) => c.fact),
    found_clues: (sc.clues ?? []).filter((c) => found.has(c.id)).map((c) => ({ id: c.id, name: c.name, shows: c.shows })),
    players: Object.fromEntries(game.players.map((p) => [p.id, playerFacts(game, p.id, { forGM: true })])),
  })}

HIDDEN (may change in a fold, by these indexes):
${JSON.stringify(hidden)}`;
}
