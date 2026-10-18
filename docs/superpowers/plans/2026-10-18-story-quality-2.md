# Story Quality Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps the live check found: plot holes on the culprit's path, giveaways by role, GM characters and cards handing out clues early, herrings that never mislead, claims nobody answers, and a round event nobody checks.

**Architecture:** More of the story becomes fields that code can check (a place and the people for every truth step), the code checks cover roles and every round, the card check's output is filtered and re-checked, and the round-change continuity check reads the new round's event.

**Tech Stack:** Node 24 TypeScript, node:test via tsx, the `claude` CLI GM.

**Spec:** `docs/superpowers/specs/2026-10-18-story-quality-design.md` ("Story quality round 2" in Next steps; the design's rules all still hold).

## Global Constraints

- A story problem never fails a world on its own; structural problems fail the draft as before.
- Old saved worlds (no new fields) load and play as today.
- Plain English; never print a world's truth, cards or clues in the terminal (the host plays); logs carry counts, never values.
- Never modify an existing test without explaining and waiting for the user's confirmation.

## Review Focus

1. A truth step with no place or people (older shape, or the GM leaves it empty). Expect: it is skipped by the path check, never a crash.
2. A role word shared by two characters ("guard" for two guards). Expect: it is not a giveaway.
3. A GM character's sheet sentence that only shares a few common words with a later clue. Expect: kept.
4. A claim the GM grants. Expect: no refusal line.
5. "He" or "she" with no player named before it. Expect: the sentence is kept.

---

### Task 1: The culprit's whole path

**Files:** `server/prompts.ts` (truth.timeline items gain `location_id` and `character_ids`; rule: whereabouts at every truth step's time), `server/game.ts` (`resolveStoryIds` covers them; structural: a set location_id must be a place), `server/story.ts` (presence check over every truth step that names a culprit)
**Test:** `test/story-path.test.ts`
- `should flag anyone awake where the culprit acts, at that time`
- `should skip truth steps with no place or people`
- `should turn names into ids in truth steps`

### Task 2: Giveaways by role, in every round

**Files:** `server/story.ts` (`pointsAtCulprit`: a name, or a role word only the culprit's role has; the last-round exemption goes), `server/prompts.ts` (generation and check rule: "never single out the culprit by a role, an initial or a trait only they have")
**Test:** `test/story-giveaway.test.ts`
- `should flag a clue that names the culprit's role when only they have it`
- `should not flag a role word two characters share`
- `should flag a last-round clue that names the culprit`

### Task 3: GM characters keep later clues until their round

**Files:** `server/game.ts` (`peopleAsked` drops sheet sentences that give away a closed clue), `server/story.ts` (issue when an important GM character's reveals_freely or knows retells a later clue; `npcs.N.reveals_freely` and `reveals_under_pressure` join the patch list)
**Test:** `test/npc-gating.test.ts`
- `should hide a sheet sentence that retells a later clue from the out-loud answerer`
- `should keep sheet sentences that share only a few words`
- `should list a GM character who gives away a later clue`
- `should let the check patch reveals_freely`

### Task 4: The card check cannot spoil the case

**Files:** `server/game.ts` (`applyAudit`: drops a culprit reveal that retells a culprit clue; strips "with <someone>" from a herring target's alibi), `server/prompts.ts` (`auditPrompt` rule), `server/gm.ts` (story issues run again after the card check and are logged as counts)
**Test:** `test/audit-guard.test.ts`
- `should drop a culprit reveal that retells a clue about the culprit`
- `should keep a herring target's alibi without a witness`
- `should log story issues found after the card check`

### Task 5: Herrings that mislead

**Files:** `server/story.ts` (issue: a herring target has an alibi witness or is seen at the crime time; a suspect's clearing clue opens before their pointer), `server/prompts.ts` (generation and check: "the refutation makes it impossible, not just less likely")
**Test:** `test/herrings-mislead.test.ts`
- `should flag a herring whose target has a witness at the crime time`
- `should flag a suspect cleared before anything points at them`

### Task 6: The check reads for impossible clues, motives and goals

**Files:** `server/prompts.ts` (storyCheckPrompt items 9 to 11; variety covers hidden facts and late clues)
**Test:** `test/story-check-items.test.ts`
- `should ask the check for impossible clues, motive sources and reachable goals`
- `should keep the secretly kind victim out of hidden facts and clues too`

### Task 7: Claims answered in code

**Files:** `server/prompts.ts` (`ASK_SCHEMA.claims_answer: [{ claim, granted, why }]`), `server/game.ts` (`completeAsk`: each reader claim not granted gets a "That can't happen:" line and a refused log entry; the move itself still happens)
**Test:** `test/claims.test.ts`
- `should tell the player when a claim is not granted`
- `should say nothing when every claim is granted`
- `should refuse claims the GM left unanswered`

### Task 8: Pronouns and the refusal line

**Files:** `server/game.ts` (`dropPuppeting`: "he"/"she" opening a sentence stands for the player named just before; the refusal "why" passes the puppet filter and never names the culprit)
**Test:** `test/pronouns.test.ts`
- `should drop "He came down the stairs" after a player was named`
- `should keep a pronoun with no player before it`
- `should clean the refusal line`

### Task 9: The round-change check reads the new round's event

**Files:** `server/app.ts` (the round-change and final checks start after the round change is applied, so they read the new event; no wait)
**Test:** `test/continuity-after-event.test.ts`
- `should start the round check after the new round's event is written`

### Task 10: Live check

Two Normal worlds, the same audit brief, and a bot playthrough of 2 full rounds (the script answers the round vote). Report before and after.

## Final review

One whole-branch review on the most capable model; one fix pass for Critical and Important, each red then green; minors to the ledger.
