// @ts-nocheck -- ported from public/map.js; typed when the screens settle
import { esc } from './text.ts';
import { planGeography, tripLabel, metresText } from './geography.ts';

const TITLES = /^(dr|mr|mrs|ms|miss|sir|lady|lord|capt|captain|inspector|prof|professor|father|sister|uncle|aunt|auntie|madam|master)\.?$/i;
export const shortName = (name) => {
  const words = String(name ?? '').trim().split(/\s+/);
  return words.length > 1 && TITLES.test(words[0]) ? words[1] : words[0];
};

// A small fixed-seed random stream, so the same game always draws the same map.
function seeded(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const n1 = (v) => Math.round(v * 10) / 10;

// Line drawings on a 24 by 24 box, in the current text colour.
const GLYPHS = {
  tree: '<path d="M12 22v-5M12 2C8 2 5 5 5 9c-2 1-2 6 2 7h10c4-1 4-6 2-7 0-4-3-7-7-7z"/>',
  trees: '<path d="M8 22v-4M17 22v-4M8 5C5 5 3 8 3 11s2 7 5 7 5-3 5-7-2-6-5-6zM17 4c-3 0-5 3-5 6s2 8 5 8 5-4 5-8-2-6-5-6z"/>',
  pine: '<path d="M12 3 6 13h3l-4 7h14l-4-7h3z"/>',
  water: '<path d="M3 9q3-3 6 0t6 0 6 0M3 15q3-3 6 0t6 0 6 0"/>',
  bridge: '<path d="M2 16h20M4 16q8-10 16 0M8 16v-4M16 16v-4"/>',
  well: '<path d="M5 9h14M7 9v10h10V9M6 9l6-5 6 5M12 9v4"/>',
  statue: '<circle cx="12" cy="5" r="2"/><path d="M12 7v7M9 10h6M10 21v-4h4v4M7 21h10"/>',
  tower: '<path d="M8 21V7h8v14M7 7V4h2v2h2V4h2v2h2V4h2v3M11 21v-4h2v4"/>',
  gate: '<path d="M5 21V6M19 21V6M5 9q7-6 14 0M9 21v-9M15 21v-9"/>',
  rock: '<path d="M3 18l3-7 5-3 5 2 4 8z"/>',
  hill: '<path d="M2 19q10-16 20 0"/>',
  dune: '<path d="M2 17q5-6 10-1t10-2"/>',
  road: '<path d="M8 3 5 21M16 3l3 18M12 5v3M12 11v3M12 17v3"/>',
  shop: '<path d="M4 10h16l-1-5H5zM5 10v10h14V10M10 20v-6h4v6"/>',
  house: '<path d="M4 11 12 4l8 7M6 9v11h12V9M10 20v-5h4v5"/>',
  ruin: '<path d="M4 20V9l3 2V7l3 2v11M14 20v-6l3-2 3 3v5M3 20h18"/>',
  stairs: '<path d="M3 20h4v-4h4v-4h4V8h4V4"/>',
  door: '<path d="M7 21V4h10v17M5 21h14"/><circle cx="14" cy="13" r="1"/>',
  window: '<path d="M5 5h14v14H5zM12 5v14M5 12h14"/>',
  wave: '<path d="M2 12q3-4 6 0t6 0 6 0"/>',
};
const glyph = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPHS[name] ?? GLYPHS.rock}</svg>`;

// The quiet texture each terrain scatters, and how thickly.
const SCATTER = {
  forest: { glyphs: ['tree', 'trees', 'tree'], share: 0.7 },
  hills: { glyphs: ['hill', 'tree'], share: 0.35 },
  coast: { glyphs: ['rock', 'tree'], share: 0.2 },
  river: { glyphs: ['tree', 'trees'], share: 0.35 },
  snow: { glyphs: ['pine', 'pine', 'rock'], share: 0.35 },
  desert: { glyphs: ['dune', 'dune', 'rock'], share: 0.4 },
  village: { glyphs: ['house', 'tree', 'trees'], share: 0.3 },
  city: { glyphs: [], share: 0 },
  building: { glyphs: [], share: 0 },
};

const far = (pts, x, y, rx, ry) => pts.every((p) => ((p.x - x) / rx) ** 2 + ((p.y - y) / ry) ** 2 > 1);

// A wavy line across the map from left to right at height y.
const wavy = (rand, y, amp) => {
  const pts = Array.from({ length: 6 }, (_, i) => [i * 22 - 5, y + (rand() * 2 - 1) * amp]);
  return pts.reduce((d, [x, py], i) => (i ? `${d} S${n1(x - 11)} ${n1(py)} ${n1(x)} ${n1(py)}` : `M${x} ${n1(py)}`), '');
};

// Big shapes under everything: water, streets, walls, contour lines. Kept away from the places.
function terrainShapes(terrain, rand, places) {
  if (terrain === 'river') {
    const ys = [18, 30, 42, 58, 70, 82];
    const y = ys.map((v) => ({ v, gap: Math.min(...places.map((p) => Math.abs(p.y - v))) })).sort((a, b) => b.gap - a.gap || a.v - b.v)[Math.floor(rand() * 2)].v;
    return `<path class="water river" d="${wavy(rand, y, 5)}"/>`;
  }
  if (terrain === 'coast') {
    const xs = places.map((p) => p.x);
    const ys = places.map((p) => p.y);
    const sides = [['bottom', 100 - Math.max(...ys)], ['top', Math.min(...ys)], ['left', Math.min(...xs)], ['right', 100 - Math.max(...xs)]].sort((a, b) => b[1] - a[1]);
    const [side, room] = sides[0];
    const depth = Math.max(5, Math.min(24, room - 9));
    const edge = side === 'bottom' || side === 'right' ? 100 - depth : depth;
    const line = Array.from({ length: 6 }, (_, i) => [i * 20, n1(edge + (rand() * 2 - 1) * 2.5)]);
    const wave = line.map(([a, b]) => (side === 'bottom' || side === 'top' ? `${a} ${b}` : `${b} ${a}`)).join(' L');
    const close = { bottom: 'L100 100 L0 100Z', top: 'L100 0 L0 0Z', left: 'L0 100 L0 0Z', right: 'L100 100 L100 0Z' }[side];
    return `<path class="water sea" d="M${wave} ${close}"/>`;
  }
  if (terrain === 'city') {
    const off = 4 + rand() * 8;
    const lines = [];
    for (let v = off; v < 100; v += 16) lines.push(`M${n1(v)} 0V100`, `M0 ${n1(v)}H100`);
    return `<path class="streets" d="${lines.join('')}"/>`;
  }
  if (terrain === 'village') return `<path class="lane" d="${wavy(rand, 20 + rand() * 60, 8)}"/>`;
  if (terrain === 'building') {
    const off = 20 + rand() * 10;
    const walls = [];
    for (let v = off; v < 96; v += 30) walls.push(`M${n1(v)} 3V97`, `M3 ${n1(v)}H97`);
    return `<rect class="wall" x="2" y="2" width="96" height="96"/><path class="room-line" d="${walls.join('')}"/>`;
  }
  if (terrain === 'hills') {
    const out = [];
    const tops = [];
    for (let i = 0; i < 12 && out.length < 3; i += 1) {
      const x = 10 + rand() * 80;
      const y = 10 + rand() * 80;
      if (!far(places, x, y, 18, 16) || !far(tops, x, y, 26, 18)) continue;
      tops.push({ x, y });
      out.push([1, 0.66, 0.33].map((k) => `<ellipse class="contour" cx="${n1(x)}" cy="${n1(y)}" rx="${n1(12 * k)}" ry="${n1(8 * k)}"/>`).join(''));
    }
    return out.join('');
  }
  return '';
}

// Small marks scattered on a jittered grid, never on a place, a landmark or a path label.
function scatter(terrain, rand, avoid) {
  const s = SCATTER[terrain];
  if (!s?.glyphs.length) return '';
  const out = [];
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const x = col * 12.5 + 2 + rand() * 8.5;
      const y = row * 16.6 + 2 + rand() * 12;
      const pick = s.glyphs[Math.floor(rand() * s.glyphs.length)];
      if (rand() > s.share || !far(avoid, x, y, 11, 10)) continue;
      out.push(`<i class="mark" style="left:${n1(x)}%;top:${n1(y)}%">${glyph(pick)}</i>`);
    }
  }
  return out.join('');
}

// The scale bar: the biggest round length that fits in a quarter of the map.
function scaleBar(across, about) {
  const nice = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000].filter((v) => v <= across / 4).at(-1) ?? 5;
  return `<div class="scale"><i style="width:${n1((nice / across) * 100)}%"></i><span>${about ? 'about ' : ''}${metresText(nice)}</span></div>`;
}

export function mapHtml(view, { me = null, before = null, editing = false } = {}) {
  const map = view?.map;
  if (!map?.places?.length) return '';
  const geo = map.geography ?? planGeography(map.places);
  const seed = String(view.gameId ?? '');
  const rand = seeded(`${seed}|map`);
  const people = [
    ...(view.cast?.players ?? []).map((c) => ({ ...c, kind: 'player' })),
    ...(view.cast?.npcs ?? []).map((c) => ({ ...c, kind: 'npc' })),
  ];
  const here = me ? map.places.find((p) => p.name === view.here)?.id ?? map.positions?.[me] ?? null : null;
  const points = Object.fromEntries([...map.places, ...geo.landmarks].map((p) => [p.id, p]));

  const drawn = geo.paths.filter((p) => points[p.from] && points[p.to]).map((p) => {
    const a = points[p.from];
    const b = points[p.to];
    const bend = (seeded(`${seed}|${[p.from, p.to].sort().join('-')}`)() * 2 - 1) * 0.18;
    const cx = (a.x + b.x) / 2 - (b.y - a.y) * bend;
    const cy = (a.y + b.y) / 2 + (b.x - a.x) * bend;
    const near = here ? p.from === here || p.to === here : null;
    return { ...p, a, b, cx, cy, near };
  });
  const shown = drawn.filter((p) => p.near !== false);
  // Each time label sits on its curve where it is clearest of the place chips and the labels before it.
  const taken = [...map.places];
  for (const p of shown) {
    const at = (t) => ({ x: (1 - t) ** 2 * p.a.x + 2 * (1 - t) * t * p.cx + t ** 2 * p.b.x, y: (1 - t) ** 2 * p.a.y + 2 * (1 - t) * t * p.cy + t ** 2 * p.b.y });
    const room = (q) => Math.min(...taken.map((o) => ((o.x - q.x) / 20) ** 2 + ((o.y - q.y) / 11) ** 2));
    const best = [0.5, 0.4, 0.6, 0.3, 0.7].map(at).reduce((x, y) => (room(y) > room(x) + 0.05 ? y : x));
    p.mx = best.x;
    p.my = best.y;
    taken.push(best);
  }
  const terrain = geo.terrain ?? 'plain';

  const svg = [
    '<rect class="ground" width="100" height="100"/>',
    terrainShapes(geo.terrain, rand, map.places),
    ...drawn.map((p) => `<path class="path ${p.kind}${p.near === null ? '' : p.near ? ' near' : ' far'}" data-path="${esc([p.from, p.to].join('-'))}" d="M${n1(p.a.x)} ${n1(p.a.y)} Q${n1(p.cx)} ${n1(p.cy)} ${n1(p.b.x)} ${n1(p.b.y)}"/>`),
  ].join('');
  const marks = scatter(geo.terrain, rand, [...map.places, ...geo.landmarks, ...shown.map((p) => ({ x: p.mx, y: p.my }))]);
  const landmarks = geo.landmarks.map((l) => `<span class="landmark" style="left:${Math.min(90, Math.max(10, l.x))}%;top:${Math.min(94, Math.max(6, l.y))}%" title="${esc(l.name)}">${glyph(l.kind)}<span>${esc(l.name)}</span></span>`).join('');
  const trips = shown.map((p) => `<span class="trip${p.near ? ' near' : ''}" style="left:${n1(p.mx)}%;top:${n1(p.my)}%">${esc(tripLabel(p.m, geo.about))}</span>`).join('');

  const places = map.places.map((p) => {
    const inHere = people.filter((c) => map.positions[c.id] === p.id);
    const chips = inHere.map((c) => {
      const moved = before && before[c.id] && before[c.id] !== p.id;
      const label = c.id === me ? 'You' : shortName(c.name);
      return `<span class="who ${c.kind}${c.minor ? ' minor' : ''}${c.id === me ? ' me' : ''}${moved ? ' moved' : ''}" title="${esc(c.name)}${c.minor ? ' (minor)' : ''}">${esc(label)}</span>`;
    }).join('');
    const room = editing
      ? `<input class="room-input" data-room="${esc(p.id)}" value="${esc(p.room)}" placeholder="Spot in our room" maxlength="40">`
      : p.room ? `<div class="room">&#128205; ${esc(p.room)}</div>` : '';
    return `<div class="place${editing ? ' editing' : ''}${p.id === here ? ' here' : ''}" data-place="${esc(p.id)}" style="left:${p.x}%;top:${p.y}%"><div class="place-name">${p.icon ? `${esc(p.icon)} ` : ''}${esc(p.name)}</div>${room}<div class="whos">${chips}</div></div>`;
  }).join('');

  const title = view.title ? `<div class="map-title">${esc(view.title)}</div>` : '';
  const compass = '<div class="compass" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3l4 10h-8z"/></svg><span>N</span></div>';
  // On the phone the trips from your place are also listed in words, so a label hidden by a chip is never lost.
  const plainName = (id) => String(points[id]?.name ?? '').replace(/^the\s+/i, '');
  const placeIds = new Set(map.places.map((p) => p.id));
  const fromHere = shown.filter((p) => p.near && placeIds.has(p.from === here ? p.to : p.from));
  const list = fromHere.length
    ? `<div class="map-trips"><b>From the ${esc(plainName(here))}:</b> ${fromHere.map((p) => `<span>${esc(plainName(p.from === here ? p.to : p.from))}, ${esc(tripLabel(p.m, geo.about))}</span>`).join(' ')}</div>`
    : '';
  return `<div class="map${editing ? ' editing' : ''}" data-terrain="${terrain}"><svg class="land" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${svg}</svg><div class="marks" aria-hidden="true">${marks}</div>${landmarks}${title}${compass}${scaleBar(geo.across_m, geo.about)}${trips}${places}</div>
    ${list}<div class="map-key small muted"><span class="who player">Player</span> <span class="who npc">Played by the GM</span>${(view.cast?.npcs ?? []).some((n) => n.minor) ? ' <span class="who npc minor">Minor</span>' : ''}</div>`;
}
