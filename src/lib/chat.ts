import type { GameEvent, ThreadEntry, DmView } from './views';

// The phone's one screen is the chat: what the room heard and what only you see, in story order.
export type Channel = 'room' | 'gm' | 'dm';
export type Layout = 'tabs' | 'three' | 'stream';

export interface ChatItem {
  key: string;
  at: number;
  side: 'room' | 'me';
  channel?: Channel;
  with?: string;
  dm?: DmView;
  kind: string;
  text: string;
  tone?: 'right' | 'wrong';
  by?: string;
  q?: string;
  lines?: { speaker: string; text: string }[];
  entry?: ThreadEntry;
}

// The round job and the round's question show in the round strip, not as chat lines.
const HIDDEN = new Set(['goal']);
const KIND: Record<string, string> = { phase: 'round-start', round: 'vote-result', said: 'said', forced: 'said' };

function roomItem(e: GameEvent, i: number): ChatItem | null {
  if (HIDDEN.has(e.kind)) return null;
  const item: ChatItem = { key: `e${i}`, at: e.at, side: 'room', kind: KIND[e.kind] ?? e.kind, text: e.text };
  if (e.kind === 'qa') Object.assign(item, { by: e.by, q: e.q, lines: e.lines });
  if (e.kind === 'round') {
    if (/That is right!/.test(e.text)) item.tone = 'right';
    else if (/Not quite\./.test(e.text)) item.tone = 'wrong';
  }
  return item;
}

export function chatItems(view: { events?: GameEvent[]; thread?: ThreadEntry[]; dms?: DmView[]; pending?: { kind: string; text: string } | null; publicPending?: string | null }): ChatItem[] {
  const room = (view.events ?? []).map(roomItem).filter((x): x is ChatItem => Boolean(x));
  const mine: ChatItem[] = (view.thread ?? []).map((m, i) => ({ key: `t${i}`, at: m.at, side: 'me', kind: m.from, text: m.text, entry: m }));
  const dms: ChatItem[] = (view.dms ?? []).map((m) => ({ key: m.id, at: m.at, side: 'me', channel: 'dm', with: m.with, kind: m.from === 'GM' ? 'dm-gm' : m.mine ? 'dm-mine' : 'dm', text: m.text, by: m.from, lines: m.lines, dm: m }));
  // Same time: the room line first, then mine; a stable sort keeps each list in its own order.
  const items = [...room, ...mine, ...dms].map((x, i) => ({ x, i })).sort((a, b) => a.x.at - b.x.at || a.i - b.i).map(({ x }) => x);
  if (view.pending) items.push({ key: 'pending', at: Infinity, side: 'me', kind: 'you', text: view.pending.text }, { key: 'thinking', at: Infinity, side: 'me', kind: 'thinking', text: 'Thinking…' });
  if (view.publicPending) items.push({ key: 'public-pending', at: Infinity, side: 'room', kind: 'asking', text: String(view.publicPending) });
  return items;
}

// Only messages between players carry their channel; everything else is the room or the GM by its side.
export const channelOf = (i: ChatItem): Channel => i.channel ?? (i.side === 'room' ? 'room' : 'gm');

// What one tab of one layout shows. tabs: Room | Private. three: Room | GM | People (one person's thread). stream: all, with a filter.
export function channelItems(items: ChatItem[], { layout, tab, person = null }: { layout: Layout; tab: string; person?: string | null }): ChatItem[] {
  if (tab === 'all') return items;
  if (tab === 'room') return items.filter((i) => channelOf(i) === 'room');
  if (layout === 'three' && tab === 'gm') return items.filter((i) => channelOf(i) === 'gm');
  if (layout === 'three' && tab === 'people') return items.filter((i) => channelOf(i) === 'dm' && (!person || i.with === person));
  return items.filter((i) => channelOf(i) !== 'room');
}

// Lines in a tab that came after the last look, not counting my own.
export const unreadIn = (items: ChatItem[], seenAt: number) => items.filter((i) => Number.isFinite(i.at) && i.at > seenAt && i.kind !== 'you' && i.kind !== 'dm-mine').length;

export interface Target { kind: 'room' | 'gm' | 'dm'; id: string | null; label: string; npc?: boolean }

// Who a line can go to. Out loud: everyone, or one person in the story. In private: the GM, or another player.
export function targetsFor(view: { me: { id: string }; cast?: { players?: { id: string; name: string }[]; npcs?: { id: string; name: string }[] } | null }, side: 'room' | 'private'): Target[] {
  const others = (view.cast?.players ?? []).filter((p) => p.id !== view.me.id);
  if (side === 'private') return [{ kind: 'gm', id: null, label: 'GM' }, ...others.map((p) => ({ kind: 'dm' as const, id: p.id, label: p.name }))];
  return [{ kind: 'room', id: null, label: 'Everyone' }, ...others.map((p) => ({ kind: 'room' as const, id: p.id, label: p.name })), ...(view.cast?.npcs ?? []).map((n) => ({ kind: 'room' as const, id: n.id, label: n.name, npc: true }))];
}

// A question to the room is asked; anything else is said to it.
export const askLine = (by: string | undefined, q: string | undefined) => `${by} ${/\?\s*$/.test(String(q ?? '')) ? 'asked the room' : 'to the room'}: ${q}`;

// A job title inside a sentence is lower case; a place after "from", "of", "at" or "in" keeps its capital.
const roleInSentence = (role: string) => role.split(/\s+/).map((w, i, all) => (i > 0 && /^(from|of|at|in)$/i.test(all[i - 1]) ? w : w.toLowerCase())).join(' ');

// A first line is the hardest: offer a few, to tap and edit.
export function introLines(card: { name: string; role?: string; intro_line?: string; hook?: string }): string[] {
  const plain = card.role ? `I'm ${card.name}, the ${roleInSentence(card.role)}.` : `I'm ${card.name}.`;
  return [...new Set([plain, String(card.intro_line ?? '').trim(), 'Did anyone else hear something tonight?'].filter(Boolean))];
}
