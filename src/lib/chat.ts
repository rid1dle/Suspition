import type { GameEvent, ThreadEntry } from './views';

// The phone's one screen is the chat: what the room heard and what only you see, in story order.
export interface ChatItem {
  key: string;
  at: number;
  side: 'room' | 'me';
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

export function chatItems(view: { events?: GameEvent[]; thread?: ThreadEntry[]; pending?: { kind: string; text: string } | null; publicPending?: string | null }): ChatItem[] {
  const room = (view.events ?? []).map(roomItem).filter((x): x is ChatItem => Boolean(x));
  const mine: ChatItem[] = (view.thread ?? []).map((m, i) => ({ key: `t${i}`, at: m.at, side: 'me', kind: m.from, text: m.text, entry: m }));
  // Same time: the room line first, then mine; a stable sort keeps each list in its own order.
  const items = [...room, ...mine].map((x, i) => ({ x, i })).sort((a, b) => a.x.at - b.x.at || a.i - b.i).map(({ x }) => x);
  if (view.pending) items.push({ key: 'pending', at: Infinity, side: 'me', kind: 'you', text: view.pending.text }, { key: 'thinking', at: Infinity, side: 'me', kind: 'thinking', text: 'Thinking…' });
  if (view.publicPending) items.push({ key: 'public-pending', at: Infinity, side: 'room', kind: 'asking', text: String(view.publicPending) });
  return items;
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
