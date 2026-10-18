// @ts-nocheck -- ported from public/alerts.js; typed when the screens settle
import { feedItem } from './feed.ts';

// Sounds the table plays for new public news. Only the most important one plays per update.
const TABLE_SOUND = { right: 'good', wrong: 'bad', said: 'said', forced: 'said', clue: 'clue', timeline: 'clue', hint: 'hint', qa: 'news', event: 'news', override: 'soft', note: 'soft' };
const PRIORITY = ['phase', 'call', 'vote', 'good', 'bad', 'said', 'hint', 'clue', 'news', 'soft'];

export function tableSound(prev, next) {
  if (!prev || !next || prev.gameId !== next.gameId) return null;
  const fresh = (next.events ?? []).slice(prev.events?.length ?? 0);
  const sounds = new Set();
  for (const e of fresh) {
    if (e.kind === 'phase') sounds.add('phase');
    else if (e.kind === 'moment') sounds.add('call');
    else if (e.kind === 'vote') sounds.add('vote');
    else {
      const it = feedItem(e);
      if (it && TABLE_SOUND[it.kind]) sounds.add(TABLE_SOUND[it.kind]);
    }
  }
  return PRIORITY.find((s) => sounds.has(s)) ?? null;
}

const others = (thread) => (thread ?? []).filter((m) => m.from !== 'you');

// What is new for this player alone. Each alert has a sound, a short line and the tab it belongs to.
export function phoneAlerts(prev, next) {
  if (!prev || !next || prev.gameId !== next.gameId || prev.me?.id !== next.me?.id) return [];
  const out = [];
  const replies = others(next.thread).slice(others(prev.thread).length);
  if (replies.some((m) => m.from === 'whisper')) out.push({ sound: 'secret', text: 'A secret note for you.', tab: 'ask' });
  else if (replies.some((m) => m.from === 'gm')) out.push({ sound: 'private', text: 'The GM answered you.', tab: 'ask' });
  const newClues = (next.clues ?? []).filter((c) => !(prev.clues ?? []).some((p) => p.id === c.id));
  if (newClues.length) out.push({ sound: 'clue', text: `You found a clue: ${newClues.map((c) => c.name).join(', ')}.`, tab: 'clues' });
  if (next.card && prev.card) {
    if ((next.card.hidden_known?.length ?? 0) > (prev.card.hidden_known?.length ?? 0)) out.push({ sound: 'secret', text: 'You found out something about yourself.', tab: 'card' });
    if ((next.card.locked?.length ?? 0) < (prev.card.locked?.length ?? 0)) out.push({ sound: 'secret', text: 'A new part of your card opened.', tab: 'card' });
    if (next.card.goal !== prev.card.goal) out.push({ sound: 'secret', text: 'Your goal changed.', tab: 'card' });
    else if (next.card.starting_knowledge !== prev.card.starting_knowledge) out.push({ sound: 'secret', text: 'Your card has new things you remember.', tab: 'card' });
  }
  const momentIds = new Set((prev.moments ?? []).map((m) => m.id));
  if ((next.moments ?? []).some((m) => !momentIds.has(m.id))) out.push({ sound: 'call', text: 'Get ready. The story turns to you soon.', tab: null });
  const role = next.seat?.mine?.role;
  if (role !== prev.seat?.mine?.role || next.seat?.name !== prev.seat?.name) {
    if (role === 'seated') out.push({ sound: 'call', text: "You're in the hot seat. Read your whisper.", tab: 'story' });
    else if (role === 'asker') out.push({ sound: 'call', text: `You have a question for ${next.seat.name}.`, tab: 'story' });
  }
  if (next.round?.vote && !prev.round?.vote) out.push({ sound: 'vote', text: 'Vote now on the round question.', tab: 'story' });
  if (next.hintVote && !prev.hintVote && next.hintVote.proposer !== next.me?.name) out.push({ sound: 'vote', text: `${next.hintVote.proposer} wants a hint. Vote yes or no.`, tab: null });
  return out;
}
