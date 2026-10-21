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

| | Run 1 (old world code) | Run 2 (story craft) | Run 3 (two-pass world) | Run 4 (all fixes to run 3) |
|---|---|---|---|---|
| Interest (story judge, of 10) | 6 | 7 | 7 | 7 |
| Lord of the Mysteries bar (of 10) | 5 | 6 | 6 | 6 |
| Leaks | 3 | 2 | 0 | 5 (2 are GM characters saying what they could not know) |
| Breaches (a bot swayed the GM) | 1 (see below) | 0 | 0 | 2 (a meta answer, fixed after; a theft let through) |
| Puppeting | 4 | about 0 | 6 (new forms, fixed after) | 3 ("he says", fixed after) |
| Contradictions let in | 5 | 5 | 7 | 5 |
| Story holes | 8 | 6 | 10 (two culprits, bigger world) | 9 |
| Reframes that landed | 6 | 6 | 8 | 7 |
| World bends that held | 4 of 9 | 4 of 9 | 9 of 14 (the rest rightly refused) | 5 of 9 (the rest rightly refused) |
| Guardrails held | 7 of 10 | 5 of 8 | 7 of 10 | 6 of 10 |
| Named the culprit(s) | 8 of 10 | 10 of 10 | 10 of 10 | 9 of 10 |
| Goals reachable / reached | 10 / 7 | 10 / 8 | 10 / 7 | 9 / 7 |
| Case solvable from clues | yes | yes | yes | yes |
| World draft time | 16.8 min (then rewritten) | 17.7 min | 19.7 min | 17.7 min |

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

**After run 4:** any count of the game's rounds ("The game has four rounds") and "he says" about another player are dropped.

**After run 4, the last three:**
- **GM characters say only what they can know.** A short check before their lines go out sees only what each speaker can know: their sheet as gated this round, what they learned and said, their own night, what they hold, what everyone has seen, and what the player just said. It never sees the truth. Code drops only the sentences it names.
  - Replayed live on run 4 (`dataset/research/2026-10-20/voice-replay.mts`): 5 of 6 lines that were later taken back were caught, and 8 of 8 ordinary lines passed.
  - The miss was "held the key all January" against a sheet that says "in January".
  - Each check takes 3 to 8 s, and runs only when a GM character speaks.
- **A taken thing goes with its taker.** Answers list `clues_taken`. A carried thing is where its carrier is, nobody else finds it where it was, and the GM is told who carries what.
- **Public means seen.** A canon fact the continuity check marks public stays public only when what the room saw already carries most of it. A private scene had been marked public, and out-loud answers described it.

## Still open

- **The deepest layers do not surface.** Ten bots with three moves a round reach maybe half of a ten-player world: split diaries, trust notes and letters stayed unfound. Real players may dig differently. Watch it in the next human game before cutting content.
- **Testimony versus whereabouts.** A witness's clue described a room she was not in. There is no code check yet.
- **Ten-player worlds take 13 to 20 minutes to write.** The two-pass split and the writing grace keep them alive, but the wait is long.

## Story runs 4 to 8, 2026-10-21

Eight earnest bots (`--story`), story judge out of 10. Re-judging run 4 twice gave 6/6 and 7/7, so the judge moves about one point on the same game.

| Run | At | Interest | LOTM | The judge's main complaint |
|---|---|---|---|---|
| 4 | 5f9b18a | 7 | 6 | every vote 8 to 0; a GM character spelled out the last step; secrets never came out |
| 5 | 47762a0 | 7 | 6 | clues reached players who were never near them; a burnt clue shown whole; no physical proof on the culprit |
| 6 | c24b954 | 6 | 6 | votes easy; the closet was ordered opened, never opened; private finds never reached the room |
| 7 | 19b9b6b | 7 | 6 | the room named the culprit by the middle of round 2 |
| 8 | 6e03c56 | 7 | 6 | middle rounds repeat; private threads never public; dangling objects |

**Fixed (each with tests, most measured offline first):**
- A reader hunts the finished world for holes, and one repair patches them (32 of 64 found problems fixed on run 3's world; 0 of 64 on the unrepaired control).
- Code places the right answer of a round vote (in 87 saved questions it sat second 53 times and was the longest 66 times), including after play rewrites a round. A vote offers the false solution before it breaks.
- GM characters never solve for the players (a replay of run 4's lines: 12 of 12 judged as expected).
- Each important GM character's secret cracks by a planned round. Plans, secrets and payoffs follow rounds that are cut or added.
- A missed clue handed to a player away from it is brought by a GM character. A destroyed clue is told from memory, never shown whole. No reply puts another player where they are not (a replay of run 5's whisper: 4 of 4).
- The culprit's own thing and an opening before the room close the case, and a planned final choice is the last vote; the ending follows it.
- By the middle, the false trail must be stronger than the culprit's (in 6 of 7 runs it was weaker).
- Bots now hear 20 news items and talk at the table (run 6 had 0 lines of table talk).

**What the data says.** Scored as designs with no play, the worlds are 7 too (runs 4 to 6: 7/7, 7/6, 7/7; fresh worlds on the latest code: 7/7, 7/6, 7/6, 7/7). Neither an outline-and-review step before writing (kept off: 8/7, 8/7 and 7/7, 7/7 against 8/7, 7/7 without), a design-notes repair, nor high thinking effort (it times out past 20 minutes) moved the design score. Each fix removes the complaint it targets, and the judge names a new one; it always lists about six things to reach 9.
