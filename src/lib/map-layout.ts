// @ts-nocheck -- plain data in, plain data out; shared by the table and the phone
// The map as a tidy plan: each place gets its own cell of a grid, near where the GM put it, so no two ever
// overlap and the rough geography (west stays west, north stays north) still reads. Times are not drawn;
// they come from tripFrom when a player picks a place.
import { tripTime, tripShort, pathMetres } from './geography.ts';
import { shortName } from './map.ts';

export const CELL_W = 280;
// A phone is narrow: its cells are too, and only the distances from your place are drawn.
export const TALL_CELL_W = 205;
export const CELL_H = 130;
export const CARD_W = 172;
export const BEND = 0.12;
const PAD = 40;

// aspect: the screen's width over its height, so a phone gets a tall plan and the big screen a wide one.
function cellsFor(places, aspect) {
  const n = places.length;
  const cols = Math.min(5, Math.max(1, Math.round(Math.sqrt(n * aspect * 0.65))));
  const rows = Math.ceil(n / cols) + 1;
  const free = new Set();
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) free.add(`${c},${r}`);
  const wanted = places.map((p) => ({ p, fx: (clamp01(p.x) * (cols - 1)), fy: (clamp01(p.y) * (rows - 1)) }));
  // Places nearest a cell's centre choose first, so the clearest positions keep their spot.
  wanted.sort((a, b) => offset(a) - offset(b));
  const at = {};
  for (const w of wanted) {
    let best = null;
    for (const key of free) {
      const [c, r] = key.split(',').map(Number);
      const d = (c - w.fx) ** 2 + ((r - w.fy) * 1.2) ** 2;
      if (!best || d < best.d) best = { key, c, r, d };
    }
    free.delete(best.key);
    at[w.p.id] = { c: best.c, r: best.r };
  }
  // Empty rows and columns close up.
  const usedC = [...new Set(Object.values(at).map((a) => a.c))].sort((a, b) => a - b);
  const usedR = [...new Set(Object.values(at).map((a) => a.r))].sort((a, b) => a - b);
  for (const a of Object.values(at)) {
    a.c = usedC.indexOf(a.c);
    a.r = usedR.indexOf(a.r);
  }
  return { at, cols: usedC.length, rows: usedR.length };
}
const clamp01 = (v) => Math.min(1, Math.max(0, (Number(v) || 0) / 100));
const offset = (w) => (w.fx - Math.round(w.fx)) ** 2 + (w.fy - Math.round(w.fy)) ** 2;

// view: a public or player view (map, cast). me: the player's own id on a phone.
export function layoutMap(view, { me = null, before = null, aspect = 1.6 } = {}) {
  const cellW = aspect < 1 ? TALL_CELL_W : CELL_W;
  const map = view?.map;
  if (!map?.places?.length) return null;
  const people = [
    ...(view.cast?.players ?? []).map((c) => ({ ...c, kind: 'player' })),
    ...(view.cast?.npcs ?? []).map((c) => ({ ...c, kind: 'npc' })),
  ];
  const { at, cols, rows } = cellsFor(map.places, aspect);
  const here = me ? map.places.find((p) => p.name === view.here)?.id ?? map.positions?.[me] ?? null : null;
  const places = map.places.map((p) => {
    const cell = at[p.id];
    const x = PAD + cell.c * cellW + cellW / 2;
    const y = PAD + cell.r * CELL_H + CELL_H / 2;
    const inside = people.filter((c) => map.positions?.[c.id] === p.id)
      .map((c) => ({ id: c.id, name: c.name, label: c.id === me ? 'You' : shortName(c.name), kind: c.kind, minor: Boolean(c.minor), me: c.id === me, moved: Boolean(before && before[c.id] && before[c.id] !== p.id) }))
      .sort((a, b) => Number(b.me) - Number(a.me) || (a.kind === b.kind ? 0 : a.kind === 'player' ? -1 : 1));
    // How tall the card draws: a name that wraps takes a second line, people take a row.
    const h = 48 + (String(p.name).length > 16 ? 22 : 0) + (inside.length ? 30 : 0);
    return { id: p.id, name: p.name, icon: p.icon ?? '', info: p.public_info ?? '', x, y, h, here: p.id === here, people: inside };
  });
  const byId = Object.fromEntries(places.map((p) => [p.id, p]));
  const seen = new Set();
  const paths = [];
  const geo = map.geography;
  const across = Number(geo?.across_m) || 300;
  const raw = Object.fromEntries(map.places.map((p) => [p.id, p]));
  const add = (a, b, kind, m) => {
    const key = [a, b].sort().join('|');
    if (a === b || !byId[a] || !byId[b] || seen.has(key)) return;
    seen.add(key);
    const [A, B] = [byId[a], byId[b]];
    // The same gentle bend the screen draws, so the distance sits on the line itself.
    const cx = (A.x + B.x) / 2 - (B.y - A.y) * BEND;
    const cy = (A.y + B.y) / 2 + (B.x - A.x) * BEND;
    const metres = Number(m) || pathMetres(raw[a], raw[b], across);
    paths.push({ from: a, to: b, kind: kind ?? 'trail', x1: A.x, y1: A.y, x2: B.x, y2: B.y, cx, cy, m: metres, label: tripShort(metres, Boolean(geo?.about)), near: here ? a === here || b === here : null });
  };
  // A path through a landmark joins the two places it links.
  const viaLandmark = {};
  for (const p of geo?.paths ?? []) {
    if (byId[p.from] && byId[p.to]) add(p.from, p.to, p.kind, p.m);
    else if (byId[p.from] || byId[p.to]) (viaLandmark[byId[p.from] ? p.to : p.from] ??= []).push({ place: byId[p.from] ? p.from : p.to, kind: p.kind, m: Number(p.m) || 0 });
  }
  for (const list of Object.values(viaLandmark)) for (let i = 1; i < list.length; i += 1) add(list[0].place, list[i].place, list[i].kind, list[0].m + list[i].m);
  for (const p of map.places) for (const n of p.neighbors ?? []) add(p.id, n, null);
  // Each distance sits on its curve where it is clearest of the cards and of the distances before it.
  const taken = [];
  const clash = (q) => places.some((c) => Math.abs(q.x - c.x) < CARD_W / 2 + 30 && Math.abs(q.y - c.y) < c.h / 2 + 8)
    || taken.some((t) => Math.abs(q.x - t.x) < 80 && Math.abs(q.y - t.y) < 18);
  for (const p of paths) {
    const at = (t) => ({ x: (1 - t) ** 2 * p.x1 + 2 * (1 - t) * t * p.cx + t ** 2 * p.x2, y: (1 - t) ** 2 * p.y1 + 2 * (1 - t) * t * p.cy + t ** 2 * p.y2 });
    const spot = [0.5, 0.44, 0.56, 0.38, 0.62, 0.32, 0.68, 0.26, 0.74, 0.2, 0.8].map(at).find((q) => !clash(q));
    if (spot) {
      p.lx = spot.x;
      p.ly = spot.y;
      taken.push(spot);
    } else p.label = '';
  }
  return { width: PAD * 2 + cols * cellW, height: PAD * 2 + rows * CELL_H, places, paths, here, terrain: geo?.terrain ?? null, hasMinor: people.some((c) => c.minor) };
}

// How long it takes to walk from one place to another along the paths, as words ("4 min walk"); null if no way.
export function tripFrom(view, from, to) {
  const map = view?.map;
  const geo = map?.geography;
  if (!map?.places?.length || !from || !to || from === to) return null;
  const points = Object.fromEntries([...map.places, ...(geo?.landmarks ?? [])].map((p) => [p.id, p]));
  const across = Number(geo?.across_m) || 300;
  const edges = {};
  const link = (a, b, m) => {
    if (!points[a] || !points[b]) return;
    (edges[a] ??= []).push([b, m]);
    (edges[b] ??= []).push([a, m]);
  };
  for (const p of geo?.paths ?? []) link(p.from, p.to, Number(p.m) || pathMetres(points[p.from] ?? {}, points[p.to] ?? {}, across));
  if (!geo?.paths?.length) for (const p of map.places) for (const n of p.neighbors ?? []) if (points[n]) link(p.id, n, pathMetres(p, points[n], across));
  const dist = { [from]: 0 };
  const open = new Set([from]);
  while (open.size) {
    const cur = [...open].reduce((a, b) => (dist[a] <= dist[b] ? a : b));
    open.delete(cur);
    if (cur === to) break;
    for (const [next, m] of edges[cur] ?? []) {
      const d = dist[cur] + m;
      if (dist[next] === undefined || d < dist[next]) {
        dist[next] = d;
        open.add(next);
      }
    }
  }
  return dist[to] === undefined ? null : tripTime(dist[to], Boolean(geo?.about));
}
