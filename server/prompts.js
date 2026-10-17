import { ROOTS, MODES, PALETTES, PERCUSSION } from '../public/music-theory.js';

export const LENGTHS = {
  short: { phases: 3, minutes: 10, questions: 3 },
  standard: { phases: 4, minutes: 15, questions: 3 },
  long: { phases: 5, minutes: 20, questions: 4 },
};

const str = { type: 'string' };
const strArr = { type: 'array', items: str };
const obj = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const messages = { type: 'array', items: obj({ player_id: str, text: str }) };

export const SCENARIO_SCHEMA = obj({
  title: str,
  setting_summary: str,
  background: strArr,
  public_timeline: { type: 'array', items: obj({ order: { type: 'integer' }, time: str, event: str, reveal_round: { type: 'integer', minimum: 0, maximum: 5 } }) },
  opening_scene: str,
  truth: obj({
    summary: str,
    timeline: { type: 'array', items: obj({ time: str, event: str }) },
    culprit_ids: strArr,
    method: str,
    motive: str,
    ambiguities: str,
  }),
  players: {
    type: 'array',
    items: obj({
      id: str,
      character_name: str,
      role_title: str,
      public_info: str,
      private_info: str,
      goal: str,
      side: { type: 'string', enum: ['investigator', 'culprit', 'wildcard'] },
      side_explanation: str,
      hidden_facts: { type: 'array', items: obj({ id: str, fact: str }) },
      starting_knowledge: str,
      start_location: str,
      icon: str,
    }),
  },
  npcs: {
    type: 'array',
    items: obj({
      id: str,
      name: str,
      role_title: str,
      public_info: str,
      knows: str,
      secrets: str,
      lies: str,
      reveals_freely: str,
      reveals_under_pressure: str,
      start_location: str,
      icon: str,
    }),
  },
  locations: {
    type: 'array',
    items: obj({
      id: str,
      name: str,
      public_info: str,
      x: { type: 'integer', minimum: 0, maximum: 100 },
      y: { type: 'integer', minimum: 0, maximum: 100 },
      neighbors: strArr,
      icon: str,
    }),
  },
  clues: {
    type: 'array',
    items: obj({
      id: str,
      name: str,
      where: str,
      shows: str,
      does_not_prove: str,
      importance: { type: 'string', enum: ['essential', 'useful', 'misleading'] },
      can_be_destroyed: { type: 'boolean' },
    }),
  },
  key_deductions: { type: 'array', items: obj({ id: str, statement: str, clue_ids: strArr }) },
  phases: {
    type: 'array',
    items: obj({
      name: str,
      planned_beat: str,
      question: str,
      options: strArr,
      answer_index: { type: 'integer', minimum: 0, maximum: 3 },
      reward: str,
      reward_time: str,
      reward_order: { type: 'integer' },
      wrong_nudge: str,
    }),
  },
  hint_ladder: { type: 'array', items: obj({ text: str, is_false: { type: 'boolean' } }) },
  twists: { type: 'array', items: obj({ name: str, description: str }) },
  music: obj({
    root: { type: 'string', enum: ROOTS },
    mode: { type: 'string', enum: Object.keys(MODES) },
    tempo: { type: 'integer', minimum: 50, maximum: 140 },
    palette: { type: 'string', enum: PALETTES },
    percussion: { type: 'string', enum: PERCUSSION },
    motif: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 7 } },
    description: str,
  }),
});

export const ASK_SCHEMA = obj({
  answer: str,
  clues_found: strArr,
  suspicion_change: { type: 'integer', minimum: -10, maximum: 25 },
  public_event: str,
  hidden_fact_revealed: str,
  clues_destroyed: strArr,
  messages_to_players: messages,
  player_location: str,
  move_is_public: { type: 'boolean' },
});

const positions = { type: 'array', items: obj({ character_id: str, location_id: str }) };

export const PHASE_SCHEMA = obj({
  public_event: str,
  positions,
  messages_to_players: messages,
  clues_destroyed: strArr,
  suspicion_change: { type: 'integer', minimum: -20, maximum: 20 },
});

export const SCORE_SCHEMA = obj({
  reveal_story: str,
  players: {
    type: 'array',
    items: obj({
      player_id: str,
      method_score: { type: 'integer', minimum: 0, maximum: 2 },
      motive_score: { type: 'integer', minimum: 0, maximum: 2 },
      goal_achieved: { type: 'boolean' },
      goal_outcome: str,
      comment: str,
    }),
  },
});

export function culpritGuidance(playerCount) {
  if (playerCount >= 6) {
    return 'Use one or two culprits among the player characters. With two, decide whether they know about each other and say so in their private_info.';
  }
  return 'Use exactly one culprit among the player characters. GM characters may be accomplices, never the only culprit.';
}

export const TWISTS = [
  { id: 'wildcard', text: 'A wildcard player whose goal belongs to neither side.' },
  { id: 'peek', text: "One player secretly knows one fact from another player's private card (put it in their private_info)." },
  { id: 'goal-change', text: "One player's goal changes during a named phase (write the change into that phase's planned_beat)." },
  { id: 'false-hint', text: 'One false hint on the ladder, plausible but refutable by evidence (mark it is_false).' },
  { id: 'framed', text: 'An innocent player is being framed: planted evidence points at them, and the planting itself leaves a trace.' },
  { id: 'alliance', text: 'Two players share a secret alliance or relationship that both know about and both want hidden.' },
  { id: 'second-incident', text: 'A second incident happens mid-game (a theft, an attack, a disappearance) and is written into a phase beat.' },
  { id: 'mistaken-identity', text: 'Someone is not who they claim to be: a GM character or the victim used a false identity.' },
  { id: 'unaware-accomplice', text: 'An innocent player unknowingly helped the culprit; this is one of their hidden facts.' },
  { id: 'culprit-team', text: 'Two culprits who do not know about each other at the start.', minPlayers: 6 },
];

export function pickTwists(playerCount, random = Math.random) {
  const pool = TWISTS.filter((t) => !t.minPlayers || playerCount >= t.minPlayers);
  const count = playerCount >= 6 ? 3 : 2;
  const picked = [];
  while (picked.length < count && pool.length) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return picked;
}

export const PLAIN_STYLE = `Writing style (the most important rule):
- Plain, simple English. Write like you are talking to a 12-year-old.
- Short sentences, under 12 words each. One idea per sentence.
- Common words only. No fancy, poetic or old-fashioned words.
- Say less. Players read on phones and talk out loud. The talk is the fun, not the text.
- Players call the phases "rounds". In any text they see, say "round", never "phase".
- Never use em dashes; use commas or full stops.
- Ids (p1, n1, c3, l2, k1, h1) go only in id and *_ids fields. Never write an id in text; use the name.`;

export const GENERATION_SYSTEM = `You design one-session hidden-role mystery games for friends playing in the same room.
Each player is a character inside the mystery. Some are investigators with their own secrets, one or more are the culprits, and there may be a wildcard whose goal fits neither side.

Design rules:
- Write the truth first: what happened, in order, who did what, when, where, how and why. Everything else must be consistent with it.
- Every player's private_info and goal must connect to the central event. No filler secrets. Innocent players hide real things (debts, affairs, small crimes, loyalties) that create honest red herrings.
- Every player gets 1 or 2 hidden_facts: true things about their own character that they do not know. Each must be discoverable through at least one clue or GM character, and must matter to the story.
- 4 to 6 key deductions. Each one needs at least 2 independent clues (different kinds of evidence, not duplicates).
- 3 to 6 GM characters (witnesses, staff, family). The victim may be one of them if they are alive, otherwise describe the victim in the truth.
- 4 to 6 locations. Clues sit in locations or with GM characters.
- Culprits know they are culprits. Their private_info says exactly what they did and what they must hide, and their goal is to avoid being named.
- Investigators' goals combine solving the case with a personal objective. A wildcard's goal is something else entirely (escape with an item, protect someone, expose a different secret).
- public_info, setting_summary and opening_scene are read by everyone. They must never reveal a culprit, a secret or a hidden fact.
- The hint ladder runs from vague to specific. Write at least as many hints as requested. If you use the false-hint twist, mark exactly one hint is_false: true and make it plausible but refutable by evidence.
- Use exactly the twists listed in the request, woven into the characters and phases. Record each in twists with a description of how it works in this game.
- Background: 5 to 8 short lines everyone reads at the start. Cover: the place and the year, why everyone is here tonight, who the victim is and what they were like, what just happened, what is cut off or blocked, and one or two things everyone in this world would know. No secrets.
- Public timeline: 3 to 8 times everyone knows or can learn. reveal_round 0 means known from the start; 1 to the number of rounds means it is announced when that round starts. order sorts the whole story in time (use 10, 20, 30... so new entries fit between). Never put a secret in it.
- Rounds (phases): one entry per round, with a short name and a planned beat (an event that changes the situation). Each round has a clear goal: question is what the group must work out this round, answerable from clues and talk in that round (for example "How did the lights go out?"). options are 3 or 4 short answers; answer_index is the right one. The last round's question must not be "who did it" (that is the final vote). reward is one new fact the group unlocks if they get it right; reward_time and reward_order place it on the timeline ('' and 0 if it has no time). wrong_nudge is one gentle line pointing them the right way if they get it wrong. The questions should build: each round's answer helps the next.
- Character names are in-world names that fit the setting. Use the player's wish if they gave one.
- Ids: players are p1, p2, ... exactly as given. GM characters n1, n2, ...; locations l1, ...; clues c1, ...; key deductions k1, ...; hidden facts h1, h2, ... (unique across all players).
- Icons: give every location, player and GM character an icon: one emoji that fits it (a candle, a key, a teacup). Keep it simple and readable.
- Map: give every location x and y from 0 to 100, laid out like a simple floor plan (places next to each other are close). neighbors lists the ids of places you can walk to directly. Every player and GM character gets a start_location: the id of the place they are when the game starts. Spread people out, one to three per place.
- music: the game's soundtrack, played live in the room. Pick a root, mode, tempo, instrument palette and percussion that fit this setting and tone (a cozy village fair is not a dark ship), and a motif of 5 to 8 scale degrees (0 is the root, 7 the octave) that is easy to recognise. description is one line a host could read aloud ("slow music box over a heartbeat").
- Length limits (hard): title up to 6 words. setting_summary 1 or 2 short sentences. opening_scene 40 to 70 words. public_info 1 sentence. private_info 3 to 5 short sentences. goal 1 sentence. side_explanation 1 sentence. hidden fact 1 sentence. clue shows 1 sentence. planned_beat 1 or 2 sentences. Each hint 1 sentence. Each twist description 1 sentence. Location public_info 1 short sentence.

${PLAIN_STYLE}`;

export function generationPrompt(game, twists = pickTwists(game.players.length)) {
  const { setup, players } = game;
  const length = LENGTHS[setup.length];
  const roster = players.map((p, i) => ({ id: `p${i + 1}`, name: p.name, wish: p.wish || '' }));
  return `Design a mystery for this group.

Players (${roster.length}):
${JSON.stringify(roster, null, 2)}

Setting: ${setup.setting || 'Surprise us'}
Tone: ${setup.tone}
Phases: exactly ${length.phases}
Global hints to write: at least ${setup.hints + 1}
About the group: ${setup.notes || 'Nothing given'}
Culprits: ${twists.some((t) => t.id === 'culprit-team') ? 'Exactly two culprits among the player characters, who do not know about each other at the start.' : culpritGuidance(roster.length)}
Twists to use:
${twists.map((t) => `- ${t.text}`).join('\n')}`;
}

export function playSystem(scenario) {
  return `You are the game master of a live hidden-role mystery game. Players sit in one room and talk freely; they reach you privately from their phones.

The scenario below is the canonical truth. It never changes. Every answer you give must be consistent with it and with everything you have already told anyone (the record is in each request).

How to answer a player:
- Speak to them by their character name, in second person, 20 to 60 words. GM characters talk in their own voice and follow their sheet: they reveal what is in reveals_freely, reveal reveals_under_pressure only when pushed with evidence or leverage, and tell their lies unless confronted with contradicting evidence.
- Never state the truth outright. Give evidence, testimony and observations; let players reason.
- When a sensible search or question would find a clue, describe what the player finds concretely and list its id in clues_found. Searching the right place should find obvious evidence without luck. A destroyed clue cannot be found.
- Never reveal another player's private card directly. Players can learn about each other only through in-world evidence and testimony.
- "self" requests: the player investigates their own past. If the request reasonably targets one of their hidden facts, reveal at most one (put its id in hidden_fact_revealed) through in-world means. Otherwise give a useful partial memory and leave hidden_fact_revealed empty.
- "action" requests: a secret action. Decide plausibly what happens. Covert actions by a careful player can succeed; sloppy or loud ones raise suspicion. Destroying evidence: only clues with can_be_destroyed true, and list them in clues_destroyed. If someone would plausibly witness it, add a public_event (without naming the actor unless they were clearly seen) or a message to that witness's player.
- suspicion_change: 0 for ordinary questions, positive for aggressive or careless moves (culprit actions especially), negative only if someone convincingly calms things down.
- public_event: empty string unless something happens that everyone in the room would notice.
- messages_to_players: private notes to other players caused by this action (they were followed, an NPC tells them someone was asking about them). Use player ids. Usually empty.
- Out-of-world questions (rules, "who is the killer") get a short in-character deflection.
- player_location: if the request puts the player in a place (they search it, or go to talk to someone there), the id of that place. Empty string if they did not move. move_is_public: true if others would see them go there. For secret actions it is usually false.

${PLAIN_STYLE}

SCENARIO (secret, never quote it wholesale):
${JSON.stringify(scenario)}`;
}

export function askPrompt({ snapshot, player, kind, text }) {
  return `Game state:
${JSON.stringify(snapshot)}

Request from ${player.id} (${player.character_name}), type "${kind}":
${text}`;
}

export function phasePrompt({ snapshot, nextPhase, lastRound }) {
  return `The game is moving to the next phase: "${nextPhase.name}" (planned beat: ${nextPhase.planned_beat}).

Game state:
${JSON.stringify(snapshot)}

${lastRound ? `Last round's question was "${lastRound.question}". The group ${lastRound.correct ? 'got it right, so the reward is now public' : 'got it wrong, so the culprit gains a little cover'}. Build on that.\n\n` : ''}Move the world on. Write the public_event announced on the table and read out loud (15 to 40 words): use the planned beat, adapted to what players actually did. Do not restate the phase number or name; the table already shows it. React to suspicion: above 60, the culprit's position should get worse (a witness remembers, evidence surfaces); below 30, the culprit may gain cover. Destroy clues only if a culprit or GM character would plausibly act now (can_be_destroyed must be true). Use messages_to_players for private developments, including any planned goal change for a player. Use positions for people who visibly move now (GM characters wander off, people gather somewhere); list only changes, with location ids. Leave arrays empty if nothing applies.`;
}

export function scorePrompt({ snapshot, submissions, verdict }) {
  return `The game is over. Final submissions from every player:
${JSON.stringify(submissions)}

Group verdict (decided by the rules, do not change it): ${JSON.stringify(verdict)}

Game state:
${JSON.stringify(snapshot)}

Score each player: method_score and motive_score from 0 (wrong or missing) to 2 (essentially right), judged only against the truth and evidence. goal_achieved and goal_outcome judge their personal goal from what they actually did in the game record (one sentence). comment is one short, friendly sentence on their play.
Then write reveal_story (80 to 160 words, short sentences): what really happened, in order, the key lies, and who was who. It is read aloud to the room.`;
}

export const PUBLIC_ANSWER_SCHEMA = obj({ answer: str });

export function publicSystem(publicView) {
  return `You answer questions about the setting of a mystery game, for everyone in the room to hear.
You only know what is below. It is all public. Answer from it, or say "Nobody knows that yet." Never invent clues, secrets or facts about who did it. You may add harmless everyday detail about the world (the weather, how far a town is, what a room looks like) if it fits.
Answer in 1 to 3 short sentences.

${PLAIN_STYLE}

PUBLIC INFORMATION:
${JSON.stringify(publicView)}`;
}

export const ILLUSTRATION_SCHEMA = obj({ svg: str });

export function illustrationPrompt(scenario) {
  return `Draw one simple, moody picture of this setting as SVG: ${scenario.setting_summary} ${scenario.background?.slice(0, 3).join(' ')}
Rules: start with <svg and use viewBox="0 0 800 400". Flat shapes and gradients, 4 to 7 colours, a clear silhouette of the place. No text, no people's faces, no scripts, no links, no external images, no foreignObject. Under 7000 characters.`;
}
