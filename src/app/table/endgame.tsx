'use client';

import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Label, Muted } from '@/components/game/label';
import { Timeline, Results, SharedClues } from '@/components/game/panels';
import { totalLine } from '@/lib/score';
import { Header } from './setup';
import type { TableProps } from './table-app';

const SIDES: Record<string, string> = { investigator: 'Detective', culprit: 'Culprit', wildcard: 'Wildcard' };

export function FinalWait(props: TableProps) {
  const { view, host, act } = props;
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pt-8">
      <Header {...props} title="Who did it?" sub={view.title} />
      {view.scoring && <p className="rounded-lg bg-primary/10 p-3">The GM is checking your answers…</p>}
      {view.error && <p className="rounded-lg bg-destructive/15 p-3 text-destructive">{view.error}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-2xl bg-card p-6">
          <p className="font-heading text-2xl">Everyone picks on their phone. Culprits too.</p>
          <div className="flex flex-col gap-1 text-lg">
            {view.players.map((p) => <div key={p.id}>{view.submitted.includes(p.id) ? '✓' : '…'} {p.name}</div>)}
          </div>
          {host && <><Button className="self-start" onClick={() => act('finish')}>Show the answer</Button><Muted className="text-xs">It shows by itself when everyone has picked.</Muted></>}
        </section>
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-5"><Label>Timeline</Label><Timeline timeline={view.timeline} /></section>
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-5"><Label>Rounds</Label>{view.roundResults?.length ? <Results results={view.roundResults} /> : <Muted>No round votes.</Muted>}</section>
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-5"><Label>Shared clues</Label><SharedClues clues={view.sharedClues} /></section>
        </div>
      </div>
    </main>
  );
}

// The answer, staged: the verdict lands, the story types out, then every card turns over one by one.
export function Reveal(props: TableProps) {
  const { view, readNow } = props;
  const r = view.reveal!;
  const root = useRef<HTMLDivElement>(null);
  const nameOf = (id: string) => [...(view.cast?.players ?? []), ...(view.cast?.npcs ?? [])].find((c) => c.id === id)?.name ?? id;
  const win = r.verdict.winner === 'investigators';
  useEffect(() => {
    let alive = true;
    (async () => {
      const { gsap } = await import('gsap');
      if (!alive || !root.current) return;
      const q = gsap.utils.selector(root.current);
      const tl = gsap.timeline();
      tl.from(q('[data-verdict]'), { scale: 0.6, opacity: 0, duration: 0.8, ease: 'back.out(1.6)' })
        .from(q('[data-story] p'), { opacity: 0, y: 12, duration: 0.6 }, '+=0.3')
        .from(q('[data-card]'), { rotateY: 90, opacity: 0, duration: 0.7, stagger: 0.35, ease: 'power2.out' }, '+=0.4');
      if (win) tl.call(() => { confetti({ particleCount: 180, spread: 90, origin: { y: 0.35 }, disableForReducedMotion: true }); }, [], 0.6);
    })();
    return () => { alive = false; };
  }, [win]);
  return (
    <main ref={root} className="mx-auto flex max-w-7xl flex-col gap-6 px-6 pt-8">
      <Header {...props} title="The answer" sub={view.title} />
      <div data-verdict className={`rounded-2xl p-6 text-2xl ${win ? 'bg-primary text-primary-foreground' : 'bg-destructive text-white'}`}>
        <b>{win ? 'The detectives win.' : 'The culprits got away.'}</b> {r.verdict.correct_player_ids.length} of {view.players.length} picked <b>{r.truth.culprit_ids.map(nameOf).join(' and ')}</b>.
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,1.4fr)_minmax(280px,1fr)]">
        <section data-story className="flex flex-col gap-3 rounded-2xl bg-card p-6">
          <div className="flex items-center justify-between"><Label>What really happened</Label><Button size="sm" variant="ghost" onClick={() => readNow([r.reveal_story])}>Read it out</Button></div>
          <p className="font-heading text-xl leading-relaxed whitespace-pre-wrap">{r.reveal_story}</p>
          <Label className="mt-3">Timeline</Label>
          <Timeline timeline={r.truth.timeline} />
        </section>
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-5"><Label>Rounds</Label>{view.roundResults?.length ? <Results results={view.roundResults} /> : <Muted>No round votes.</Muted>}</section>
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-5"><Label>How people found out</Label>
            {r.learned?.length ? r.learned.map((k: { who: string; fact: string; round: number; how: string }, i: number) => <div key={i} className="text-sm"><b>{k.who}</b> learned: {k.fact} <span className="text-muted-foreground">(round {k.round}, {k.how})</span></div>) : <Muted>The GM people learned nothing new.</Muted>}
          </section>
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-5"><Label>Twists</Label>
            {r.twists.map((t: { name: string; description: string }, i: number) => <div key={i} className="text-sm"><b>{t.name}</b>: {t.description}</div>)}
            {r.false_hint && <div className="text-sm"><b>The fake hint:</b> {r.false_hint}</div>}
          </section>
        </div>
      </div>
      <h2 className="mt-4 font-heading text-3xl">Everyone's cards</h2>
      <div className="grid gap-4 [perspective:1400px] md:grid-cols-2 xl:grid-cols-3">
        {r.cards.map((c: Record<string, any>) => {
          const s = r.players.find((p: { player_id: string }) => p.player_id === c.id) ?? {};
          const best = r.bestPlay?.includes(c.id);
          return (
            <div key={c.id} data-card className={`flex flex-col gap-3 rounded-2xl bg-card p-5 ${best ? 'ring-2 ring-primary' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div><b className="font-heading text-xl">{c.name}</b> <span className="text-muted-foreground">({c.player})</span><div className="text-sm text-muted-foreground">{c.role}</div></div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${c.side === 'culprit' ? 'bg-destructive text-white' : 'bg-muted'}`}>{SIDES[c.side] ?? c.side}</span>
              </div>
              <div className="rounded-lg border-l-4 border-l-primary bg-muted/40 p-3 text-sm"><Label>Secret</Label>{c.private_info}<div className="mt-1"><b>Goal:</b> {c.goal}</div></div>
              <div className="rounded-lg border-l-4 border-l-violet-400/70 bg-muted/40 p-3 text-sm"><Label>They never knew</Label>{c.hidden_facts.map((f: string, i: number) => <div key={i}>{f}</div>)}</div>
              <div className="text-sm"><b>Picked:</b> {c.submission ? c.submission.culprit_ids.map(nameOf).join(', ') : <span className="text-muted-foreground">nobody</span>}</div>
              <div className="text-sm"><b>{totalLine(s)}</b>{best && <b className="text-primary"> · Best play</b>} · Culprit {s.culprit_correct ? '✓' : '✗'} · How {s.method_score ?? 0}/2 · Why {s.motive_score ?? 0}/2 · Goal {s.goal_achieved ? '✓' : '✗'}</div>
              <Muted className="text-xs">{s.goal_outcome} {s.comment}</Muted>
            </div>
          );
        })}
      </div>
    </main>
  );
}
