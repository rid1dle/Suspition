'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label, Muted } from '@/components/game/label';
import { RoundCard } from '@/components/game/round';
import { Feed } from '@/components/game/feed';
import { PeopleList } from '@/components/game/people';
import { CaseBox, Timeline, Alibis, SharedClues, Recap, ScenePicture } from '@/components/game/panels';
import { whoisLines } from '@/lib/score';
import { visibleCount } from '@/lib/feed';
import { countdown, suspicionLabel } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { ConfirmButton } from './setup';
import { TableMap } from './table-map';
import { SeatBanner, PointBanner, type SeatView } from '@/components/game/hot-seat';
import type { TableProps } from './table-app';

type Side = 'map' | 'timeline' | 'alibis' | 'clues' | 'people';
const SIDES: [Side, string][] = [['map', 'Map'], ['timeline', 'Timeline'], ['alibis', 'Alibis'], ['clues', 'Clues'], ['people', 'People']];

function useNow(ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

// A glowing meter: how close the group is to the culprit.
function Suspicion({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 text-sm" title="How close the group is to the culprit">
      <span className="text-muted-foreground">Suspicion</span>
      <span className="relative h-2 w-28 overflow-hidden rounded-full bg-muted">
        <motion.i className="absolute inset-y-0 left-0 block rounded-full bg-gradient-to-r from-primary to-destructive" animate={{ width: `${Math.max(4, value)}%` }} transition={{ type: 'spring', stiffness: 60 }}
          style={{ boxShadow: value >= 50 ? '0 0 12px var(--destructive)' : 'none' }} />
      </span>
      <span className={value >= 75 ? 'text-destructive' : ''}>{suspicionLabel(value)}</span>
    </div>
  );
}

// A full-screen title when a new round starts, then it settles into the page.
// The round's loud moment: its name, its job and the event everyone hears.
export function RoundTitleCard({ title, objective, event }: { title: string; objective?: string; event?: string }) {
  return (
    <motion.div initial={{ scale: 0.85, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 90 }} className="flex flex-col items-center gap-4 px-8 text-center">
      <Label>A new round</Label>
      <div className="font-display text-6xl leading-tight">{title}</div>
      {event && <p className="max-w-3xl text-3xl leading-snug">{event}</p>}
      {objective && <div className="max-w-3xl font-heading text-2xl text-muted-foreground">{objective}</div>}
    </motion.div>
  );
}

function RoundTitle({ view }: { view: TableProps['view'] }) {
  const [show, setShow] = useState<string | null>(null);
  const last = useRef<number | null>(null);
  useEffect(() => {
    const n = view.phase?.number ?? null;
    if (last.current !== null && n !== null && n !== last.current) {
      setShow(`Round ${n} of ${view.phase!.count}: ${view.phase!.name}`);
      const t = setTimeout(() => setShow(null), 6000);
      last.current = n;
      return () => clearTimeout(t);
    }
    last.current = n;
  }, [view.phase]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur">
          <RoundTitleCard title={show} objective={view.round?.objective} event={view.events.filter((e) => e.kind === 'event' && e.phase === view.phase?.index).at(-1)?.text} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function WhoIs({ view }: { view: TableProps['view'] }) {
  const now = useNow(1000);
  const lines = whoisLines(view.cast) as string[];
  if (!lines.length) return null;
  const line = lines[Math.floor(now / 20_000) % lines.length];
  return (
    <AnimatePresence mode="wait">
      <motion.p key={line} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-sm">
        <span className="mr-2 text-xs tracking-widest text-muted-foreground uppercase">Who's who</span>{line}
      </motion.p>
    </AnimatePresence>
  );
}

export function Playing(props: TableProps) {
  const { view, host, act } = props;
  const now = useNow();
  const [side, setSide] = useState<Side>('map');
  const [note, setNote] = useState('');
  const seenNews = useRef(visibleCount(view.events));
  const [fresh, setFresh] = useState(0);
  const seen = useRef<Record<string, number>>({});
  useEffect(() => {
    const n = visibleCount(view.events);
    setFresh(n - seenNews.current);
    seenNews.current = n;
  }, [view.events]);
  const counts: Record<string, number> = { timeline: view.timeline?.length ?? 0, clues: view.sharedClues?.length ?? 0, people: (view.people ?? []).reduce((n: number, p: { facts: unknown[] }) => n + p.facts.length, 0) };
  for (const [t, n] of Object.entries(counts)) if (side === t || seen.current[t] === undefined) seen.current[t] = n;
  const timer = view.phase?.endsAt ? countdown(view.phase.endsAt, now) : null;
  const vote = view.round?.vote;
  const last = (view.phase?.number ?? 0) >= (view.phase?.count ?? 0);
  const nextLabel = vote ? 'Close the vote' : view.round && !view.round.done && view.round.question ? 'Start the vote' : last ? 'Go to the final vote' : 'Next round';
  const hv = view.hintVote as { proposer: string; yes: number; no: number; need: number } | null;
  const va = view.voteAsk as { proposer: string; yes: number; need: number } | null;
  const seat = view.seat as SeatView | null;
  const sendNote = async () => { if (note.trim() && await act('note', { text: note })) setNote(''); };

  return (
    <div className="flex flex-col">
      <RoundTitle view={view} />
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border bg-background/85 px-6 py-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{view.title}</div>
          <div className="truncate font-heading text-xl">{view.phase ? `Round ${view.phase.number} of ${view.phase.count} · ${view.phase.name}` : ''}</div>
        </div>
        <div className="flex items-center gap-1 text-sm" title="Group hints left. Ask for one on your phone.">
          <span className="text-muted-foreground">Hints</span>
          {Array.from({ length: view.hintsTotal }, (_, i) => <span key={i} className={`size-2 rounded-full ${i < view.hintsLeft ? 'bg-primary' : 'bg-muted'}`} />)}
        </div>
        <Suspicion value={view.suspicion} />
        {timer && <div className={cn('font-mono text-4xl tabular-nums', timer.low && 'animate-pulse text-destructive')}>{timer.text}</div>}
        {host && (
          <div className="flex gap-2">
            {seat && !seat.status && seat.waiting > 0 && !vote && <Button variant="secondary" onClick={() => act('seatnow')}>Hot seat now</Button>}
            <Button variant="ghost" onClick={() => act('extend')}>+5 min</Button>
            <ConfirmButton label={nextLabel} variant="default" onConfirm={() => act('next')} />
            <ConfirmButton label="End game" confirm="Tap again to end it" className="text-destructive" onConfirm={async () => { const r = await act('new'); if (r?.host) props.onNewGame(String(r.host)); }} />
          </div>
        )}
      </header>
      {!host && <p className="mx-6 mt-3 rounded-lg bg-muted p-3 text-sm">View only. To run the game, open the table link from the terminal.</p>}
      {(view.error || view.transitioning || view.scoring) && (
        <p className={cn('mx-6 mt-3 rounded-lg p-3', view.error ? 'bg-destructive/15 text-destructive' : 'bg-primary/10')}>
          {view.error ?? (view.transitioning ? 'Things are changing…' : 'The GM is checking your answers…')}
        </p>
      )}
      <div className="grid gap-6 px-6 pt-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <AnimatePresence>
            {view.calling?.length > 0 && (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} className="rounded-2xl bg-primary p-5 text-xl text-primary-foreground shadow-xl">
                <b>{view.calling.join(' and ')}</b>, the story turns to you. Everyone, listen.
              </motion.div>
            )}
          </AnimatePresence>
          {seat?.status ? <SeatBanner seat={seat} now={now} /> : <PointBanner point={view.point as never} now={now} />}
          {va && <div className="rounded-xl bg-card p-4"><b>{va.proposer}</b> wants to vote now. {va.yes} of {va.need} ready. Everyone has to say yes on their phone.</div>}
          {hv && <div className="rounded-xl bg-card p-4"><b>{hv.proposer}</b> wants a hint. Vote on your phone: {hv.yes} yes, {hv.no} no. Needs {hv.need}.</div>}
          <section className={cn('flex flex-col gap-5 rounded-2xl bg-card p-6 transition', vote && 'ring-2 ring-primary')}>
            <CaseBox question={view.caseQuestion} />
            {view.round ? <RoundCard round={view.round} countdown={vote ? countdown(vote.endsAt, now).text : ''} />
              : <div><Label>This round</Label><div className="font-heading text-xl">Talk, look around and share clues.</div></div>}
            {vote && (
              <div className="flex flex-col gap-1">
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <motion.i className="block h-full bg-primary" animate={{ width: `${(vote.voted / Math.max(1, vote.of)) * 100}%` }} transition={{ type: 'spring', stiffness: 80 }} />
                </div>
                <Muted className="text-xs">Vote on your phones.</Muted>
              </div>
            )}
          </section>
          <Recap recap={view.recap} />
          <WhoIs view={view} />
          {host && (
            <div className="flex gap-2">
              <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendNote()}
                placeholder='Tell the GM what the room thinks. "We think Ramesh lied about the gate."' />
              <Button variant="ghost" onClick={sendNote}>Tell the GM</Button>
            </div>
          )}
          <Feed events={view.events} fresh={fresh} onGo={(t) => setSide(t === 'clues' ? 'clues' : 'timeline')} />
        </div>
        <Tabs value={side} onValueChange={(t) => setSide(t as Side)} className="min-w-0 gap-4">
          <TabsList variant="line" className="h-auto group-data-horizontal/tabs:h-auto w-full justify-start gap-1 rounded-none border-b border-border p-0">
            {SIDES.map(([t, l]) => {
              const n = counts[t] ?? 0;
              const isNew = n > (seen.current[t] ?? 0);
              return (
                <TabsTrigger key={t} value={t} className="relative h-auto flex-none px-3 py-2 text-sm text-muted-foreground after:hidden data-active:text-foreground">
                  {l}{n ? <span className={cn('ml-1', isNew && 'text-primary')}>{n}</span> : null}
                  {side === t && <motion.span layoutId="side-line" className="absolute inset-x-2 -bottom-px h-0.5 bg-primary" />}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {side === 'map' && <TableMap view={view} host={host} act={act} />}
          {side === 'timeline' && <Timeline timeline={view.timeline} />}
          {side === 'alibis' && <><Muted className="text-xs">Where each person says they were</Muted><Alibis alibis={view.alibis} /></>}
          {side === 'clues' && <SharedClues clues={view.sharedClues} />}
          {side === 'people' && <><ScenePicture svg={view.illustration} /><PeopleList people={view.people} openAll /></>}
        </Tabs>
      </div>
    </div>
  );
}
