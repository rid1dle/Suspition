# Soundtrack: composed per game, per round

Status: APPROVED, 2026-10-18

## Why

The music is good but doesn't hit the mark. Today the GM picks one theme per game: a key, a mood, a tempo, one synth instrument family, a beat and a 5 to 8 note tune. The engine loops the same four chords all game, with thin synth tones. The creator wants:
- music that is much better;
- a music definition step, where the GM thinks about it, then makes it;
- options to choose from;
- each round with its own music;
- far more immersion.

## Decisions (from the creator)

- **Sound source:** recorded instrument samples, played with Tone.js (MIT, version 15.1.22). The samples come from VSCO 2 Community Edition (CC0), a small compressed subset bundled with the app, so it works offline.
- **Options:** both. The host picks one of 3 soundtrack directions at the start and can switch at any time from the music bar.

## How it works

1. **Music definition.**
   - After the world is written, the GM makes one "compose" call. It runs in the background during the reading step, like the scene picture.
   - It returns 3 directions. Each has:
     - a name and a one-line description a host can read aloud;
     - instruments, chosen from the bundled set;
     - a tempo and a key;
     - a main theme (a melody with rhythm);
     - a plan for each round.
   - Each round's plan holds its mood, chords, which layers play, how the theme is varied (slower, darker, broken up, in a new key) and how intense it gets.
   - Each direction also defines short stingers (2 to 4 seconds) for the big moments: a round starts, a hot seat, a vote, the reveal.
2. **Picking.**
   - The table's reading screen shows the 3 directions as cards with a 10-second "Listen" preview each. The host taps one.
   - If nobody picks, the first plays.
   - The music bar can switch direction or skip to the next piece at any time.
3. **Playing.**
   - Each round crossfades into its own piece.
   - Layers come in and out with tension: drone or pad, bass, chords, a pulse or arpeggio, the melody and percussion. This uses the tension signal the game already has (votes, timers, suspicion).
   - Stingers play at the big moments and the music dips under speech (narration) as today.
4. **Fallback.** If the compose call fails or is slow, today's engine plays the world's existing `music` theme, so there is never silence.

## Constraints

- **Samples load only when needed:** just the chosen direction's instruments, so phones download nothing and the table loads only what plays. The full bundled set is about 30 MB or less, and the licence file ships with it.
- **Music is on the table screen only**, as today.
- **One extra GM call per game.** It is smaller than the world call, and is never on the path that blocks play.
- **The music plan is checked and cleaned like other GM output.** Unknown instruments, out-of-range notes or tempos, and bad rhythms are fixed or dropped.
- **Tests run without audio.** Unit tests cover the pure parts: cleaning the plan, turning chords into notes, picking layers by tension, and choosing stingers.

## The GM is the composer

Every game's music is original. The GM writes new themes, chords and variations each time, and real recorded instruments perform them. Nothing is a stock track.

## Phase 2: AI audio layer (requested by the creator)

The creator wants the GM to also create sound itself, original every time, with real instruments as the base. Phase 2 adds an AI audio model on top of the instrument score, for what instruments can't do: atmospheres and textures such as wind through the lodge, crowd murmur, or an eerie drone under the theme.
- **Prompts:** the compose call also writes a short audio prompt for each round.
- **Generation:** a local model (for example MusicGen, run from the Python side) or an audio API makes short loops during the reading step. They are cached with the game.
- **Fallback:** if it is slow or unavailable, the instrument score plays alone.

Which model to use, and what it costs, is decided when phase 2 starts.

**Research (2026-10-18, read from docs and pricing pages, no model run yet):**
- **Local candidate:** Stable Audio 3 Small-SFX through its official MLX build.
  - Made for sound effects and ambience. The Community Licence is free under $1M revenue, and you own the outputs.
  - The official figure is about 1 s per 10 s clip on an M1 with 8 GB.
  - It installs its own Python 3.11 env with uv, which avoids the Python 3.14 problem.
  - Risks: quality is untested, and the code is new (May 2026).
- **API candidate:** ElevenLabs Sound Effects.
  - The only option with a real `loop: true`.
  - Clips are 30 s at most, and it needs an API key and internet.
  - Cost is about $0.12 a minute of audio, so about $0.30 a game.
- **Ruled out:**
  - MusicGen, AudioLDM 2, TangoFlux and MMAudio: their weights are non-commercial.
  - Suno: no public API.
  - Google Lyria: music only.
- **Looping:** without a loop option, make each clip 2 s long and crossfade its tail into its head once on the server. That works for steady sound (rain, wind, murmur, drone). Save loops as WAV, not MP3, to avoid a gap at the seam.

## Not in scope

- Music on phones.
- Users uploading their own music.

## Open for the builder

- The exact instrument subset (for example piano, cello section, violin section, harp, celesta, a few percussion pieces, a choir pad).
- The audio format and quality setting.
- How theme variation is written (transposing, slowing, breaking up, inverting).

## Later decision (2026-10-19): the GM picks, from a pool that grows

The creator liked the music but did not want to choose it every game, and did not want a fixed set of tracks that would repeat.

- **The GM picks:** the composer writes 3 new directions per game and names the one that fits this world best (`best`, with `why`). That one plays; the briefing shows its name and why, and "Change" folds the list away.
- **The pool:** music the host switched to in past games (the strongest sign of taste), the three hand-made music lab directions, then what played. Up to 3 go to the composer as favourites "to learn from, never copy".
- **No repeats:** what played in the last 6 real games goes to the composer as "never repeat these names, and never the same lead instrument in the same mode".
- **The look:** the composer also sees the world's look (colour, ambient effect, texture, lettering, sound feel). Everything it sees is public; never the truth or the story type.
- **Where it lives:** `src/lib/soundtrack/pool.ts` (`musicPool`), `Db.musicPool` reads the soundtracks of past real games, `App.musicPool` passes them to `GM.compose`. Playtests never count.
