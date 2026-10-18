'use client';

import { useAutoAnimate } from '@formkit/auto-animate/react';
import { roundGroups } from '@/lib/feed';
import type { GameEvent } from '@/lib/views';
import { Label, Muted } from './label';
import { Novel, type Line } from './novel';

const ICONS: Record<string, string> = { said: '🗣', forced: '🗣', clue: '🔎', timeline: '⏱', hint: '✦', qa: '?', note: '💬', right: '✓', wrong: '✗' };
const TAB_NAMES: Record<string, string> = { clues: 'Clues', timeline: 'Timeline' };

interface Item { kind: string; text: string; ask?: string; tab?: string; lines?: Line[] }
interface Group { phase: number; title: string; items: Item[] }

// News grouped by round: this round open, older rounds folded. Items that live elsewhere point there.
export function Feed({ events, fresh = 0, onGo }: { events: GameEvent[]; fresh?: number; onGo?: (tab: string) => void }) {
  const [list] = useAutoAnimate<HTMLUListElement>();
  const groups = roundGroups(events) as Group[];
  if (!groups.length) return <Muted>Nothing has happened yet.</Muted>;
  let left = fresh;
  const row = (it: Item, i: number) => {
    const isFresh = left-- > 0;
    return (
      <li key={`${it.kind}-${i}-${it.text.slice(0, 20)}`} data-kind={it.kind} className={`flex gap-3 rounded-lg px-2 py-1.5 ${isFresh ? 'bg-primary/10' : ''}`}>
        <span className={`w-5 shrink-0 text-center ${it.kind === 'right' ? 'text-emerald-400' : it.kind === 'wrong' ? 'text-destructive' : 'text-muted-foreground'}`}>{ICONS[it.kind] ?? '·'}</span>
        <div className="min-w-0">
          {it.ask && <Muted className="text-xs">{it.ask}</Muted>}
          {it.lines?.length ? <Novel lines={it.lines} /> : it.text}
          {it.tab && <button className="ml-1 text-sm text-primary" onClick={() => onGo?.(it.tab!)}>{TAB_NAMES[it.tab]} ›</button>}
        </div>
      </li>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g, gi) => (gi === 0 ? (
        <div key={g.phase} className="flex flex-col gap-1">
          <Label>{g.phase >= 0 ? 'This round' : g.title}</Label>
          <ul ref={list} className="flex flex-col">{g.items.map(row)}</ul>
        </div>
      ) : (
        <details key={g.phase} className="group">
          <summary className="cursor-pointer list-none text-sm text-muted-foreground">{g.title} · {g.items.length} update{g.items.length === 1 ? '' : 's'}</summary>
          <ul className="mt-1 flex flex-col">{g.items.map(row)}</ul>
        </details>
      )))}
    </div>
  );
}
