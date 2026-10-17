# Detective: design

A hidden-role mystery game for people in one room. Each player uses their own phone. A shared
table screen shows the public picture. Claude, running headless on the host laptop, is the
game master: it writes a fresh world for each group, holds the truth, answers private
questions, and scores the final reconstruction.

## Why

The fantasy is "we figured out what really happened", with the social bluffing of Secret
Hitler: any player might be the culprit, everyone has something to hide, and the talk at the
table is free. The game only steps in to move time forward, answer private questions, hand out
hints and judge the ending.

## Goals

- One command starts it. Players join by scanning a QR code; nothing to install.
- Every game is different: setting, culprits, twists and goals are generated from the group's
  setup answers.
- Every character has three layers: **public** (everyone sees), **private** (only the player),
  **unknown to them** (true about them, revealed at the end or by investigating themselves).
- Every private goal ties back to what actually happened. No filler secrets.
- The truth is fixed before play and never changes. Answers stay consistent with it.
- Time and suspicion are real trackers that change what happens, not decoration.
- The host can play. No screen the host looks at shows spoilers.

## Non-goals (v1)

- Remote play over the internet (later).
- Dice, combat, character progression, campaigns.
- Accounts, multiple simultaneous games, or a hosted server.

## Anti-goals

- A mystery that can be lost because one clue was missed. Every key deduction needs at least
  two independent clues.
- The GM inventing facts that contradict earlier answers, or bending the truth to fit a theory.
- Phone screens that reveal a player's side by their layout. A culprit's phone looks exactly
  like an innocent's.
- Any API response that leaks the truth or another player's private card.

## How it is built (decided)

- **Node 20, no framework.** `node:http` server, Server-Sent Events for live updates, plain
  HTML/CSS/JS pages. One dependency: `qrcode`. Tests use the built-in `node:test`.
- **GM = `claude -p`** on the user's normal Claude login (no API key). Flags that keep each call
  fast and isolated: `--strict-mcp-config --mcp-config {}`, hooks disabled,
  `--no-session-persistence`, no tools, `--setting-sources project` (keeps the developer's global
  CLAUDE.md out of the GM's context), a custom system prompt, and `--json-schema` so every answer
  comes back as validated structured output. Measured: about 4 to 10 seconds for a short call.
- **The truth lives in files** under `game-data/`, so a server restart resumes the game and
  every GM call reads the same canonical scenario.

## Flow

1. **Lobby.** Host runs `npm start` and opens the table screen. It shows a QR code and a join
   link. Players enter a name and, optionally, a wish for their character.
2. **Setup.** On the table screen the host answers: setting (or "surprise us"), tone, length,
   number of global hints, anything about the group. Then "Write our world".
3. **Generation.** One GM call writes the whole scenario (below). The server validates it and
   retries once with the errors if it is malformed.
4. **Reading.** Each phone shows its card. The table shows the opening scene. Players tap
   "I've read it"; the host starts the first phase.
5. **Phases.** The game runs in 3 to 5 named phases (for example Evening, Late night, Dawn), each
   with a timer and a per-player question budget. During a phase players talk freely, and on
   their phones they can:
   - **Ask the GM** a private question: interview a character, search a place, examine something.
   - **Investigate themselves**: try to uncover one of their own hidden facts.
   - **Take a secret action**: anything their character might do covertly (destroy, plant,
     mislead, follow someone). Every player has this button, so it reveals nothing.
   Each costs one question from the phase budget. Answers can find clues, change suspicion,
   create a public event on the table, or send a private message to another player.
6. **Phase change.** Host taps "Next phase" (or the timer runs out). The GM moves the world on:
   a public event, private messages, clues lost, suspicion effects. Budgets refill.
7. **Global hints.** Any player can propose spending one. Everyone votes on their phone; a
   majority spends it. Hints come from a ladder written with the scenario, vague to specific.
8. **Final reconstruction.** After the last phase each player submits who did it (from the cast
   list), how, and why, plus how they did on their own goal. Culprits submit too.
9. **Reveal.** The group verdict is decided in code: if a majority named exactly the right
   culprit(s), the investigators win; otherwise the culprits win. The GM then scores method and
   motive per player, judges personal goals, and writes the reveal. The table shows the story,
   every card (public, private, hidden facts), the twists and the scores.

## The scenario (what generation produces)

- Title, a public setting summary and an opening scene read on the table.
- **Truth**: summary, timeline, culprit ids, method, motive.
- **Player characters** (one per player): name, role, public info, private info, goal, side
  (`investigator`, `culprit` or `wildcard`), hidden facts, what they know at the start.
- **GM characters**: role, public description, what they know, secrets, lies, what they reveal
  freely and under pressure.
- **Locations** and **clues** (what each shows, what it does not prove, where it is, whether it
  can be destroyed).
- **Key deductions**, each backed by two or more clue ids.
- **Phase plan**: name and planned beat per phase.
- **Hint ladder** and **twists** (secret until the reveal).

Culprit count scales with the group: one culprit for up to 5 players, possibly two (who may
know each other) for 6 or more. The GM picks twists from a menu: a wildcard role, a culprit
team that does or does not know each other, one player who secretly knows part of another's
card, a goal that changes mid-game, one false hint on the ladder (always exposed at the reveal).

## Trackers

- **Time**: phases, a timer per phase, and a question budget per player per phase (2 to 4,
  by game length). Things happen as phases pass.
- **Suspicion** (0 to 100): loud or careless moves raise it, especially culprit actions. The GM
  reads it at every phase change; high suspicion makes the culprit's position worse (witnesses
  remember, evidence surfaces).

## Privacy rules

- The table view is built only from public fields until the reveal.
- A player's view holds only their own card, their own thread, and public state. Hidden facts
  appear only once revealed.
- Players are identified by a random token kept on their phone. The host token lives on the
  table screen.

## Left to the builder

Visual style, exact prompt wording, timer defaults, retry and concurrency limits.

## Calls I made (not discussed)

- Setup uses a fixed form, not a GM-led conversation.
- One game at a time per server.
- Hints come from the pre-written ladder rather than a fresh GM call, so they are instant and
  consistent.
- The winner is decided in code from the culprit votes, not by the GM.
- The "lock someone up" vote is left out of v1.
- Notes are kept on each phone only.
