'use client';

import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Label, Muted } from '@/components/game/label';
import { useEffect } from 'react';
import { BriefStep, BriefPager } from '@/components/game/briefing';
import { Timeline, Alibis, News } from '@/components/game/panels';
import { Header } from './setup';
import type { TableProps } from './table-app';

export function Reading(props: TableProps) {
  const { view, host, act, readNow } = props;
  const b = view.briefing;
  const step = b?.steps?.[b.step];
  const go = (i: number) => { if (b && i !== b.step) act('brief', { delta: i - b.step }); };
  useEffect(() => {
    if (!host || !b) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable]')) return;
      if (e.key === 'ArrowRight') go(b.step + 1);
      if (e.key === 'ArrowLeft') go(b.step - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 pt-8">
      <Header {...props} title={view.title} sub={view.setting} />
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,1.7fr)_minmax(280px,1fr)]">
        <div className="flex flex-col gap-4">
          <section className="rounded-2xl bg-card p-8 text-lg">
              {host && b ? <BriefPager view={view as never} at={b.step} onGo={(i) => go(Math.max(0, Math.min(b.steps.length - 1, i)))} /> : <BriefStep view={view as never} />}
          </section>
          {host && b && <Button variant="ghost" className="self-start" onClick={() => step && readNow([`${step.title}.`, ...step.lines])}>Read this card out loud again</Button>}
        </div>
        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-2xl bg-card p-5">
            <Label>Read your card on your phone. Then tap "Done".</Label>
            <div className="flex flex-wrap gap-2">
              {view.players.map((p) => {
                const ready = view.ready.includes(p.id);
                return <motion.span key={p.id} layout className={`rounded-full px-3 py-1 text-sm ${ready ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{ready ? '✓ ' : ''}{p.name}</motion.span>;
              })}
            </div>
            {host && <Button onClick={() => act('start')}>Start round 1</Button>}
          </section>
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-5"><Label>Timeline so far</Label><Timeline timeline={view.timeline} /><Muted className="text-xs">More times show up as the rounds go on.</Muted></section>
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-5"><Label>Alibis: where people say they were</Label><Alibis alibis={view.alibis} /></section>
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-5"><Label>Questions about the world</Label>
            {view.events.some((e) => e.kind === 'qa') ? <News events={view.events.filter((e) => e.kind === 'qa')} /> : <Muted>Ask on your phone. Everyone sees the answer.</Muted>}
          </section>
        </aside>
      </div>
    </main>
  );
}
