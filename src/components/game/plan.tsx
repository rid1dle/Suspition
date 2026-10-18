'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckIcon, ChevronRightIcon, RotateCcwIcon } from 'lucide-react';
import type { Progress, Retry } from '@/lib/views';
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

// How long the second try should take, from how long the first one did.
function waitLine(retry: Retry, now: number) {
  const left = retry.tookMs - (now - retry.at);
  if (left <= 0) return 'Taking a little longer than the first one.';
  const minutes = Math.round(left / 60_000);
  return minutes >= 2 ? `About ${minutes} more minutes.` : 'About a minute more.';
}

// A second try: the first draft folds into one done line, then one plain line says why it starts again.
function RetryLines({ retry, now, compact }: { retry: Retry; now: number; compact: boolean }) {
  const why = retry.reason === 'garbled' ? 'It came out garbled' : `It broke ${retry.broke || 'some'} rule${retry.broke === 1 ? '' : 's'}`;
  return (
    <div className={cn('flex flex-col gap-2 border-b border-border pb-3', compact ? 'text-sm' : 'text-base')}>
      <div className="flex items-center gap-3 text-muted-foreground">
        <CheckIcon className="size-4 shrink-0 text-primary" />
        <span>First draft written</span>
        <span className="ml-auto tabular-nums">{clock(retry.tookMs)}</span>
      </div>
      <div className="flex items-start gap-3">
        <RotateCcwIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>{why}, so the GM is writing it again. {waitLine(retry, now)}</span>
      </div>
    </div>
  );
}

// The GM's own steps, shown the way Claude shows its work: a live line while thinking,
// then each step with a spinner or a tick, finished ones folding away.
export function PlanSteps({ progress, now = Date.now(), compact = false }: { progress: Progress; now?: number; compact?: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const elapsed = `${clock(now - (progress.startedAt ?? now))} so far`;
  const retry = progress.retry ? <RetryLines retry={progress.retry} now={now} compact={compact} /> : null;
  if (progress.thinking || !progress.plan) {
    return (
      <div className="flex flex-col gap-3">
        {retry}
        <div className="flex items-center gap-3 text-lg">
          <Spinner />
          <Shimmer>Thinking</Shimmer>
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">{elapsed}</span>
        </div>
      </div>
    );
  }
  const done = progress.plan.filter((s) => s.state === 'done');
  const rest = progress.plan.filter((s) => s.state !== 'done');
  const shown = compact && !showAll ? rest : progress.plan;
  return (
    <div className="flex flex-col gap-2">
      {retry}
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
      <p className="text-sm text-muted-foreground tabular-nums">{elapsed}</p>
    </div>
  );
}
