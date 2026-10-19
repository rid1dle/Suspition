# Story playtest, 2026-10-19: results

Twenty made-up players (`scripts/story-playtest.ts`) in two games of ten, the most a game takes. Most of them pushed the story their own way (drivers); some pushed moves that contradict it (contradictors); a few played fair, tried to break the game or tried to sway the GM. A judge on the GM model read each finished game. The full reports are kept outside the repo, in the session scratchpad.

## Game 1: "Rain on the Rani Haar" (a monsoon wedding)

5 rounds (the story added one). The room named the right culprit. The case stayed solvable to the end.

| Measure | Count |
|---|---|
| Moves the GM honoured (a player's theory or detail shaped the story) | 10 |
| Moves rightly refused, with a reason | 10 |
| Contradictions let in | 7 |
| Leaks | 6 |
| Lines that spoke for a player | 4 |
| Breaches (a bot swayed the GM) | 0 |

**Main cause found:** the out-loud GM was given everyone's claimed alibis in a field named `where_people_say_they_were`, read it as fact and quoted it as "the record". A claim that was a lie became a contradiction or a leak. **Fixed:** the field is now `alibis_claimed_not_checked`, with a rule never to quote it as fact or call anything "the record".

**Second cause:** the reader cut a spoken line at 30 words, and the GM narrated the cut as the character choking up. **Fixed:** spoken lines are kept whole.

## Game 2: "a night train stuck in the snow"

The first try failed: a ten-player world took more than the 15 minutes the writer allowed. **Fixed:** the limit now grows with the group (15 minutes up to 6 players, 90 s more for each one after). The rerun's world took 13 minutes.

6 rounds. Every vote was right, and the case stayed solvable.

| Measure | Count |
|---|---|
| Moves honoured | 7 |
| Rightly refused | 7 |
| Wrongly refused | 7 |
| Contradictions let in | 8 |
| Leaks | 4 |
| Lines that spoke for a player | 6 |
| Breaches | 0 |

**Main cause found:** a meeting called in round 1 never ended. The harness never ran the server's once-a-second clock, and nothing ended a meeting at a round change. So every act and move was held for six rounds. That caused the wrongly refused moves, the lost points and the "your hand stops" lines. **Fixed:**
- a meeting ends with its round, or when a vote starts
- the harness runs the clock
- an act the game holds back never costs a point
- the GM must say a held act waits, never that the player chose not to

**Also fixed:** an added quiz round whose right answer named the culprit ("That is right!" before the final vote) now becomes a spotlight.

## Left for the creator (not fixed)

- **NPCs contradict themselves**, then say "I spoke wrong". A fixed list of each GM character's facts would help.
- **Claims repeated as facts:** the GM sometimes repeats a player's claim as fact. A list of confirmed vs only-claimed facts would help.
- **Card facts leak:** a round's reward line can carry a fact from a private card. This is hard to check in code.
- **Scoring:** the fair part of a move that also tried to sway the GM still scores as swaying.

## After the playtest (2026-10-19, later)

- **GM characters contradicting themselves:** fixed. Each GM character's own lines (to the room and privately) are kept and handed to both the private and the out-loud GM, with the rule never to contradict them and never to repeat a private line to the room.
- **Round lines carrying a private card:** fixed. A reward, a round event or a "because" line that retells a sentence only a player's own card holds is dropped (a round event loses just that sentence), until the room has heard that fact in public.
- **World writing time:** measured, not changed. A 10-player world spends about 9 of its 12 to 13 draft minutes thinking. Two 10-player worlds written with less thinking took 11 and 12.5 minutes in all instead of about 16, but both needed the story repair pass and kept more holes (5 and 2 left after the card check, against 1 and 1). Running the story check and the card check side by side would save about 2 minutes, but the card check would then write facts from a draft the story check is still changing. Both trade consistency for time, so neither was done. The table now tells the room the real wait for its size (about 11 minutes for 4 players, 16 for 10).

## Second run, on the fixed code (before the GM memory and private card fixes)

| Measure | Game 1 | Game 2 |
|---|---|---|
| Moves honoured | 9 | 8 |
| Rightly refused | 15 | 8 |
| Wrongly refused | 0 (game 2 of the first run had 7) | 1 |
| Contradictions let in | 4 | 8 |
| Leaks | 2 | 3 |
| Breaches | 0 | 0 |
| Case still complete | yes | no |

- **The meeting fix worked:** no act was blocked by a stuck meeting.
- **Game 2's contradictions:** mostly one GM character taking back his own words (6 times). The GM memory fix that came after this run targets exactly that.
- **New findings, left for the creator:**
  - **Two culprits:** game 1 had two. 6 of 10 players named one of them and the culprits won. Players can pick more than one person, but nothing tells them there may be two, and naming one of two counts as wrong. Should the final screen say "there may be more than one", and should naming one of two earn partial credit?
  - **Game 2 not solvable at the end:** leads the room raised again and again (a candle count, shawls in first class) were never checked by anyone, and two secret goals had nothing findable to reach them.
  - **"You told us" lines:** a GM character said "you told us you are from Amritsar" to a player who never said it.
