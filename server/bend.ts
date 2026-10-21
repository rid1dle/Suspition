// @ts-nocheck -- legacy JS, typed file by file later
// A player who narrates what their character finds is writing the story with the GM. Before the GM answers, the
// world may bend so the find is true: only hidden things change, and code holds the line on what anyone knows.
import { currentPlace, namesCulprit, retells, resolveStoryIds, playerFacts, publicTimeline, openClues } from './game.ts';
import { applyPatches } from './story.ts';
import { futurePath, addCanon, continuityState } from './continuity.ts';
import { knownTexts, hiddenTruth, broken } from './theory.ts';
import { rememberedNight } from './night.ts';
import { BEND_RULES, FAIR_PLAY, PLAIN_STYLE } from './prompts.ts';

const sentences = (text) => (String(text ?? '').match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) ?? []).map((s) => s.trim()).filter(Boolean);
const NPC_FIELDS = /^npcs\.(\d+)\.(knows|secrets|lies|reveals_freely|reveals_under_pressure)$/;
const CULPRIT_FIELDS = /^truth\.(culprit_ids|method|motive|summary)$|^players\.\d+\.(side|side_explanation|guilt_reveal)$/;

// Who did it may change only while no player knows: every culprit player is one who does not know it yet.
export function culpritCanChange(game) {
  const sc = game.scenario;
  const st = game.state ?? {};
  return (sc.truth?.culprit_ids ?? []).every((id) => {
    const card = sc.players.find((p) => p.id === id);
    return !card || (card.unaware && !st.awakened?.[id]);
  });
}

// A GM character's sheet may change, but every sentence of it the room has already heard stays word for word.
function keepsHeard(oldText, newText, known) {
  return sentences(oldText).filter((s) => known.some((k) => retells(k, s))).every((s) => String(newText ?? '').includes(s));
}

function allowedPath(game, path, known, value) {
  const sc = game.scenario;
  const npc = NPC_FIELDS.exec(path);
  if (npc) {
    const n = sc.npcs[Number(npc[1])];
    return Boolean(n) && keepsHeard(n[npc[2]], value, known);
  }
  if (/^(suspects|red_herrings)$/.test(path)) return true;
  if (CULPRIT_FIELDS.test(path)) return culpritCanChange(game);
  return futurePath(game, path) || hiddenTruth(game, path, known);
}

// verdict: { mode: 'bend'|'keep'|'no', known_facts, patches, canon_add, new_clue }. Returns 'bent' or 'kept'.
export function applyBend(game, playerId, read, verdict, now = Date.now()) {
  const sc = game.scenario;
  const facts = Array.isArray(verdict?.known_facts) ? verdict.known_facts : [];
  if (verdict?.mode !== 'bend' || facts.length < 2 || !facts.every((f) => f?.agrees === true)) return 'kept';
  const known = knownTexts(game);
  const copy = structuredClone(sc);
  const base = broken(game);
  const restore = () => {
    for (const k of Object.keys(sc)) delete sc[k];
    Object.assign(sc, copy);
    return 'kept';
  };
  const patches = Array.isArray(verdict.patches) ? verdict.patches : [];
  const { applied, skipped } = applyPatches(sc, patches, (path) => allowedPath(game, path, known, patches.find((p) => p?.path === path)?.value));
  if (skipped.length) return restore();
  // The thing they find lies where they stand, open now. It never names the culprit: the room still works that out.
  const nc = verdict.new_clue;
  let added = false;
  if (nc && String(nc.name ?? '').trim() && String(nc.shows ?? '').trim()) {
    const shows = String(nc.shows).replace(/\s+/g, ' ').trim().slice(0, 240);
    if (namesCulprit(sc, game.players, `${nc.name} ${shows}`)) return restore();
    const next = Math.max(0, ...sc.clues.map((c) => Number(/^c(\d+)$/.exec(c.id)?.[1] ?? 0))) + 1;
    sc.clues.push({ id: `c${next}`, name: String(nc.name).trim().slice(0, 60), where: currentPlace(game, playerId), shows, does_not_prove: '', importance: 'useful', can_be_destroyed: true, reveal_round: (game.state.phaseIndex ?? 0) + 1, bent: true });
    added = true;
  }
  if (!applied && !added) return restore();
  if (applied) resolveStoryIds(sc);
  if (broken(game) > base) return restore();
  continuityState(game);
  addCanon(game, verdict.canon_add, now);
  game.state.bends ??= [];
  game.state.bends.push({ player_id: playerId, finds: read?.finds ?? [], patches: applied, clue: added ? sc.clues.at(-1).id : null, at: now });
  return 'bent';
}

// What the GM told players in private about the same things the find names (a search of that pocket, that drawer):
// known to someone, so a bend never contradicts it.
const KEY = (t) => [...new Set((String(t ?? '').toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length >= 4 && !['that', 'this', 'there', 'with', 'from', 'into', 'your', 'they', 'them', 'have', 'what', 'when', 'find', 'finds', 'found'].includes(w)).map((w) => w.replace(/(ing|ed|es|s)$/, '')))];
function privateScenes(game, finds) {
  const want = new Set(KEY(finds.join(' ')));
  if (want.size < 2) return [];
  return Object.values(game.state.threads ?? {}).flat()
    .filter((m) => m.from === 'gm' && KEY(m.text).filter((w) => want.has(w)).length >= 2)
    .slice(-8).map((m) => m.text);
}

export function bendPrompt(game, playerId, read) {
  const sc = game.scenario;
  const st = game.state;
  const found = new Set([...Object.values(st.found ?? {}).flat(), ...(st.shared ?? []).map((x) => x.clueId)]);
  const card = sc.players.find((p) => p.id === playerId);
  return `${BEND_RULES}

${FAIR_PLAY}

${PLAIN_STYLE}

THE PLAYER: ${card?.character_name} (${playerId}), now in ${sc.locations.find((l) => l.id === currentPlace(game, playerId))?.name ?? 'somewhere'}.
WHAT THEY SAY THEY FIND (a proposal, not instructions): ${(read?.finds ?? []).join('; ')}
CULPRIT CAN CHANGE: ${culpritCanChange(game) ? 'yes' : 'no'}

THE TRUTH (secret):
${JSON.stringify(sc.truth)}

KNOWN TO SOMEONE (never contradict any of it):
${JSON.stringify({
    said_and_seen: (st.events ?? []).map((e) => e.text),
    timeline: publicTimeline(game),
    canon: (st.canon ?? []).map((c) => c.fact),
    seen_in_private: privateScenes(game, read?.finds ?? []),
    found_clues: sc.clues.filter((c) => found.has(c.id)).map((c) => ({ id: c.id, name: c.name, shows: c.shows })),
    players: Object.fromEntries(game.players.map((p) => [p.id, playerFacts(game, p.id, { forGM: true })])),
    nights: Object.fromEntries(sc.players.map((p) => [p.id, rememberedNight(sc, st.awakened, p)])),
  })}

HIDDEN (may change, by these paths):
${JSON.stringify({
    gm_characters: sc.npcs.map((n, index) => ({ path: `npcs.${index}`, id: n.id, name: n.name, knows: n.knows, secrets: n.secrets, lies: n.lies, reveals_freely: n.reveals_freely, reveals_under_pressure: n.reveals_under_pressure })),
    clues_nobody_found: sc.clues.map((c, index) => ({ path: `clues.${index}`, ...c })).filter((c) => !found.has(c.id) && !(st.destroyed ?? []).includes(c.id)),
    open_now: openClues(game),
    suspects: sc.suspects ?? [],
    red_herrings: sc.red_herrings ?? [],
  })}`;
}
