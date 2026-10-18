# Soundtrack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every game gets original music. The GM composes 3 soundtrack directions, real recorded instruments play them, each round has its own piece that grows with the tension, and big moments get short stingers. The host picks one, can switch any time, and the old engine plays whenever the new one can't.

**Architecture:**
- **The GM writes notes and choices, the code writes the music.** The compose call returns small, checked choices (instruments from a fixed list, a key, a tempo, a theme, per-round chords and styles). Pure functions in `src/lib/soundtrack/` turn them into notes bar by bar: voice leading, octave fitting, variations, layers by tension, stingers. All of that is tested without audio.
- **A thin player** (`Tone.js` samplers) only schedules the notes. A `Music` facade has the same methods as today's `Score`, so the table code barely changes, and it falls back to `Score` whenever there is no soundtrack or the samples don't load.
- **Samples** are a measured, compressed subset of VSCO 2 CE, built once by a script and committed under `public/samples/`.

**Tech Stack:** Node 24 TypeScript, React (Next 16), node:test via tsx, Tone.js 15.1.22 (table only, loaded lazily), ffmpeg-static 5.3.0 (dev only, for the sample build).

**Spec:** `docs/superpowers/specs/2026-10-18-soundtrack-design.md` (approved). Phase 2 (the AI audio layer) is not in this plan: its model and cost are decided after research.

## Global Constraints

- **Sound source:** recorded instrument samples from VSCO 2 Community Edition (CC0), played with Tone.js 15.1.22 (MIT). The licence file ships with the samples.
- **Options:** the host picks 1 of 3 directions on the reading screen, with a 10-second "Listen" preview for each. If nobody picks, the first plays. The music bar can switch direction or skip to the next piece at any time.
- **Each round crossfades into its own piece.** Layers (drone or pad, bass, chords, pulse or arpeggio, melody, percussion) come in and out with the tension signal (`intensityFor`).
- **Stingers** of 2 to 4 seconds for: a round starts, a hot seat goes live, a vote opens, the reveal.
- **Fallback:** if the compose call fails or is slow, or the samples don't load within 20 s, today's `Score` plays the world's `music` theme. There is never silence because of the new engine.
- **Load only what plays:** the table loads just the chosen direction's instruments (plus a previewed one). Phones load nothing new. The whole bundled set is 30 MB or less.
- **One extra GM call per game,** in the background during the reading step, never on a path that blocks play.
- **The compose call sees only public facts:** title, setting summary, tone, round names, opening scene. Never the truth, culprits, cards or clues.
- **Plain English** in every label and in the GM's direction names and lines ("a host could read it aloud"). No em dashes.
- **Readability first:** world fonts only on titles; text on solid cards; no moving edges.
- **Tests run without audio.**
- **Never modify an existing test without explaining and waiting for the user's confirmation.**
- **Live checks** run in a git worktree on a scratch port with `DETECTIVE_DATA_DIR` in the scratchpad. Never rebuild `.next` in the main checkout or touch port 4321.

## Facts checked before planning (2026-10-18)

- `tone` latest stable is 15.1.22, MIT (`npm view tone dist-tags`).
- VSCO 2 CE is CC0-1.0, 2.3 GB of 24-bit 44.1 kHz WAV.
- **VSCO note names are not scientific pitch.** The cello file `susvib_C1_v1_1.wav` measures 65.4 Hz (C2), and `susvib_A2_v1_1.wav` measures 219.4 Hz (A3). So the build names every sample by its measured pitch.
- `ffmpeg-static@5.3.0` on this M1 has `libmp3lame`. A 5 s stereo cello note at `-q:a 4` is 74 KB.
- The library has no choir and no celesta. The pad is a Tone synth, and the glockenspiel stands in for celesta.

## Review Focus

1. **A game whose round count differs from the plan the GM wrote** (fewer rounds returned, a rework that changed phases, an extra replay round). Expect: every round index plays something, the last plan repeats. Pinned in Task 2 (`cleanSoundtrack` pads) and Task 3 (`roundPlan` clamps).
2. **Samples that never arrive** (a 404, a slow network, a decode error). Expect: simple music within 20 s, and the bar says "Simple music". Pinned in Task 5 (facade with a failing fake player).
3. **Preview pressed while the music is off.** Expect: the 10 s preview plays, then the music is off again and nothing keeps running. Pinned in Task 5.
4. **The host switches direction several times quickly.** Expect: only the last choice plays, with one crossfade, no stacked layers. Pinned in Task 5.
5. **GM text that names a person** in a direction name or line ("Priya's Waltz"). Expect: it never reaches the table, and a generic name is used instead. Pinned in Task 2.

---

## File structure

| File | Responsibility |
|---|---|
| `scripts/samples/sources.ts` | Which VSCO folders and files each instrument comes from (build-only). |
| `scripts/samples/pitch.ts` | Measure a sample's pitch from raw PCM (autocorrelation). |
| `scripts/build-samples.ts` | Download, measure, trim, encode, and write `public/samples/**` plus the manifest. |
| `public/samples/**`, `public/samples/LICENSE-VSCO.txt` | The committed MP3 subset and its licence. |
| `src/lib/soundtrack/manifest.ts` | Generated: per instrument, measured note name to file, plus bytes. |
| `src/lib/soundtrack/instruments.ts` | The catalogue the GM may choose from: ids, roles, ranges, kit pieces. |
| `src/lib/soundtrack/types.ts` | `Soundtrack`, `Direction`, `RoundPlan`, `NoteEvent` and the enums. |
| `src/lib/soundtrack/clean.ts` | `cleanSoundtrack`: GM output into a safe, playable soundtrack. |
| `src/lib/soundtrack/arrange.ts` | Pure music: chords, voice leading, variations, layers, bars, stingers. |
| `src/lib/soundtrack/player.ts` | Tone.js player: samplers, buses, scheduling, crossfades, preview. |
| `src/lib/music.ts` | Keeps `Score`; adds the `Music` facade that picks player or `Score`. |
| `src/lib/music-theory.ts` | `cuesBetween` gains `seat` and `vote`. |
| `server/prompts.ts`, `server/gm.ts` | `SOUNDTRACK_SCHEMA`, `composePrompt`, `gm.compose`. |
| `server/game.ts`, `server/app.ts`, `server/index.ts` | Soundtrack state, view field, background compose, `POST /api/music`. |
| `src/components/game/music-picker.tsx` | The reading-screen picker. |
| `src/app/table/reading.tsx`, `src/app/table/table-app.tsx` | Wire the picker, the facade and the music bar controls. |
| `src/app/music-lab/page.tsx`, `src/lib/soundtrack/fixture.ts` | A page to audition directions without a game. |

---

### Task 1: The sample library

**Files:**
- Create: `scripts/samples/sources.ts`, `scripts/samples/pitch.ts`, `scripts/build-samples.ts`
- Create (generated, committed): `public/samples/<instrument>/<Note>.mp3`, `public/samples/LICENSE-VSCO.txt`, `src/lib/soundtrack/manifest.ts`
- Modify: `package.json` (devDependency `ffmpeg-static` pinned to `5.3.0`; script `"samples": "node scripts/check-node.cjs && node scripts/build-samples.ts"`)
- Test: `test/samples.test.ts`

**Interfaces:**
- Produces: `MANIFEST: Record<string, { notes: Record<string, string>; bytes: number }>` in `src/lib/soundtrack/manifest.ts`. Keys are instrument or kit ids. Note keys are scientific names with sharps (`C2`, `F#3`). Values are paths relative to `/samples/` (`cellos/C2.mp3`). Kit pieces use the single key `hit`.
- Produces: `measurePitch(pcm: Float32Array, sampleRate: number): number | null` (Hz) and `noteName(midi: number): string` in `scripts/samples/pitch.ts`.

Instruments and sources (dynamic layer: the softest sustained one unless noted):

| id | VSCO folder | role use |
|---|---|---|
| `piano` | `Keys/Upright Piano` | lead, harmony, bass |
| `harp` | `Strings/Harp` | lead, harmony, texture |
| `violins` | `Strings/Violin Section/susVib` | lead, harmony |
| `cellos` | `Strings/Cello Section/susvib` | lead, harmony, bass |
| `pizzicato` | `Strings/Violin Section/Pizz` | lead, texture |
| `tremolo` | `Strings/Violin Section/Trem` | harmony, texture |
| `basses` | `Strings/Solo Contrabass/SusNV` | bass |
| `bass_pizz` | `Strings/Solo Contrabass/Pizz` | bass |
| `flute` | `Woodwinds/Flute/susNV` | lead, texture |
| `clarinet` | `Woodwinds/Clarinet/susLong` | lead, harmony |
| `oboe` | `Woodwinds/Oboe/Sus` | lead |
| `horn` | `Brass/F Horn/sus` | lead, harmony |
| `glockenspiel` | `Percussion/Glock` | lead, texture |
| `marimba` | `Percussion/Marimba` | lead, texture |
| `timpani` | `Percussion/Timpani` | bass |

Kit (one or two hits each): `kick` (`VSCO 1 Percussion/drums/bass`), `snare` (`VSCO 1 Percussion/drums/snare`), `shaker` (`VSCO 1 Percussion/varWood/Camo's Shaker`), `woodblock` (`VSCO 1 Percussion/varWood/log_drum`), `triangle` (`VSCO 1 Percussion/varMetal/triangle`), `cymbal` (`VSCO 1 Percussion/varMetal/Cymbals`, a roll or swell), `timpani_roll` (`Percussion/Timpani/Rolls`).

- [ ] **Step 1: Write the failing tests** in `test/samples.test.ts`:

```ts
test('should measure a pure 110 Hz tone as A2', () => {
  const sr = 44100; const pcm = new Float32Array(sr * 2).map((_, i) => Math.sin(2 * Math.PI * 110 * i / sr));
  assert.ok(Math.abs(measurePitch(pcm, sr)! - 110) < 1, 'within 1 Hz');
  assert.equal(noteName(45), 'A2');
});
test('should not halve the pitch of a tone with a strong second harmonic', () => {
  // fundamental 220 Hz plus 440 Hz at the same level must still read 220, not 110
});
test('should return null for silence', () => { assert.equal(measurePitch(new Float32Array(44100), 44100), null); });
test('should give every catalogue instrument and kit piece at least one sample on disk', () => {
  // for each id in MANIFEST: Object.keys(notes).length >= 1, and existsSync(`public/samples/${file}`) for every file
});
test('should keep the whole sample set at 30 MB or less', () => {
  assert.ok(Object.values(MANIFEST).reduce((n, i) => n + i.bytes, 0) <= 30 * 1024 * 1024, 'over budget');
});
test('should ship the VSCO licence with the samples', () => { assert.match(readFileSync('public/samples/LICENSE-VSCO.txt', 'utf8'), /CC0/); });
test('should space pitched samples at most 4 semitones apart', () => { /* sorted midi of each pitched instrument: gaps <= 4 */ });
```

- [ ] **Step 2: Run it.** `npm test -- test/samples.test.ts` (or the tsx command with that file). Expected: FAIL, module not found.

- [ ] **Step 3: Implement `pitch.ts`.** Autocorrelation over 2 s starting 0.8 s in (past the attack), lags for 25 to 1200 Hz, then take the shortest lag whose correlation is at least 0.9 of the best peak (this avoids octave-down errors). Return null when the RMS is below 1e-4. Middle C is `C4` (MIDI 60).

- [ ] **Step 4: Implement `build-samples.ts`.**
  - One request to `https://api.github.com/repos/sgossner/VSCO-2-CE/git/trees/master?recursive=1`. Download files from `raw.githubusercontent.com` into a cache under `os.tmpdir()`, so a rebuild doesn't download again.
  - **Pitched:** decode each candidate to mono f32 with ffmpeg and measure it. Keep a file only when its measured MIDI is within 0.5 of the filename's note plus 12·k, for some k in {-1, 0, 1}. Name it by the measured note. Log every dropped file with the reason, and fail the build if an instrument ends with no samples.
  - Pick a subset with gaps of at most 4 semitones. Then trim: sustains to 6 s, hits to 3 s, with a 0.4 s fade-out. Encode stereo MP3 at `-q:a 4`.
  - Per instrument, normalise so the loudest sample peaks at -3 dBFS, using one gain for the whole instrument so its dynamics stay.
  - **Kit:** take the first matching file per piece, trim to 3 s (4 s for `cymbal` and `timpani_roll`), mono.
  - Write `src/lib/soundtrack/manifest.ts` (a generated header comment, then the `MANIFEST` const with real byte sizes) and `LICENSE-VSCO.txt` (the repo's LICENSE text plus a credit line).

- [ ] **Step 5: Run the build.** `npm i -D ffmpeg-static@5.3.0 && npm run samples`. Expected: it ends with a total of 30 MB or less and lists the dropped files. Read the dropped list: if more than a third of an instrument's files dropped, look at that folder's naming before going on.

- [ ] **Step 6: Run the tests.** Expected: PASS.

- [ ] **Step 7: Commit.** `git add scripts/samples scripts/build-samples.ts public/samples src/lib/soundtrack/manifest.ts test/samples.test.ts package.json package-lock.json && git commit -m "feat: measured VSCO 2 CE sample set for the soundtrack"`

---

### Task 2: Catalogue, types and cleaning

**Files:**
- Create: `src/lib/soundtrack/types.ts`, `src/lib/soundtrack/instruments.ts`, `src/lib/soundtrack/clean.ts`
- Test: `test/soundtrack-clean.test.ts`

**Interfaces:**
- Consumes: `MANIFEST` (Task 1); `ROOTS`, `MODES` from `src/lib/music-theory.ts`.
- Produces:
  - In `types.ts`:
    - `InstrumentId`: the 15 ids above plus `'pad'` (a Tone synth, no samples).
    - `KitId`: the 7 kit ids.
    - `Role = 'lead' | 'harmony' | 'bass' | 'texture'`
    - `VARIATIONS = ['plain', 'slow', 'dark', 'broken', 'high', 'inverted'] as const`
    - `PULSES = ['none', 'eighths', 'arp_up', 'arp_updown', 'ostinato'] as const`
    - `GROOVES = ['none', 'heartbeat', 'ticking', 'march', 'brush', 'tribal'] as const`
    - `STINGER_STYLES = ['swell', 'hit', 'chime', 'rise', 'fall'] as const`
    - `StingerKind = 'round' | 'seat' | 'vote' | 'reveal'`
    - `type Variation = typeof VARIATIONS[number]`, and likewise `Pulse`, `Groove`, `StingerStyle`
    - `ThemeNote = { degree: number; beats: number; rest?: boolean }`
    - `RoundPlan = { mood: string; chords: number[]; variation; shift: number; pulse; groove; low: number; high: number }`
    - `Direction = { name: string; line: string; tempo: number; root: string; mode: string; lead: InstrumentId; harmony: InstrumentId; bass: InstrumentId; texture: InstrumentId; kit: KitId[]; theme: ThemeNote[]; rounds: RoundPlan[]; stingers: Record<StingerKind, StingerStyle> }`
    - `Soundtrack = { directions: Direction[]; chosen: number }`
    - `TableSoundtrack = { status: 'writing' | 'ready' | 'failed'; directions?: Direction[]; chosen?: number }` (what `tableView` sends)
    - `NoteEvent = { at: number /* beats from bar start */; part: 'drone' | 'pad' | 'bass' | 'chords' | 'pulse' | 'melody' | 'counter' | 'groove' | 'stinger'; instrument: InstrumentId | KitId; midi: number; beats: number; velocity: number }`
  - In `instruments.ts`:
    - `INSTRUMENTS: Record<InstrumentId, { label: string; roles: Role[]; range: [number, number] }>`. Ranges come from the manifest's lowest and highest sample, widened by 5 semitones. The pad is [36, 84].
    - `KIT_IDS: KitId[]`
    - `defaultFor(role: Role): InstrumentId`: piano for lead, violins for harmony, cellos for bass, harp for texture.
    - `instrumentsOf(d: Direction): (InstrumentId | KitId)[]` (unique).
  - In `clean.ts`: `cleanSoundtrack(raw: unknown, opts: { rounds: number; names: string[] }): Soundtrack | null`.

- [ ] **Step 1: Write the failing tests:**
  - `should keep a valid direction as given` (a fixture direction round-trips with `deepEqual`).
  - `should replace an unknown or wrong-role instrument with the role default`: `lead: 'kazoo'` gives `'piano'`; `bass: 'flute'` (flute can't play bass) gives `'cellos'`.
  - `should clamp tempo, theme degrees and beats into playable values`: tempo 400 gives 140; degree 99 gives 14; beats 0.3 snaps to 0.5; total theme beats pad with a rest up to 8 or 16, or trim to 16.
  - `should give every game round a plan, repeating the last when the GM wrote too few`: rounds 5, GM gave 2, so the length is 5 and plans 3 to 5 equal plan 2.
  - `should drop extra round plans`.
  - `should keep chords to 4 or 8 scale degrees from 0 to 6`: `[0, 9, 4]` gives `[0, 6, 4, 0]`; 6 chords gives the first 4.
  - `should order low and high and keep them between 0 and 1`: low 0.9, high 0.2 gives 0.2 and 0.9.
  - `should never show a person's name in a direction name or line`: with `names: ['Priya']`, `"Priya's Waltz"` becomes `"Music 1"` and a line naming Priya becomes `''`. Match the name as a whole word, case-insensitive.
  - `should keep at most 3 directions and return null when none can play` (a direction with fewer than 4 theme notes after cleaning is dropped).
  - `should cap the kit at 3 known pieces`.
  - `should keep chosen inside the directions`.

- [ ] **Step 2: Run them.** Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the types, the catalogue and `cleanSoundtrack` to the tests. Allowed beats: 0.5, 1, 1.5, 2, 3, 4. Degrees clamp to -7..14, shift to -5..7. Default root and mode when invalid: `C` and `minor`. A missing stinger style becomes `swell`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: soundtrack catalogue and cleaning`

---

### Task 3: The arranger (pure music)

**Files:**
- Create: `src/lib/soundtrack/arrange.ts`
- Test: `test/soundtrack-arrange.test.ts`

**Interfaces:**
- Consumes: types and `INSTRUMENTS` (Task 2); `degreeToMidi`, `MODES`, `ROOTS` from `music-theory.ts`.
- Produces:
  - `roundPlan(d: Direction, roundIndex: number): RoundPlan`: clamps the index to the plans.
  - `chordPitches(d: Direction, degree: number, shift: number): number[]`: a diatonic triad from the mode, as pitch classes around octave 3.
  - `voiceLead(prev: number[] | null, next: number[], center = 57): number[]`: the inversion and octave of `next` with the least total movement from `prev`, or the one closest to `center` when `prev` is null.
  - `fitRange(midi: number, range: [number, number]): number`: moves by octaves into range.
  - `vary(theme: ThemeNote[], kind: Variation): ThemeNote[]`
  - `effective(x: number, plan: RoundPlan): number`: `plan.low + (plan.high - plan.low) * x`.
  - `layersFor(eff: number, plan: RoundPlan): Set<NoteEvent['part']>`
  - `arrangeBar(d: Direction, roundIndex: number, bar: number, x: number, prev: number[] | null, variation?: Variation): { events: NoteEvent[]; voicing: number[] }`
  - `stingerNotes(d: Direction, kind: StingerKind | 'hint'): NoteEvent[]`: at most 4 beats at the direction's tempo. `'hint'` always uses the `chime` style.

Rules the tests pin:
- **Variations:**
  - `slow` doubles every `beats`
  - `dark` drops the melody an octave and lowers degrees 2 and 5 of a major mode by a semitone
  - `broken` keeps the first half and turns every other note of it into a rest
  - `high` raises everything an octave
  - `inverted` mirrors degrees around the first note
  - `plain` returns the theme unchanged
- **Layer thresholds on the effective tension:**

| Layer | Plays when |
|---|---|
| `drone` | always |
| `pad` | 0.15 or more |
| `melody` | 0.25 or more |
| `bass` | 0.3 or more |
| `chords` | 0.4 or more |
| `pulse` | 0.45 or more, unless the pulse is `none` |
| `groove` | 0.55 or more, unless the groove is `none` |
| `counter` | 0.8 or more |

- **Bars:** one chord per 4-beat bar, cycling through the round's chords. The melody plays the theme across consecutive bars. Below 0.5 it plays every other phrase (call and rest). Every note lands inside its instrument's range (`fitRange`).

- [ ] **Step 1: Write the failing tests:**
  - `should move a C major chord to F major by the smallest steps`: `voiceLead([48, 52, 55], [53, 57, 60])` gives `[48, 53, 57]`.
  - `should build minor triads in a minor key`: `chordPitches({ root: 'A', mode: 'minor' }, 0, 0)` has pitch classes A, C and E.
  - `should fold a note into an instrument's range by octaves`: `fitRange(30, [40, 80])` is 42; `fitRange(90, [40, 80])` is 78.
  - one test per variation, with the exact expected notes for a 4-note theme
  - `should add layers as the tension rises and drop pulse and groove when they are none`
  - `should play only drone and pad at the lowest tension of round 1`
  - `should keep every note of a bar inside its instrument's range` (sweep x from 0 to 1, bars 0 to 15, all three fixture directions)
  - `should repeat the last round plan for a round past the end`
  - `should keep every stinger within 4 beats and use the direction's own instruments`
  - `should give the same bar the same notes every time` (no randomness: the same inputs give equal output)

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** to the tests.
  - Pulse patterns over the bar's voicing: `eighths` repeats the chord root in eighths; `arp_up` and `arp_updown` arpeggiate the voicing in eighths; `ostinato` repeats the first two theme degrees in eighths.
  - Groove patterns: `heartbeat` (kick at 0 and 0.28), `ticking` (shaker every beat), `march` (snare on 2 and 4, kick on 1), `brush` (snare soft on 2 and 4), `tribal` (timpani or woodblock on 1, 2.5 and 3).
  - Velocity rises with `eff` (0.3 to 0.9).
  - Stingers: `swell` (harmony instrument, a tonic chord, crescendo over 3 beats plus a cymbal when the kit has it); `hit` (bass plus timpani or kick on beat 1, then a short chord); `chime` (texture instrument, the first 4 theme notes in eighths); `rise` (lead, a scale run up an octave over 2 beats then the tonic); `fall` (the same run going down, ending on degree 1 below).
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: soundtrack arranger: voice leading, variations, layers by tension, stingers`

---

### Task 4: The GM composes, the game keeps it

**Files:**
- Modify: `server/prompts.ts` (add `SOUNDTRACK_SCHEMA`, `composePrompt`), `server/gm.ts` (add `compose`), `server/game.ts` (add `startSoundtrack`, `applySoundtrack`, `failSoundtrack`, `pickSoundtrack`, and the `tableView` field), `server/app.ts` (add `composeMusic`, `pickMusic`; call after attach and from `init`), `server/index.ts` (route)
- Test: `test/soundtrack-server.test.ts`

**Interfaces:**
- Consumes: `cleanSoundtrack`, `INSTRUMENTS`, `KIT_IDS`, the enums (Tasks 2 and 3).
- Produces:
  - `gm.compose(game): Promise<unknown>`: schema `SOUNDTRACK_SCHEMA`, `model: this.playModel`, `timeoutMs: 300_000`.
  - `G.startSoundtrack(game)` sets `game.state.soundtrack = { status: 'writing' }`.
  - `G.applySoundtrack(game, raw)` sets `{ status: 'ready', directions, chosen: 0 }`, or `{ status: 'failed' }` when the cleaning returns null. `names` is every player name plus every character and NPC name. `rounds` is `game.scenario.phases.length`.
  - `G.failSoundtrack(game)` sets `{ status: 'failed' }`.
  - `G.pickSoundtrack(game, index)` throws `GameError` 400 "That music is not on the list." when the index is out of range, and 409 when the soundtrack isn't ready.
  - `tableView(game).soundtrack: { status, directions?, chosen? } | null`. **Not** in `playerView`.
  - `app.composeMusic(game)` is a background task: `startSoundtrack`, then `gm.compose`, then `applySoundtrack`, and `failSoundtrack` on error. It saves and notifies each time.
  - `app.pickMusic(hostToken, index)`; route `'POST /api/music': (b) => app.pickMusic(b.host, b.index)`.

`composePrompt(game)` is built only from `scenario.title`, `scenario.setting_summary`, `game.setup.tone`, `scenario.opening_scene` and `scenario.phases.map((p) => p.name)`. The fixed instructions (exact copy):

```
You are the composer for a party mystery game. Write 3 different soundtrack directions for this world.
Each direction is a full plan. Make the three really different, for example one big and orchestral, one small and close (piano, harp, a solo voice), one built on rhythm.
- name: 2 to 4 plain words. line: one sentence a host can read aloud, under 15 words, saying what it sounds like ("Slow cellos and a ticking clock").
- Never use the name of any person in the story.
- Pick instruments only from the lists. lead plays the theme, harmony holds the chords, bass is the low line, texture adds colour.
- theme: 6 to 12 notes, easy to hum. Mostly steps, one leap at most. degree 0 is the key note.
- rounds: one plan per round, in order. Round 1 is quiet and curious (low about 0.1, high about 0.4). The middle rounds build. The last round is the most intense (high up to 1).
- chords: 4 or 8 scale degrees per round (0 to 6). Change the chords from round to round so each round feels new.
- variation changes the theme for that round. shift moves the round to a new key (in semitones, 0 keeps it).
- Fit the tone: cozy is warm and light, tense is tight and pulsing, dark is low and slow, funny is bouncy and bright.
```

- [ ] **Step 1: Write the failing tests:**
  - `should build the compose prompt from public facts only`: with a fixture scenario, the prompt includes the title and every round name, and does not include any culprit's `character_name` linked to the truth, `truth`/`solution` text, any card `private_info`, or any clue text. Assert on the actual strings of the fixture.
  - `should store a cleaned soundtrack with the first direction chosen`
  - `should mark the soundtrack failed when nothing can play`
  - `should let the table pick a direction and refuse one off the list` (400 for index 3 of 3; 409 while writing)
  - `should show the soundtrack on the table and never on a phone`
  - `should compose in the background after the world is written, without holding up the reading step` (app test with a fake GM whose `compose` resolves later: the status is `reading` before compose resolves; afterwards the soundtrack is `ready`)
  - `should fall back to failed when the compose call throws`
  - `should compose once for a game restored in reading or playing without a soundtrack, and not again when one exists`
  - `should require the host token to pick music` (rejects with "table screen")

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** to the tests. `SOUNDTRACK_SCHEMA` uses the enums from Task 2 (so the GM can only choose valid ids) and the numeric bounds above. Call `this.composeMusic(game)` right after `this.drawPicture(game)` in `setup`. In `init`, compose when `state` exists, `status` is `reading` or `playing`, and `state.soundtrack` is missing or `writing`.
- [ ] **Step 4: Run them, then the full suite.** Expected: PASS. If an existing test breaks (for example a `deepEqual` on the whole `tableView`), stop and ask the user before changing it.
- [ ] **Step 5: Commit.** `feat: GM composes three soundtrack directions in the background; the table picks one`

---

### Task 5: The player, the facade and the cues

**Files:**
- Create: `src/lib/soundtrack/player.ts`
- Modify: `src/lib/music.ts` (add `Music`), `src/lib/music-theory.ts` (`cuesBetween`), `src/app/table/table-app.tsx` (`useMedia` uses `Music`; the sound de-dupe covers `vote`)
- Modify: `package.json` (dependency `tone` pinned to `15.1.22`)
- Test: `test/music-facade.test.ts`, plus new cases in a new file `test/music-cues.test.ts` (the existing `test/music.test.ts` stays untouched)

**Interfaces:**
- Consumes: `arrangeBar`, `stingerNotes`, `roundPlan`, `effective` (Task 3); `MANIFEST`, `instrumentsOf` (Tasks 1 and 2); `Score` (existing).
- Produces:
  - `SoundtrackPlayer`, implementing `PlayerLike`:
    - `load(ids: (InstrumentId | KitId)[]): Promise<void>` rejects after 20 s or on any decode error
    - `play(d: Direction, roundIndex: number)`, `setRound(i: number)`, `setDirection(d: Direction)`, `setIntensity(x: number)`, `stinger(kind: StingerKind | 'hint')`, `nextPiece()`, `setVolume(v)`, `duck(on)`, `stop()`, `level(): { rms: number; peak: number }`, `readonly playing: boolean`
    - Tone is imported with `await import('tone')` inside `load`.
  - `Music` in `src/lib/music.ts`: `constructor({ makeScore = () => new Score(), makePlayer = () => new SoundtrackPlayer() } = {})`. It has the same members `table-app.tsx` uses on `Score` today (`start`, `stop`, `playing`, `volume`, `setVolume`, `duck`, `setTheme`, `setIntensity`, `cue`, `level`), plus:
    - `setSoundtrack(s: TableSoundtrack | null)`, `setRound(i: number)`
    - `preview(index: number): Promise<void>` (10 s)
    - `nextPiece()`
    - `readonly source: 'composed' | 'loading' | 'simple'`
  - `cuesBetween` adds `'seat'` (a seat's `status` changes to `'live'`) and `'vote'` (`next.round?.vote` appears).

Behaviour:
- **What plays.** With a ready soundtrack, `start` loads the chosen direction's instruments and then plays them. Until they load, `Score` plays, and `source` is `loading`. If loading fails, `Score` keeps playing for the rest of the game and `source` becomes `simple`.
- **Switching.** Each `setSoundtrack` with a new `chosen` crossfades over 4 s at the next bar. Several switches before a load finishes play only the last one, because each switch takes a fresh token and stale loads are ignored.
- **Preview** loads that direction, plays round 1 at x = 0.55 for 10 s, then goes back to the chosen direction. If the music was off before the preview, it is off again after.
- **Cues map to stingers:** `phase` to `round`, `seat` to `seat`, `vote` and `final` to `vote`, `reveal` to `reveal`. The `hint` cue plays `stinger('hint')`. On `Score` the new cues do nothing, as today.
- **`nextPiece`** moves the current round to the next variation in `VARIATIONS`, for this table only.
- **Mixing.** Each part has its own gain: drone 0.25, pad 0.35, bass 0.6, chords 0.45, pulse 0.4, melody 0.7, counter 0.35, groove 0.5, stinger 0.8. There is a light shared reverb (decay 3 s, wet 0.25) and a limiter at -1 dB on the master.

- [ ] **Step 1: Write the failing tests** with fake players and scores (no audio):
  - `should play the simple music until the composed music loads, then switch`
  - `should keep the simple music for the game when the samples fail to load` (the fake `load` rejects; `source` is `'simple'`; `score.playing` stays true)
  - `should play only the last direction after quick switches` (three `setSoundtrack` calls before `load` resolves; the fake records a single `play` with direction 2)
  - `should turn the music off again after a preview started from silence`
  - `should send a round stinger on a new phase and a seat stinger when a seat goes live`
  - `should move to the round of the current phase` (`setRound(2)` reaches the player)
  - `should keep the composed engine off when there is no soundtrack` (`source` is `'simple'` and `makePlayer` is never called)
  - in `test/music-cues.test.ts`: `should cue a seat when a hot seat goes live` and `should cue a vote when the round vote opens`

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** `Music` and `cuesBetween` to the tests, then `SoundtrackPlayer`:
  - A Tone `Sampler` per sampled instrument (`urls` from `MANIFEST`, `baseUrl: '/samples/'`), a `Player` per kit piece, and a `PolySynth(AMSynth)` for the pad.
  - Two `Channel` buses for crossfades.
  - `getTransport().scheduleRepeat` once per bar, calling `arrangeBar` with the smoothed intensity (the same 0.08 easing as `Score`).
  - `level()` reads a `Tone.Analyser('waveform')` on the master.
- [ ] **Step 4: Wire `table-app.tsx`.**
  - `useMedia` builds `new Music()` instead of `new Score()`, calls `m.score.setSoundtrack(view.soundtrack)` and `m.score.setRound(view.phase?.index ?? 0)`, and keeps everything else.
  - Extend the sound de-dupe so the `vote` sound is skipped when the music played the `vote` cue.
- [ ] **Step 5: Run the facade tests and the full suite, and type-check** (`npx tsc --noEmit -p tsconfig.json`). Expected: PASS, no type errors.
- [ ] **Step 6: Commit.** `feat: soundtrack player with fallback, crossfades and stingers`

---

### Task 6: The picker and the music bar

**Files:**
- Create: `src/components/game/music-picker.tsx`
- Modify: `src/app/table/reading.tsx` (picker at the top of the aside), `src/app/table/table-app.tsx` (`MediaBar`)
- Test: `test/music-picker.test.tsx`

**Interfaces:**
- Consumes: `view.soundtrack` (Task 4), the `Music` facade (Task 5).
- Produces: `MusicPicker({ soundtrack, host, previewing, onListen, onPick }: { soundtrack: TableSoundtrack | null; host: boolean; previewing: number | null; onListen: (i: number) => void; onPick: (i: number) => void })`

Copy (exact):

| State | Text |
|---|---|
| title | "Music for this game" |
| writing | "The GM is writing the music. Simple music plays until it is ready." |
| failed | "Simple music this game. The GM could not write a soundtrack." |
| ready (per row) | the direction's `name` (heading font), its `line` (body font), a "Listen" button ("Playing… {n}s" while previewing), and "Use this" (host only), or a "Chosen" badge on the chosen row |

Music bar:
- When the source is `composed`, it shows a shadcn `Select` of the direction names (host only) and a "Next piece" button (lucide `SkipForwardIcon`).
- The right-side text shows the chosen direction's `line`. While loading it shows "Loading the instruments…", and when simple, "Simple music".

- [ ] **Step 1: Write the failing tests** (`renderToStaticMarkup`, match `&#x27;` too):
  - `should say the GM is writing while the soundtrack is not ready`
  - `should list three directions with Listen on each and Use this only for the host`
  - `should mark the chosen direction`
  - `should say simple music plays when composing failed`
  - `should show a countdown on the direction being previewed`
  - `should render nothing before the world exists` (`soundtrack` null gives an empty string)
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the picker with `Button` and `Badge`, a solid `bg-card` section, and no raw form controls (the screens-review guard checks this). Wire `onPick` to `act('music', { index })` and `onListen` to `media.score.preview(i)`.
- [ ] **Step 4: Run them, the full suite and `tsc`.** Expected: PASS.
- [ ] **Step 5: Commit.** `feat: pick and switch the soundtrack on the table`

---

### Task 7: The music lab and the live check

**Files:**
- Create: `src/lib/soundtrack/fixture.ts` (3 hand-written directions, 4 rounds each, one per tone family), `src/app/music-lab/page.tsx`
- Test: `test/soundtrack-fixture.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `/music-lab`, a page that plays the fixture or a pasted soundtrack JSON, without a game. It has a direction picker, a round selector, an intensity `Slider` (0 to 1), a button per stinger, "Next piece", and a live level meter. It is not linked from the game screens.

- [ ] **Step 1: Write the failing test:** `should keep the fixture valid after cleaning` (`cleanSoundtrack(FIXTURE, { rounds: 4, names: [] })` deep-equals `FIXTURE`).
- [ ] **Step 2: Run it.** Expected: FAIL. **Step 3: Implement** the fixture and the page. **Step 4: Run it.** Expected: PASS. Commit: `feat: music lab to audition soundtracks`.
- [ ] **Step 5: Live check in a worktree** (the user approves the GM spend first). Build in a scratchpad worktree (`cp -cR node_modules`, `next build`) and run on port 4432 with a scratch data dir. Then:
  1. Open `/music-lab` with the browse tool. Click play. Check that there are no console errors, that every `/samples/` request returns 200 (from the performance resource list), and that the level meter reads above 0 within 5 s.
  2. Start one real game in hot seats style. Confirm the soundtrack goes from `writing` to `ready` during the reading step, and log how long the compose call took. Pick direction 2 and preview direction 3. Start round 1 and confirm the music switches to the composed source.
  3. Read the server log for `gm compose` and any failure.
- [ ] **Step 6: The user listens.** Hand over the lab URL and the game. Their judgment of the sound is the acceptance test; tune the mixing gains and thresholds from their notes, and cover each tuning with a test where the arranger's behaviour changes.

---

## Final review

One whole-branch review on the most capable model, with this plan, the spec and the ledger's rulings. Critical and Important findings get one fix pass, each fix tested red then green. Minor findings go to the ledger.
