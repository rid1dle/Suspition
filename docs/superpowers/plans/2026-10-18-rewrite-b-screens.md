# Rewrite B: the new screens (table, phone, world rooms, fun)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain-JS table and phone screens with Next.js screens that look like each world's
room, show the GM's own steps Claude-style, and make the big moments fun, with every feature of the
old screens kept.

**Architecture:** Plan A left the server, views and database in place; the views already carry `room`,
`progress.plan`, `card.reminders`, play points and profiles. Plan B adds React screens under
`src/app/table` and `src/app/play` that read the same live stream (`/events`) through one store, a
`WorldRoom` wrapper that turns `view.room` into CSS variables, fonts and effects, and ports the old pure
modules from `public/` to `src/lib`. When both screens are done, Next serves `/`, `/table`, `/play`
and `public/` is removed.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, shadcn/ui (Radix), Motion (`motion`), GSAP (table
reveal only), AutoAnimate, canvas-confetti, sonner, dnd-kit, qrcode.react, Howler, Paper Shaders and
tsParticles slim (table only), `node:test` with `react-dom/server` for component tests, gstack `$B`
for screen checks.

**Spec:** `docs/superpowers/specs/2026-10-18-next-rewrite-design.md` (sections 2, 3, 4, 4b)

## Global Constraints

- Plain, simple English in every UI string. No em dashes.
- Platform UI rules: the resting screen answers one question; one home per fact; quiet controls, one
  emphasis per area; the next action directly under its prompt; tabs only for 2 to 5 independent views.
- Keep every feature of the old screens (read `public/table.js`, `public/play.js`, `public/panels.js`
  before porting a screen; list the features in the task's ledger line).
- The host plays: the table never shows secrets; reveal content only after the reveal.
- Phones: CSS-only effects, animate only transform and opacity, honour `prefers-reduced-motion`, pause
  effects when the tab is hidden. WebGL, particles and GSAP load only on `/table` via `next/dynamic`.
- No runtime calls to the internet; every font, sound and library is bundled.
- Approved test changes only: tests of the moved pure modules are renamed with new import paths;
  `panels.test` HTML-string checks are replaced by component checks of the same names and values;
  `server.test` follows the routes. No other existing test changes.
- Commits on `feat/first-playable`, no Co-Authored-By trailer; `npm test` and `npx tsc --noEmit` green
  after every task; `npm run attacks` 21 of 21 at the end.

## Review Focus

1. **A phone that reconnects** (screen locked, Wi-Fi drop, server restart): the stream reconnects, the
   screen restores without losing a typed draft. Test in Task 2.
2. **A world with the default room or `ambient: 'none'`** and a phone with reduced motion: no effect
   layers render, text stays readable. Test in Task 3.
3. **Long text** (a 600-character answer, a 7-step plan, 10 players, 21 clues): nothing overflows at
   400 px or on a 1280 px table. Checked in Tasks 6 and 8 with `$B`.
4. **The GM thinking for 100 s** with no plan yet: the generating screen still feels alive (shimmer,
   elapsed time, lobby questions keep phones busy). Checked in Task 5.
5. **The table left open for hours:** effects pause when hidden and the frame-rate fallback kicks in;
   no growing memory from stream reconnects. Checked in Task 9.

---

### Task 1: Pure client modules move to `src/lib` (TypeScript)

**Files:** Move `public/{alerts,feed,map,music-theory,music,narration,sfx,skill-labels,text}.js` →
`src/lib/*.ts`; split `public/panels.js` logic (`pointsOf`, `playLine`, `totalLine`, `whoisLines`) into
`src/lib/score.ts`. The old screens load `/x.js` in the browser, so `public/*.js` stay untouched
until Task 10; `src/lib` holds the TypeScript versions the new screens use. Rename the matching tests
to import `src/lib` (approved).
**Interfaces:** same exports and signatures as today. `server/skills.ts` and `server/prompts.ts`
import `skill-labels` and `music-theory` from `src/lib`.

- [ ] Steps: move, rename imports, `npm test` (same counts), `npx tsc --noEmit`, commit
  `refactor: client logic as TypeScript in src/lib`.

### Task 2: One live store and the view types

**Files:** Create `src/lib/live.ts`, `src/lib/views.ts`; Test `test/live.test.ts`.
**Interfaces:**
- `views.ts`: `TableView`, `PlayerView`, `Room`, `Plan`, `CardView` types matching `publicCore`,
  `tableView`, `playerView` today.
- `createLive(url, { EventSourceImpl })` → `{ subscribe(fn), get(): View | null, status(): 'connecting'
  | 'open' | 'gone' }`; reconnects with backoff 1 s → 10 s; on `event: gone` sets `gone` and stops;
  `useLive(url)` hook built on `useSyncExternalStore`.
- `useDraft(key)`: a text draft kept in `sessionStorage` (try/catch) so a reconnect never loses typing.

- [ ] Tests: `should keep the last view while reconnecting`, `should stop and say gone when the seat is
  gone`, `should back off between reconnects up to 10 seconds`, `should keep a draft across a reload`.
- [ ] Implement, `npm test`, commit `feat: one live store for both screens`.

### Task 3: The world room on screen

**Files:** Create `src/components/world/room.tsx` (`WorldRoom`), `src/components/world/effects.tsx`
(CSS effects), `src/components/world/fonts.ts` (10 font pairs via `next/font/google` with
`preload: false`, self-hosted at build), `src/app/world.css`; Test `test/room-ui.test.ts`.
**Interfaces:**
- `WorldRoom({ room, calm, children })` sets `--background`, `--card`, `--muted`, `--foreground`,
  `--muted-foreground`, `--primary`/`--accent`, `--primary-foreground`, `--destructive` from
  `room.colors`, `data-font`, `data-texture`, `data-ambient`, `data-intensity`; renders `AmbientLayer`
  unless `calm` or reduced motion or `ambient === 'none'`.
- `AmbientLayer({ ambient, intensity })`: CSS-only rain, fog, embers, fireflies, dust, snow, lantern;
  `pointer-events: none`, `aria-hidden`, transform/opacity only, paused when `document.hidden`.
- Font pairs: `{ id, heading, body }` for the 10 ids in `ROOM_OPTIONS.font_pair`.

- [ ] Tests (render to static markup): `should set the world colours as CSS variables`, `should not
  render effects for a calm screen or ambient none`, `should use the font pair the world picked`.
- [ ] Implement; check two rooms (monsoon rain, palace lantern) at 400 px and 1280 px with `$B`; commit
  `feat: each world's room on screen`.

### Task 4: Shared game components

**Files:** Create `src/components/game/*.tsx`: `NowCard` (case question, round job, tappable tips),
`RoundVote` (live bars), `Feed` (news grouped by round, older folded), `Timeline`, `Alibis`,
`CluesList`, `PeopleList`, `MapView` (from `src/lib/map.ts`), `Novel` (reply lines, streaming reveal),
`PlayChip` (floating "+1 Searching"), `SkillBars`, `ReminderCard`, `PlanSteps`; Test
`test/components.test.ts` (replaces the `panels.test` HTML checks, approved).
**Interfaces:** each takes the slice of the view it shows; no fetching inside components.
`PlanSteps({ progress, compact })`: "Thinking" shimmer while `thinking`; steps with spinner (active),
tick (done), muted (todo); count line under the active step; "Fixing something, about a minute more"
when `redraft`; finished steps collapse into one line with "Show steps"; elapsed time.
`ReminderCard({ name, line, color, onOpen, onDismiss })`: initial badge, "Remember" + name, line, timer
bar, swipe to dismiss.

- [ ] Tests: every check `panels.test` makes today, against the components (same names and values),
  plus `should show thinking until the plan arrives`, `should collapse finished steps`, `should show a
  reminder in the third person with the character's initial`.
- [ ] Implement; commit `feat: game components`.

### Task 5: The phone (`/play`)

**Files:** Create `src/app/play/page.tsx`, `src/app/play/*.tsx` (join, lobby, card, story, ask, people,
clues, moment, final, reveal); Test `test/play-ui.test.ts`.
**Interfaces:** reads `useLive('/events?token=...')`; actions via `src/lib/api.ts` (`api(path, body)`).
Features (all old ones plus): join chips / username / "Is this you?"; lobby question cards (swipe or
tap), profile with skill bars; GM steps compact sheet while the world is written; card flip (who you
are / what you hide); tabs Story, Card, Ask, People, Clues; reply lines appear one by one; play chip
floats from a reply; reminder cards every 3 minutes (third person); moment glow and Android buzz;
final: drag suspects into order (dnd-kit), How/Why with points shown and the empty warning; reveal with
skills, tip and best-play; join tap unlocks sound.

- [ ] Tests: join flow chooses the right request body; final empty warning; reminder timing (fake
  clock); card flip state.
- [ ] Implement; `$B` at 400 px for every status (lobby, generating, reading, playing, vote, moment,
  final, reveal) using scratch servers and saved fixture games; read each screenshot; commit
  `feat: the new phone screen`.

### Task 6: The table (`/table`)

**Files:** Create `src/app/table/page.tsx`, `src/app/table/*.tsx` (setup, generating, briefing,
playing, final, reveal, host bar); Test `test/table-ui.test.ts`.
Features (all old ones plus): setup with every setting (private questions, test game, replays, GM
characters) and the QR; generating screen = `PlanSteps` large, Claude-style, plus who has joined;
briefing steps read aloud; playing: one top bar, now card, live vote bars, feed by round, side tabs
Map / Timeline / Alibis / Clues / People, suspicion meter that glows, round title card; final waiting;
reveal staged with GSAP (story typed, cards flip one by one, confetti for winners, best-play); host
controls quiet; "Saved games" link; narrator and music as today.

- [ ] Tests: no secret in any table render before the reveal (render every status from fixtures and
  search for PRIVATE/TRUTH/HIDDEN markers); host-only controls hidden without the host token.
- [ ] Implement; `$B` at 1280 and 1920 px for every status; commit `feat: the new table screen`.

### Task 7: Sound

**Files:** Create `src/lib/sounds.ts` (Howler sound sets `soft`, `tense`, `playful`: join, clue, vote
open, vote result, moment, play chip, reveal), small audio files in `public/sounds/` (generated
locally with Web Audio offline rendering, so no downloads); port the music engine.

- [ ] Tests: the sound set follows `room.soundSet`; nothing plays before the first tap.
- [ ] Commit `feat: sound sets per world`.

### Task 8: Saved games, full view

**Files:** Modify `src/app/games/*`: a game opens to its summary (title, players, status, winner,
learning tag, note) and its playtest report when there is one; an unfinished game shows no truth.

- [ ] Test: `should not show the truth of an unfinished game`. Commit `feat: open a saved game`.

### Task 9: Table effects and performance

**Files:** Create `src/components/world/table-effects.tsx` (Paper Shaders background + tsParticles
slim, chosen by `room.ambient`), frame-rate watch (drop to CSS effects under 40 fps for 3 s), "Calm
screen" toggle (host bar, remembered per device).

- [ ] `$B` check of a 10-minute idle table (memory steady, effects paused when hidden). Commit
  `feat: table effects with a calm fallback`.

### Task 10: Switch over and clean up

**Files:** `server/index.ts` stops serving `public/` pages (Next serves `/`, `/table`, `/play`);
remove `public/*.js`, `public/*.html`, `public/style.css` (keep `public/sounds`); update `server.test`
(approved); README.

- [ ] `npm test`, `npx tsc --noEmit`, `npm run build`; full `$B` pass on a scratch server: a short real
  game with the real GM (3 phone tabs + table) from join to reveal; `npm run attacks`; commit
  `feat: the new screens replace the old ones`.
- [ ] Run `npm run playtest` once on the new build; fix what it finds (breaches become attacks).
