# UI and UX rules

How a Suspition screen is designed and judged. Three layers; when they disagree, the higher one wins:

1. **What the creator has settled** (the verdict ledger below): verdicts given on real screens of this game.
2. **The game's design language:** `DESIGN.md` (tokens, the house look, how each world's room look overrides it) and the shadcn primitives in `src/components/ui/`.
3. **The base: the impeccable skill.** It carries the general craft (design laws, cognitive load, interaction states, heuristics, UX writing). Load it; do not restate it here. Product facts are in `PRODUCT.md`.

## The idea behind it all

The talk in the room is the game. People glance at a phone for two seconds between talking out loud, and watch the table screen from a sofa across a dim room. A screen that needs reading slows the talk, and a slow talk kills the night.

Our recurring failure: **putting on screen what the code holds instead of what this group needs right now.** Every setting becomes a row, every state a panel, every reason a sentence. Each is correct and the screen still overwhelms. So:

1. **Fewest options, always** (the biggest rule). A choice that cannot change this group's game is hidden, not disabled. Rare choices fold away. Check every setting at 1, 2, 3 to 5 and 6+ players.
2. **The resting screen answers one question.** The phone: "what is happening and what can I do now?" The table: "where does the case stand?" Everything else opens on request.
3. **Readability first, mood second.** The world's look lives in titles and at the edges; reading always wins.
4. **The story sets the mood.** Sorrowful, tense, funny, eerie: the screens follow what the GM is telling, subtly, never in the reading area.
5. **Play all at once.** No screen waits for a turn with nothing to do. Turn moments (hot seat, vote) are short and pinned where you are already looking.
6. **Familiar beats clever.** Standard patterns and the shadcn primitive that already exists.
7. **Change what was asked.** A UI note names one element; fix that one.

## Using impeccable here

- **Where it is:** a user-level plugin at `~/.claude/plugins/marketplaces/impeccable/.claude/skills/impeccable/`; load its `SKILL.md`, then `reference/product.md` for phones and `reference/brand.md` for the table screen (mixed register, see `PRODUCT.md`).
- **For settings and forms** add `reference/cognitive-load.md` and `reference/interaction-design.md`; for labels `reference/ux-writing.md`; to review a screen `reference/heuristics-scoring.md`; when a screen is "too much", `reference/distill.md` and `reference/quieter.md`.
- **Context:** run `node ~/.claude/plugins/marketplaces/impeccable/.claude/skills/impeccable/scripts/load-context.mjs` from the repo root; it finds `PRODUCT.md` and `DESIGN.md` there.
- **Where impeccable and the game differ, the game wins:**
  - Theme: dark is decided by the scene (a living room at night), not by reflex.
  - Colour: each world brings its own palette (the GM's room look); the house palette is only the default. Never hard-code a colour that a world should be able to change.
  - Fonts: a world's character font goes on titles only; body, buttons and inputs use the one clean font.

## The verdict ledger

What was rejected and what was accepted, one line each. Add new verdicts the same way.

**Choices and setup**
- A setup with every option at once was rejected as "looking bad with so many options". Accepted: the start button pinned beside the join code; "The story" (where, mood, length, difficulty) and "The culprit" as one-line rows; everything else folded under "More options".
- Options that cannot change a 1 or 2 player game (round style, overrides alone, background-only GM characters, the culprit count when only one is possible) are hidden, not shown.
- "Play the round again" was cut: a wrong answer already turns the story.
- Group words for a player alone were rejected: "Get a hint", "Answer the round question now", no meeting button.
- One or two players play with no clock: a round ends when they answer it ("When you know, answer"), or "Move on" when it has no question. The GM says in the chat when they have seen enough to answer.

**Reading**
- Everything in the world font over a dotted grid was "much more noisy to read". Accepted: character fonts on titles only, text on solid cards.
- An animated film grain with a moving edge "is not looking good". Effects are scattered, faint, at the edges, never moving at the edge of the reading area.
- Grey italic GM narration was hard to read; narration is full-colour italics.
- Walls of text were rejected everywhere: short lines, plain words, written for a 12-year-old.
- Waiting screens say what is really happening, with an honest time ("about 16 minutes for 10 players").

**The phone (chat first)**
- Private and public apart: one mixed stream was rejected after a two-player game ("allow separation of private from public"). Accepted: chat tabs in the top bar, Room | Private by default, with Room | GM | People and One stream as a per-phone choice under Me. One composer with a To picker (Everyone or one person out loud; the GM or one player in private). The GM answers in the room unless switched off; it joins a message between players only when asked in.
- Players message each other; the GM reads it to keep the story whole but stays quiet unless asked in.
- Anything you found in private can go to the room: "Tell the room" drops a ready first-person line into the box to cut before sending; saying a find in your own words counts as telling it, and the clue no longer asks to be announced.
- "Let's all go there" is a card for everyone else (Go with them / Not now), from the map's "Ask everyone to come" or said out loud.
- The room hears characters, never the friends playing them: "Kabir said", not "Himanshu said".
- The first sheet shows where you are right now and what to try first (sent to the GM), not lines to introduce yourself to people who already know you.
- Whatever needs you now (a move to confirm, a vote, a meeting, your hot seat, your moment) sits in a tray right above the composer, not at the top of the page where the chat scrolls it away.
- Drawers in the top bar (Me, Goals, Clues, Map, People, Case file) instead of tabs of big panels.
- No limits shown as counters: talking and acting are free.
- Asking about the world, its powers and rules, or "what do I do now?" never costs a point. A "-1 Breaking the rules" on a world question was rejected: the GM answers like a guide, with what you know and 2 or 3 things to try.
- A player alone with an empty chat at the start "doesn't know how to even start". Every player's chat opens with a first lead: where they are, one thing happening near them, and what to try first.
- Every person in People (and on the card, under "Your people") says who they are to you, for every group size.
- "In between we just lost interest" (a two-player game): the same question came back three rounds running, three 1-1 votes ended in nothing, a GM character found the lamp the player had walked to, the tape was blocked twice, and the feed said "The story needs one more round". Accepted, after causal network theory (Trabasso and van den Broek 1985) and narrative transportation (Green and Brock 2000): every turn is caused by something a player did and says so; no dead-end replies; a player who is there finds it; an obstacle at most once; no repeated lines; the story never mentions votes, rounds or counts; a lead never asks the same answers again or chains; a split vote is talked out once; recaps read as cause and effect.
- A wrong round answer is the room's theory, not a mistake: no red cross and no "Not quite". The GM folds it into the story when nothing anyone has seen says otherwise, or leads them back with a story line, a clue and a new round.
- "Where we are now" only says what the players have seen or been told; a recap line nobody heard is dropped.
- The room's buttons (meeting, hint, vote early) sit in the bottom bar above the message box, never at the top of the chat where they scroll away.
- After your final answer the phone shows who has picked and who is still picking, not an empty screen.
- A culprit's phone looks exactly like an innocent's, in layout and in words.

**The table**
- During play the left column is only what the room needs right now (banners, the round card with the big question and the vote, the recap, Tell the GM). Reference lives in tabs on the right: Map, Things, Timeline, Alibis, Clues, People (with who plays who). A long left column of everything was sent back.
- The briefing keeps "Start round 1" at the top of its column, seen at once; long reference (alibis, the whole night on the reveal) folds.
- A panel with nothing in it is hidden, not shown empty ("No round votes" was rejected).
- The room feed sits beside the map, not at the bottom under the cards.
- Alibis are statements, not table cells: each person's own words first ("I was at dinner at seven, then back at my dispensary..."), the short where-and-when grid under them as "In short".
- Music is never a setup chore: "I don't want to set the sound myself every game". The GM picks the direction that fits the world and says why in one line; "Change" folds the list away.
- The map must feel like a map, not a diagram: a grid of place cards was "not good, doesn't feel like a map". Accepted: the GM draws each world's map once (top-down, in the world's art style, no words) to fixed spots; Leaflet shows it with map zoom, drag and pinch; names, people and distances sit on top and tidy themselves by zoom (less detail, then a pin); the phone opens on you; tapping a place lights the way there with the walk time and Go there; the big screen has a Bigger map view. Distances stay visible on the paths.

**Words**
- Plain labels, one reading per action ("Show everyone", "Tap again to end it").
- Never assume a murder: "the culprit", "the case", not "the killer".
- Players never see our internal word "table": the shared screen is "the big screen" ("The table is on card 1" read as a table of data).
- No em dashes anywhere, in UI or GM text.

**Carried over from the creator's platform rules** (they hold here too)
- One emphasis per area; secondary controls are quiet text, not pills or boxes.
- The next action sits directly under the thing that asks for it.
- Destructive actions are small and need a second tap.
- No invented structure: group by what the game really has.
- Use the space: no half-empty columns beside a long one.
- Look at a screen at its real size with the largest real data: the table at 1440 x 900, a phone at 400 x 860, 10 players, a long world name.

## The check before showing a UI change

1. What is the one question this screen answers right now, and does the resting state answer it?
2. Is every choice on it able to change this group's game? If not, hide it.
3. Can it be read in two seconds on a phone, or from the sofa on the table?
4. Is there one emphasis per area?
5. Does every label have one reading, in plain words?
6. Does it follow the story's mood without touching the reading area?
7. Does a culprit's version look exactly like an innocent's?
8. Does it hold up at 1 player and 10, a long name, empty, and phone width?
9. Does it break any verdict in the ledger?
10. Was anything changed that the request did not ask for?

For a fuller review, score it with impeccable's `reference/heuristics-scoring.md`.
