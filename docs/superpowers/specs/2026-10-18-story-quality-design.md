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
