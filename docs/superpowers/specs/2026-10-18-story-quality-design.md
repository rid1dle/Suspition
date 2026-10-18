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

## Player agency first (added by the creator, 2026-10-18)

"It's an RP first game, so they should know what they are doing before the other characters." The game must never announce what a player's character did, said or where they were unless that player did it in play or it is on their own card. The failure this prevents: the room hears "Rishabh says Nikhil went to the shed" when Nikhil never decided that and does not know it.

- **The source rule.** A player character's actions, words and whereabouts may appear in any GM text only from:
  - their own card (private_info, starting_knowledge, night, revealed hidden facts), or
  - their own record in play (their moves, things they said out loud, moments they accepted).

  This covers answers, ripples, round events, recaps, hot seat whispers and follow-ups, and continuity corrections. Nothing else, including another character's account.
- **Other characters may only report what the player did in play or what is on that player's card.** A GM character can say "I saw Nikhil by the shed" only if Nikhil's card or record puts him there.
- **When the story needs something new from a player character** (a continuity fix, a new beat), it goes to that player first, privately, as an offer they can take or change. Example: "The story needs to know where you were at 11. Say it, or tap: by the shed." Only after the player answers may anyone else mention it.
- **Code backs the prompt rule.** The puppet filter today drops reported speech. It extends to actions and gestures: a sentence that has a player character move, act or react ("Nikhil went", "Ben flinches") is dropped unless the fact is on their card or in their record. This also closes the living story review's "ripples about gestures" question.
- **The checks enforce it.**
  - The consistency check (before play) confirms every truth and whereabouts fact about a player character is on that player's own card.
  - The continuity check (during play) lists any text that has a player doing something they never did. It fixes it with a correction or a private offer, never by asserting it.
- Built in the story quality plan as part of Task 7 (continuity) and a new player-agency task, ahead of the polish task.

## Moves that would break the story (added by the creator, 2026-10-18)

"The GM should be able to honour them but not create contradictions. Sometimes user requests will directly cause contradictions; that is the GM's responsibility to identify such requests, reject them and let the user know." There is no request box after the room is built, and there never will be: the story changes through what players do and say.

- **Honour by default.** A move that fits the truth, the canon and what others have established changes the story (a player builds a cover story, plants doubt, finds a reason). The GM builds on it.
- **Refuse what cannot be true.** A move whose outcome would contradict the truth, the canon, another player's own record or a found clue does not happen. Examples: "I find the letter that proves Ben did it" when Ben is innocent; "the door was never locked" after the room heard it was.
- **Tell the player.** The answer shows it in the story (the drawer is empty, the guard remembers the lock) and the player gets one plain line under it saying why the story cannot go that way ("That can't happen: everyone already heard the door was locked at 11:10."). Never silent, never a rules lecture, never a secret.
- **Code backs it.** The answer has a `refused` field. A refused move finds no clue, moves nobody and sends no ripple, and it is logged for the playtest report.

## Rounds grow with the story (added by the creator, 2026-10-18)

"When the world changes as players say things and do actions, the number of rounds cannot be constant, or it would cause contradictions. But not over a limit, or the game would become endless."

- **The continuity check may add a round** when what players did opened something the rounds left cannot close (a new suspect thread, a destroyed clue that needs a new way in, a big turn). At most one per check, with a reason.
- **The limit:** at most 2 rounds more than the game started with, counting replays of a round voted wrong. Never more. Within the limit, adding is the GM's call; past it, the case must close in the rounds left.
- **Where it goes:** before the last round, so the last round stays the closing one; never into the round being played. Clues and timeline entries for later rounds move back by one round with it.
- **Everyone sees it:** the table says "The story needs one more round. There are now 5 rounds." The rules on the phones count the new total.
- **Rounds only grow.** A round is never taken away: its clues and red herrings would be stranded. The host can always move on early with Next round.

## Polish carried over from the living story review

These are fixed in the story quality plan's Task 8 (polish):
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

1. **Story quality** (this design): built on 2026-10-18 (Tasks 1 to 9, 7b, 7c, 7d, review fixes). Live check on 2 Normal worlds: every innocent now has a motive (0 of 10 without one, against 6 of 11 before), culprit, method and motive are each reachable, both worlds valid on the first draft. Still short of the baseline: 4 or 5 major plot holes per world (complete 2 of 5), a single late clue can still name the culprit, red herrings 2 to 3 of 5.
   **Story quality round 2** (next, waiting for the creator), from the audit and the bot playthrough:
   - Whereabouts at every step of the culprit's path, not only the crime time; flag anyone awake on that path.
   - The giveaway check also catches roles, initials, surnames and a trait only the culprit has, in every round.
   - GM character sheets never hand out a later round's clue (reveals_freely and knows gated by round); patches may fix reveals_freely.
   - The card check (alibis, reveals, reminders) cannot refute a herring before its round or hand over a culprit clue; story issues run again after it.
   - Herrings: the target has no public alibi at the crime time, pointers open before the clearing clue, and the refutation makes it impossible.
   - The check catches clues that cannot exist (marks from later events, witnesses who were elsewhere) and motives or goals with no source in the world.
   - Variety covers hidden facts and late clues ("the victim was secretly kind" came back there).
   - Code-side refusals when the reader finds a claim the GM neither grants nor refuses; "he"/"she" in the action filter; the continuity check also runs after the round event is written.
   - Tasks 1 to 6: difficulty, world fields, story issues, clue rounds, consistency check, nights from whereabouts.
   - Task 7: continuity during play.
   - Task 7b: player agency first (the source rule, the private offer, the action and gesture filter).
   - Task 7c: moves that would break the story are refused and the player is told why.
   - Task 7d: rounds grow with the story, at most 2 more than chosen.
   - Task 8: polish.
   - Task 9: live check against the audit.
   - Built here tests first, with one review at the end.
2. **The living map**, plan to write.
   - The creator chose "GM plans, code draws". The GM gives terrain, 6 to 12 made-up landmarks and the real scale of the place (one building up to a whole city). Code draws clean landmarks, winding paths and a compass in the world's colours.
   - Every path shows distance and time in m or km ("350 m, 4 min walk"; long trips also show the drive time).
   - It should share the whereabouts and distances work from story quality.
3. **The soundtrack**: `docs/superpowers/plans/2026-10-18-soundtrack.md` (approved, build it as written). Phase 2 AI audio is researched in its spec: Stable Audio 3 Small-SFX through MLX locally, or ElevenLabs Sound Effects with loop.
4. **The big story playtest**, after the map and the soundtrack are built. 15 to 20 or more agent players, each with their own motive and human side (stubborn, chatty, a liar, a peacemaker), most of them actively driving the story their way through moves and things said out loud, some making moves that would contradict it. It measures: moves honoured, contradictions the GM let in, moves it rightly refused and told the player about, and whether the case is still complete and solvable like Lord of the Mysteries at the end. Results go to the creator before any change.
5. **Open questions for the creator:**
   - Should ripples land after a random 10 to 40 s delay, so their timing does not hint whose move it was?
   - Should code also filter ripples that describe another player's gestures?
6. **For the creator:**
   - Restart the 4321 server (Ctrl+C, then `nvm use 24 && npm start`) to get everything since 08a3f00.
   - A game night test of hot seats, then of the living story.
7. **Older open items:**
   - Playtest c0a2b6ac1d67 problems:
     - clue text names another player's secret
     - a sway is charged twice
     - leads are never closed
     - duplicate clue shares are wasted
     - whisper targets should exclude the actor
   - Deferred minors from the earlier plans, in the checkpoint `~/.gstack/projects/detective/checkpoints/20261018-161020-hot-seats-done-soundtrack-next.md`.
   - The pre-existing reader gap: a raw question reaches the GM when the reader fails.
