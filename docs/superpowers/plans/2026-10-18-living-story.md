# Living Story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every game feels like its own story, and the story visibly moves as people type. Empty settings draw from a wide deck instead of the GM's favourite world. Private moves and questions asked out loud send small "ripples" the whole room sees. The screen's look shifts subtly with the tension and glows softly when the story turns. Each world's own picture, and a wider set of effects and fonts, make the look personal. The host picks an art style from real sample pictures (or Random, or Mix), and every round gets its own picture that symbolises it.

**Architecture:**
- **Setting deck:** server-owned. The lobby view carries one drawn idea; the host can shuffle it. A world written from an empty box uses that idea, and the prompt lists the group's recent worlds to avoid.
- **Ripples:** ride on the two GM calls that already answer moves (`ASK_SCHEMA.public_event`, plus a new `ripple` field on `PUBLIC_ANSWER_SCHEMA`), so they add no GM call. A code gate rate-limits them, and they are stored as events of kind `ripple`.
- **The look follows the story:** through two CSS variables on `WorldRoom`, `--tension` (from the same `intensityFor` the music uses) and a `data-beat` attribute set for 2.5 s on story turns. Reading areas never change.
- **Story look:** the newest picture (the scene, then each round's) as a blurred backdrop at the table's edges, so the backdrop shifts a little every round; six new ambients and four new font pairs in the room lists.
- **Art styles:** a shared list of styles, each with drawing rules for the GM and a sample SVG the GM drew once (committed), shown as a picture grid on setup. `illustrate` takes the style. Round pictures are one background GM call per round, from public facts only.

**Tech Stack:** Node 24 TypeScript, React (Next 16), node:test via tsx, CSS in `src/app/world.css`, next/font.

**Spec:** this plan's Decisions section (the creator's answers on 2026-10-18), plus the creator's earlier brief of 2026-10-17: "Define a story structure, but it should flow very naturally by the users chat, killer is fixed."

## Decisions (from the creator, 2026-10-18)

- **World variety:** "Deck shown on setup". With an empty setting box, the setup screen shows a drawn idea with a Shuffle button. The game skips places used in recent games and tells the GM which worlds this group already played. "What is cut off" becomes "why nobody can just leave", which need not be weather.
- **Story look:** "Both": the scene picture as a backdrop, plus more effects and fonts.
- **Living story:** "Ripples". Any private move or question asked out loud can cause a small change the whole room sees within a minute. The GM decides when a move deserves one; at most one per player every few minutes. No extra GM cost. Fair play still applies.
- **Look follows the story:** "Tension + story beats". As tension rises the edges slowly darken, the accent at the edges warms, and the ambient effect quickens a little. When the story turns, a soft glow fades in and out along the screen edges. Reading areas never change. Subtle but noticeable.
- **Art style:** asked before the game is created. Keep today's style ("I really like the way you have chosen the art style now") and add more. Add "Random" and "Mix" (Mix changes the style for each picture). Show a real example picture per style, so the host sees what they are signing up for, not just text.
- **Round pictures:** "for each round make an illustration ... to symbolize the round."
- **Order:** story first, then the soundtrack (its own plan, `2026-10-18-soundtrack.md`). The soundtrack uses the same tension signal and story beats.

## Evidence that shaped it

- Of 6 games started with an empty setting box, 5 are a snowed-in station or observatory in Ladakh; the 6th is a dam cut off by a flood. All 6 were "tense". The prompt sends `Setting: Surprise us`, and the background rule requires "what is cut off or blocked".
- In the two bot playtests, private moves almost never reached the room: of 23 moves, at most 4 events came from a move. Rule 356 tells the GM to leave `public_event` "empty unless ... everyone in the room would notice". Questions asked out loud have no such field.
- The look follows the world correctly (the fair got red, paper and lanterns), so same world means same look.

## Global Constraints

- **Fair play** (existing `FAIR_PLAY` and `dropPuppeting`) applies to every ripple: no secrets that are not public, no words put in a player's mouth, never name the actor of a covert move unless they were clearly seen, never call a culprit guilty.
- **Ripple limits:** at most one ripple per player per 180 s, and at most one ripple on the table per 45 s. Extra ripples are dropped with a log line, never queued. Each ripple is at most 20 words.
- **Readability first:** cards stay solid; the tension and beat effects live only in the edge band (the same mask the ambient uses) and in the page vignette. Under `prefers-reduced-motion` the beat is a static tint for 2.5 s, not a fade.
- **No moving edges** in the continuous sense: the beat glow is one fade in and out per story turn, never a loop.
- **Plain English** in all copy and GM text; no em dashes.
- **Never modify an existing test without explaining and waiting for the user's confirmation.**
- **Live checks** run in a scratchpad worktree on a scratch port; never touch port 4321 or rebuild `.next` in the main checkout.

## Review Focus

1. **A burst of moves** (four players typing in the same minute). Expect: at most one ripple shows per 45 s, so the table never floods. Pinned in Task 2.
2. **A ripple that names the actor of a secret move,** or reports what a player said. Expect: `dropPuppeting` removes it as for `public_event` today. Pinned in Task 2.
3. **A deck that runs dry** (every idea matches a recent world). Expect: the least recently used idea is drawn rather than nothing. Pinned in Task 1.
4. **An old game with an unknown ambient or font,** or a new one shown by an old screen. Expect: unknown values fall back to `none` and `noir-serif` as today. Pinned in Task 4.
5. **Tension jumping on every view tick** (it reads the clock for "last minute"). Expect: the CSS variable changes only when the value moves by 0.05 or more, so there are no constant style writes. Pinned in Task 3.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/settings-deck.ts` | The deck (about 40 ideas, each with keywords) and `drawIdea`. Shared by server and client. |
| `server/game.ts` | `surprise` in the lobby state and view, `shuffleSurprise`, and `applySetup` keeping the drawn idea; ripple gate and storage. |
| `server/prompts.ts` | `generationPrompt` uses the idea and recent worlds; background rule rewrite; ripple rules in `askPrompt` and `publicSystem`; `PUBLIC_ANSWER_SCHEMA.ripple`; six new ambients in the room guidance. |
| `server/app.ts`, `server/index.ts` | `recentWorlds()` from the library; `POST /api/surprise`. |
| `src/app/table/setup.tsx` | The drawn idea line with Shuffle. |
| `src/lib/story-look.ts` | `tensionLevel`, `beatBetween`: pure. |
| `src/components/world/room.tsx` | `--tension`, `data-beat`, the backdrop layer, ambient pace. |
| `src/app/world.css` | Vignette, edge warmth, beat glow, backdrop, six ambients, four font pairs. |
| `src/components/world/fonts.ts`, `server/room.ts` | New fonts and the room option lists. |
| `src/lib/feed.ts`, `src/lib/alerts.ts` | Ripple items on the table feed, with a soft sound. |
| `src/lib/art-styles.ts` | The art styles: id, name, drawing rules; `resolveStyle` for Random and Mix. |
| `scripts/art-samples.ts`, `public/art-styles/<id>.svg` | One-time GM-drawn sample per style, committed. |
| `src/components/game/art-style-picker.tsx` | The picture grid on setup. |

---

### Task 1: Setting deck, shuffle and recent worlds

**Files:**
- Create: `src/lib/settings-deck.ts`
- Modify: `server/game.ts` (`createGame` draws one, `shuffleSurprise`, the lobby view field `surprise`, and `applySetup` stores `setup.surprise` when `setting` is empty), `server/app.ts` (`shuffleSurprise(hostToken)`, `recentWorlds()`), `server/index.ts` (`'POST /api/surprise'`), `server/prompts.ts` (`generationPrompt`, background rule), `src/app/table/setup.tsx`
- Test: `test/settings-deck.test.ts`, `test/setup-surprise.test.tsx`

**Interfaces:**
- Produces:
  - `DECK: { id: string; text: string; keywords: string[] }[]`
  - `drawIdea(recent: string[], random = Math.random, avoid: string[] = []): { id: string; text: string }`. `recent` is lower-cased titles and setting lines of recent worlds; `avoid` is ids already shown this lobby.
  - `G.shuffleSurprise(game, recent, random?)` returns the new idea.
  - Lobby `tableView(game).surprise: { id, text } | null`
  - `app.recentWorlds(): string[]` (the last 10 games with a scenario, as `"${title}: ${setting_summary}"`, newest first)

Deck content rules:
- About 40 ideas over many kinds of place: transport (a night train, a ferry), celebrations (a palace wedding, a Diwali party), work (a film set, a newsroom, a restaurant kitchen at closing), nature (a tea estate in the monsoon, a houseboat), history (a 1920s ocean liner, a 1970s radio station), the future (a Mars habitat).
- Each idea is under 10 words and names a place and a time or event.
- At most 3 ideas in the whole deck may be snowy, mountain or remote stations.
- Keywords are the nouns a recent world would share with the idea ("train", "railway"; "snow", "station", "observatory", "ladakh").

- [ ] **Step 1: Write the failing tests:**
  - `should never draw an idea whose keywords appear in a recent world`: with recent `['cold air at station nine: a weather post in ladakh, snowed in']`, 200 draws with a seeded random never return an idea whose keywords include `snow`, `station` or `ladakh`.
  - `should draw the least recently used idea when every idea matches a recent world` (no crash, returns an idea)
  - `should not repeat an idea already shown in this lobby until the deck runs out`
  - `should keep the deck varied`: ids are unique, at most 3 ideas carry any of `snow`, `mountain` or `station`, every text is under 10 words, and no text contains an em dash.
  - `should use the drawn idea when the setting box is empty, and the typed setting otherwise` (`applySetup` sets `setup.surprise`; `generationPrompt` contains `Setting idea (drawn by the game): <text>` and no longer contains `Surprise us`)
  - `should list this group's recent worlds in the prompt and ask for a different place, era and reason people are stuck`
  - `should ask why nobody can just leave, not what is cut off by weather` (the prompt has no `what is cut off or blocked`; it has `why nobody can simply leave or call for help tonight`)
  - `should shuffle only for the host` (app test: rejects without the host token with "table screen")
  - in `setup-surprise.test.tsx`: `should show the drawn idea and a Shuffle button while the setting box is empty`, and `should hide the idea once a setting is typed`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The background rule's clause becomes: "why nobody can simply leave or call for help tonight (it can be a storm, but also a moving train, a ceremony that must finish, a promise, a locked event, a rule)". The prompt line when the box is empty:

```
Setting idea (drawn by the game): ${surprise.text}. Build the world around it; make it specific and surprising.
Worlds this group played recently (make this one clearly different in place, era and the reason people are stuck):
- ${recent...}
```

  Setup UI, under the input when it is empty: `If you leave this empty: <idea>` with a ghost `Button` "Shuffle" (lucide `ShuffleIcon`). Existing chips stay.
- [ ] **Step 4: Run them and the full suite.** Expected: PASS. If an existing prompt test asserts `Surprise us`, stop and ask before changing it.
- [ ] **Step 5: Commit.** `feat: settings deck with shuffle; the GM knows the group's recent worlds`

---

### Task 2: Ripples

**Files:**
- Modify: `server/prompts.ts`:
  - `askPrompt` rule for `public_event`
  - `PUBLIC_ANSWER_SCHEMA` gains `ripple: str`
  - `publicSystem` gains the ripple rule
- Modify: `server/game.ts`:
  - `completeAsk` and `completePublicAsk` route through `addRipple`
  - new `RIPPLE_PLAYER_MS = 180_000`, `RIPPLE_TABLE_MS = 45_000`, `RIPPLE_WORDS = 20`
- Modify: `src/lib/feed.ts`, `src/lib/alerts.ts` (ripple kind: a feed item styled as a short italic news line, sound `soft`)
- Test: `test/ripples.test.ts`

**Interfaces:**
- Produces: `addRipple(game, playerId, text, now): boolean`. It returns false when dropped. It stores `{ kind: 'ripple', text, at, phase }` with no actor id in the event, so phones and the table never learn whose move caused it. It keeps `st.rippleAt[playerId]` and `st.rippleLast`.
- Consumes: `dropPuppeting` and `capWords` (existing).

The ripple rule, the same in `askPrompt` (for `public_event`) and `publicSystem` (for `ripple`), as exact copy:

```
- ripple: one short line (under 20 words) the whole room notices because of this move, when it would plausibly be seen or heard, or changes how a GM character behaves: a reaction, a sound, something moved, a door now locked. Aim for one in every two or three moves; leave it empty when nothing would show. Never reveal what a player secretly did unless they were clearly seen, never say who did it, never put words in a player's mouth.
```

- [ ] **Step 1: Write the failing tests:**
  - `should put a ripple from a private move on the table as its own kind`
  - `should not say whose move caused a ripple` (the stored event has no `by` and no player id; a ripple that names the acting player is dropped by `dropPuppeting` with `others: true`, as for `public_event` today)
  - `should drop a second ripple from the same player within 3 minutes`
  - `should drop any ripple within 45 seconds of the last one on the table` (four players, the same minute: only the first is stored)
  - `should cut a ripple to 20 words`
  - `should take a ripple from a question asked out loud`
  - `should play a soft sound and show ripples in the table feed` (`tableSound` gives `soft`; `feedItem` gives a ripple item)
  - `should tell the GM to aim for a ripple in every two or three moves` (prompt text checks for both prompts)
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** to the tests. A round-change `public_event` stays kind `event` (loud, unchanged).
- [ ] **Step 4: Run them and the full suite.** Expected: PASS. Existing tests that assert a private move's `public_event` lands as kind `event` would now break: stop and ask before changing any.
- [ ] **Step 5: Commit.** `feat: ripples: private moves and out-loud questions visibly move the story`

---

### Task 3: The look follows the story

**Files:**
- Create: `src/lib/story-look.ts`
- Modify: `src/components/world/room.tsx` (`WorldRoom` gains `tension?: number` and `beat?: number`), `src/app/table/table-app.tsx` and `src/app/play/play-app.tsx` (pass them), `src/app/world.css`
- Test: `test/story-look.test.ts`, `test/world-room.test.tsx`

**Interfaces:**
- Consumes: `intensityFor` from `src/lib/music-theory.ts` (the same signal the music uses).
- Produces:
  - `tensionLevel(view, now): number`: `intensityFor` rounded to steps of 0.05.
  - `beatBetween(prev, next): boolean`: true when a new event of kind `ripple`, `event`, `phase` or `round` arrives, or the status turns `reveal`.
  - `WorldRoom` sets `style['--tension']` and `data-beat="on"` for 2500 ms after a beat. Ambient layers get `playbackRate = 1 + 0.5 * tension` through `getAnimations()`.

CSS (edge band only):
- `.world::after` is a fixed vignette, `radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / calc(0.15 + var(--tension) * 0.35)))`, under the content (`z-index: 0`).
- An edge warmth layer uses the ambient mask, with `color-mix(in oklab, var(--primary) calc(var(--tension) * 18%), #e0603a)` at `opacity: calc(var(--tension) * 0.25)`.
- `[data-beat='on']` adds an inset glow of the primary at 35% that fades in over 0.6 s and out over 1.9 s (one keyframe run). Under reduced motion it is a static tint.

- [ ] **Step 1: Write the failing tests:**
  - `should rise with the round and with suspicion, in steps of 0.05` (mirrors `intensityFor`)
  - `should not change the tension value for clock ticks smaller than a step`
  - `should mark a beat for a ripple, a round event, a new phase and the reveal, and not for a question answered out loud`
  - in `world-room.test.tsx`: `should write the tension as a CSS variable on the room` and `should not add any effect class inside the reading column` (the rendered markup has no `data-beat` styles on children; only the root carries the attributes)
  - `should keep the beat glow to one run and pause it for reduced motion` (read `world.css`: the `beat` animation has `animation-iteration-count: 1`, and a `prefers-reduced-motion` block sets `animation: none` for it)
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** to the tests.
- [ ] **Step 4: Run them, the full suite and `tsc`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: the screen's edges follow the story's tension and glow when it turns`

---

### Task 4: The story's own look

**Files:**
- Modify: `server/room.ts` (`ROOM_OPTIONS.ambient` gains `petals`, `sparks`, `leaves`, `sand`, `stars`, `bubbles`; `font_pair` gains `handwritten-note`, `poster-bold`, `terminal`, `marquee`), `server/prompts.ts` (room guidance names when each fits), `src/components/world/fonts.ts` (`Caveat`, `Bebas_Neue`, `Oswald`, `JetBrains_Mono`, `Rozha_One`, `Marcellus`), `src/app/world.css` (six ambients, four font pairs, the backdrop), `src/components/world/room.tsx` (the backdrop layer), `src/app/table/table-app.tsx` (pass `illustration`)
- Test: `test/story-look-room.test.ts`

Font pairs (display, heading; the body is always Inter):

| pair | display | heading |
|---|---|---|
| `handwritten-note` | Caveat | Karla |
| `poster-bold` | Bebas Neue | Oswald |
| `terminal` | JetBrains Mono | JetBrains Mono |
| `marquee` | Rozha One | Marcellus |

**Backdrop:** table only, when `illustration` exists and the screen is not calm. A fixed layer, `background-image: url("data:image/svg+xml;utf8,…")` of the cleaned SVG, `background-size: cover`, `filter: blur(28px) saturate(0.85)`, `opacity: 0.22`, the same edge mask as `.ambient`, `z-index: 0`.

- [ ] **Step 1: Write the failing tests:**
  - `should offer six new ambients and four new font pairs to the GM` (`ROOM_OPTIONS` and `ROOM_SCHEMA` enums)
  - `should give every font pair a CSS rule with Inter as the body` (parse `world.css`: one rule per `ROOM_OPTIONS.font_pair`, each with `--font-body: var(--font-inter)`)
  - `should give every ambient a CSS effect` (one `data-effect='<name>'` rule per ambient except `none`)
  - `should fall back for an unknown ambient or font from an old game` (`roomFor` on a room with `ambient: 'lava'` gives `none`; an unknown font gives `noir-serif`)
  - `should show the scene picture as a backdrop on the table and not on phones or when calm`
  - `should escape the picture safely into the backdrop` (an SVG with `#` and quotes renders as a valid data URL; reuse `cleanSvg` output only)
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** to the tests. Room guidance in the prompt: petals for weddings, gardens and spring; sparks for workshops, trains and fireworks; leaves for forests and autumn; sand for deserts and dunes; stars for open skies and space; bubbles for the sea and parties.
- [ ] **Step 4: Run them, the full suite, `tsc`, and `next build` in a scratch worktree** (fonts are fetched at build time). Expected: all PASS, the build succeeds.
- [ ] **Step 5: Commit.** `feat: each world's picture as a backdrop; more effects and font pairs`

---

### Task 5: Art styles with real samples

**Files:**
- Create: `src/lib/art-styles.ts`, `scripts/art-samples.ts`, `public/art-styles/<id>.svg` (generated once, committed), `src/components/game/art-style-picker.tsx`
- Modify: `server/game.ts` (`applySetup` keeps `artStyle`, default `moody-flat`), `server/prompts.ts` (`illustrationPrompt(scenario, style)`), `server/gm.ts` (`illustrate(game, { style, prompt })`), `server/app.ts` (`drawPicture` resolves the style), `src/app/table/setup.tsx`, `package.json` (script `"art-samples"`)
- Test: `test/art-styles.test.ts`, `test/art-style-picker.test.tsx`

**Interfaces:**
- Produces:
  - `ART_STYLES: { id: string; name: string; rules: string }[]`, in this order: `moody-flat` (today's rules, unchanged), `paper-cut`, `ink-noir`, `retro-poster`, `stained-glass`, `woodblock`, `folk-art` (Madhubani-style patterns and borders), `storybook`, `blueprint`, `neon`, `pixel`
  - `ART_CHOICES = [...ART_STYLES.map((s) => s.id), 'random', 'mix']`
  - `resolveStyle(choice: string, gameSeed: string, pictureIndex: number): string`:
    - `random`: one style for the whole game, chosen from the seed
    - `mix`: a different style for each picture index, with no repeat until all are used
    - an unknown choice gives `moody-flat`
  - `illustrationPrompt(scenario, styleId)`: shared SVG rules (`viewBox="0 0 800 400"`, no text, no faces, no scripts, links, external images or foreignObject, under 9000 characters) plus the style's `rules`.
  - `ArtStylePicker({ value, onPick })`: a grid of buttons, each the sample `<img src="/art-styles/<id>.svg">` with its name under it. "Random" shows a die icon over a blurred sample, "Mix" a 2 by 2 collage of four samples. One selected at a time (`aria-pressed`).

Each style's `rules` are one or two sentences an SVG can meet. Examples: `paper-cut`: "Layered paper shapes stacked front to back, each with a soft drop shadow, 4 to 6 muted colours." `ink-noir`: "Black ink lines and cross-hatching on off-white paper, one red accent." `pixel`: "Chunky pixel art built only from squares on a 40 by 20 grid, 6 to 8 colours."

- [ ] **Step 1: Write the failing tests:**
  - `should keep today's style as the default and first in the list` (its rules contain "Flat shapes and gradients, 4 to 7 colours")
  - `should give every style a sample picture on disk` (`existsSync('public/art-styles/<id>.svg')`, and each file passes `cleanSvg`)
  - `should draw one style for the whole game on Random, the same for every picture`
  - `should change the style for every picture on Mix, without repeats until all are used`
  - `should fall back to the default style for an unknown choice`
  - `should put the chosen style's rules in the drawing prompt and keep the safety rules`
  - picker: `should show a picture and a name for every style, plus Random and Mix`, `should mark the chosen style`
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** `scripts/art-samples.ts` asks the GM to draw the same reference scene in each style ("a lamp-lit house on a hill at night, a road and one tree"), runs `cleanSvg`, and writes the files. Run it once: 11 GM calls, then commit the SVGs. Look at every sample before committing; redraw any that fail `cleanSvg` or don't read as their style.
- [ ] **Step 4: Run them and the full suite.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: pick the art style on setup from real samples, with Random and Mix`

### Task 6: A picture for every round

**Files:**
- Modify: `server/prompts.ts` (`roundPicturePrompt`), `server/gm.ts` (reuse `illustrate`), `server/app.ts` (`drawRound(game)` after the phase change is applied), `server/game.ts` (`st.roundArt` and the view field `picture`), `src/app/table/playing.tsx` (the round card shows the round's picture), `src/components/world/room.tsx` (the backdrop uses `view.picture ?? view.illustration`)
- Test: `test/round-pictures.test.ts`

**Interfaces:**
- Consumes: `resolveStyle` and `illustrationPrompt` (Task 5); `cleanSvg` (existing).
- Produces:
  - `roundPicturePrompt(game, roundNumber)`: built only from the round's `name`, this round's loud event (the newest `event` of kind `event` since the round started), the job, and `setting_summary`. Never `planned_beat`, the truth, cards or clues. It adds: "Draw a symbol of this round: an object or a place that stands for it. No people, no faces, nothing that shows who did it or how."
  - `st.roundArt: Record<number, string>`, keyed by round number
  - `tableView(game).picture`: the current round's picture, or null
  - `drawRound`: one background GM call per round; picture index = round number (index 0 is the scene); a failure leaves the scene picture in place.

- [ ] **Step 1: Write the failing tests:**
  - `should build the round picture prompt from public facts only` (it contains the round name and its loud event, and none of the fixture's `planned_beat`, truth, culprit card text or clue text)
  - `should store the round's picture and show it on the table for that round only`
  - `should keep the scene picture when the round picture fails`
  - `should use the next Mix style for each round`
  - `should not draw a round picture for a replayed round twice` (a round number that already has art is skipped)
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** to the tests. The table's playing screen shows the round picture where `ScenePicture` sits today, falling back to the scene.
- [ ] **Step 4: Run them and the full suite.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: a symbolic picture for every round, in the chosen style`

### Task 7: Live check

- [ ] **Step 1:** Build in a scratchpad worktree and run on port 4433 with a scratch data dir and three bot players (`scripts/playtest.ts` style, or joined by hand). Leave the setting empty. Confirm the setup shows an idea, Shuffle changes it, and the world is written from it.
- [ ] **Step 2:** Play one round with bots. Count the ripples on the table against private moves and out-loud questions. Aim for one per two or three moves, and none within 45 s of another. Confirm none names the actor of a secret move: read only the ripple lines, never the cards.
- [ ] **Step 3:** Pick "Mix" at setup. Confirm the scene picture and each round's picture come in different styles, that each round picture shows within about 2 minutes of the round starting, and that the backdrop follows the newest picture.
- [ ] **Step 4:** Screenshot the table at tension about 0.3 and about 0.8 (later round, a vote open), and right after a ripple. Confirm the edges change, the reading cards don't, and the backdrop and the new ambient show.
- [ ] **Step 5:** Report the numbers and screenshots to the user. Their eye decides "subtle but noticeable"; tune `0.35`, `18%` and `0.25` from their notes.

## Final review

One whole-branch review on the most capable model, with this plan and the ledger's rulings. One fix pass for Critical and Important findings, each red then green; minors go to the ledger.
