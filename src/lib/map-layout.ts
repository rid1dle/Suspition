// @ts-nocheck -- plain data in, plain data out; shared by the server (the GM draws to these spots) and the screens
// The world's map is a picture 1200 x 800. Each place has a fixed spot on it, spread from where the GM put it so no
// two labels collide; the GM's drawing and the markers on top both use these spots, so they always line up.
import { tripTime, tripShort, pathMetres } from './geography.ts';
import { shortName } from './map.ts';
import { esc } from './text.ts';

export const MAP_W = 1200;
export const MAP_H = 800;
const EDGE = 110;
// Two place labels need about this much room between their centres.
const APART_X = 230;
const APART_Y = 120;

const scaleX = (x) => EDGE + (Math.min(100, Math.max(0, Number(x) || 0)) / 100) * (MAP_W - EDGE * 2);
const scaleY = (y) => EDGE * 0.8 + (Math.min(100, Math.max(0, Number(y) || 0)) / 100) * (MAP_H - EDGE * 1.6);

// places and landmarks with x, y from 0 to 100 -> { id: { x, y } } on the 1200 x 800 picture.
export function mapSpots(places, landmarks = []) {
  const pts = places.map((p) => ({ id: p.id, x: scaleX(p.x), y: scaleY(p.y) }));
  for (let pass = 0; pass < 200; pass += 1) {
    let moved = false;
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        const a = pts[i];
        const b = pts[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx / APART_X, dy / APART_Y);
        if (d >= 1) continue;
        // Push the two apart along the line between them (straight down when they sit exactly on top of each other).
        const ux = d ? dx / APART_X / d : 0;
        const uy = d ? dy / APART_Y / d : 1;
        const push = (1 - d) / 2 + 0.01;
        a.x -= ux * push * APART_X;
        a.y -= uy * push * APART_Y;
        b.x += ux * push * APART_X;
        b.y += uy * push * APART_Y;
        moved = true;
      }
    }
    for (const p of pts) {
      p.x = Math.min(MAP_W - EDGE, Math.max(EDGE, p.x));
      p.y = Math.min(MAP_H - EDGE * 0.6, Math.max(EDGE * 0.6, p.y));
    }
    if (!moved) break;
  }
  const out = Object.fromEntries(pts.map((p) => [p.id, { x: Math.round(p.x), y: Math.round(p.y) }]));
  for (const l of landmarks) if (!out[l.id]) out[l.id] = { x: Math.round(scaleX(l.x)), y: Math.round(scaleY(l.y)) };
  return out;
}

// The graph of paths between places (and the landmarks they pass), with metres on each.
function edgesOf(map) {
  const geo = map?.geography;
  const points = Object.fromEntries([...(map?.places ?? []), ...(geo?.landmarks ?? [])].map((p) => [p.id, p]));
  const across = Number(geo?.across_m) || 300;
  const edges = [];
  const seen = new Set();
  const link = (a, b, kind, m) => {
    const key = [a, b].sort().join('|');
    if (a === b || !points[a] || !points[b] || seen.has(key)) return;
    seen.add(key);
    edges.push({ from: a, to: b, kind: kind ?? 'trail', m: Number(m) || pathMetres(points[a], points[b], across) });
  };
  for (const p of geo?.paths ?? []) link(p.from, p.to, p.kind, p.m);
  for (const p of map?.places ?? []) for (const n of p.neighbors ?? []) link(p.id, n, null);
  return edges;
}

// The shortest way between two places along the paths: { metres, steps: [ids] }, or null.
export function routeFrom(view, from, to) {
  const map = view?.map;
  if (!map?.places?.length || !from || !to || from === to) return null;
  const next = {};
  for (const e of edgesOf(map)) {
    (next[e.from] ??= []).push([e.to, e.m]);
    (next[e.to] ??= []).push([e.from, e.m]);
  }
  const dist = { [from]: 0 };
  const prev = {};
  const open = new Set([from]);
  while (open.size) {
    const cur = [...open].reduce((a, b) => (dist[a] <= dist[b] ? a : b));
    open.delete(cur);
    if (cur === to) break;
    for (const [n, m] of next[cur] ?? []) {
      const d = dist[cur] + m;
      if (dist[n] === undefined || d < dist[n]) {
        dist[n] = d;
        prev[n] = cur;
        open.add(n);
      }
    }
  }
  if (dist[to] === undefined) return null;
  const steps = [to];
  while (steps[0] !== from) steps.unshift(prev[steps[0]]);
  return { metres: dist[to], steps };
}

// How long it takes to walk from one place to another along the paths, as words ("4 min walk"); null if no way.
export function tripFrom(view, from, to) {
  const r = routeFrom(view, from, to);
  return r ? tripTime(r.metres, Boolean(view?.map?.geography?.about)) : null;
}

// Everything the map draws on top of its picture: places with their people, paths with their distances.
// me: the player's own id on a phone (only their own paths get distances there). before: positions last time, for glows.
export function mapPlan(view, { me = null, before = null } = {}) {
  const map = view?.map;
  if (!map?.places?.length) return null;
  const geo = map.geography;
  const spots = map.art?.spots ?? mapSpots(map.places, geo?.landmarks ?? []);
  const people = [
    ...(view.cast?.players ?? []).map((c) => ({ ...c, kind: 'player' })),
    ...(view.cast?.npcs ?? []).map((c) => ({ ...c, kind: 'npc' })),
  ];
  const here = me ? map.places.find((p) => p.name === view.here)?.id ?? map.positions?.[me] ?? null : null;
  const places = map.places.filter((p) => spots[p.id]).map((p) => {
    const inside = people.filter((c) => map.positions?.[c.id] === p.id)
      .map((c) => ({ id: c.id, name: c.name, label: c.id === me ? 'You' : shortName(c.name), kind: c.kind, minor: Boolean(c.minor), me: c.id === me, moved: Boolean(before && before[c.id] && before[c.id] !== p.id) }))
      .sort((a, b) => Number(b.me) - Number(a.me) || (a.kind === b.kind ? 0 : a.kind === 'player' ? -1 : 1));
    // How tall the label draws: a long name wraps, people take a row.
    const name = `${p.icon ? '   ' : ''}${p.name}`;
    const w = Math.min(192, Math.max(120, name.length * 8.5 + 24));
    const h = 34 + (name.length * 8.5 + 24 > 192 ? 18 : 0) + (p.room ? 16 : 0) + (inside.length ? 24 : 0);
    return { id: p.id, name: p.name, icon: p.icon ?? '', room: p.room ?? '', x: spots[p.id].x, y: spots[p.id].y, w, h, here: p.id === here, people: inside };
  });
  const placeIds = new Set(places.map((p) => p.id));
  // A path through a landmark is drawn through it; its two halves add up to one distance between the places.
  const edges = edgesOf(map).filter((e) => spots[e.from] && spots[e.to]);
  const paths = [];
  const used = new Set();
  for (const e of edges) {
    if (placeIds.has(e.from) && placeIds.has(e.to)) {
      paths.push({ from: e.from, to: e.to, kind: e.kind, m: e.m, points: [spots[e.from], spots[e.to]] });
      continue;
    }
    const mid = placeIds.has(e.from) ? e.to : e.from;
    if (used.has(mid)) continue;
    const legs = edges.filter((x) => (x.from === mid || x.to === mid) && placeIds.has(x.from === mid ? x.to : x.from));
    for (let i = 1; i < legs.length; i += 1) {
      const a = legs[0].from === mid ? legs[0].to : legs[0].from;
      const b = legs[i].from === mid ? legs[i].to : legs[i].from;
      paths.push({ from: a, to: b, kind: legs[i].kind, m: legs[0].m + legs[i].m, points: [spots[a], spots[mid], spots[b]] });
    }
    used.add(mid);
  }
  // Each distance sits on its path where it is clearest of the place labels and the distances before it.
  const taken = [];
  const clash = (q, half) => places.some((c) => Math.abs(q.x - c.x) < c.w / 2 + half + 4 && Math.abs(q.y - c.y) < c.h / 2 + 12)
    || taken.some((t) => Math.abs(q.x - t.x) < t.half + half + 6 && Math.abs(q.y - t.y) < 20);
  for (const p of paths) {
    p.near = here ? p.from === here || p.to === here : null;
    p.label = tripShort(p.m, Boolean(geo?.about));
    const half = p.label.length * 3.4 + 8;
    const long = (u, v) => Math.hypot(u.x - v.x, u.y - v.y);
    const [a, b] = p.points.length === 3 && long(p.points[1], p.points[2]) > long(p.points[0], p.points[1]) ? [p.points[1], p.points[2]] : [p.points[0], p.points[1]];
    // Along the line first; then just above or below it, where a short path between two close places has room.
    const along = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.2, 0.8].map((t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }));
    const beside = [0.5, 0.4, 0.6].flatMap((t) => [-26, 26, -48, 48, -70, 70].map((dy) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + dy })));
    const spot = [...along, ...beside].find((q) => !clash(q, half));
    if (spot) {
      p.lx = Math.round(spot.x);
      p.ly = Math.round(spot.y);
      taken.push({ ...spot, half });
    } else p.label = '';
  }
  return { width: MAP_W, height: MAP_H, places, paths, here, art: map.art?.svg ?? null, terrain: geo?.terrain ?? null, hasMinor: people.some((c) => c.minor) };
}

const GROUND = { forest: '#2f4a33', river: '#2f4a3a', hills: '#4a4a32', coast: '#4d4634', snow: '#56606a', desert: '#5e4a2c', city: '#34363c', village: '#423c2e', building: '#3a332e' };

// When the GM has drawn no map (an old world, or the drawing failed): a plain one from the same spots.
export function plainMapSvg(plan) {
  if (!plan) return '';
  const ground = GROUND[plan.terrain] ?? '#3a3631';
  const roads = plan.paths.map((p) => `<polyline points="${p.points.map((q) => `${q.x},${q.y}`).join(' ')}" fill="none" stroke="#d8cbb0" stroke-opacity="0.22" stroke-width="${p.kind === 'road' || p.kind === 'corridor' ? 18 : 10}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const lots = plan.places.map((p) => `<rect x="${p.x - 95}" y="${p.y - 45}" width="190" height="90" rx="14" fill="#000" fill-opacity="0.18" stroke="#d8cbb0" stroke-opacity="0.18"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_W} ${MAP_H}"><rect width="${MAP_W}" height="${MAP_H}" fill="${ground}"/>${roads}${lots}</svg>`;
}

// The label of a place on the map: its name, where it is in your room, and who is there.
export function placeLabelHtml(p, { selected = false } = {}) {
  const chips = p.people.map((c) => `<span class="who ${c.kind}${c.minor ? ' minor' : ''}${c.me ? ' me' : ''}${c.moved ? ' moved' : ''}" title="${esc(c.name)}">${esc(c.label)}</span>`).join('');
  return `<div class="map-place${p.here ? ' here' : ''}${selected ? ' selected' : ''}" data-place="${esc(p.id)}"><div class="map-place-name">${p.icon ? `<span class="map-place-glyph">${esc(p.icon)}</span> ` : ''}<span class="map-place-text">${esc(p.name)}</span></div>${p.room ? `<div class="map-place-room">&#128205; ${esc(p.room)}</div>` : ''}${chips ? `<div class="whos">${chips}</div>` : ''}</div>`;
}
