// @ts-nocheck -- ported from public/map.js; typed when the screens settle
import { esc } from './text.ts';

const TITLES = /^(dr|mr|mrs|ms|miss|sir|lady|lord|capt|captain|inspector|prof|professor|father|sister|uncle|aunt|auntie|madam|master)\.?$/i;
export const shortName = (name) => {
  const words = String(name ?? '').trim().split(/\s+/);
  return words.length > 1 && TITLES.test(words[0]) ? words[1] : words[0];
};

export function mapHtml(view, { me = null, before = null, editing = false } = {}) {
  const map = view?.map;
  if (!map?.places?.length) return '';
  const people = [
    ...(view.cast?.players ?? []).map((c) => ({ ...c, kind: 'player' })),
    ...(view.cast?.npcs ?? []).map((c) => ({ ...c, kind: 'npc' })),
  ];
  const byId = Object.fromEntries(map.places.map((p) => [p.id, p]));
  const drawn = new Set();
  const lines = map.places.flatMap((p) => p.neighbors.map((n) => {
    const key = [p.id, n].sort().join('-');
    if (drawn.has(key) || !byId[n]) return '';
    drawn.add(key);
    return `<line x1="${p.x}" y1="${p.y}" x2="${byId[n].x}" y2="${byId[n].y}"/>`;
  })).join('');
  const places = map.places.map((p) => {
    const here = people.filter((c) => map.positions[c.id] === p.id);
    const chips = here.map((c) => {
      const moved = before && before[c.id] && before[c.id] !== p.id;
      const label = c.id === me ? 'You' : shortName(c.name);
      return `<span class="who ${c.kind}${c.minor ? ' minor' : ''}${c.id === me ? ' me' : ''}${moved ? ' moved' : ''}" title="${esc(c.name)}${c.minor ? ' (minor)' : ''}">${esc(label)}</span>`;
    }).join('');
    const room = editing
      ? `<input class="room-input" data-room="${esc(p.id)}" value="${esc(p.room)}" placeholder="Spot in our room" maxlength="40">`
      : p.room ? `<div class="room">&#128205; ${esc(p.room)}</div>` : '';
    return `<div class="place${editing ? ' editing' : ''}" data-place="${esc(p.id)}" style="left:${p.x}%;top:${p.y}%"><div class="place-name">${p.icon ? `${esc(p.icon)} ` : ''}${esc(p.name)}</div>${room}<div class="whos">${chips}</div></div>`;
  }).join('');
  return `<div class="map${editing ? ' editing' : ''}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${places}</div>
    <div class="map-key small muted"><span class="who player">Player</span> <span class="who npc">Played by the GM</span>${(view.cast?.npcs ?? []).some((n) => n.minor) ? ' <span class="who npc minor">Minor</span>' : ''}</div>`;
}
