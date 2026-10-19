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
