# Story Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Worlds that are hard, complete and full of real suspects, and that stay whole while they are played. Every character has a motive and a clue against them, red herrings are built from evidence, the culprit takes several clues across rounds to name, everyone's whereabouts agree with the crime, and a GM consistency check catches the holes code can't.

**Architecture:**
- **New structured fields in the world** (`suspects`, `red_herrings`, `truth.crime`, `truth.whereabouts`, clue `reveal_round`, deduction `about`) turn story rules into things code can check.
- **Two kinds of check.**
  - `validateScenario` keeps failing only structural problems, and the draft is retried as today.
  - A new `storyIssues` lists story problems. Those never fail a world; they go to a new GM call, `checkStory`, which returns small patches to allowed fields or asks for one rewrite.
- **In play,** clues open by round, enforced in code.

**Tech Stack:** Node 24 TypeScript, node:test via tsx, the `claude` CLI GM.

**Spec:** `docs/superpowers/specs/2026-10-18-story-quality-design.md` (approved). Its difficulty table holds the numbers.

## Global Constraints

- **Difficulty** (`setup.difficulty`, default `normal`):

| | easy | normal | hard |
|---|---|---|---|
| `culpritClues` | 2 | 3 | 4 |
| `culpritRounds` | 1 | 2 | 3 |
| `herrings` | ceil(innocents / 2) | innocents | 2 × innocents |
| hints may name a person | from the middle hint | only the last hint | never |

- **A story problem never fails a world on its own.** Structural problems (missing fields, unknown ids, wrong counts) fail the draft as today.
- **A patch that adds a structural problem is undone.** Patches may only change these fields:
  - `clues[i].shows`, `clues[i].does_not_prove`, `clues[i].where`, `clues[i].reveal_round`
  - `players[i].private_info`, `public_info`, `starting_knowledge`
  - `npcs[i].knows`, `secrets`, `lies`
  - `hint_ladder[i].text`
  - `public_timeline[i].event`
  - `truth.whereabouts`, `suspects`, `red_herrings`
- **The consistency check** has a timeout of 180 s. If it fails or times out, the world is kept as is, with the code's issue list logged.
- Plain English; fair play rules unchanged; never print a world's truth, cards or clues in the terminal (the host plays).
- Never modify an existing test without explaining and waiting for the user's confirmation.

## Review Focus

1. **An old saved world without the new fields** (every game played so far). Expect: it loads and plays. All clues are open, and `storyIssues` and gating treat missing fields as "not set". Pinned in Task 4 (gating) and Task 3 (issues on an old fixture).
2. **The consistency check returns a patch to a field not on the list,** or a patch that breaks ids. Expect: the patch is skipped and logged, never applied. Pinned in Task 5.
3. **A Hard game with 3 rounds** (Short length): 4 culprit clues across 3 rounds must still fit. Expect: the prompt says so, and `storyIssues` counts rounds, not phases names. Pinned in Task 3.
4. **The GM hands out a clue from a later round** in a private answer. Expect: it is not given; the clue stays for its round. Pinned in Task 4.
5. **A culprit name hidden in a hint or a card line** (public_info, distrust reason). Expect: listed as a story issue for the check. Pinned in Task 3.

---

### Task 1: Difficulty on setup

**Files:**
- Create: `src/lib/difficulty.ts`
- Modify: `server/game.ts` (`applySetup` keeps `difficulty`), `server/prompts.ts` (`generationPrompt` states the difficulty rules), `src/app/table/setup.tsx` (a `Chips` field "How hard?")
- Test: `test/difficulty.test.ts`

**Interfaces:**
- Produces:
  - `DIFFICULTIES = ['easy', 'normal', 'hard']`
  - `difficultyRules(level: string, innocents: number): { culpritClues: number; culpritRounds: number; herrings: number; hintNames: 'middle' | 'last' | 'never' }` (unknown level gives `normal`)
  - `difficultyPrompt(level, innocents, rounds): string`: plain lines for the world prompt. The rounds a hard world spans are `min(3, rounds)`.

- [ ] **Step 1: Write the failing tests:**
  - `should give normal by default and for an unknown level`
  - `should ask for more clues, rounds and herrings as it gets harder` (exact numbers from the table for 3 innocents: easy 2/1/2, normal 3/2/3, hard 4/3/6)
  - `should never ask for more rounds than the game has` (hard with 2 rounds gives `culpritRounds` 2)
  - `should keep the chosen difficulty in the setup, normal when missing`
  - `should state the difficulty rules in the world prompt` (normal: "at least 3 clues from at least 2 rounds"; hard: "no hint names a person")
- [ ] **Step 2: Run them.** Expected: FAIL. **Step 3: Implement.** Setup copy: "How hard?" with Easy, Normal, Hard and the note "Normal: the killer takes 3 clues from 2 rounds to name." **Step 4: Run them and the suite.** Expected: PASS. **Step 5: Commit** `feat: difficulty on setup`.

### Task 2: Suspects, red herrings, whereabouts and gated clues in the world

**Files:**
- Modify: `server/prompts.ts` (`WORLD_SCHEMA`, `GENERATION_SYSTEM` rules), `server/game.ts` (`validateScenario` structural checks for the new fields)
- Test: `test/story-schema.test.ts`

**Interfaces:**
- Produces, in `WORLD_SCHEMA`:
  - `truth.crime: { time: str, location_id: str }`
  - `truth.whereabouts: [{ time, character_id, location_id, doing, seen_by: strArr }]`
  - `suspects: [{ character_id, motive_against_victim, where_at_crime_time, alibi_witness, pointer_clue_ids: strArr, cleared_by_clue_ids: strArr }]`
  - `red_herrings: [{ points_at, clue_ids: strArr, why_convincing, refuted_by_clue_ids: strArr }]`
  - clue `reveal_round: integer 1..5`
  - key deduction `about: enum ['culprit', 'method', 'motive', 'other']`
- Structural checks added to `validateScenario`:
  - every player and important GM character has one `suspects` entry
  - every id in the new fields exists
  - `truth.crime.location_id` is a location
  - every clue's `reveal_round` is between 1 and the number of rounds
  - every clue's `where` is a location or character id
  - deductions with `about` culprit, method and motive each exist

New rules in `GENERATION_SYSTEM` (exact copy; replace the "Innocent players hide real things" rule):

```
- Everyone is a suspect. For every player and important GM character except the victim, fill suspects: a motive_against_victim (a real reason to want the victim harmed tonight; a secret crime of their own is not a motive, say why it makes them want the victim gone), where_at_crime_time, alibi_witness (empty: nobody can vouch for them during the crime), pointer_clue_ids (clues that point at them) and cleared_by_clue_ids (a different clue, found later, that clears them; empty only for the culprit).
- Red herrings are built, not labelled. Each red_herring points at an innocent for the murder itself, is convincing (why_convincing), and is ruled out only by a different clue found in a later round (refuted_by_clue_ids). "It is a different crime" never rules anything out. Never write in a clue's own text that it has nothing to do with the death.
- No giveaways. No single clue, public line, hint, round question, reward, public_info or intro line may point at the culprit alone. A clue states what is seen, never the conclusion, and never names who did it. Each clue has a reveal_round: the round it can first be found.
- Whereabouts: in truth.whereabouts, say where every character was at each key time (at least the crime time) and who saw them. Nobody but the culprit and the victim is at truth.crime's place at its time, unless asleep or out of sight; say which.
- Variety: each character's secret is a different kind. Use workplace theft or forged papers only when the setting needs them. Do not make the twist "the victim was secretly kind".
```

- [ ] **Step 1: Write the failing tests:**
  - `should ask for suspects, built red herrings, whereabouts and clue rounds in the world` (the schema has each field; the system prompt has each rule above, verbatim key phrases)
  - `should fail a draft whose suspects miss a character or name an unknown clue`
  - `should fail a draft whose clue sits nowhere real or opens after the last round`
  - `should fail a draft with no deduction about the culprit, the method or the motive`
  - `should pass the fixture world after it gains the new fields` (`makeScenario` gets valid defaults for them, see the note)
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Extend `test/fixtures.ts` `makeScenario` with valid new fields. This adds fields only; no existing assertion changes. If any existing test then fails, stop and ask before changing it.
- [ ] **Step 4: Run them and the suite.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: suspects, built red herrings, whereabouts and clue rounds in every world`

### Task 3: Story issues found by code

**Files:**
- Create: `server/story.ts`
- Test: `test/story-issues.test.ts`

**Interfaces:**
- Consumes: `namesCulprit`, `namesAnyOf` (server/game.ts), `difficultyRules` (Task 1)
- Produces: `storyIssues(scenario, { players, difficulty, rounds }): string[]`. Each line names the field and the problem in plain words, ready to hand to the GM. An old world without the new fields returns `[]`.

Checks:
- **giveaway:** `namesCulprit` over:
  - each clue's `shows` whose `reveal_round` is below the last round
  - `public_timeline[].event`
  - every hint except the last (the middle one onward on Easy, none on Hard)
  - players' `public_info` and `intro_line`
  - phases' `question` and `options`
- **spread:** the clues of `about: 'culprit'` deductions (union) number fewer than `culpritClues`, or span fewer distinct `reveal_round`s than `culpritRounds`.
- **suspect:** a non-culprit with an empty motive, no pointer clue, no clearing clue, or a clearing clue that is also a pointer clue. The culprit has a non-empty `cleared_by_clue_ids`.
- **herring:** fewer than `herrings`; one pointing at a culprit; one whose refuting clues overlap its own clues; or one whose refuting clues open in the same round or earlier than its own.
- **presence:** someone other than the culprit and victim is at `truth.crime.location_id` at `truth.crime.time` in `whereabouts` and their `doing` does not say asleep or out of sight.

- [ ] **Step 1: Write the failing tests:** one per check, each with a fixture world broken in exactly that way and asserting one issue line that names the field. Plus:
  - `should find nothing wrong in a well-made world`
  - `should return nothing for an old world without the new fields`
  - `should count rounds for a Hard game of 3 rounds` (4 clues across rounds 1, 2, 3 pass; across 1 and 2 fail)
  - `should find a culprit's name in a hint or a card line`
- [ ] **Step 2: Run them.** Expected: FAIL. **Step 3: Implement.** **Step 4: Run them.** Expected: PASS. **Step 5: Commit.** `feat: code finds story problems in a world`

### Task 4: Clues open by round in play

**Files:**
- Modify: `server/game.ts` (`completeAsk` drops `clues_found` with `reveal_round` above the current round number index; `snapshotForGM` adds `clues_open_now` and `clues_later`), `server/prompts.ts` (`playSystem`: "Only hand out clues listed in clues_open_now.")
- Test: `test/clue-rounds.test.ts`

**Interfaces:**
- Produces: `openClues(game): string[]`: clue ids with `reveal_round` ≤ `phaseIndex + 1`. A clue without `reveal_round` is always open.

- [ ] **Step 1: Write the failing tests:**
  - `should not give a clue before its round`
  - `should give it once its round comes`
  - `should keep every clue open in an old world`
  - `should tell the GM which clues are open now`
- [ ] **Step 2 to 5:** RED, implement, GREEN, commit `feat: clues open by round`.

### Task 5: The consistency check

**Files:**
- Modify: `server/prompts.ts` (`STORY_CHECK_SCHEMA`, `storyCheckPrompt`), `server/gm.ts` (`checkStory(scenario, issues)`; `generate` runs it after a valid draft and before the card audit), `server/story.ts` (`applyStoryPatches`), `server/progress.ts` (step `{ id: 'story', label: 'Checking the story for holes' }` before `cards`), `server/app.ts` (progress event `story`)
- Test: `test/story-check.test.ts`

**Interfaces:**
- Consumes: `storyIssues` (Task 3), `validateScenario`.
- Produces:
  - `STORY_CHECK_SCHEMA = { verdict: 'ok' | 'patch' | 'rewrite', problems: [{ what, fix }], patches: [{ path, value }] }`. `path` uses dots and indexes (`clues.3.shows`). `value` is a string, an integer, or for `truth.whereabouts`, `suspects` and `red_herrings` the whole array.
  - `applyStoryPatches(scenario, patches, rules): { applied: number; skipped: string[] }`. Paths only from the allowed list. After applying, if `validateScenario` gives more errors than before, everything is undone and all are reported as skipped.
  - In `gm.generate`, after a valid draft:
    - `issues = storyIssues(...)`, then `checkStory`
    - `ok`: keep the world
    - `patch`: apply the patches
    - `rewrite`, when an attempt is left: regenerate with the problems as "A previous draft broke these rules"; otherwise apply the patches
    - Each outcome is logged as `gm story check: <verdict>, <n> patches, <m> skipped`.

`storyCheckPrompt(scenario, issues)` (fixed copy at its top):

```
You check a mystery for holes before anyone plays it. The world below is final unless you find a problem. Check each item and report every problem you find:
1. Whereabouts: anyone at the crime place at the crime time who would have seen it.
2. Every clue and every hidden fact has an event in the truth that made it.
3. Every key deduction follows from its own clues.
4. The culprit, the method and the motive can each be worked out from clues.
5. No single clue, hint, card line or public line points at the culprit alone.
6. Head counts, objects and times agree everywhere.
7. Every red herring is convincing and ruled out by a different, later clue.
The code already found these problems: {issues}
Fix small problems with patches to the allowed fields only. Choose rewrite only when the story cannot be fixed with patches.
```

- [ ] **Step 1: Write the failing tests** (a fake GM run):
  - `should keep the world when the check says ok`
  - `should apply allowed patches and skip others` (a patch to `truth.culprit_ids` is skipped and named)
  - `should undo patches that break the world` (a patch setting a clue's `where` to an unknown id is undone)
  - `should rewrite once when the check asks and an attempt is left, with the problems in the prompt`
  - `should keep the world when the check fails or times out`
  - `should show "Checking the story for holes" while it runs`
- [ ] **Step 2 to 5:** RED, implement, GREEN, run the full suite. If an existing generation test counts GM calls and breaks, stop and ask before changing it. Commit `feat: a GM consistency check fixes story holes before play`.

### Task 6: Cards follow the whereabouts

**Files:**
- Modify: `server/prompts.ts` (`auditPrompt`: "night: copy this character's entries from truth.whereabouts; add only what they did between them"), `server/game.ts` (`applyAudit`: when `truth.whereabouts` has entries for a player, their `night` is built from those entries and the audit's extra lines are merged in time order)
- Test: `test/audit-whereabouts.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `should build a player's night from the whereabouts`
  - `should keep the audit's night for an old world without whereabouts`
- [ ] **Step 2 to 5:** RED, implement, GREEN, commit `feat: each player's night matches the truth`.

### Task 7: Continuity during play

**Files:**
- Create: `server/continuity.ts`
- Modify: `server/prompts.ts` (`CONTINUITY_SCHEMA`, `continuityPrompt`; `playSystem` and `publicSystem` read `canon`), `server/gm.ts` (`continuity(game)`, its own 1-slot limiter), `server/app.ts` (`checkContinuity(game, reason)`: at each round change before the phase call's result is applied, after every 8 GM answers, before the final vote), `server/game.ts` (`st.canon`, `st.continuity` log, `snapshotForGM.canon`)
- Test: `test/continuity.test.ts`

**Interfaces:**
- Produces:
  - `CONTINUITY_SCHEMA = { problems: [{ what, kind: 'contradiction' | 'truth' | 'ignored' | 'broken' }], canon_add: [{ fact, about: strArr }], corrections: [{ to: 'table' | player_id, speaker: npc_id, text }], patches: [{ path, value }], solvable: boolean, missing: strArr }`
  - `applyContinuity(game, result, now): { canon: number; corrections: number; applied: number; skipped: string[] }`
  - `continuityPrompt(game)`: truth, the remaining plan, canon, and the record since `st.continuity.lastAt`.
- Rules:
  - Patches may only change future fields:
    - `phases[i]` with i > phaseIndex: `planned_beat`, `question`, `options`, `answer_index`, `reward`, `wrong_nudge`
    - unfound clues: `where`, `reveal_round`, `shows`
    - unused hints: `text`
    - `npcs[i]`: `knows`, `lies`
    - `clues` may gain one backup clue when an essential clue was destroyed
  - Anything else is skipped and logged.
  - Corrections go out as a ripple (table) or a whisper, are spoken by a GM character, and pass `dropPuppeting`.
  - Canon is capped at 60 facts, oldest merged first. `playSystem` and `publicSystem` say: "Established facts (canon) are true; never contradict them."
- The fixed copy at the top of `continuityPrompt`:

```
You keep a mystery whole while it is played. Read what was said since the last check against the truth, the plan and the established facts. List every contradiction, every answer that contradicts the truth, every fact players established that the plan ignores, and every player action that broke the case. Fix them: add facts to canon so later answers agree; let a GM character correct a mistake in the story; patch only the future parts of the plan so the case stays solvable. Never change who did it, how or why, never undo what a player found, never reveal a secret, never speak for a player.
```

- [ ] **Step 1: Write the failing tests** (a fake GM):
  - `should run at a round change, after 8 answers and before the final vote, one at a time`
  - `should add canon that later GM prompts carry`
  - `should send a correction as a GM character's ripple or whisper, never in a player's voice`
  - `should patch only future fields and skip the rest` (a patch to the current round or to `truth` is skipped)
  - `should add a backup clue when an essential clue was destroyed`
  - `should change nothing when the check fails or times out`
  - `should keep its own GM slot` (answers do not wait behind it)
- [ ] **Step 2 to 5:** RED, implement, GREEN, run the suite, commit `feat: the GM keeps the story whole during play`.

### Task 7b: Player agency first

**Files:**
- Modify:
  - `server/game.ts`:
    - `dropPuppeting` gains action and gesture verbs, with a `backed(game, pid, sentence)` escape for facts on the player's card or in their record
    - `playerFacts(game, pid)`
    - `offerToPlayer(game, pid, text, choice)`
  - `server/prompts.ts`: `FAIR_PLAY` gains the source rule; `continuityPrompt` and `storyCheckPrompt` add the checklist item
  - `server/continuity.ts`: needs from the story become private offers
- Test: `test/player-agency.test.ts`

**Rule copy (add to `FAIR_PLAY`):**

```
A player character's actions, words and whereabouts come only from their own card or from what that player did or said in play. Never tell anyone a player went somewhere, did, said or felt something unless it is on that player's card or in their record. If the story needs something new from a player's character, ask that player privately first; never assert it.
```

- [ ] **Step 1: Write the failing tests:**
  - `should drop a sentence that has a player do something they never did` ("Nikhil went to the shed at eleven.", no backing)
  - `should keep it when the player's card or record backs it` (the card says the shed, or Nikhil's own move went there)
  - `should drop gestures of other players in ripples and answers` ("Ben flinches.")
  - `should send a story need to the player as a private offer, and only let others mention it after the player answers`
  - `should list unbacked player facts as continuity problems`
- [ ] **Step 2 to 5:** RED, implement, GREEN, run the suite, commit `feat: players drive their own characters; nothing about them is told before they know it`.

### Task 8: Polish from the living story review

**Files:** `server/game.ts`, `src/db/library.ts`, `src/lib/settings-deck.ts`, `server/app.ts`, `src/components/world/room.tsx`, `src/components/world/table-effects.tsx`, `src/app/world.css`
**Test:** `test/polish.test.ts`

One failing test each, then the fix:
- `should keep past world titles off the views and out of the dataset export`: the view's `setup` has no `recent`, and neither does `forDataset`.
- `should read recent worlds with one query, newest 10, without playtests`: `GameLibrary.recentWorlds` reads only summary columns through `json_extract` and never calls `loadGame`.
- `should draw the idea matching only the oldest recent world when every idea matches`: score each idea by the newest world it matches and take the oldest.
- `should keep the newest round picture through the final vote and the reveal`.
- `should draw a missing round picture after a restart mid-round`: `init` calls `drawRound` when playing.
- `should quicken the particle effects with tension`: `particleOptions(ambient, color, tension)` scales `move.speed` by `1 + 0.5 * tension`.
- `should keep sparks no faster than embers`: CSS sparks flicker from 1.7 s.
- `should fade the vignette with opacity, not gradient steps`: a fixed gradient whose `opacity` follows `--tension`.
- `should re-render the room only when the tension value changes`: the hook keeps the previous value when the step is the same.

Commit `fix: polish from the living story review`.

### Task 9: Live check against the audit

- [ ] **Step 1:** Write 2 Normal worlds offline with a script in the scratchpad: `new GM(...)`, then `generate` on a 4-player lobby game, with the setting drawn from the deck. Save each world JSON in the scratchpad. Record the time for each step, including the story check, from the GM log.
- [ ] **Step 2:** Give the same audit brief as before to a fresh opus reviewer for the 2 new worlds. Compare its scores, the suspects with motive, opportunity and a pointer, the real red herrings and the plot holes against the earlier table (best before: complete 3, red herrings 4, plot holes 4).
- [ ] **Step 3:** Play one of the worlds for 2 rounds on a scratch port with bot moves that push on its weak spots: contradict an answer, destroy a clue, ask the same question twice, ask a GM character where another player was. Check that the continuity log finds and fixes the contradictions, that the case stays solvable, and that no text puts a player somewhere they never chose.
- [ ] **Step 4:** Report the before and after numbers to the user. Never print the worlds' contents.

## Final review

One whole-branch review on the most capable model, with this plan, the spec and the ledger's rulings. One fix pass for Critical and Important findings, each red then green. Minors go to the ledger.
