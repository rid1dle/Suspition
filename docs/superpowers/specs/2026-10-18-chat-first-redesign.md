# What comes next: finish, then a chat-first redesign

Status: DRAFT, written 2026-10-18 from the creator's notes after the second real game. Every item here is waiting for a design pass and the creator's yes before it is built.

## Where we are

- Branch `feat/first-playable`. Pushed up to a19b3cb. Built since then, not pushed (all tests pass, 862 at 7aacef1):
  - **Story quality round 2,** Tasks 1 to 9:
    - checks on the culprit's whole path
    - giveaways by role
    - GM characters and the card check can no longer hand out later clues
    - herrings that mislead
    - impossible clues
    - claims answered in code
    - pronouns
    - the round check runs after the new round's event
  - **From the real games:**
    - how characters talk across rooms
    - places that matter: tap the map to go, a confirmed move, and an announcement to the room
    - a point for each trip that finds something
    - the spotlight vote shows no right or wrong
    - the story follows the room's choice
    - backstories
    - a goals panel
    - goal steps the GM ticks off
    - objects that matter, told up front
    - a pinned "your turn" banner on phones
    - the GM never lies but may hold back
    - rejoin codes on the table
- **Not yet done from round 2:** Task 10 (live check: two worlds, the audit, a two-round bot playthrough) and the final review. The ledger is in `.superpowers/sdd/2026-10-18-story-quality-2/progress.md`.
- **Measured on the last real game:** the world took about 6.5 minutes of GM thinking before it started writing. Expect 10 to 13 minutes in all. This needs a look.

## 1. Finish what is open

1. **Story quality round 2:** Task 10 and the final review. The creator's game notes go into the review.
2. **The living map:** the GM plans terrain, 6 to 12 made-up landmarks and the real scale, and code draws them.
   - Paths show distance and time ("350 m, 4 min walk"; long trips also show the drive). The scale can grow to a whole city.
   - It reuses whereabouts, places and the new movement (going somewhere is now a real step).
3. **The soundtrack:** the plan `docs/superpowers/plans/2026-10-18-soundtrack.md`, as written.
4. **A UI audit:** some buttons do nothing and some are useless. Walk every screen in a real game (table and phone, each phase) with the browser:
   - list each control and what it does
   - fix what is broken and remove what earns nothing
   - the result is a short table: control, screen, verdict (keep, fix, remove), reason
5. **Sound:** check every sound cue against the game's moments; nothing silent where the room needs to notice, nothing noisy for small things.
6. **The big story playtest:** 15 to 20 or more agent players, each with their own motive and human side, after the map and soundtrack.
7. **Older open items:**
   - the deferred minors in the two story quality ledgers and the earlier checkpoints
   - playtest c0a2b6ac1d67's problems
   - the reader gap: a raw question reaches the GM when the reader fails

## 2. The redesign: chat first

**The idea.** The game is role play first. What players do most is talk in character and discuss, so the chat is the game. Everything else (the card, clues, goals, map, people) supports the chat, a tap away, never in its way. Some inspiration from Among Us, not much: meetings, rooms you move between, small tasks, a shared suspicion. The point stays RP and discussion.

### The phone

- **One main screen: the chat.** One stream in story order:
  - what was said out loud
  - the GM's answers to you
  - GM characters speaking
  - ripples
  - moves ("Nikhil goes to the Lamp Room to check something")
  - round events, votes and their results
  - your turn calls

  The composer sits at the bottom.
- **Support, a tap away:** your card (backstory, secret, goal steps), clues, things that matter, the map with "go", people and alibis. These are compact drawers or chips, not tabs full of big panels.
- **Cull:**
  - big panels that repeat each other (the recap, the goals panel and "still open" say much the same)
  - the timeline and alibi lists as permanent blocks
  - anything nobody tapped in the real games
  - the UI audit decides each one
- **Start from your story.** On joining, show the backstory first ("Your story so far"), then the hook, then a nudge to speak: "Introduce yourself to the room" with two or three suggested first lines the player can tap and edit. The first message is the hardest; make it one tap.

### Talking and doing: two stages instead of a question limit

Today each player has a few private questions per round. That cap stops people from playing. Proposal (to confirm):

- **Talk (unlimited):** talking in character, to the room or to a GM character.
  - Short answers on a fast model.
  - It never finds a clue, moves anyone or changes the world. It can only reveal what that person would say.
  - A gentle cooldown (one message in flight per player) keeps the GM from flooding.
- **Act (limited, real):** a move that changes the world: go somewhere, search, take, hide, plant, follow.
  - A few per round, as today's questions.
  - Each act is confirmed ("Go to the Lamp Room? Everyone will see you go.").
  - Each act is announced to the room as a move (where, never why), and resolved by the full GM with clues, ripples and goal steps.
- **The composer picks the stage:** the reader already tells a question from an action. A message that would act asks "This is an act. Use one? Go / Just say it".
- **Why this over the alternatives:**
  - Unlimited everything floods the GM and lets one player solve the case alone.
  - A hard cap on all messages kills the role play, which is the point.
  - Two stages keep talk free and keep the case paced by acts.

### Actions everyone can see

Keep and extend what was built in the last game:
- moves on the map
- "X goes to the shed to check something"
- the trip point
- the pinned turn banner

Make them feel like the room's events in the chat, with a small icon and the place. Never say what the player meant to do there.

### Among Us, lightly

- **Meetings:** any player can call one when something big happens (a find, a ripple, a contradiction). Everyone gets pulled into one discussion screen for a short time, and it ends with an optional vote on who the room looks at. This replaces the fixed round vote as the main way to discuss and suspect.
- **Tasks:** the goal steps and trips are the tasks. Doing them is how a player has something to do between talks.
- **Rooms:** where you are matters (already built); the map shows who is where, the moves are public.
- **Not taken:** kills, sabotage timers and "ejecting" players. Nobody leaves the game; RP needs everyone in.

## 3. Constraints that carry over

- RP first: players drive their own characters. Nothing about a player is told before that player knows it; the GM never lies; refused moves are explained.
- The host plays: no host screen or terminal shows a secret.
- Plain short English on every screen and in every GM line.
- Readability over effects; the world's style at the edges.

## Open questions for the creator

1. **Talk and act:** is the split right, and how many acts per round (today's 2 or 3)?
2. **Meetings:** should they replace the round vote, or sit beside it?
3. **The order of the work:** UI audit and fixes first, then the chat-first phone, then the map and soundtrack, then the big playtest. Or the map and soundtrack first, as planned before?
