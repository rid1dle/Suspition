import { intensityFor } from './music-theory';

// The look and the music share one tension signal. Steps of 0.05 so a ticking clock never rewrites the style.
export function tensionLevel(view: unknown, now = Date.now()) {
  return Math.round(intensityFor(view, now) * 20) / 20;
}

const BEATS = new Set(['ripple', 'event', 'phase', 'round']);

// A story turn: something new the whole room notices, or the reveal.
export function beatBetween(prev: { gameId?: string; status?: string; events?: { kind: string }[] } | null, next: { gameId?: string; status?: string; events?: { kind: string }[] } | null) {
  if (!prev || !next || prev.gameId !== next.gameId) return false;
  if (next.status === 'reveal' && prev.status !== 'reveal') return true;
  return (next.events ?? []).slice(prev.events?.length ?? 0).some((e) => BEATS.has(e.kind));
}
