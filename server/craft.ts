// @ts-nocheck -- same shapes as story.ts
// Story craft: the checks that make a world a story, not only a fair puzzle. Each wanted thing has a field
// the world writer fills and a check here; problems go to the story check with the rest, one plain line each.
import { retells, setupPaidRound } from './game.ts';
import { ARTIFACT_FORMS, WRITTEN_FORMS } from './prompts.ts';

export { ARTIFACT_FORMS, WRITTEN_FORMS };

const CHANCE = /\b(chance|accident|accidentally|coincidence|by luck|luckily|happened to)\b/i;
const MIN_SETUPS = 4;
const MIN_REFRAMES = 3;

const wordsOf = (t) => String(t ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
const SMALL = new Set(['the', 'a', 'an', 'of', 'and', 'old', 'new']);
// Words every goal uses that say nothing about what it is about.
const GOAL_WORDS = new Set(['before', 'final', 'vote', 'make', 'sure', 'nobody', 'anyone', 'everyone', 'room', 'tonight', 'avoid', 'named', 'keep', 'from', 'that', 'this', 'your', 'with', 'into', 'without', 'being', 'their', 'them', 'they', 'what', 'about', 'game']);

// A world written before these fields existed (no setups list) skips every check.
export function craftIssues(s) {
  if (!s || !Array.isArray(s.setups)) return [];
  const out = [];
  const rounds = s.phases?.length ?? 1;
  const clues = s.clues ?? [];
  const clue = Object.fromEntries(clues.map((c) => [c.id, c]));
  const roundOfClue = (id) => Number(clue[id]?.reveal_round) || 1;
  const deduction = Object.fromEntries((s.key_deductions ?? []).map((k) => [k.id, k]));
  const roundOfDeduction = (id) => Math.max(1, ...(deduction[id]?.clue_ids ?? []).filter((c) => clue[c]).map(roundOfClue));
  // Where a detail is first seen: background, the opening and people's public lines are there from the start.
  const seenRound = (ref) => (clue[ref] ? roundOfClue(ref) : 0);
  const paidRound = (ref) => setupPaidRound(s, ref);

  // Cause and effect: every step of the truth is set off by something and leads somewhere.
  const steps = s.truth?.timeline ?? [];
  const stepIds = new Set(steps.map((t) => t?.id).filter(Boolean));
  const madeClue = new Set(clues.map((c) => c.from_step));
  const causedBy = new Set(steps.flatMap((t) => wordsOf(t?.because).filter((w) => stepIds.has(w))));
  let chance = 0;
  steps.forEach((t, i) => {
    const at = `truth.timeline[${i}] (${t?.id || 'no id'})`;
    if (!t?.id) out.push(`cause: truth.timeline[${i}] has no id; give every step an id (t1, t2...).`);
    if (!String(t?.because ?? '').trim()) out.push(`cause: ${at} has no because; say which step or whose want set it off.`);
    else if (CHANCE.test(t.because) || /^chance$/i.test(t.because.trim())) chance += 1;
    if (t?.id && !(t.leads_to ?? []).length && !madeClue.has(t.id) && !causedBy.has(t.id)) out.push(`cause: ${at} leads nowhere: no clue comes from it and no step follows from it; tie it to the crime or a goal, or cut it.`);
  });
  if (chance > 1) out.push(`cause: ${chance} steps of the truth happen by chance; at most one may. Give the rest a reason someone wanted.`);
  if (!String(s.why_tonight ?? '').trim()) out.push('cause: why_tonight is empty; say whose want made this happen tonight and not another night.');

  // Clues are things in the world with their own words, not summaries.
  clues.forEach((c, i) => {
    const at = `clues[${i}] (${c.id})`;
    if (!ARTIFACT_FORMS.includes(c.form)) out.push(`artifact: ${at}.form is "${c.form ?? ''}"; use one of ${ARTIFACT_FORMS.join(', ')}.`);
    if (!String(c.text ?? '').trim()) out.push(`artifact: ${at} has no text; write what players read or see: the note's own words, the ledger line, how the object looks.`);
    if (c.from_step && !stepIds.has(c.from_step)) out.push(`artifact: ${at}.from_step (${c.from_step}) is not a step of truth.timeline.`);
    else if (!c.from_step) out.push(`artifact: ${at} has no from_step; name the truth step that made it.`);
  });
  const written = clues.filter((c) => WRITTEN_FORMS.has(c.form));
  if (clues.length && written.length * 2 < clues.length) out.push(`artifact: only ${written.length} of ${clues.length} clues are written things (letters, notes, ledgers, receipts, labels, messages, records, photos); make at least half of them written, each in its writer's voice.`);
  for (let r = 1; r <= rounds; r += 1) {
    if (clues.some((c) => roundOfClue(c.id) === r) && !written.some((c) => roundOfClue(c.id) === r)) out.push(`artifact: round ${r} has no written clue; give it one document players can read.`);
  }
  if (clues.length && !clues.some((c) => c.form === 'absence')) out.push('artifact: no clue is an absence (the dog that did not bark, a cup nobody used); make one.');

  // Plant, then pay: what is shown on purpose is used, and only after it is shown.
  if (s.setups.length < MIN_SETUPS) out.push(`setup: ${s.setups.length} setups; it needs at least ${MIN_SETUPS}, at least 2 of them seen by round 1.`);
  else if (s.setups.filter((x) => (Number(x?.shown_round) || 0) <= 1).length < 2) out.push('setup: fewer than 2 setups are seen by round 1; plant more early.');
  s.setups.forEach((x, i) => {
    const at = `setups[${i}] (${x?.id || 'no id'})`;
    const paid = paidRound(x?.paid_by);
    if (paid === null) out.push(`setup: ${at} pays off in nothing; paid_by must be a clue id, a key deduction id or "round N".`);
    else if (paid < (Number(x?.shown_round) || 0)) out.push(`setup: ${at} is paid in round ${paid} before it is shown in round ${x.shown_round}.`);
  });
  const planted = s.setups.map((x) => new Set(wordsOf(x?.detail)));
  (s.key_objects ?? []).forEach((o, i) => {
    const key = wordsOf(o?.name).filter((w) => !SMALL.has(w));
    if (key.length && !planted.some((p) => key.every((w) => p.has(w)))) out.push(`setup: key_objects[${i}] (${o.name}) is shown to everyone but no setup pays it off; add one or cut the object.`);
  });

  // Reframes: early details that mean something else once the truth is out.
  const reframes = s.reframes ?? [];
  if (reframes.length < MIN_REFRAMES) out.push(`reframe: ${reframes.length} reframe${reframes.length === 1 ? '' : 's'}; it needs at least ${MIN_REFRAMES}, details seen early that a later clue turns around.`);
  reframes.forEach((x, i) => {
    if (!clue[x?.flipped_by]) out.push(`reframe: reframes[${i}].flipped_by (${x?.flipped_by ?? ''}) is not a clue id.`);
    else if (roundOfClue(x.flipped_by) <= seenRound(x.seen_in)) out.push(`reframe: reframes[${i}] is flipped by ${x.flipped_by} (round ${roundOfClue(x.flipped_by)}), not after it is seen (round ${seenRound(x.seen_in)}); flip it with a later clue.`);
  });

  // The turns are spread: in at least 2 rounds, one of them in the last two.
  const flips = [...new Set(reframes.filter((x) => clue[x?.flipped_by]).map((x) => roundOfClue(x.flipped_by)))];
  if (rounds >= 3 && reframes.length && flips.length < 2) out.push(`reframe: every reframe turns in round ${flips[0] ?? '?'}; spread them over at least 2 rounds so the game keeps turning.`);
  if (rounds >= 3 && reframes.length && !flips.some((r) => r >= rounds - 1)) out.push(`reframe: no reframe turns in the last two rounds; flip one there, with a clue that opens late.`);

  // A false solution the room believes by the middle, broken later, so the true answer is never plain early.
  if (Array.isArray(s.setups)) {
    const f = s.false_solution ?? {};
    const mid = Math.ceil(rounds / 2);
    const built = (f.built_from ?? []).filter((id) => clue[id]);
    const people = new Set([...(s.players ?? []), ...(s.npcs ?? [])].map((p) => p.id));
    if (!people.has(f.points_at) || (s.truth?.culprit_ids ?? []).includes(f.points_at)) out.push(`false: false_solution.points_at (${f.points_at ?? ''}) must be an innocent person's id.`);
    if (built.length < 2) out.push('false: false_solution.built_from needs 2 or more real clue ids that make the wrong answer convincing.');
    else if (built.some((id) => roundOfClue(id) > mid)) out.push(`false: false_solution is built from clues that open after round ${mid}; the room must believe it by the middle.`);
    if (!clue[f.broken_by]) out.push(`false: false_solution.broken_by (${f.broken_by ?? ''}) is not a clue id.`);
    else {
      const breaks = roundOfClue(f.broken_by);
      if (built.length && breaks <= Math.max(...built.map(roundOfClue))) out.push(`false: false_solution is broken in round ${breaks}, before or with the clues that build it; break it later.`);
      const culpritDeductions = (s.key_deductions ?? []).filter((k) => k.about === 'culprit' && (k.clue_ids ?? []).some((id) => clue[id]));
      if (culpritDeductions.length && culpritDeductions.every((k) => Math.max(...k.clue_ids.filter((id) => clue[id]).map(roundOfClue)) < breaks)) out.push(`false: the case against the culprit is complete before the false solution breaks (round ${breaks}); hold one culprit clue until then or later.`);
    }
  }

  // Every culprit has a chain of their own: two clues that point at them, one that cannot be destroyed.
  for (const id of s.truth?.culprit_ids ?? []) {
    const x = (s.suspects ?? []).find((y) => y?.character_id === id);
    const own = (x?.pointer_clue_ids ?? []).filter((c) => clue[c]);
    if (own.length < 2) out.push(`proof: culprit ${id} has ${own.length} clue${own.length === 1 ? '' : 's'} pointing at them; give each culprit 2 or more, so each can be proved, not guessed.`);
    else if (own.every((c) => clue[c].can_be_destroyed)) out.push(`proof: every clue pointing at culprit ${id} can be destroyed; make one of them a thing that survives.`);
  }

  // The pool stays open: two innocents still uncleared after the second-to-last round's clues, and the false
  // solution's target never cleared before it breaks. Otherwise elimination names the culprit early.
  if (rounds >= 3) {
    const culpritsSet = new Set(s.truth?.culprit_ids ?? []);
    const clearedBy = (x) => Math.min(...(x?.cleared_by_clue_ids ?? []).filter((id) => clue[id]).map(roundOfClue), Infinity);
    const innocents = (s.suspects ?? []).filter((x) => x && !culpritsSet.has(x.character_id));
    const open = innocents.filter((x) => clearedBy(x) >= rounds - 1);
    if (innocents.length >= 2 && open.length < 2) out.push(`pool: only ${open.length} innocent${open.length === 1 ? '' : 's'} still uncleared after round ${rounds - 2}; keep at least 2 suspects open until round ${rounds - 1} or later (move a clearing clue later) so the culprit is not plain early.`);
    const target = (s.suspects ?? []).find((x) => x?.character_id === s.false_solution?.points_at);
    const breaks = clue[s.false_solution?.broken_by] ? roundOfClue(s.false_solution.broken_by) : null;
    if (target && breaks && clearedBy(target) < breaks) out.push(`pool: the false solution's target (${target.character_id}) is cleared in round ${clearedBy(target)}, before it breaks in round ${breaks}; clear them with the breaking clue or later.`);
  }
  if (rounds >= 3 && reframes.length && !reframes.some((x) => clue[x?.flipped_by] && roundOfClue(x.flipped_by) === rounds)) out.push(`reframe: nothing turns in the last round (${rounds}); flip one there, ideally about a culprit, so the end is a turn and not only a broken alibi.`);

  // Secret goals move the main story: what a player chases is itself evidence or sits where evidence is.
  const evidence = new Set(clues.flatMap((c) => wordsOf(`${c.name} ${c.text ?? ''} ${c.shows}`)).filter((w) => w.length >= 4 && !SMALL.has(w)));
  const names = new Set([...(s.players ?? []).map((p) => p.character_name), ...(s.npcs ?? []).map((n) => n.name), ...(s.locations ?? []).map((l) => l.name)].flatMap(wordsOf));
  const goals = (s.players ?? []).filter((p) => String(p.goal ?? '').trim());
  const joined = goals.filter((p) => wordsOf(p.goal).filter((w) => w.length >= 4 && !names.has(w) && !GOAL_WORDS.has(w)).some((w) => evidence.has(w)));
  if (goals.length >= 2 && joined.length * 2 < goals.length) out.push(`goal: only ${joined.length} of ${goals.length} secret goals touch a clue; make the thing each player wants to get, hide or show part of the evidence.`);

  // Every GM character who matters is up to something, round by round.
  (s.npcs ?? []).forEach((n, i) => {
    if (n?.importance !== 'important') return;
    const plan = n.agenda?.plan ?? [];
    if (plan.length < 2) out.push(`agenda: npcs[${i}] (${n.id}).agenda has ${plan.length} step${plan.length === 1 ? '' : 's'}; give them a plan of 2 or 3 steps, one per round, that move the story if nobody stops them.`);
    for (const p of plan) {
      const r = Number(p?.round);
      if (!(r >= 1 && r <= rounds)) out.push(`agenda: npcs[${i}] (${n.id}).agenda has a step in round ${p?.round}; there are ${rounds} rounds.`);
    }
  });

  // Hard rules of the world, learned before they are needed.
  const rules = s.world_rules ?? [];
  if (!rules.length) out.push('rule: world_rules is empty; give the world 1 to 3 hard rules (a lock, a habit, a custom, a power) with a cost or limit, that a deduction uses.');
  rules.forEach((r, i) => {
    if (!deduction[r?.used_in]) out.push(`rule: world_rules[${i}].used_in (${r?.used_in ?? ''}) is not a key deduction id.`);
    else if (seenRound(r.shown_by) > roundOfDeduction(r.used_in)) out.push(`rule: world_rules[${i}] is shown in round ${seenRound(r.shown_by)}, after ${r.used_in} needs it (round ${roundOfDeduction(r.used_in)}); show it earlier.`);
  });

  // Fair proof: what ties the culprit to the crime or the motive can be found without searching the culprit.
  const culprits = new Set(s.truth?.culprit_ids ?? []);
  (s.key_deductions ?? []).forEach((k, i) => {
    const own = (k.clue_ids ?? []).filter((id) => clue[id]);
    if (['culprit', 'motive'].includes(k.about) && own.length && own.every((id) => culprits.has(clue[id].where))) out.push(`proof: key_deductions[${i}] (${k.id}) rests only on clues the culprit carries; put one where players can find it without searching them.`);
  });

  // Every lie a GM character tells can be caught by a thing players find.
  if (Array.isArray(s.lies_caught)) {
    (s.npcs ?? []).forEach((n, i) => {
      if (!String(n?.lies ?? '').trim()) return;
      const catches = s.lies_caught.filter((x) => x?.npc_id === n.id);
      if (!catches.length) out.push(`lie: npcs[${i}] (${n.id}) tells lies that nothing catches; add lies_caught with the clue that breaks each one.`);
      for (const x of catches) if (!clue[x.caught_by]) out.push(`lie: lies_caught for ${n.id} names ${x.caught_by ?? ''}, which is not a clue id.`);
    });
  }

  // One document in two halves, found apart: only together do they say the whole thing.
  if (clues.some((c) => c.text)) {
    const pairs = clues.filter((c) => clue[c.pairs_with] && clue[c.pairs_with].pairs_with === c.id);
    if (!pairs.length) out.push('split: no document is split in two; set pairs_with on two halves found in different places or rounds.');
    for (const c of pairs) {
      const o = clue[c.pairs_with];
      if (c.id < o.id && c.where === o.where && roundOfClue(c.id) === roundOfClue(o.id)) out.push(`split: ${c.id} and ${o.id} are halves found in the same place and round; put them apart.`);
    }
  }

  // A round's beat is an event, never a clue handed to the whole room.
  (s.phases ?? []).forEach((ph, i) => {
    for (const c of clues) {
      if (c.importance === 'essential' && retells(ph?.planned_beat, c.shows)) out.push(`beat: phases[${i}].planned_beat hands out clue ${c.id} to everyone; make the beat an event that opens a way to it.`);
    }
  });
  return out;
}

// The dressing pass joins the world: each clue keeps its facts and gains its own words; setups, reframes and
// rules are added; each important GM character gets a plan. Unknown ids and empty answers are left out.
export function applyDress(s, dress) {
  if (!s || !dress || typeof dress !== 'object') return 0;
  let n = 0;
  for (const d of dress.clues ?? []) {
    const c = (s.clues ?? []).find((x) => x.id === d?.id);
    if (!c || !String(d.text ?? '').trim()) continue;
    Object.assign(c, { form: ARTIFACT_FORMS.includes(d.form) ? d.form : 'object', author: String(d.author ?? ''), written_at: String(d.written_at ?? ''), text: String(d.text), ...(String(d.pairs_with ?? '').trim() ? { pairs_with: String(d.pairs_with).trim() } : {}) });
    n += 1;
  }
  if (dress.false_solution && typeof dress.false_solution === 'object' && String(dress.false_solution.believed ?? '').trim()) {
    const f = dress.false_solution;
    s.false_solution = { believed: String(f.believed), points_at: String(f.points_at ?? ''), built_from: (f.built_from ?? []).map(String), broken_by: String(f.broken_by ?? '') };
    n += 1;
  }
  for (const key of ['setups', 'reframes', 'world_rules', 'lies_caught']) {
    if (!Array.isArray(dress[key])) continue;
    s[key] = dress[key].filter((x) => x && typeof x === 'object');
    n += s[key].length;
  }
  for (const a of dress.agendas ?? []) {
    const npc = (s.npcs ?? []).find((x) => x.id === a?.npc_id);
    if (!npc || npc.importance !== 'important') continue;
    npc.agenda = { wants: String(a.wants ?? ''), plan: (a.plan ?? []).filter((p) => p && String(p.does ?? '').trim()), leaves: String(a.leaves ?? '') };
    // A secret that cracks in round 1 is no secret, and one past the last round never comes out.
    const crack = Number(a.cracks?.round);
    if (Number.isInteger(crack) && crack >= 2 && crack <= (s.phases?.length ?? 1) && String(a.cracks?.how ?? '').trim()) npc.agenda.cracks = { round: crack, how: String(a.cracks.how).trim() };
    n += 1;
  }
  return n;
}
