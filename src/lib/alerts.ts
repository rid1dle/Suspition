// @ts-nocheck -- ported from public/alerts.js; typed when the screens settle
import { feedItem } from './feed.ts';

// Sounds the table plays for new public news. Only the most important one plays per update.
const TABLE_SOUND = { right: 'good', wrong: 'bad', said: 'said', forced: 'said', clue: 'clue', timeline: 'clue', hint: 'hint', qa: 'news', event: 'news', ripple: 'soft', refused: 'soft', override: 'soft', note: 'soft' };
const PRIORITY = ['phase', 'call', 'vote', 'good', 'bad', 'said', 'hint', 'clue', 'news', 'soft'];

export function tableSound(prev, next) {
  if (!prev || !next || prev.gameId !== next.gameId) return null;
  const fresh = (next.events ?? []).slice(prev.events?.length ?? 0);
  const sounds = new Set();
  for (const e of fresh) {
    if (e.kind === 'phase') sounds.add('phase');
    else if (e.kind === 'moment' || e.kind === 'meeting') sounds.add('call');
    else if (e.kind === 'move') sounds.add('soft');
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
    const stepsDone = (next.card.goal_steps ?? []).filter((s, i) => s.done && !prev.card.goal_steps?.[i]?.done);
    for (const s of stepsDone) out.push({ sound: 'secret', text: `Goal step done: ${s.text}`, tab: 'card' });
    if (next.card.goal !== prev.card.goal) out.push({ sound: 'secret', text: 'Your goal changed.', tab: 'card' });
    else if (next.card.starting_knowledge !== prev.card.starting_knowledge) out.push({ sound: 'secret', text: 'Your card has new things you remember.', tab: 'card' });
  }
  const momentIds = new Set((prev.moments ?? []).map((m) => m.id));
  if ((next.moments ?? []).some((m) => !momentIds.has(m.id))) out.push({ sound: 'call', text: 'Get ready. The story turns to you soon.', tab: null });
  else if ((next.moments ?? []).some((m) => m.status === 'called' && (prev.moments ?? []).find((p) => p.id === m.id)?.status !== 'called')) out.push({ sound: 'call', text: 'Your moment. Everyone is listening. Say your line now.', tab: null });
  const role = next.seat?.mine?.role;
  if (role !== prev.seat?.mine?.role || next.seat?.name !== prev.seat?.name) {
    if (role === 'seated') out.push({ sound: 'call', text: "You're in the hot seat. Read your whisper.", tab: 'story' });
    else if (role === 'asker') out.push({ sound: 'call', text: `You have a question for ${next.seat.name}.`, tab: 'story' });
  }
  // Things that need this player now ring like a call, with a buzz.
  if (next.meeting && !prev.meeting) out.push({ sound: 'call', text: `Meeting! ${next.meeting.by} calls everyone together.`, tab: null });
  if (next.moveConfirm && !prev.moveConfirm) out.push({ sound: 'call', text: `Go to the ${String(next.moveConfirm.place).replace(/^the\s+/i, '')}? Answer Go or Not now.`, tab: null });
  if ((next.offers ?? []).some((o) => !(prev.offers ?? []).some((p) => p.id === o.id))) out.push({ sound: 'call', text: 'The story needs an answer from you.', tab: null });
  if (next.phase?.number && prev.phase?.number && next.phase.number !== prev.phase.number) out.push({ sound: 'phase', text: `Round ${next.phase.number}: ${next.phase.name}.`, tab: null });
  if (next.voteAsk && !prev.voteAsk && next.voteAsk.proposer !== next.me?.name) out.push({ sound: 'vote', text: `${next.voteAsk.proposer} wants to vote now. Yes or Not yet?`, tab: null });
  if (next.round?.vote && !prev.round?.vote) out.push({ sound: 'vote', text: 'Vote now on the round question.', tab: 'story' });
  if (next.hintVote && !prev.hintVote && next.hintVote.proposer !== next.me?.name) out.push({ sound: 'vote', text: `${next.hintVote.proposer} wants a hint. Vote yes or no.`, tab: null });
  return out;
}
