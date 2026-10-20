// @ts-nocheck -- ported from public/feed.js; typed when the screens settle
import { esc } from './text.ts';
import { askLine } from './chat.ts';

// These kinds already show elsewhere: the round heading, the goal card, the vote card, the calling banner.
const SHOWN_ELSEWHERE = new Set(['opening', 'phase', 'goal', 'vote', 'moment', 'recap', 'seat']);
const ICONS = { said: '&#128483;', forced: '&#128483;', clue: '&#128270;', timeline: '&#9201;', hint: '&#10022;', qa: '?', note: '&#128172;' };

export function feedItem(e) {
  if (SHOWN_ELSEWHERE.has(e.kind)) return null;
  if (e.kind === 'clue') {
    const m = /^(.*?) shows a clue\. (.*?):/.exec(e.text);
    const by = e.by ?? m?.[1];
    const name = e.name ?? m?.[2];
    const did = e.lost === 'destroyed' ? 'told the room about a lost clue' : e.lost === 'damaged' ? 'showed what is left of a clue' : 'showed a clue';
    return { kind: 'clue', text: by && name ? `${by} ${did}: ${name}` : e.text, tab: 'clues' };
  }
  if (e.kind === 'timeline') return { kind: 'timeline', text: e.text, tab: 'timeline' };
  if (e.kind === 'qa') return { kind: 'qa', text: e.text, ask: askLine(e.by, e.q), lines: e.lines };
  // Only a quiz round has a right answer; the room picking someone to look at is never marked right or wrong.
  if (e.kind === 'round') return { kind: /That is right!/.test(e.text) ? 'right' : /Not quite\./.test(e.text) ? 'wrong' : 'round', text: e.text };
  return { kind: e.kind, text: e.text };
}

export function roundGroups(events) {
  const groups = new Map();
  for (const e of events ?? []) {
    const key = e.phase ?? -1;
    if (!groups.has(key)) groups.set(key, { phase: key, title: key < 0 ? 'Before round 1' : `Round ${key + 1}`, items: [] });
    const g = groups.get(key);
    if (e.kind === 'phase' && /^Round \d+/.test(e.text)) g.title = e.text.replace(/^Round (\d+)(?: of \d+)?(, the last)?: /, 'Round $1$2 · ');
    const item = feedItem(e);
    if (item) g.items.push(item);
  }
  return [...groups.values()].filter((g) => g.items.length).reverse().map((g) => ({ ...g, items: g.items.reverse() }));
}

const TAB_NAMES = { clues: 'Clues', timeline: 'Timeline' };

function itemHtml(it, fresh) {
  const icon = ICONS[it.kind] ? `<span class="ic">${ICONS[it.kind]}</span>` : '';
  const ask = it.ask ? `<div class="small muted">${esc(it.ask)}</div>` : '';
  const go = it.tab ? ` <span class="go" data-go="${it.tab}">${TAB_NAMES[it.tab]} &rsaquo;</span>` : '';
  return `<li class="k-${esc(it.kind)}${fresh ? ' fresh' : ''}">${icon}<div>${ask}${esc(it.text)}${go}</div></li>`;
}

export function feedHtml(events, { fresh = 0, open = new Set() } = {}) {
  const groups = roundGroups(events);
  if (!groups.length) return '<p class="small muted">Nothing has happened yet.</p>';
  let left = fresh;
  return groups.map((g, gi) => {
    const items = g.items.map((it) => itemHtml(it, left-- > 0)).join('');
    if (gi === 0) return `<div class="round-group current"><div class="label">${gi === 0 && g.phase >= 0 ? 'This round' : esc(g.title)}</div><ul class="feed">${items}</ul></div>`;
    const n = g.items.length;
    return `<details class="round-group" data-round="${g.phase}"${open.has(g.phase) ? ' open' : ''}><summary>${esc(g.title)} <span class="muted small">${n} update${n === 1 ? '' : 's'}</span></summary><ul class="feed">${items}</ul></details>`;
  }).join('');
}

export function visibleCount(events) {
  return (events ?? []).filter((e) => feedItem(e)).length;
}
