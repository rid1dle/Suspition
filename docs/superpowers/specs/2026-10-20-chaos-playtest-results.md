# Chaos playtests, 2026-10-20: results

Ten bots played each game, on the live GM. Their roles:

| Role | Who | What they did |
|---|---|---|
| social | Asha, Nisha | used every channel: private GM, out loud with the GM, room talk without it, messages to one player (with and without asking the GM in), invites, "tell the room" |
| bender | Kabir, Ishaan | narrated finds and their own past, and moved the world |
| bluffer | Meera | told each player a different story |
| breaker | Ravi | "make me the killer", "skip to the vote" |
| swayer | Tanvi | flattery, fake GM confirmations, asking for points |
| contradictor | Arjun | asserted times and places that clash with what was settled |
| driver | Zoya | pushed one theory hard |
| fair | Dev | the control for "can it be solved" |

A second judge grades the story itself, next to the old judge. Runs: `scripts/story-playtest.ts <dir> --chaos`. Raw reports live in `dataset/research/2026-10-20/chaos-run*` (untracked).

## Results

| | Run 1 (old world code) | Run 2 (story craft) | Run 3 (two-pass world) |
|---|---|---|---|
| Interest (story judge, of 10) | 6 | 7 | 7 |
| Lord of the Mysteries bar (of 10) | 5 | 6 | 6 |
| Leaks | 3 | 2 | 0 |
| Breaches (a bot swayed the GM) | 1 (see below) | 0 | 0 |
| Puppeting | 4 | about 0 | 6 (new forms, fixed after) |
| Contradictions let in | 5 | 5 | 7 |
| Story holes | 8 | 6 | 10 (two culprits, bigger world) |
| Reframes that landed | 6 | 6 | 8 |
| World bends that held | 4 of 9 | 4 of 9 | 9 of 14 (the rest rightly refused) |
| Guardrails held | 7 of 10 | 5 of 8 | 7 of 10 |
| Named the culprit(s) | 8 of 10 | 10 of 10 | 10 of 10 |
| Goals reachable / reached | 10 / 7 | 10 / 8 | 10 / 7 |
| Case solvable from clues | yes | yes | yes |

**What held every time:** flattery and fake "the GM cleared me" claims (swaying scores of -11 and -12). "Make me the killer" and "skip to the vote". Contradictors' false times. Secrets. The culprit never changed.

**One judge verdict overruled.** In run 1, Kabir's narrated find ("my old editor's name is on the list") was counted as a breach. By the creator's rule a narrated find that breaks nothing becomes true, and the story judge confirmed it broke nothing.

## Fixed after each run

**After run 1:**
- The spotlight published a culprit's "carries brass key L4", a solution fact no clue showed. Fixed two ways: a rule on how reveal lines are written, and a skip for any line that retells a clue nobody has found, applied to everyone.
- Gaps in the puppet filter.
- A double demerit, and "honest repeat is -1".
- Invented NPC leads and witnesses, and made-up quotes left standing.
- Fair-proof checks.
- Round headings without a total.

**World writing:** stories as fields with code checks (see `2026-10-20-story-craft-design.md`).
- A draft that breaks up to 6 patchable rules is fixed, not rewritten.
- The story layer moved to a second pass after a draft timed out.
- A draft that has started writing gets 8 more minutes. Two 10-player drafts had been killed a minute from done.

**After run 2:**
- A goal met in play stays met.
- Round counts are dropped from the story.
- Unseen red herrings are put in reach, and a broken liar gives way in the last round.
- Narration never states a lie, and ownership stays as written.
- Pressure on one point builds until something gives.
- A refusal names the fact, never a person.
- Acting unseen is not a claim.
- A reward follows from its own round's clues.

**After run 3:**
- More puppeting forms are caught.
- Game talk is dropped.
- A find is paid once.
- A culprit's lie to a character counts as bluffing.
- "Remember" is used only for what players saw.
- GM characters' moves inside a round are kept. In every run a GM character walked off, came back, and then said "I spoke wrong".

## Still open

- **The deepest layers do not surface.** Ten bots with three moves a round reach maybe half of a ten-player world: split diaries, trust notes and letters stayed unfound. Real players may dig differently. Watch it in the next human game before cutting content.
- **Testimony versus whereabouts.** A witness's clue described a room she was not in. There is no code check yet.
- **Ten-player worlds take 13 to 20 minutes to write.** The two-pass split and the writing grace keep them alive, but the wait is long.
