# Suspition on Next.js: design

Date: 2026-10-18. Builds on `docs/design.md` and `2026-10-18-know-the-players-design.md` (done, on
`feat/first-playable`, 413 tests, 21 saved attacks holding).

## Why

The game works, but the screens are plain, every world looks the same, and the "Making your mystery"
screen shows the same 13 fixed steps every time. The owner wants a rewrite in Next.js with the best
current libraries: more interactive, more fun, a look that changes with each game world, and a
database if it helps. The owner also plays test games and odd games that must not teach the game
anything, so they need to choose which games it learns from.

## Goals

1. **Choose what the game learns from.** List every saved game, mark it as a real game, a test or an
   outlier, and change that later. Only real games teach profiles, skills, ratings and bot samples.
   Nothing is ever deleted. A game can be marked "Test game" at setup.
2. **Steps the model chooses.** While a world is being written, the GM picks its own short,
   spoiler-free steps for this world. They show one by one like Claude's own UI. Same on phones.
3. **A room for each world.** The GM picks the look of each world (colours, fonts, texture, a gentle
   moving background, sounds) from presets that always look good and stay readable.
4. **A fun, interactive table and phone.** Animation, sound and touch that make moments feel big
   (character reveal, round vote, the accusation, the answer) without slowing anyone down.
5. **Next.js, TypeScript, a real database.** Keep everything that works: the engine, the reader wall,
   play points, profiles, playtests, attacks and every test.

## Non-goals

- Playing over the internet. The game stays one laptop plus phones on the same Wi-Fi, with no
  internet needed at runtime (every library, font and sound is bundled locally).
- Accounts or passwords.
- A cloud database or cloud real-time service.
- Changing game rules, scoring or prompts beyond what the goals above need.

## Anti-goals

- Effects that make text hard to read, drain phone batteries, or lag a vote.
- A different look that hides where things are: the layout and the one-home-per-fact rules stay
  (platform UI rules: one question per resting screen, quiet controls, next action under its prompt).
- Losing any working feature or test in the move.
- A theme the model writes as free CSS. It picks from presets only.

## Stack (from research, 2026-10-18)

| Area | Pick | Why |
| --- | --- | --- |
| App | Next.js 16 (App Router, TypeScript, React 19), Tailwind v4 | Owner's choice |
| Server | One `server.ts` custom Node server (Node 24) that owns the game, the GM child processes, the live stream and the database, and hands page requests to Next | GM calls run 4 s to 6 min and the game lives in memory; one owner process, same shape as today |
| Live updates | Server-Sent Events from `server.ts` (not a Route Handler), full state on reconnect | One-way pushes, auto reconnect, no buffering problems |
| Database | SQLite file (`game-data/suspition.db`) with better-sqlite3 and Drizzle ORM, migrations run on start | Zero setup for friends; queries like "moves in real games"; the owner's Postgres habits carry over |
| Validation | Zod v4; `z.toJSONSchema()` builds the GM's `--json-schema`, the same schema checks the reply | One source of truth |
| Components | shadcn/ui on Radix, plus effects from Magic UI and Motion Primitives (all MIT) | Accessible, we own the code, restyled per world |
| Animation | Motion (`m` + `LazyMotion`) for transitions, gestures, flips; GSAP for big table reveals (loaded only on the table); AutoAnimate for small lists | Best in class, all free |
| Ambient | CSS-only effects on phones; Paper Shaders (WebGL) and tsParticles slim on the table | Phones stay fast |
| Theme colours | Material Color Utilities: the GM picks a seed colour, the server builds a readable palette | Contrast by design |
| Fonts | 10 font pairs bundled with `next/font/local` | Offline, chosen per world |
| Sound | Web Audio music engine (ported as is) + Howler for sound effects | Already built; Howler handles the iOS unlock |
| Extras | canvas-confetti, sonner toasts, qrcode.react, dnd-kit (ranking suspects), cmdk (host commands), CSS 3D card flips | Small and local |
| Tests | Keep `node:test`, run `.ts` through Node 24 type stripping; Playwright for screen tests later | Keeps all 413 tests |

## 1. Choosing what the game learns from

- Every game row has `learning`: `real`, `test` or `outlier` (default `real`), plus a note.
- **Setup:** a "Test game" switch (off by default). A test game is stored as `test` from the start.
- **Games page** (`/games`, host only, opened from the table): a list of every game, newest first:
  title, day, players, status, winner, and the learning tag as a quiet three-way switch. A game opens to
  its summary and its playtest report if it has one. Search and filter by tag. "Remove from learning"
  is the only destructive-looking action, and it only changes the tag.
- **Import:** drop a saved game JSON (old file or another laptop's export) onto the page to add it.
- **Learning is derived, never stored twice.** Profiles' skills, ratings, `played_before` and bot
  samples are computed from moves and games tagged `real` only. Changing a tag recomputes them at once.
  Lobby answers belong to the person, not a game, so they always count.
- Playtests are tagged `playtest` (their own kind) and never teach profiles.

## 2. Steps the model chooses

- The world schema gains a first field, written before anything else:
  `progress: [{ title, covers: [section keys] }]`, 3 to 7 steps, each under 8 words, in the world's own
  flavour ("Booking a monsoon wedding in Goa", "Giving each of you a secret"), with no spoilers (no
  culprit, no secrets, no clue names). `covers` says which parts of the world each step writes.
- Progress is real: as the streamed JSON reaches the sections a step covers, that step goes active,
  then done. Safe counts (for example "6 clues so far") show as a small line under the active step.
- Until the steps arrive (the first seconds), the screen shows a single "Thinking" line, like Claude.
- If the GM redrafts, the steps stay and a quiet line says "Fixing something, about a minute more".
- The card check after the world gets its own step written by code: "Making sure everyone knows their
  own story".
- Look: Claude style. The active step has a soft shimmer and a spinner, finished steps collapse into
  one line, "Show steps" opens them, time so far in small text. Phones show the same steps in a
  compact sheet while they answer lobby questions.

## 3. A room for each world

- The world schema gains `room`, chosen by the GM from fixed lists:
  - `seed_color` (hex): the server builds light and dark tones with Material Color Utilities and checks
    contrast (text on surfaces at least 4.5:1, or it falls back to the default palette).
  - `font_pair`: one of 10 bundled pairs (for example "noir serif", "royal deco", "cozy rounded",
    "old typewriter", "neon grotesk").
  - `texture`: paper, velvet, rain glass, film grain, stone, none.
  - `ambient`: rain, fog, embers, fireflies, dust, snow, lantern glow, none, with `intensity` low or
    medium.
  - `sound_set`: a small set of sound effects (soft, tense, playful) for votes, clues and reveals.
- The table and phones apply it as CSS variables under `[data-world]`. Phones get the colours, fonts and
  a CSS-only ambient effect; the table also gets the WebGL background and particles.
- `prefers-reduced-motion` and a "Calm screen" toggle turn effects off. Effects pause when the tab is
  hidden.
- Old worlds with no `room` get one picked by code from the setting words, so they look themed too.

## 4. Fun and interactive

Table (big screen, the room's shared view):
- Opening: the world title arrives with the room's ambient effect and music; the scene picture fades in.
- Who's who: character cards deal onto the table one by one.
- Round start: a full-screen title card for the round's job, then it settles into the "now" card.
- Votes: live bars that fill as phones vote; a short drum roll; the result lands with a stamp.
- Suspicion: a living meter (glow and pulse grow with suspicion).
- The answer: a staged reveal (GSAP timeline): the story typed out, each card flips to show the
  secret, confetti for the winners, best-play shout-out.

Phone (private, one hand):
- Character card: tap to flip between "who you are" and "what you hide"; swipe between tabs.
- Asking: the ask box with tappable idea chips; the reply streams in line by line like a chat.
- Play points: a small "+1 Searching" chip floats up from the reply, with a soft sound (and a buzz on
  Android).
- Moments: the phone glows and buzzes when it is your turn to speak.
- Final answer: drag suspects into order of suspicion (dnd-kit), then How and Why with points shown.
- Lobby: the quick questions as swipeable cards; the profile with animated skill bars.
- Joining unlocks sound on iOS (the Join tap).

## 5. Architecture

```
server.ts            node:http: /api/*, /events (SSE), everything else to Next
src/engine/          the game, reader, skills, profiles, prompts, GM client (ported to TypeScript)
src/db/              Drizzle schema, migrations, queries; store interfaces the engine uses
src/app/             App Router: /table, /play, /games, /people (host)
src/components/      shadcn components, world theme, effects, cards
src/lib/live.ts      one EventSource store read through useSyncExternalStore
```

Database tables: `games` (id, status, learning, note, created, updated, state JSON), `events`
(game_id, seq, kind, payload JSON), `people` (username, name, answers JSON, created), `moves`
(game_id, player_id, username, skill, points, rubric, round, why, at), `playtests` (game_id, report
JSON). Nothing is deleted. `npm run dataset` exports the database to the existing JSON files so the
dataset stays readable in git.

## 6. Migration order (the game keeps working after every step)

1. Node 24; port the engine to TypeScript file by file behind the existing tests.
2. Zod schemas for the GM, checked equal to today's JSON Schemas, then swapped in.
3. `server.ts` with Next mounted; the old screens still served.
4. SQLite with Drizzle behind a store interface; one-time import of every JSON game, profile and
   playtest; learning tags.
5. New phone screens, then the new table screens, then `/games`; the old `public/` UI is removed.
6. Model-chosen steps and world rooms.
7. Fun pass (animations, sounds, reveals), then a bot playtest and the attack replay on the new build.

## Constraints

- Plain, simple English everywhere. No em dashes.
- Host plays: no secrets on the table, `/games` hides the truth of an unfinished game.
- Every change ships with tests; the 21 saved attacks keep holding.
- No runtime calls to the internet.

## Calls made while writing this (check these)

1. **The game's saved state stays the source of truth.** `games.state` holds the whole game as today,
   so the engine does not change how it saves. The `events` and `moves` tables are rebuilt from it on
   every save, only so queries are fast.
2. **Git keeps the lasting copy.** `npm run dataset` (and every game end) writes the JSON files in
   `dataset/` as today, now including each game's learning tag and note. If the database is empty on
   start (new laptop, lost file), it imports everything from `dataset/`. Test and outlier games still go
   to git, with their tag.
3. **Importing a game from another laptop:** a game id already here is skipped. A username that already
   exists asks on the import screen: "Is Rahul from that game the same Rahul as here? Same person /
   Different person" (different makes `rahul-2`).
4. **People who only ever played test games** keep their answers but do not show in the "Played before"
   names and never feed bot samples, until they play one real game.
5. **Table hardware:** built for the laptop's own browser (shown on a TV by cable or casting). The table
   measures its frame rate and drops to the light effects by itself if it stutters; "Calm screen" turns
   effects off. Oldest phones: two-year-old iPhone and mid-range Android; phones only ever get CSS
   effects.

## Decision needed from the owner: what happens to the existing tests

Moving to TypeScript and React touches the 20 existing test files in three ways. The owner's rule says
existing tests are never changed without their OK, so this needs a yes before step 1:

- **Renamed only** (`.js` to `.ts`, import paths updated, no logic or assertion changes): the engine,
  reader, skills, prompts, GM, app, profiles logic, questions, playtest, attacks, music, narration, map,
  feed, alerts tests. Their pure logic moves to `src/engine` or `src/lib` and keeps its tests.
- **Moved to the new store:** the file-based `People` store tests become the same checks against the
  SQLite store.
- **Replaced:** tests of HTML-string builders in `public/panels.js` (they build strings React will no
  longer use) are replaced by component tests that check the same things on screen (same names, same
  values). `server.test` is rewritten for `server.ts` (same routes and checks; the stream moves from
  `/api/stream` to `/events`).

## Left to the builder

The 10 font pairs, the exact effect presets, the sound set, component wording, and which flourishes
from Magic UI and Motion Primitives to use.
