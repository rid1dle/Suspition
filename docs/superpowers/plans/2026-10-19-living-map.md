# The living map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The GM plans a geography for each world; the code measures every path and draws a quiet, readable SVG map, and the story respects walking times.

**Architecture:** One shared module `src/lib/geography.ts` cleans the GM's `geography`, measures paths and words trip times; the server uses it for the public map view, the move announcement, the GM's answer prompt and the new `far` story check; `src/lib/map.ts` draws it.

**Tech Stack:** TypeScript (ts-nocheck legacy files), node:test via tsx, plain HTML/SVG strings, CSS in `src/app/world.css`.

**Spec:** `docs/superpowers/specs/2026-10-19-living-map-design.md`

## Global Constraints

- Walking 80 m a minute; driving 30 km an hour (500 m a minute), shown only past 1.5 km. Winding factor 1.3.
- Distance = straight line on the 0 to 100 grid times `across_m / 100`, times 1.3.
- Old worlds (no `geography`): `across_m` 300, times marked "about", on the map only. Their announcements, answers and story checks stay exactly as today.
- Terrains: forest, hills, coast, river, snow, desert, city, village, building. Landmark kinds: tree, trees, water, bridge, well, statue, tower, gate, rock, hill, road, shop, house, ruin, stairs, door, window. Path kinds: road, trail, stairs, corridor, bridge, water.
- Landmarks 6 to 12 (more are cut to 12), scenery only: never a clue's place, never where a person is.
- Same game id, same map. `data-place` stays on places. Labels on solid chips; the world's display font only on the map title.
- Plain short English, no em dashes. Never print truth, cards or clues to the terminal.

## Review Focus

- A GM landmark that reuses a location's id or name, or a clue's `where`: dropped (Task 1 test).
- A path naming an unknown end or a duplicate pair: dropped; a missing neighbor pair: added (Task 1 test).
- Whereabouts across midnight ("11:50 pm" then "12:10 am"): gap is 20 minutes, not negative (Task 3 test).
- A host who drags places: distances stay the GM's planned ones (Task 2 test).
- Bad numbers (`across_m` of 0, text, a landmark at x 300): clamped or dropped, never NaN on screen (Task 1 test).

---

### Task 1: Geography module

**Files:** Create `src/lib/geography.ts`; Test `test/geography.test.ts`

**Interfaces (Produces):**
- `TERRAINS`, `LANDMARK_KINDS`, `PATH_KINDS: string[]`
- `pathMetres(a: {x,y}, b: {x,y}, acrossM: number): number`
- `tripTime(m: number, about?: boolean): string` -> "under a minute", "4 min walk", "75 min walk, 12 min by car"; "about " prefix when about.
- `tripLabel(m: number, about?: boolean): string` -> "20 m, under a minute", "350 m, 4 min walk", "6 km, 75 min walk, 12 min by car".
- `planGeography(places: {id,name,x,y,neighbors}[], raw?: object, keep?: { ids?: string[], names?: string[] }): { terrain: string|null, across_m: number, about: boolean, landmarks: {id,name,kind,x,y}[], paths: {from,to,kind,m}[] }`

- [ ] Tests first:
  - `should give every neighbor pair a path with metres and minutes` (two places 30 apart at across 1000 -> m 390, label "390 m, 5 min walk"; one path per pair)
  - `should show drive time only past 1.5 km` (1400 m no "by car"; 6000 m -> "6 km, 75 min walk, 12 min by car")
  - `should say under a minute inside one building` (20 m -> "20 m, under a minute")
  - `should mark an old world about, with 300 m across` (no raw -> about true, terrain null, across 300)
  - `should never let a landmark be a clue's place` (landmark id equal to a kept id, or a location name, dropped)
  - `should drop bad paths and landmarks and clamp numbers`
- [ ] Run, watch fail; implement; run, pass; commit `feat: geography measures paths and words trip times`.

### Task 2: Server uses it

**Files:** Modify `server/game.ts` (export `nightMinutes`, add `geographyOf`, `walkBetween`, map view `geography`, goTo time), `server/gm.ts` (answer passes `trip`), `server/prompts.ts` (schema `geography`, Map rule, askPrompt `trip`); Test `test/living-map.test.ts`

**Interfaces (Produces):**
- `geographyOf(scenario)` -> `planGeography(mapOf(scenario), scenario.geography, { ids, names })` (planned positions, host edits ignored).
- `walkBetween(scenario, fromId, toId): string` -> `tripTime(m)` or `''` when the world has no geography or ids are unknown.
- Public view `map.geography`.
- `askPrompt({ ..., trip })` adds "They just walked here from the X (4 min walk). Say how long it took."

- [ ] Tests first:
  - `should add the walking time to the move announcement` ("Ben goes to the Ballroom (4 min walk) to check something.")
  - `should keep the old announcement for a world without geography`
  - `should tell the GM the walking time of a move` (prompt the fake GM gets contains "from the Kitchen" and "min walk")
  - `should keep distances when the host drags a place`
  - `should ask the GM for a geography with the fixed kinds` (schema enums)
- [ ] Fail, implement, pass, commit `feat: moves and answers know the walking time`.

### Task 3: The `far` story check

**Files:** Modify `server/story.ts`; Test `test/living-map.test.ts`

- [ ] Tests first: `should flag a whereabouts pair that is too far apart for the time between`, `should not flag a pair with enough time, across midnight too`, `should skip the far check for a world without geography`.
- [ ] Implement in `storyIssues`: per character, whereabouts sorted by `nightMinutes`, consecutive pairs at different places, `Math.round(walk min) > gap` -> `far: truth.whereabouts[i] and [j] put X at A then B, a N min walk, only G min apart; change a place or a time.`
- [ ] Fail, implement, pass, commit `feat: story check flags trips too long for the time between`.

### Task 4: Draw the living map

**Files:** Modify `src/lib/map.ts`, `src/app/world.css`; Test `test/map.test.ts` (new tests only)

- `mapHtml(view, { me, before, editing })` draws: terrain layer (seeded from `view.gameId`), curved paths (quadratic, bend from seed), landmarks, path time chips, places with `data-place`, compass, scale bar, title chip.
- Phone (`me` set): paths touching your place get class `near` and their time; the rest `far`, no time. Table: every path shows its time.
- [ ] Tests first: `should draw the same map for the same game every time`, `should draw an old world without geography, marked about`, `should show the time on paths from your place and fade the rest on your phone`, `should show every path's time on the table`, `should draw landmarks as scenery, not places`, `should draw a compass and a scale bar`.
- [ ] Fail, implement, pass, commit `feat: draw the living map`.

### Task 5: Visual check and docs

- [ ] Static HTML from a fixture rendered with `$B` at 400 px and 1400 px; fix what reads badly.
- [ ] One line in `docs/design.md` "Calls I made"; commit.
