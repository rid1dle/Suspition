// @ts-nocheck -- ported from public/panels.js (logic only; the HTML builders become React components)
import { SKILL_LABELS } from './skill-labels.ts';
import { PLAY_MAX } from './rules.ts';

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

export function whoisLines(cast) {
  if (!cast) return [];
  return [
    ...cast.players.map((c) => `${c.player} plays ${c.name}, ${c.role}. ${c.info}`),
    ...cast.npcs.filter((n) => !n.minor).map((n) => `${n.name}, ${n.role}, is played by the GM. ${n.info}`),
  ];
}

export function pointsOf(s) {
  return (s?.culprit_correct ? 1 : 0) + (s?.method_score ?? 0) + (s?.motive_score ?? 0) + (s?.goal_achieved ? 1 : 0);
}

export function playLine(play) {
  if (!play) return '';
  return [signed(play.points ?? 0), play.skill && SKILL_LABELS[play.skill], play.why].filter(Boolean).join(' · ');
}

export const totalLine = (s) => `Case ${pointsOf(s)}/6 · Play ${signed(s?.play ?? 0)}${s?.play_earned != null && s.play_earned > (s?.play ?? 0) ? ` (${s.play_earned} earned, at most ${PLAY_MAX} a round)` : ''}`;
