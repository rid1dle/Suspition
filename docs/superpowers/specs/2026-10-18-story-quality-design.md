# Story quality: hard, complete, everyone a suspect

Status: APPROVED, 2026-10-18

## The baseline (from the creator, the game's original brief)

- The story is engaging.
- It is difficult to solve.
- It is complete without plot holes, like Lord of the Mysteries.
- It has real red herrings.
- Everyone questions everyone, because everyone has their own motive.

## What the audit found (5 worlds, scored 1 to 5)

Engaging scored 2 to 4, difficult 1 to 3, complete 1 to 3, red herrings 1 to 4, and everyone-a-suspect 1 to 5. Every world had 4 or 5 plot holes.

1. **Too easy.** In 4 of 5 worlds one clue, reachable in round 1, names the culprit. Clue text states the conclusion, clues have no round, and the culprit-name screen only covers round rewards.
2. **Innocents are not murder suspects.** 6 of 11 innocents had no reason to want the victim dead. They hide other wrongs instead (theft, forged papers, false names), and the same ones repeat.
3. **Red herrings are labelled, not built.** Most "misleading" clues rule themselves out in their own text ("nothing to do with the death"). Some are never resolved.
4. **Where people were contradicts the crime.** Every world puts an innocent at the crime place at the crime time, and they see nothing. Nothing checks it.
5. **Loose ends.** These include impossible facts, clues in the wrong place, motives no clue can reach and wrong head counts. "Everything must be consistent" is the only rule.

Engaging is the strongest area, but all 5 worlds reuse the same surprise ("the victim was secretly kind").

## Decisions

- **Difficulty is asked on setup:** Easy, Normal (the default) or Hard. Normal meets the baseline.

| | Easy | Normal | Hard |
|---|---|---|---|
| Clues needed to name the culprit | 2 | 3 | 4 |
| Rounds those clues span | 1 | 2 | 3 (the last clue in the final round) |
| Built red herrings | 1 per 2 innocents | 1 per innocent | 2 per innocent |
| Hints may name a person | from the middle hint | only the last hint | never |

- **Every character is a real suspect.** Each player and important GM character, except the victim, has:
  - a motive against the victim tonight (a side crime is not a motive)
  - nobody who can vouch for them during the crime
  - a clue pointing at them
  - a different clue that clears them (the culprit has none)
- **Red herrings are built.** Each one points at an innocent for the murder itself, is convincing, and is ruled out only by a different clue found in a later round.
- **No giveaways.**
  - Clues open by round.
  - No single clue, public line, hint, round question, reward or card line may point at the culprit alone.
  - The culprit is named only by combining the clues the difficulty asks for.
- **Whereabouts are written down.** The truth records where every character was at each key time. Nobody but the culprit and victim is at the crime place at the crime time unless asleep or out of sight. The audit copies each player's night from this record instead of inventing it.
- **A consistency check.** After the code checks, one GM call reads the whole world against a fixed checklist:
  - whereabouts against the crime
  - every clue and hidden fact has a truth event behind it
  - each deduction follows from its clues
  - culprit, method and motive are each reachable
  - single-clue giveaways
  - head counts and unexplained objects

  It returns small patches to listed fields, or asks for one rewrite when the problems are big. Expected cost is 30 to 60 s of world writing. The waiting screen says "Checking the story for holes".
- **Variety.** Each character's secret is a different kind. Workplace theft and forged papers only when the setting needs them. No "the victim was secretly kind" unless it is new for this group.

## Constraints

- Structural problems (missing fields, unknown ids, wrong counts) fail the draft and retry, as today. Story problems the code finds go to the consistency check as a list; they never fail a world on their own, so a world is not lost to a strict check.
- A patch that adds a structural problem is undone.
- Plain English and fair play rules hold as before.

## Continuity during play (added by the creator, 2026-10-18)

"As the conversations grow, things will automatically start to go haywire... people's decisions will introduce plot holes and contradictions for sure." The world check before play is not enough; the story must be kept whole while it is played.

- **When it runs:**
  - at every round change, before the next round's call
  - mid-round, after every 8 GM answers (private or out loud) since the last check
  - once more before the final vote, as a solvability check
- It runs in the background, one call at a time, and never blocks play.
- **What it reads:**
  - the truth and the remaining plan (future rounds, unfound clues, unused hints, GM characters' knowledge)
  - everything said since the last check: GM answers, ripples, round events, whispers, moments, things said out loud
  - the established facts so far (the canon)
- **What it finds:**
  - contradictions between answers (two times for one event, a door both locked and open)
  - answers that contradict the truth
  - facts players have now established that the plan ignores
  - player actions that broke the case: an essential clue destroyed, a GM character confronted, someone moved
- **How it fixes, in order of preference:**
  1. **Canon.** It adds the fact to the established facts, which every later GM answer must follow (for example "The generator door was locked at 11:10; said in round 1").
  2. **An in-world correction.** A GM character corrects themselves through a ripple or a whisper ("Yashwant: I had the time wrong, it was 11:40"). It never blames or speaks for a player.
  3. **Restructure the future.** Small patches to future fields only:
     - a coming round's planned beat, question or options
     - an unfound clue's place or round
     - an unused hint's text
     - a GM character's knowledge
     - a backup clue when an essential one was destroyed

     The case must stay solvable at the chosen difficulty.
- **It never:**
  - changes the culprit, the method or the motive
  - undoes a player's discovery
  - takes back something said out loud without an in-world reason
  - reveals a secret
- **A failed or slow check** (180 s timeout) changes nothing; the next check catches up.
- **The check is logged** (problems found, fixes made) for the playtest report.
- **Cost:** about one extra background GM call per round, plus one per 8 answers.

## Polish carried over from the living story review

These are fixed in the story quality plan's polish task:
- Past world titles stay on the server (not in the view, not in the dataset export).
- Recent worlds come from one database query (newest 10, playtests skipped).
- When every idea matches a recent world, the idea that matches only the oldest world is drawn.
- The backdrop keeps the newest round picture through the final vote and the reveal.
- A restart mid-round draws the missing round picture.
- Tension also quickens the table's particle effects (snow, embers, fireflies, dust).
- Sparks flicker no faster than embers.
- The edge vignette fades smoothly (opacity, not gradient steps).
- Screens re-render only when the tension value changes, not every 5 s.

## Next steps (everything left, in order, as of 2026-10-18)

Branch `feat/first-playable`. Pushed up to 08a3f00; everything after (briefing pager, the living story plan, the plan docs) is committed but **not pushed**. Ask before pushing.

1. **Story quality** (this design): `docs/superpowers/plans/2026-10-18-story-quality.md`. The creator has approved the design, the difficulty levels and the consistency check; the plan is waiting for their go-ahead.
   - Tasks 1 to 7: difficulty, world fields, story issues, clue rounds, consistency check, nights from whereabouts, live check.
   - Task 8: continuity during play.
   - Task 9: polish.
   - Built here tests first, with one review at the end.
2. **The living map**, plan to write.
   - The creator chose "GM plans, code draws". The GM gives terrain, 6 to 12 made-up landmarks and the real scale of the place (one building up to a whole city). Code draws clean landmarks, winding paths and a compass in the world's colours.
   - Every path shows distance and time in m or km ("350 m, 4 min walk"; long trips also show the drive time).
   - It should share the whereabouts and distances work from story quality.
3. **The soundtrack**: `docs/superpowers/plans/2026-10-18-soundtrack.md` (approved, build it as written). Phase 2 AI audio is researched in its spec: Stable Audio 3 Small-SFX through MLX locally, or ElevenLabs Sound Effects with loop.
4. **Open questions for the creator:**
   - Should ripples land after a random 10 to 40 s delay, so their timing does not hint whose move it was?
   - Should code also filter ripples that describe another player's gestures?
5. **For the creator:**
   - Restart the 4321 server (Ctrl+C, then `nvm use 24 && npm start`) to get everything since 08a3f00.
   - A game night test of hot seats, then of the living story.
6. **Older open items:**
   - Playtest c0a2b6ac1d67 problems:
     - clue text names another player's secret
     - a sway is charged twice
     - leads are never closed
     - duplicate clue shares are wasted
     - whisper targets should exclude the actor
   - Deferred minors from the earlier plans, in the checkpoint `~/.gstack/projects/detective/checkpoints/20261018-161020-hot-seats-done-soundtrack-next.md`.
   - The pre-existing reader gap: a raw question reaches the GM when the reader fails.
