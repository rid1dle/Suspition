# A story that moves with the room

Status: approved by the creator ("design everything, I approve all already", 2026-10-18), written from their notes after the third real game ("The Sealed Report", 3 players, hot seats, hard).

## What went wrong in that game

- **The rounds never moved.** 4 rounds were planned and 4 were played. The round check ran 6 times, found 2 to 6 story problems each time, and added 0 rounds. Asking the GM "do you want another round?" is met at its cheapest reading: never. (See the vault note on rules a model meets at its cheapest reading.)
- **Every round was written before play.** The names were fixed and every vote was the same "Who should the room look at?".
- **The room voted blind.** The players said they "didn't even have an idea of what is going on": they and the game were out of sync, so all four votes were made without a shared picture.
- **Turning suspicion earned nothing.** The culprit pushed blame onto others, and the room looked away from him in two rounds, but nothing in the game noticed or rewarded it.
- **The creator wants a story with a shape,** of any kind the game picks, and at the end to hear what kind it started as and what it became.

## The design

### 1. Code decides how long the story runs

After each round's vote, `storyPace(game)` returns `more`, `on` or `sooner`. Code decides, so it cannot be skipped.

- **Only public signals decide it.** Who the room picked in a spotlight never does: a round added or cut because the pick was right or wrong would tell everyone who did it, since the round count is on every screen. (Changed after the review; the first version paced on spotlight picks.)
- **more:** the coming round would be the last planned one, and at least one of these holds:
  - the room's last quiz answer was wrong (a quiz result is public already)
  - fewer than half of the clues opened so far have been found by anyone (worlds whose clues have no rounds skip this)
  - the last story check said the case is not solvable

  One round is added before the closing round, up to +2 in all (the existing `EXTRA_ROUNDS`). The GM names it at the round change.
- **sooner:** at least 4 rounds are planned, the coming round is not yet the last, at least 3 clues are open and 9 in 10 of them are found, and the last check did not say unsolvable. The coming round becomes the closing round: the middle rounds between are dropped and their clues open in the closing round. At most once a game, never below 3 rounds, and no round is added after it.
- **on:** nothing changes.
- The room is told: "The story needs one more round." or "The room is closing in. The next round is the last."
- The phone and the table say "Round 2 of 4" as now; the count simply changes when the story does.

### 2. Each round is written as it starts

The round-change GM call (it already writes the loud event, the job and the recap) also returns:

- `round_name`: 2 to 5 words named from what happened, not the plan. It replaces the planned name. Empty keeps the plan's.
- `because`: (it may name the person the room just picked, culprit or not, since that pick is public; any other culprit's name drops the line, so a missing line never tells) one line that ties the room's last choice to what happens now ("Because the room looked at Nikhil, the clerk is asked for the seal log."). It is the first line of the new round, so everyone sees their choice matter.
- `vote`: the coming round's question, in one of two kinds:
  - **spotlight:** who the room looks at (as now)
  - **choice:** a story decision for the room with 2 or 3 options and no right answer ("Break the strongroom door now, or wait for the key?"). The room's pick is told to the next round's GM call and to the story check, the same way a spotlight is, so the story follows it.

  A planned quiz question (classic style, with a right answer) stays unless the GM gives a valid replacement. If the GM gives nothing valid, the round keeps what it had. Two choice rounds in a row are not allowed: code turns the second into a spotlight.

### 3. Everyone knows where things stand

- **Before every vote:** a "Before you vote" card on every phone and on the table. It shows the recap lines and the still open questions, and for a spotlight, one public line about each person (the latest public fact about them). It sits above the options.
- **At every round change:** the `because` line, then the recap ("Where we are now") as a pinned card at the top of the round, with the open questions. In the chat-first phone this is the first item of the new round.

### 4. Turning the room is rewarded

After a spotlight vote, code awards play points (the existing play rubric, once per player per round):

- **Turned the room away from you:** a player who was the room's pick (or had 2 or more votes) in the last spotlight, has fewer votes now and is not the pick, and spoke out loud this round (an out-loud ask, a moment said, or a hot seat answer): +1, skill `bluffing` for a culprit and `persuading` for anyone else.
- **The room followed your lead:** a player who named the person the room now picks in something said out loud this round, before the vote: +1 `persuading`. Never for a culprit's own name.

The points show in the player's play line like other points. The scorer sees them.

### 5. A story with a shape, said at the end

- At world writing, code picks a story type at random from a fixed list (not the GM's choice, so it varies): revenge, family secret, cover-up gone wrong, love triangle, blackmail spiral, crime of mercy, heist gone wrong, betrayal among friends, rivalry turned deadly, inheritance fight, a ghost story with a human hand, a frame-up. The generation prompt builds the world in that shape. It is stored on the world as `story_type` and is secret until the reveal.
- Each story check also returns `story_now`: what kind of story this is becoming, under 12 words, from what players did. The latest is kept with the round it came from.
- At the reveal, the table and phones show: "This story began as a blackmail spiral. It became a frame-up that fell apart." The scorer's reveal story ends with that line.

## Out of scope

- The chat-first phone layout (its own design); this design only adds the cards it needs.
- Changing the truth or the culprit; only the rounds, their names, votes and events move.

## Tests that pin it

- `should add a round when the room's last spotlight missed before the last round`
- `should not add a round past the cap`
- `should close sooner when the room found the culprit twice and most clues`
- `should never close below 3 rounds`
- `should rename the round from the GM's round_name`
- `should show the because line first in the new round`
- `should run a choice vote and tell the next round what the room chose`
- `should turn a second choice round in a row into a spotlight`
- `should award a point to a player the room turned away from`
- `should award a point when the room follows a player's lead`
- `should not award a lead point for naming yourself`
- `should pick a story type at random and keep it secret until the reveal`
- `should say what the story began as and became at the reveal`
