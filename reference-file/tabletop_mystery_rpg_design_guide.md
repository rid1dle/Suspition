# Design Guide: Tabletop Mystery RPG

## Purpose

Use this document as the design brief for another LLM instance helping develop a tabletop role-playing game whose central activity is solving mysteries. The game should borrow the freedom, collaborative storytelling, character identity, and campaign continuity of *Dungeons & Dragons*, but investigation and deduction—not combat or character-level advancement—must be its defining experience.

Treat this as a starting design direction, not an immutable ruleset. Develop the game in small, testable increments. Explain important trade-offs and distinguish established decisions from proposals.

---

## 1. Core design goal

The central player fantasy is:

> “We figured out what really happened.”

Players inhabit characters in a fictional world, investigate events, question people, inspect places and objects, find and interpret evidence, form theories, test those theories, and eventually reconstruct the truth.

The game has two distinct layers:

- **Objective truth:** what actually happened in the fictional world.
- **Player understanding:** what players currently believe, what evidence supports those beliefs, and how confident they are.

The game is successful when players feel that they earned their conclusions through observation, reasoning, and choices.

### Core pillars

1. **Investigation:** discover and interpret evidence.
2. **Role-playing:** interact with people who have goals, secrets, and imperfect knowledge.
3. **Deduction:** construct, compare, and test hypotheses.
4. **Consequences:** actions affect time, suspicion, relationships, and the world.
5. **Player agency:** players can pursue leads in an order of their choosing and try approaches the designer did not anticipate.
6. **Fairness:** difficulty should come from interpreting ambiguous evidence, not from withholding indispensable information behind arbitrary dice rolls.

## 2. Core gameplay loop

Build play around this repeating cycle:

1. **Observe:** encounter an event, person, place, object, or anomaly.
2. **Form a hypothesis:** ask what might have happened and what would have to be true.
3. **Investigate:** interview someone, search a location, examine evidence, research records, infiltrate a restricted area, or use a contact.
4. **Interpret:** connect facts, identify contradictions, and reconstruct parts of the timeline.
5. **Test:** verify an alibi, challenge a suspect, search for a predicted clue, or compare independent sources.
6. **Revise or conclude:** update the theory, pursue a new lead, confront someone, or present a reconstruction.

The loop should operate at three scales:

- **Micro:** inspect an object or question a witness.
- **Meso:** establish a timeline, test an alibi, or eliminate an explanation.
- **Macro:** solve the main crime, disappearance, conspiracy, or historical mystery.

Every major activity should feed the investigation. Combat or action scenes can exist, but should support the mystery rather than displace it.

## 3. Design mysteries backward from the truth

The GM or mystery author must know the underlying truth before play begins. Players may discover it in any order, but clues and character behavior must remain consistent with it.

Build each mystery in five layers:

### A. Canonical truth
Specify:
- What happened, in chronological order.
- Who did what, when, where, how, and why.
- The motives, opportunities, methods, and relevant relationships.
- What each participant intended to happen versus what actually happened.
- Which facts are certain and which remain legitimately ambiguous.

### B. Characters and secrets
For each important NPC, define:
- Goals and immediate needs.
- What they know to be true.
- What they falsely believe.
- What they are concealing and why.
- Their relationship to the victim, suspects, and other witnesses.
- What they will reveal voluntarily.
- What may cause them to reveal more.
- How they react to evidence, pressure, sympathy, or contradiction.

Not every lie should concern the central mystery. Innocent people may conceal affairs, debts, embarrassment, illegal activity, or unrelated wrongdoing. This creates plausible red herrings without arbitrary misinformation.

### C. Evidence
Include physical clues, documents, testimony, timelines, financial records, environmental details, and other information that can help players reconstruct reality.

For every clue, document:
- What it literally shows.
- What conclusion it supports.
- What it does *not* prove.
- Where and how it can be found.
- Whether it is essential, useful, optional, misleading, or corroborative.
- Which other clues confirm or contradict it.
- Whether it can be lost or destroyed and, if so, what alternative route remains.

### D. Investigation space
Specify locations, people, records, tools, obstacles, and connections players can discover. Avoid a mandatory sequence of scenes. Players should be able to approach the case from different directions.

### E. Revelation
The final explanation should account for the major evidence, resolve important contradictions, explain the significant lies, and make earlier details meaningful. Do not require the players to guess an arbitrary fact that the evidence never supports.

## 4. Clue-network design

Do not design a single linear chain in which missing one clue stops the game.

For every **critical deduction**, provide at least two or three independent routes to it where practical. This is the “three-clue rule” as a useful design heuristic, not a rigid formula.

For example, a suspect's access to a locked room might be established through a key register, a witness observation, or evidence of a concealed entrance.

Important principles:

- Multiple clues should be meaningfully different, not duplicates.
- Each clue should add information or change the weight of a hypothesis.
- Distinguish **finding evidence**, **interpreting evidence**, and **acting on evidence**.
- A failed roll must not permanently block the only route to an essential fact.
- Red herrings should arise from real secrets, mistaken beliefs, incomplete evidence, or plausible alternative explanations.
- Players should be able to make and revise theories throughout play.
- Preserve uncertainty where appropriate; not every detail needs a definitive answer.

## 5. Characters and player roles

The game is an RPG, not merely a logic puzzle. Characters should provide different ways to access information and influence the world.

Start with a lightweight character structure:

- **Role:** physician, journalist, former criminal, occult scholar, aristocrat, investigator, or similar.
- **Expertise:** techniques or access that enable distinctive approaches.
- **Personal stake:** a reason the character cares about this case or the wider world.
- **Weakness or complication:** a limitation that creates meaningful choices.
- **Relationships and abilities:** contacts, favours, reputation, tools, and specialized methods.

Suggested investigative competencies:

1. **Observe:** notice physical details and anomalies.
2. **Reason:** interpret evidence and identify inconsistencies.
3. **Interview:** question, persuade, intimidate, or build rapport.
4. **Research:** access records, archives, and specialist knowledge.
5. **Infiltrate:** enter restricted places or obtain concealed information.
6. **Connect:** use relationships, contacts, and social networks.

Keep character creation simple for the first prototype. Specialization should provide distinct paths to knowledge, not make one player indispensable. No essential deduction should depend exclusively on a single character's skill.

## 6. Dice and uncertainty

Use dice only when an outcome is uncertain and the consequences matter.

Recommended principles:

- Searching an appropriate place should normally reveal obvious, relevant evidence.
- Hidden clues may require time, a suitable approach, tools, or a roll.
- Interpreting evidence should primarily reward player reasoning.
- Persuasion and access can use rolls, but outcomes should reflect the NPC's motives and the evidence presented.
- A failed roll should usually introduce a cost or complication, not erase essential information.
- High rolls may improve speed, precision, access, corroboration, or the quality of an answer; they should not magically establish objective truth.
- The evidence—not a lucky roll—determines whether a theory is sound.

Possible failure consequences include lost time, increased suspicion, damaged trust, a witness becoming unavailable, a source demanding a favour, or the culprit realizing the investigation is closing in.

Avoid a system where players must roll successfully to make basic progress. Do not allow a single bad roll to make the mystery unsolvable.

## 7. Dynamic world systems

The world should respond to the investigation. Start with three simple trackers:

### Time
People leave, evidence deteriorates, opportunities expire, and other actors take action. Time pressure should matter, but should not arbitrarily eliminate every route to an essential deduction.

### Suspicion
Aggressive or visible investigative actions may alert the culprit or attract scrutiny. The culprit may destroy records, fabricate evidence, manipulate witnesses, or flee.

### Relationships
Witnesses remember how the characters treat them. Trust, reputation, favours, and hostility change access and cooperation.

Track only states that produce meaningful decisions. Avoid bookkeeping that does not change player choices.

## 8. Session structure

Use this as a flexible scaffold for a three-to-four-hour case:

1. **Incident (about 0–30 minutes):** establish the event, location, central characters, and initial questions.
2. **Initial investigation (30–90 minutes):** gather evidence and form a plausible first theory.
3. **Contradiction (90–150 minutes):** discover evidence that invalidates or complicates the initial theory.
4. **Reconstruction (150–210 minutes):** pursue promising leads, test explanations, and prepare a case.
5. **Resolution (210–240 minutes):** present the theory, confront relevant characters, and experience the consequences.

These timings are optional. If the players solve the mystery early, allow the case to conclude. Complex cases can span several sessions. Never force a revelation at a scheduled time if the players' actions make another pace more natural.

## 9. GM reference materials

Prepare five compact, usable references for each mystery:

| Reference | Contents |
|---|---|
| Truth sheet | Canonical events, motives, and causal relationships |
| NPC sheets | Knowledge, beliefs, secrets, goals, and reaction triggers |
| Clue catalogue | What each clue shows, where it is found, and its connections |
| Investigation map | Connections among people, places, events, evidence, and questions |
| State tracker | Time, suspicion, relationships, destroyed evidence, and changing conditions |

The GM should respond consistently to unexpected player approaches. If a player proposes a plausible action, adjudicate it using the world's facts and the character's capabilities rather than forcing the prepared plot.

## 10. Final reconstruction and scoring

Make solving the mystery an explicit game activity rather than relying entirely on the GM's subjective judgment.

During play, players should be able to record:
- Evidence and its source.
- Claims made by NPCs.
- Contradictions.
- Competing hypotheses.
- What each hypothesis explains and fails to explain.
- Open questions and confidence levels.

At the end, invite the group to reconstruct:

1. What happened?
2. Who was responsible, and who else was involved?
3. Why did it happen?
4. How and when did it happen?
5. Which evidence supports the explanation?
6. How does it resolve major contradictions?
7. What remains uncertain?

Avoid binary pass/fail endings. Evaluate dimensions separately, such as:
- Correct culprit or responsible parties.
- Accurate method and timeline.
- Correct motive.
- Evidence-based reasoning.
- Resolution of major contradictions.
- Recognition of unresolved questions.

A partially correct explanation should have meaningful consequences and receive credit for what it establishes. Do not retroactively change the truth to make the players' theory correct.

## 11. Campaign progression

Progression should improve investigative possibilities without making mysteries trivial.

Use three primary forms:

- **Knowledge:** persistent understanding of institutions, history, recurring characters, and the setting.
- **Contacts:** trust, favours, professional relationships, and access to restricted sources.
- **Methods and tools:** new investigative techniques, equipment, and approaches.

Campaign consequences can change reputations, create enemies, expose conspiracies, and open new cases. Each case should resolve its main question while potentially revealing a larger one.

Avoid making numerical skill growth the main reward. Character advancement should broaden options, not replace deduction.

## 12. Example case concept

**Title:** *The Last Train to Blackwood*

A wealthy industrialist is found dead in a locked railway carriage. Three people claim to have seen him alive after departure. His business partner calls it an accident, his daughter refuses to speak, and the stationmaster has altered the passenger log.

Potential investigative paths:
- Examine the carriage and body.
- Interview passengers separately.
- Reconstruct the train's movements.
- Investigate the industrialist's business.
- Compare the passenger log with ticket receipts.
- Discover that two witnesses are hiding an affair.
- Investigate why the daughter was on the train.
- Test whether the partner's account is physically possible.

A strong design could reveal that the stationmaster falsified the log to conceal smuggling, not the murder. This makes the log alteration a real but misleading lead. The eventual solution should explain the death, the timeline, the important lies, and the business connection.

Use this only as an example, not as a mandatory setting or plot.

## 13. First playable prototype

Do not start with a huge ruleset, extensive lore, dozens of abilities, or a long campaign. Build one complete mystery and test whether investigation itself is fun.

Suggested initial scope:

- 3–5 players plus a GM.
- 2–4 hours of play.
- 5–7 suspects.
- 4–6 locations.
- 4–6 major deductions.
- A small set of character competencies.
- One simple dice mechanic.
- A time/suspicion tracker.
- A clue network and a case board.
- A structured final reconstruction.

The prototype should contain:
1. A canonical truth and timeline.
2. NPCs with independent motives and secrets.
3. A clue network with multiple paths to essential deductions.
4. Lightweight character sheets with distinct approaches.
5. Consequences for time, suspicion, and relationships.
6. A final reconstruction procedure.
7. A playtest checklist.

During playtesting, measure:
- Where players become stuck and why.
- Whether they form competing theories.
- Whether they can recover from mistaken assumptions.
- Whether their decisions change what happens.
- Whether clues feel fair and interpretable.
- Whether the final revelation is surprising but retrospectively coherent.
- Whether all players have meaningful contributions.

## 14. Non-negotiable design principles

1. **Never confuse difficulty with inaccessible information.**
2. **Never make one missed roll or clue the sole barrier to solving a case.**
3. **The canonical truth must remain consistent during play.**
4. **Players should be able to investigate in different orders and try unanticipated approaches.**
5. **Clues must support reasoning; they should not merely be rewards for rolling well.**
6. **Red herrings should emerge from the world's real complexity, not arbitrary deception by the designer.**
7. **The world should react to player choices.**
8. **A final explanation should be judged against evidence, not the GM's preferred narrative.**
9. **Keep the first version small enough to playtest and revise.**
10. **Prioritize the investigation engine over lore, combat, and character progression.**

## 15. Recommended next design milestone

Define the **investigation engine** precisely before expanding the setting or campaign:

- How are clues discovered?
- How are clues recorded and linked?
- How do NPC conversations and knowledge boundaries work?
- How are hypotheses formed, compared, and tested?
- How do contradictions emerge?
- What can dice affect, and what can they never determine?
- How do time, suspicion, and relationships change the available options?
- How does the game evaluate a correct or partially correct solution?

Develop these rules as a small, testable system. State assumptions explicitly, identify unresolved design questions, compare alternatives when trade-offs matter, and avoid prematurely adding complexity.
