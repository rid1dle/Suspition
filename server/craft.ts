// @ts-nocheck -- same shapes as story.ts
// Story craft: the checks that make a world a story, not only a fair puzzle. Each wanted thing has a field
// the world writer fills and a check here; problems go to the story check with the rest, one plain line each.
import { retells, setupPaidRound } from './game.ts';
import { ARTIFACT_FORMS, WRITTEN_FORMS } from './prompts.ts';

export { ARTIFACT_FORMS, WRITTEN_FORMS };

const CHANCE = /\b(chance|accident|accidentally|coincidence|by luck|luckily|happened to)\b/i;
const MIN_SETUPS = 4;
const MIN_REFRAMES = 2;

const wordsOf = (t) => String(t ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
const SMALL = new Set(['the', 'a', 'an', 'of', 'and', 'old', 'new']);

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

  // A round's beat is an event, never a clue handed to the whole room.
  (s.phases ?? []).forEach((ph, i) => {
    for (const c of clues) {
      if (c.importance === 'essential' && retells(ph?.planned_beat, c.shows)) out.push(`beat: phases[${i}].planned_beat hands out clue ${c.id} to everyone; make the beat an event that opens a way to it.`);
    }
  });
  return out;
}
