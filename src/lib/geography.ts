// @ts-nocheck -- shared by the server and the map; plain data in, plain data out
// The world's geography: the GM plans it, this code cleans it and measures every path.

export const TERRAINS = ['forest', 'hills', 'coast', 'river', 'snow', 'desert', 'city', 'village', 'building'];
export const LANDMARK_KINDS = ['tree', 'trees', 'water', 'bridge', 'well', 'statue', 'tower', 'gate', 'rock', 'hill', 'road', 'shop', 'house', 'ruin', 'stairs', 'door', 'window'];
export const PATH_KINDS = ['road', 'trail', 'stairs', 'corridor', 'bridge', 'water'];

const WINDING = 1.3;
const WALK_M_PER_MIN = 80;
const DRIVE_M_PER_MIN = 500;
const DRIVE_FROM_M = 1500;
const OLD_ACROSS_M = 300;
const MAX_LANDMARKS = 12;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const nameKey = (t) => String(t ?? '').trim().toLowerCase().replace(/^the\s+/, '');

export const pathMetres = (a, b, acrossM) => Math.hypot(b.x - a.x, b.y - a.y) * (acrossM / 100) * WINDING;

function metresText(m) {
  const r = m < 100 ? Math.max(5, Math.round(m / 5) * 5) : Math.round(m / 10) * 10;
  if (r < 1000) return `${r} m`;
  const km = r < 10_000 ? Math.round(r / 100) / 10 : Math.round(r / 1000);
  return `${km} km`;
}

export const walkMinutes = (m) => m / WALK_M_PER_MIN;

// "under a minute", "4 min walk", "75 min walk, 12 min by car".
export function tripTime(m, about = false) {
  const walk = walkMinutes(m);
  const text = walk < 1 ? 'under a minute' : `${Math.round(walk)} min walk${m > DRIVE_FROM_M ? `, ${Math.max(1, Math.round(m / DRIVE_M_PER_MIN))} min by car` : ''}`;
  return about ? `about ${text}` : text;
}

// "350 m, 4 min walk".
export const tripLabel = (m, about = false) => `${about ? 'about ' : ''}${metresText(m)}, ${tripTime(m)}`;

const defaultKind = (terrain) => (terrain === 'building' ? 'corridor' : terrain === 'city' ? 'road' : 'trail');

// places: the map's places at the GM's planned positions. keep.ids / keep.names: what a landmark may never be
// (a clue's place, where a person is). Old worlds (no raw) get plain ground, 300 m across, times marked about.
export function planGeography(places, raw, keep = {}) {
  const about = !raw || typeof raw !== 'object';
  const g = about ? {} : raw;
  const terrain = TERRAINS.includes(g.terrain) ? g.terrain : null;
  const across = Number(g.across_m);
  const across_m = Number.isFinite(across) && across > 0 ? clamp(Math.round(across), 20, 20_000) : OLD_ACROSS_M;

  const taken = new Set([...places.map((p) => p.id), ...(keep.ids ?? [])].map(String));
  const names = new Set([...places.map((p) => p.name), ...(keep.names ?? [])].map(nameKey));
  const landmarks = [];
  for (const l of Array.isArray(g.landmarks) ? g.landmarks : []) {
    const id = String(l?.id ?? '').trim();
    const name = String(l?.name ?? '').trim().slice(0, 30);
    const x = Number(l?.x);
    const y = Number(l?.y);
    if (!id || !name || taken.has(id) || names.has(nameKey(name)) || !LANDMARK_KINDS.includes(l?.kind)) continue;
    if (typeof l.x !== 'number' || typeof l.y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    taken.add(id);
    landmarks.push({ id, name, kind: l.kind, x: clamp(Math.round(x), 2, 98), y: clamp(Math.round(y), 2, 98) });
    if (landmarks.length === MAX_LANDMARKS) break;
  }

  const points = Object.fromEntries([...places, ...landmarks].map((p) => [p.id, p]));
  const paths = [];
  const seen = new Set();
  const add = (from, to, kind) => {
    const key = [from, to].sort().join('\u0000');
    if (from === to || !points[from] || !points[to] || seen.has(key)) return;
    seen.add(key);
    paths.push({ from, to, kind: PATH_KINDS.includes(kind) ? kind : defaultKind(terrain), m: pathMetres(points[from], points[to], across_m) });
  };
  for (const p of Array.isArray(g.paths) ? g.paths : []) add(String(p?.from ?? ''), String(p?.to ?? ''), p?.kind);
  for (const p of places) for (const n of p.neighbors ?? []) add(p.id, n, null);
  return { terrain, across_m, about, landmarks, paths };
}
