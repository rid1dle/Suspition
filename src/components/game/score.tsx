'use client';

import { motion } from 'motion/react';
import { SKILL_LABELS, PENALTY_SKILLS } from '@/lib/skill-labels';
import { playLine, totalLine } from '@/lib/score';
import type { Play } from '@/lib/views';
import { Muted } from './label';

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function PlayLine({ play }: { play: Play | null | undefined }) {
  if (!play) return null;
  return <div className={`mt-2 text-xs ${play.points > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{playLine(play)}</div>;
}

// The little "+1 Searching" chip that floats up from a reply.
export function PlayChip({ play }: { play: Play }) {
  if (!play.points) return null;
  const label = (SKILL_LABELS as Record<string, string>)[play.skill ?? ''] ?? '';
  return (
    <motion.span initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: [0, 1, 1, 0], y: [8, 0, -6, -22] }} transition={{ duration: 2.4, times: [0, 0.15, 0.75, 1] }}
      className={`pointer-events-none inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${play.points > 0 ? 'bg-primary text-primary-foreground' : 'bg-destructive text-white'}`}>
      {signed(play.points)} {label}
    </motion.span>
  );
}

export function SkillBars({ skills }: { skills: { skill: string; label?: string; points: number; moves?: number }[] }) {
  if (!skills?.length) return <Muted>No skills yet. They show up after your first game.</Muted>;
  const list = [...skills].sort((a, b) => (Number(PENALTY_SKILLS.includes(a.skill)) - Number(PENALTY_SKILLS.includes(b.skill))) || b.points - a.points);
  const top = Math.max(1, ...list.map((s) => Math.abs(s.points)));
  return (
    <div className="flex flex-col gap-2">
      {list.map((s, i) => {
        const minus = PENALTY_SKILLS.includes(s.skill);
        return (
          <div key={s.skill} className={`grid grid-cols-[minmax(7rem,1fr)_2fr_auto] items-center gap-3 text-sm ${minus ? 'text-muted-foreground' : ''}`}>
            <span>{s.label ?? (SKILL_LABELS as Record<string, string>)[s.skill] ?? s.skill}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.i className={`block h-full ${minus ? 'bg-destructive' : 'bg-primary'}`} initial={{ width: 0 }} animate={{ width: `${Math.round((Math.abs(s.points) / top) * 100)}%` }} transition={{ delay: i * 0.08, duration: 0.6 }} />
            </span>
            <span className="min-w-8 text-right tabular-nums">{signed(s.points)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TotalLine({ result }: { result: Record<string, unknown> }) {
  return <b>{totalLine(result)}</b>;
}
