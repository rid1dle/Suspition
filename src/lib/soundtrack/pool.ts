// The music the room has liked, so the GM writes new music in its spirit without repeating it.
// Favourites: music the host switched to (the strongest sign), the hand-made lab directions, then what played.
// Recent: what played in the last games, which the GM must not repeat.
import type { Direction } from './types.ts';

export type PastSoundtrack = { directions: Direction[]; chosen: number; switched?: boolean };
export type Sketch = Pick<Direction, 'name' | 'line' | 'tempo' | 'root' | 'mode' | 'lead' | 'harmony' | 'bass' | 'texture' | 'kit'>;
export type MusicPool = { favourites: Sketch[]; recent: Sketch[] };

const FAVOURITES = 3;
const RECENT = 6;

// What makes a direction sound like itself, without its whole score.
const sketch = (d: Direction): Sketch => ({ name: d.name, line: d.line, tempo: d.tempo, root: d.root, mode: d.mode, lead: d.lead, harmony: d.harmony, bass: d.bass, texture: d.texture, kit: d.kit });

export function musicPool(past: PastSoundtrack[], handMade: Direction[]): MusicPool {
  const played = past.map((p) => p.directions?.[p.chosen]).filter(Boolean) as Direction[];
  const switched = past.filter((p) => p.switched).map((p) => p.directions?.[p.chosen]).filter(Boolean) as Direction[];
  const seen = new Set<string>();
  const favourites = [...switched, ...handMade, ...played].filter((d) => !seen.has(d.name) && seen.add(d.name)).slice(0, FAVOURITES).map(sketch);
  return { favourites, recent: played.slice(0, RECENT).map(sketch) };
}
