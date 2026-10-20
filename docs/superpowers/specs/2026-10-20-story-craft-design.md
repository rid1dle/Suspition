# Story craft: worlds written as stories (2026-10-20)

The creator: "the mystery is good, but the story itself is not up to the mark". The bar is Lord of the Mysteries (the most complete world they have read), with Reverend Insanity and other complete worlds alongside it. Also in scope: Chekhov's gun, causal network theory (Trabasso and van den Broek 1985) and narrative transportation (Green and Brock 2000). The goal: a clean picture builds up from the things in the world, so the "things of note" list can go one day.

## What the audit found (11 worlds, the pipeline)

- **Every check was about fairness; none was about story.** The world writer never saw the story rules: STORY_CRAFT went only to the play prompt.
- **The truth was a list of events with no causes.** Dead branches passed: a power cut after the body was moved, a doctor drugged for no reason.
- **Setups never paid off:** a compass's power, a walking stick, a debt. **Answers were never planted:** a missing toe first seen in the clue that proves it.
- **Clues were flat facts by rule** ("Clues state the plain fact", "clue shows 1 sentence"). Two worlds had 0 clues with a voice.
- **GM characters only held facts; they wanted nothing.** Round beats came from nowhere and handed answers to the room.
- **No world had its own rules, and the reveal listed events.** The best worlds (Sealed Report, Cold Cup, Compass) were good by luck.

## What the research says matters, ranked for a 1 to 2 hour game written in one go

1. **Cause and effect** (Trabasso; LOTM "everything comes back"; Knives Out). Without it nothing lands, and it is what a model gets wrong most: flavour that goes nowhere.
2. **Clues as artifacts** (LOTM's diary pages; Gone Home; Golden Idol; Dark Souls item text; Dune's epigraphs). One hard fact hidden in a thing with a writer, a voice and an everyday reason to exist.
3. **Plant, then pay** (Chekhov; Breaking Bad's bear; LOTM's Megose and Lanevus).
4. **Reframes** (Roger Ackroyd; Book of the New Sun; Dark; LOTM's "Grimm has become a little odd"). The "it was all there" moment.
5. **Everyone wants something tonight** (LOTM's Tarot Club; Worm's factions; Disco Elysium; Twin Peaks). The world moves without the players, and red herrings come free.
6. **Hard rules with costs** (Reverend Insanity: every Gu costs and can fail; Worm's power limits; Shadow Slave's Flaw; Knives Out's Marta). Deduction and belief both come from limits.
7. **Fair play** (Knox, Van Dine, Ellery Queen's challenge, Obra Dinn): two independent sources per culprit step; nothing comes only from narration.
8. **Contradictions as play** (Ace Attorney, Danganronpa), with one negative clue (Silver Blaze's dog).

**What does not transfer:** thousand-chapter spans, slow pacing, whole-book unreliable narrators, time loops and power progression. The compressed form does: plant in the opening and pay in the last round, one diary split across rooms, and a plan per GM character per round.

Full research, with sources: the session scratchpad `story-craft-research.md` (copied into `dataset/research/2026-10-20/`).

## What was built

The lesson from before still holds: a rule written as a wish is met at its cheapest reading. So each wanted thing got a field the world writer fills, and a check in `server/craft.ts`.

| Rule | Field | Check |
|---|---|---|
| Cause and effect | `truth.timeline[].id, because, leads_to`; `why_tonight` | every step has a cause and leads to a step or a clue; at most one by chance |
| Artifacts | `clues[].form, author, written_at, text, from_step` | every clue has text and a real step; at least half are written; one written clue per round; one absence |
| Plant, then pay | `setups[]` | at least 4, 2 by round 1; each paid after it is shown; every key object is one |
| Reframes | `reframes[]` | at least 2; each flipped by a later clue |
| Agendas | `npcs[].agenda {wants, plan[{round, does}], leaves}` | every important GM character has 2 or more plan steps inside the rounds |
| World rules | `world_rules[]` | at least 1; used by a key deduction; shown before it is needed |
| Beats | (existing) `phases[].planned_beat` | never retells an essential clue |

- **The checks feed the existing story check,** which may now patch every new field.
- **In play:**
  - A found clue is quoted in its own words.
  - The round change gets each GM character's plan step and the setups due that round.
  - The reveal brings setups and reframes back by name.
  - Phones show a clue as the thing itself ("A ledger line, written by the butler at 9:10 pm"), with the plain fact under it.
- **Also:** a draft that breaks up to 6 patchable rules is fixed by one short call instead of written again. That was 16 minutes for 10 players.

## Not done yet

- **"Things that matter"** (`key_objects`) is still shown. Every key object must now be a setup, so it pays off. Removing the list waits until playtests show the artifacts carry the picture alone.
- **Rules ranked lower are not built yet:** a split document, contradictions per GM character lie, a public clock, capped allusions, and the reveal as an ordered chain. They are cheaper to add once the first six hold in live worlds.
