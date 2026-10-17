'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label, Muted } from '@/components/game/label';
import { PlanSteps } from '@/components/game/plan';
import { cn } from '@/lib/utils';
import type { TableProps } from './table-app';

// A button that needs a second tap within 3 seconds, for things that cannot be undone.
export function ConfirmButton({ label, confirm = 'Tap again', onConfirm, className, variant = 'ghost' }: { label: string; confirm?: string; onConfirm: () => void; className?: string; variant?: 'ghost' | 'default' | 'destructive' | 'secondary' }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <Button variant={variant} className={className} onClick={() => {
      if (armed) { setArmed(false); onConfirm(); return; }
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 3000);
    }}>{armed ? confirm : label}</Button>
  );
}

export function Header({ title, sub, host, view, act, onNewGame, children }: Pick<TableProps, 'host' | 'view' | 'act' | 'onNewGame'> & { title: string; sub?: string; children?: ReactNode }) {
  const fresh = ['lobby', 'reveal'].includes(view.status);
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <motion.h1 initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="font-display text-5xl leading-tight">{title}</motion.h1>
        {sub && <Muted className="mt-1 text-base">{sub}</Muted>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {children}
        {host && (
          <ConfirmButton label={fresh ? 'New game' : 'End game'} confirm={fresh ? 'Tap again' : 'Tap again to end it'} variant={fresh ? 'secondary' : 'ghost'}
            className={fresh ? '' : 'text-destructive'}
            onConfirm={async () => { const res = await act('new'); if (res?.host) onNewGame(String(res.host)); }} />
        )}
      </div>
    </header>
  );
}

const SETTINGS = ['A 1950s Bombay hotel party', 'A snowed-in ski lodge', 'A 1920s ocean liner', 'A space station', 'A college reunion', 'A village fair', 'A monsoon wedding in Goa'];
const TONES: [string, string][] = [['cozy', 'Cozy'], ['tense', 'Tense'], ['dark', 'Dark'], ['funny', 'Funny']];
const LENGTHS: [string, string, string][] = [['short', 'Short', '3 rounds, ~30 min'], ['standard', 'Normal', '4 rounds, ~1 hour'], ['long', 'Long', '5 rounds, ~1.5 hours']];

function Chips<T extends string | number>({ options, value, onPick }: { options: [T, ReactNode][]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, l]) => (
        <motion.button key={String(v)} whileTap={{ scale: 0.95 }} onClick={() => onPick(v)}
          className={cn('rounded-full border px-3.5 py-1.5 text-sm transition', value === v ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted/40 hover:border-primary')}>{l}</motion.button>
      ))}
    </div>
  );
}

function Field({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
      {note && <Muted className="text-xs">{note}</Muted>}
    </div>
  );
}

function Players({ view }: { view: TableProps['view'] }) {
  if (!view.players.length) return <Muted>Nobody yet</Muted>;
  return (
    <div className="flex flex-wrap gap-2">
      {view.players.map((p, i) => (
        <motion.span key={p.id} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', delay: i * 0.04 }}
          className="rounded-full bg-muted px-3 py-1">{p.name}</motion.span>
      ))}
    </div>
  );
}

function JoinCard({ view }: { view: TableProps['view'] }) {
  const [joinUrl, setJoinUrl] = useState('');
  useEffect(() => { fetch('/api/info').then((r) => r.json()).then((d) => setJoinUrl(d.joinUrl)).catch(() => {}); }, []);
  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-card p-6">
      <h2 className="font-heading text-2xl">Join on your phone</h2>
      {joinUrl && <div className="self-start rounded-xl bg-white p-3"><QRCodeSVG value={joinUrl} size={200} /></div>}
      <Muted>Same Wi-Fi. Then open:<br /><b className="text-foreground">{joinUrl}</b></Muted>
      <Label>Players here</Label>
      <Players view={view} />
    </section>
  );
}

export function Setup(props: TableProps) {
  const { view, host, act } = props;
  const [form, setForm] = useState({ setting: '', tone: 'tense', length: 'standard', hints: 3, overrides: 3, npcs: 3, npcRole: 'mixed', replays: 2, questions: 3, testGame: false, notes: '' });
  const [picked, setPicked] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const enough = view.players.length >= 3;
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 pt-8">
      <Header {...props} title="Suspition" sub="A mystery game for this room" />
      {!host && <p className="rounded-lg bg-muted p-3 text-sm">View only. To run the game, open the table link from the terminal.</p>}
      <div className="grid gap-6 lg:grid-cols-[minmax(280px,1fr)_minmax(320px,1.4fr)]">
        <JoinCard view={view} />
        {host && (
          <section className="flex flex-col gap-5 rounded-2xl bg-card p-6">
            <h2 className="font-heading text-2xl">Set up the game</h2>
            <Field label="Where is it?">
              <Input value={form.setting} maxLength={200} placeholder="Leave empty for a surprise" onChange={(e) => set('setting', e.target.value)} />
              <div className="flex flex-wrap gap-2">{SETTINGS.map((s) => <button key={s} onClick={() => set('setting', s)} className="rounded-full bg-muted/50 px-3 py-1 text-xs hover:text-primary">{s}</button>)}</div>
            </Field>
            <Field label="Mood"><Chips options={TONES} value={form.tone} onPick={(v) => set('tone', v)} /></Field>
            <Field label="How long?"><Chips options={LENGTHS.map(([v, l, d]) => [v, <span key={v}>{l} <span className="opacity-70">{d}</span></span>] as [string, ReactNode])} value={form.length}
              onPick={(v) => { set('length', v); if (!picked) set('questions', v === 'long' ? 4 : 3); }} /></Field>
            <Field label="Private questions per round" note="Questions asked out loud are always free.">
              <Chips options={[1, 2, 3, 4, 5, 6].map((n) => [n, n] as [number, ReactNode])} value={form.questions} onPick={(v) => { setPicked(true); set('questions', v); }} />
            </Field>
            <Field label="Got a round wrong? Play it again" note="A round you vote wrong is played again, with a clearer job.">
              <Chips options={[[0, 'Never'], [1, 'Once'], [2, 'Up to twice']]} value={form.replays} onPick={(v) => set('replays', v)} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Group hints"><Chips options={[1, 2, 3, 4, 5].map((n) => [n, n] as [number, ReactNode])} value={form.hints} onPick={(v) => set('hints', v)} /></Field>
              <Field label="Overrides per player" note="Lets a player stay quiet or say a moment their way.">
                <Chips options={[0, 1, 2, 3, 4, 5].map((n) => [n, n] as [number, ReactNode])} value={form.overrides} onPick={(v) => set('overrides', v)} />
              </Field>
            </div>
            <Field label="People the GM plays" note="Fewer is easier to follow. Background only means the story is all about the players.">
              <Chips options={[0, 1, 2, 3, 4, 5, 6].map((n) => [n, n] as [number, ReactNode])} value={form.npcs} onPick={(v) => set('npcs', v)} />
              <Chips options={[['mixed', 'Some matter to the case'], ['background', 'Background only']]} value={form.npcRole} onPick={(v) => set('npcRole', v)} />
            </Field>
            <Field label="Test game" note="A test game is saved but never teaches the game about anyone.">
              <Chips options={[['no', 'No, a real game'], ['yes', 'Yes, just testing']]} value={form.testGame ? 'yes' : 'no'} onPick={(v) => set('testGame', v === 'yes')} />
            </Field>
            <Field label="Anything the GM should know?">
              <textarea value={form.notes} maxLength={500} placeholder="Jokes, things you like, things to avoid" onChange={(e) => set('notes', e.target.value)} className="min-h-20 rounded-xl border border-input bg-transparent p-3" />
            </Field>
            <Button size="lg" className="h-12 text-lg" disabled={!enough} onClick={() => act('setup', form)}>Make our mystery</Button>
            <Muted className="text-xs">{enough ? `${view.players.length} players. Each one gets a character.` : `Need 3 players or more (${view.players.length} now).`}</Muted>
          </section>
        )}
      </div>
    </main>
  );
}

export function Generating(props: TableProps) {
  const { view } = props;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 pt-8">
      <Header {...props} title="Making your mystery" />
      <section className="flex flex-col gap-5 rounded-2xl bg-card p-8">
        <Muted>The GM is writing it now. It takes a few minutes. Nothing secret shows here.</Muted>
        {view.progress && <PlanSteps progress={view.progress} now={now} />}
      </section>
      <section className="flex flex-col gap-2"><Label>Players here</Label><Players view={view} /></section>
    </main>
  );
}

export function Failed(props: TableProps) {
  const { view, host, act } = props;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 pt-8">
      <Header {...props} title="Something went wrong" />
      <p className="rounded-xl bg-destructive/15 p-4 text-destructive">{view.error}</p>
      {host && <Button className="self-start" onClick={() => act('setup', view.setup ?? {})}>Try again</Button>}
    </main>
  );
}
