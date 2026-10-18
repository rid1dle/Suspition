'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckIcon, ChevronRightIcon } from 'lucide-react';
import type { Progress } from '@/lib/views';
import { cn } from '@/lib/utils';

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function Spinner() {
  return <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />;
}

function Shimmer({ children }: { children: React.ReactNode }) {
  return (
    <span className="shimmer bg-clip-text text-transparent"
      style={{ backgroundImage: 'linear-gradient(90deg, var(--muted-foreground) 0%, var(--foreground) 50%, var(--muted-foreground) 100%)', backgroundSize: '200% 100%', WebkitBackgroundClip: 'text' }}>
      {children}
    </span>
  );
}

// The GM's own steps, shown the way Claude shows its work: a live line while thinking,
// then each step with a spinner or a tick, finished ones folding away.
export function PlanSteps({ progress, now = Date.now(), compact = false }: { progress: Progress; now?: number; compact?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const elapsed = clock(now - (progress.startedAt ?? now));
  if (progress.thinking || !progress.plan) {
    return (
      <div className="flex items-center gap-3 text-lg">
        <Spinner />
        <Shimmer>Thinking</Shimmer>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">{elapsed}</span>
      </div>
    );
  }
  const done = progress.plan.filter((s) => s.state === 'done');
  const rest = progress.plan.filter((s) => s.state !== 'done');
  const shown = compact && !showAll ? rest : progress.plan;
  return (
    <div className="flex flex-col gap-2">
      {compact && done.length > 0 && !showAll && (
        <button onClick={() => setShowAll(true)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <CheckIcon className="size-4 text-primary" /> {done.length} step{done.length === 1 ? '' : 's'} done <ChevronRightIcon className="size-3.5" />
        </button>
      )}
      <ol className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {shown.map((s) => (
            <motion.li key={s.title} layout data-state={s.state} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={cn('flex items-start gap-3', compact ? 'text-base' : 'text-lg', s.state === 'todo' && 'text-muted-foreground/70')}>
              <span className="mt-1.5 flex size-4 shrink-0 items-center justify-center">
                {s.state === 'done' ? <CheckIcon className="size-4 text-primary" /> : s.state === 'active' ? <Spinner /> : <span className="size-1.5 rounded-full bg-muted-foreground/50" />}
              </span>
              <span className="flex flex-col">
                {s.state === 'active' ? <Shimmer>{s.title}</Shimmer> : <span className={s.state === 'done' ? 'text-muted-foreground' : ''}>{s.title}</span>}
                {s.count && <span className="text-sm text-muted-foreground">{s.count}</span>}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {progress.redraft && <p className="text-sm text-muted-foreground">Fixing something, about a minute more.</p>}
      <p className="text-sm text-muted-foreground tabular-nums">{elapsed}</p>
    </div>
  );
}
