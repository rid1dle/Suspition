# Rewrite A: foundation (TypeScript engine, Next.js server, SQLite, learning tags, new world fields)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the engine to TypeScript on Node 24, mount Next.js on one custom server, store games and
people in SQLite with learning tags, and add the engine side of model-chosen steps, world rooms,
third-person reminders and the private-questions setting, while the current screens keep working.

**Architecture:** `server/index.ts` stays the one owner process: it serves `/api/*`, the live stream
(`/events`, with `/api/stream` kept for the old screens), the old `public/` pages, and hands every other
path to Next. The engine files are renamed to `.ts` and run through Node 24 type stripping. A `src/db`
layer (Drizzle + better-sqlite3) implements the same store interfaces the App already uses, so the
engine barely changes. Plan B builds the new screens on top.

**Tech Stack:** Node 24, TypeScript, Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui,
Drizzle ORM + better-sqlite3, Zod v4, Material Color Utilities, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-18-next-rewrite-design.md`

## Global Constraints

- Plain, simple English in every UI string and prompt. No em dashes.
- Owner-approved test changes only: rename `.js` to `.ts` with import paths updated (no logic or
  assertion changes); the file `People` store tests move to the SQLite store; `server.test` is rewritten
  for the new server with the same routes and checks. Every other existing test stays exactly as it is.
- The host plays: nothing secret on the table, in `/games` for an unfinished game, or in the terminal.
- Never touch `game-data/` while the user's server runs on port 4321; test servers use scratch dirs and
  other ports. The first start of the new server imports the old JSON files; it never deletes them.
- No runtime calls to the internet (fonts and libraries bundled).
- Commits on `feat/first-playable`, no Co-Authored-By trailer. Every change ships with tests.
- `npm test` must stay green after every task; the 21 saved attacks must keep holding.

## Review Focus

1. **First start on an existing install** (old `game-data/current-game.json` mid-game, `dataset/` JSON
   files, no database): the game resumes where it was and every saved game appears in `/games`. Test in
   Task 5.
2. **A database file from a newer migration or a corrupt row:** the server starts and says what is
   wrong in the terminal instead of crashing silently. Test in Task 5.
3. **A world with no `progress`, `room` or `reminders`** (old saves, or the model skipped them): the
   old step list, a guessed room and field-built reminders are used. Tests in Tasks 7, 8, 9.
4. **Changing a game's learning tag while that game is being played:** the live game is not disturbed;
   profiles recompute after. Test in Task 6.
5. **Import of a game whose username exists here:** nothing is merged until the host answers "same
   person" or "different person". Test in Task 6.

---

### Task 1: Node 24, TypeScript, engine files renamed

**Files:**
- Move: `server/*.js` → `server/*.ts`; `scripts/**/*.js` → `.ts` (except `test/fake-claude.js`, which
  stays an executable JS file); test files that import `server/` or `scripts/` → `.ts` (approved).
  Tests of `public/` modules (alerts, feed, map, music, narration, panels) stay `.js` until Plan B.
- Create: `tsconfig.json`, `.nvmrc` (`24`), `server/types.ts`
- Modify: `package.json` (engines `>=24`, scripts use `.ts`, `test`: `node --test test/*.test.js test/*.test.ts`), `README.md` (Node 24)

**Interfaces:**
- Produces: every engine module at the same path with a `.ts` extension; imports use explicit `.ts`.
  `tsconfig.json`: `allowImportingTsExtensions`, `noEmit`, `erasableSyntaxOnly`, `module`/`moduleResolution`
  `nodenext`, `strict: true`, `jsx: preserve`, paths `@/*` → `src/*`.
- `server/types.ts`: `Game`, `Scenario`, `Card`, `Read`, `Move`, `Profile`, `Setup` types used by new
  code. Large legacy files (`game.ts`, `app.ts`, `prompts.ts`, `gm.ts`, `index.ts`, scripts) start with
  `// @ts-nocheck` (ruling: typed later, file by file); the small modules (`reader`, `skills`,
  `profiles`, `questions`, `progress`, `store`) are fully typed now.

- [ ] **Step 1:** `nvm use 24`; run `npm test` on the untouched tree. Expected: 413 pass on Node 24.
- [ ] **Step 2:** `git mv` the files, update imports (`.js` → `.ts` for moved modules), add `tsconfig.json`.
- [ ] **Step 3:** Run `npm test`. Expected: 413 pass. Run `npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 4:** Commit `chore: engine and scripts on TypeScript with Node 24 type stripping`.

### Task 2: Next.js mounted on the one server

**Files:**
- Create: `src/app/layout.tsx`, `src/app/page.tsx` (redirects to `/table`), `src/app/globals.css`
  (Tailwind v4 `@import "tailwindcss"` + theme tokens), `components.json`, `src/components/ui/*`
  (shadcn: button, badge, input, switch, tabs, sonner), `next.config.ts`, `postcss.config.mjs`
- Modify: `server/index.ts` (mount Next), `package.json` (deps: next, react, react-dom, tailwindcss,
  @tailwindcss/postcss, zod, typescript, @types/*; scripts `dev`, `build`, `start`)
- Test: `test/server.test.ts` (rewritten, approved)

**Interfaces:**
- `createHandler(app, { joinUrl, next })` where `next` is `null` in tests or Next's request handler.
  Order: `/api/*` actions → `/events` and `/api/stream` (same SSE) → `/api/info`, `/api/qr.svg`,
  `/api/people` → old pages `/table`, `/play` and `public/` static files → otherwise `next(req, res)`
  (404 when `next` is null).
- `npm start` = `next build` if `.next` is missing or older than `src/`, then `node server/index.ts`;
  `npm run dev` = same server with Next in dev mode.

- [ ] **Step 1:** Rewrite `test/server.test.ts` with every check the old file had, plus:
  `should stream the same view on /events as on /api/stream`, `should hand unknown paths to Next`
  (a fake `next` handler records the path), `should still serve the old table and play pages`.
- [ ] **Step 2:** Run it. Expected: FAIL (`/events` and `next` missing).
- [ ] **Step 3:** Implement; add Next with `next({ dev, dir: ROOT })`, `await app.prepare()` in `main`.
- [ ] **Step 4:** `npm test` PASS; `npm run build` succeeds; start on a scratch port and load `/` and
  `/table` with `$B` (Next page answers, old table still works).
- [ ] **Step 5:** Commit `feat: Next.js mounted on the game server; live stream also on /events`.

### Task 3: Private questions per round in setup

**Files:** Modify `server/game.ts` (`applySetup`, `attachScenario`), `public/table.js` (setup chip);
Test `test/game.test.ts` (new tests only).

**Interfaces:** `game.setup.questions` integer 1..6; default `LENGTHS[length].questions`;
`state.questionsPerPhase = setup.questions`.

- [ ] **Step 1:** Tests: `should use the chosen number of private questions each round`,
  `should refuse private questions outside 1 to 6`, `should default private questions to the game length`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; add a "Private questions per round" chip row (1 to 6) to the old setup screen.
- [ ] **Step 4:** `npm test` PASS. Commit `feat: private questions per round set in the room setup`.

### Task 4: SQLite database with Drizzle

**Files:** Create `src/db/schema.ts`, `src/db/index.ts`, `drizzle.config.ts`, `drizzle/` (generated SQL);
Test `test/db.test.ts`.

**Interfaces:**
- Tables: `games` (id pk, status, learning `real|test|outlier|playtest`, note, title, created_at,
  updated_at, state JSON text), `events` (game_id, seq, kind, payload JSON, pk game_id+seq), `people`
  (username pk, name, answers JSON, created_at), `moves` (game_id, player_id, username, skill, points,
  rubric, round, why, from, at; index username+game_id), `playtests` (id pk, game_id, report JSON,
  created_at), `meta` (key pk, value).
- `openDb(file): Db` creates the folder, runs `migrate()` from `drizzle/`, sets WAL.
  On a failed migration it throws `DbError` with "The game database is newer or broken: <file>".
- `Db` methods: `saveGame(game)` (upsert row; rebuild that game's `events` and `moves` from
  `state.events` and `state.play` mapped to usernames), `loadGame(id)`, `setCurrent(id)`,
  `loadCurrent()`, `listGames({ learning?, search? })` → summaries `{ id, title, day, status, players,
  winner, learning, note }`, `setLearning(id, learning, note?)`, `savePerson({ username, name, answers,
  createdAt })`, `person(username)`, `peopleList()`, `realMovesFor(username)`, `realGamesFor(username)`,
  `savePlaytest(id, gameId, report)`, `listPlaytests()`.

- [ ] **Step 1:** Tests (tmp file): `should keep a game and find it again after reopening`,
  `should rebuild moves for a game when it is saved again`, `should give only moves from real games`,
  `should list games newest first with their learning tag`, `should refuse a database it cannot migrate
  with a clear message`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; `npx drizzle-kit generate` for the first migration; commit the SQL.
- [ ] **Step 4:** `npm test` PASS. Commit `feat: SQLite game database with Drizzle`.

### Task 5: The App runs on the database; first-start import; dataset export

**Files:** Create `src/db/stores.ts` (`DbStore`, `DbPeople`, `DbArchive`), `src/db/importer.ts`;
Modify `server/index.ts`, `server/app.ts` (`learn`), `scripts/export-dataset.ts`;
Test `test/profiles.test.ts` (People store tests moved to `DbPeople`, approved), `test/db.test.ts`.

**Interfaces:**
- `DbStore implements { load(), save(game) }` (current game). `DbArchive.save(game, label)` writes the
  database row AND the git JSON file in `dataset/games/` with `learning` and `note` added.
- `DbPeople implements { list(), load(username), save(profile) }`: `load` builds the profile from the
  `people` row (answers) plus `recordGame` applied in order to each real game the person played
  (derived; never stored twice); `save` stores only username, name, answers. `list()` returns only
  people with at least one real game.
- `importOnce(db, { gameData, dataset })`: when `games` is empty, imports `dataset/games/*.json`
  (learning from the file, else `real`), `dataset/playtests/*/` (as `playtest`), `dataset/people/*.json`
  (answers), and `game-data/current-game.json` as the current game. Never deletes a file. Idempotent.
- `exportDataset(db, datasetDir)`: writes every game (with learning and note) and person answers.

- [ ] **Step 1:** Tests: `should resume the current game after a restart`, `should import old JSON
  games, people and playtests once`, `should skip the import when the database has games`,
  `should keep answers but leave test games out of a person's skills and rating`, `should not list
  people who only played test games`, the moved People store tests, `should export the learning tag
  with each game`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement; `main` opens `game-data/suspition.db`, runs `importOnce`, builds the App with
  the DB stores. `App.learn` no longer saves derived fields (they are computed on load).
- [ ] **Step 4:** `npm test` PASS. Start a scratch server against a copy of `game-data/` and `dataset/`
  (never the live folder), check the old game resumes and `/api/people` lists the right people.
- [ ] **Step 5:** Commit `feat: games and people in SQLite, imported once from the JSON files`.

### Task 6: Learning tags, games list, import with person matching

**Files:** Modify `server/game.ts` (`applySetup` accepts `testGame`), `server/app.ts`, `server/index.ts`,
`scripts/playtest/seed.ts`, `scripts/playtest.ts`; Create `src/app/games/page.tsx`,
`src/app/games/games-list.tsx`; Test `test/app.test.ts`, `test/server.test.ts`, `test/playtest.test.ts`
(new tests only).

**Interfaces:**
- Setup input `testGame: boolean` → the game row's `learning` = `test`.
- Host routes: `GET /api/games?host=` → summaries; `POST /api/games/learning {host, id, learning, note}`;
  `POST /api/games/import {host, game, people: { [username]: 'same' | 'different' }}` → either
  `{ imported: id }` or `{ ask: [{ username, name }] }` when usernames clash and no answer was given;
  a duplicate game id → `{ skipped: id }`. "different" renames that player's username with `usernameFor`.
- An unfinished game's summary never includes truth or cards.
- Bot samples (`seedBots`) read only real games from the database. Playtests save as `playtest`.
- `/games` page: list with the three-way tag switch (Real / Test / Outlier), note, search, filter, and
  a drop zone for importing a game file that walks through the "same person?" question.

- [ ] **Step 1:** Tests: `should store a test game as test from setup`, `should change a game's tag and
  recompute profiles without touching the live game`, `should ask before merging a clashing username
  on import`, `should rename a different person on import`, `should skip a game id it already has`,
  `should refuse the games list without the host token`, `should take bot samples only from real games`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement routes and App methods; build `/games` with shadcn (Tabs as filter, Switch-like
  segmented toggle, Input search, sonner toasts); a "Test game" switch on the old setup screen.
- [ ] **Step 4:** `npm test` PASS; check `/games` at 1280 px and 400 px with `$B` on a scratch server.
- [ ] **Step 5:** Commit `feat: choose which games the game learns from`.

### Task 7: Steps the model chooses

**Files:** Modify `server/prompts.ts` (schema + rules), `server/progress.ts` (capture the `progress`
value), `server/gm.ts`, `server/app.ts` (`onGenerateProgress`), `server/game.ts` (`validateScenario`,
`publicCore` progress view); Test `test/progress.test.ts`, `test/app.test.ts`, `test/game.test.ts`
(new tests only).

**Interfaces:**
- Scenario first field `progress: [{ title, covers: string[] }]` (3 to 7 steps, title under 8 words,
  covers from the top-level keys, no spoilers). The prompt says no culprit, secrets or clue names.
- `TopLevelTracker(onKey, onItem, onValue)`: `onValue(key, value)` fires once when the top-level value of
  `progress` closes (parsed JSON).
- GM `onProgress({ kind: 'plan', steps })`. App `game.progress.plan = steps`; the active step is the
  first whose `covers` has the current key; counts as today.
- View `progress.plan`: `[{ title, state: 'done'|'active'|'todo', count?: string }]` or `null` before the
  plan arrives; `progress.thinking` true until then; `progress.redraft` true on attempt 2 or draft 2.
  The old fields (`steps`, `step`, `seen`, `counts`) stay as they are (fallback, existing tests).
- After the world is written, a code step "Making sure everyone knows their own story" is appended to
  `plan` while the card check runs.

- [ ] **Step 1:** Tests: `should hand over the progress plan as soon as it is written`, `should mark the
  step that covers the section being written as active`, `should show thinking until the plan arrives`,
  `should add the card check step after the world`, `should refuse a plan with fewer than 3 steps or
  unknown sections` (validateScenario warning only: plan errors do not fail the world).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` PASS. One real generation on a scratch server shows the plan
  (check the table's progress JSON from `/events`, never the world).
- [ ] **Step 5:** Commit `feat: the GM writes its own progress steps`.

### Task 8: A room for each world

**Files:** Create `server/room.ts`; Modify `server/prompts.ts`, `server/game.ts` (`publicCore.room`);
Test `test/room.test.ts`.

**Interfaces:**
- `ROOM_OPTIONS = { font_pair: [10 ids], texture: [...], ambient: [...], intensity: ['low','medium'], sound_set: ['soft','tense','playful'] }`.
- Scenario `room: { seed_color, font_pair, texture, ambient, intensity, sound_set }` (Zod, merged into the
  JSON schema with `z.toJSONSchema`).
- `roomTheme(room)` → `{ fontPair, texture, ambient, intensity, soundSet, colors: { bg, surface,
  surfaceAlt, text, muted, accent, accentText, danger } }` built with Material Color Utilities from the
  seed (dark scheme); if any text/surface pair is under 4.5:1 or the seed is bad, the default palette.
- `guessRoom(setting, tone)` for worlds with no room (keyword map: rain/monsoon → rain, fire/ember/
  forge → embers, snow/winter → snow, palace/gala → royal deco, college/school → cozy, and so on).
- `publicCore.room = roomTheme(scenario.room ?? guessRoom(...))`.

- [ ] **Step 1:** Tests: `should build a readable palette from a seed colour`, `should fall back to the
  default palette when the seed is not a colour`, `should keep every text colour at 4.5 to 1 or more`,
  `should guess rain for a monsoon wedding`, `should refuse a font pair outside the list` (falls back).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement (`@material/material-color-utilities`).
- [ ] **Step 4:** `npm test` PASS. Commit `feat: each world picks its room`.

### Task 9: Third-person reminders

**Files:** Modify `server/prompts.ts` (players[].reminders in the world and audit schemas),
`server/game.ts` (new `remindersFor`, `applyAudit`, card view); Test `test/game.test.ts` (new tests only).

**Interfaces:**
- `players[].reminders`: 6 to 10 lines, third person, under 18 words each, only things that character
  knows.
- `remindersFor(card)` → `string[]`: `card.reminders` if present, else built from fields in the third
  person: `${name} is ${role}.`, each public sentence, `At ${time}, ${name} was at ${where}.`
  `pelletsFor` stays as it is (old screens, existing test).
- Card view gains `reminders: remindersFor(card)`; `applyAudit` fills missing `reminders`.

- [ ] **Step 1:** Tests: `should use the GM's third-person reminders when the card has them`,
  `should build third-person reminders from the card when it has none`, `should never start a reminder
  with "You"`, `should fill missing reminders from the card check`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test` PASS; `npm run attacks` 21 of 21. Commit `feat: third-person reminders`.
