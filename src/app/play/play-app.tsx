'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorldRoom } from '@/components/world/room';
import { Label, Muted } from '@/components/game/label';
import { PlanSteps } from '@/components/game/plan';
import { QuestionCard, ProfilePanel } from '@/components/game/lobby';
import { BriefStep } from '@/components/game/briefing';
import { Timeline, Alibis } from '@/components/game/panels';
import { News } from '@/components/game/panels';
import { useLive, useDraft } from '@/lib/live';
import { api, storage } from '@/lib/api';
import { joinBody } from '@/lib/phone';
import { phoneAlerts } from '@/lib/alerts';
import { Sfx } from '@/lib/sfx';
import type { PlayerView, PublicView } from '@/lib/views';
import { CardFlip } from './card';
import { Playing } from './playing';
import { Final, Reveal } from './endgame';

const sfx = typeof window === 'undefined' ? null : new Sfx({ volume: 0.25 });

export function act(path: string, body: Record<string, unknown>) {
  return api(path, body).catch((err: Error) => {
    toast.error(err.message);
    return null;
  });
}

export function PlayApp() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('t');
    if (fromHash) storage.set('detective-token', fromHash);
    setToken(fromHash || storage.get('detective-token'));
    setReady(true);
  }, []);
  if (!ready) return null;
  const save = (t: string) => {
    storage.set('detective-token', t);
    history.replaceState(null, '', `#t=${t}`);
    setToken(t);
  };
  return (
    <>
      <Toaster theme="dark" position="top-center" />
      {token ? (
        <Seat token={token} onGone={() => {
          storage.remove('detective-token');
          history.replaceState(null, '', window.location.pathname);
          setToken(null);
          toast('A new game started. Join again.');
        }} />
      ) : <JoinScreen onJoined={save} />}
    </>
  );
}

function JoinScreen({ onJoined }: { onJoined: (token: string) => void }) {
  const { view } = useLive<PublicView>('/events');
  const [people, setPeople] = useState<{ username: string; name: string }[]>([]);
  const [linked, setLinked] = useState<{ username: string; name: string } | null>(null);
  const [name, setName] = useState('');
  const [wish, setWish] = useState('');
  const [typed, setTyped] = useState('');
  const [isYou, setIsYou] = useState<{ username: string; name: string } | null>(null);
  const remembered = storage.get('detective-username');

  useEffect(() => {
    fetch('/api/people').then((r) => r.json()).then(({ people: list = [] }) => {
      setPeople(list);
      const mine = list.find((p: { username: string }) => p.username === remembered);
      if (mine) {
        setLinked(mine);
        setName(mine.name);
      }
    }).catch(() => {});
  }, [remembered]);

  const join = async (body: Record<string, unknown>, full: boolean) => {
    sfx?.unlock();
    const res = await act('join', body);
    if (!res?.token) return;
    storage.set('detective-full', full ? '1' : '0');
    if (res.username) storage.set('detective-username', String(res.username));
    onJoined(String(res.token));
  };

  const submit = async () => {
    if (linked || typed.trim()) {
      const username = linked?.username ?? typed.trim();
      return join(joinBody({ name, wish, linked, typed }), username === remembered);
    }
    const { match } = await api<{ match: { username: string; name: string } | null }>('checkname', { name }).catch(() => ({ match: null }));
    if (!match) return join(joinBody({ name, wish, linked: null, typed: '' }), true);
    setIsYou(match);
  };

  const open = !view || view.status === 'lobby';
  return (
    <WorldRoom room={null}>
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pt-12 pb-10">
        <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-display text-5xl">Suspition</motion.h1>
        {!open ? <Muted>This game already started. Ask the host for a new game.</Muted> : (
          <div className="flex flex-col gap-5">
            {people.length > 0 && (
              <div className="flex flex-col gap-2">
                <Label>Played before? Tap your name</Label>
                <div className="flex flex-wrap gap-2">
                  {people.map((p) => (
                    <motion.button key={p.username} whileTap={{ scale: 0.94 }} onClick={() => { setLinked(p); setName(p.name); setIsYou(null); }}
                      className={`rounded-full border px-4 py-2 transition ${linked?.username === p.username ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted/40'}`}>{p.name}</motion.button>
                  ))}
                </div>
              </div>
            )}
            <label className="flex flex-col gap-2"><Label>Your name</Label>
              <Input value={name} maxLength={24} autoComplete="given-name" onChange={(e) => { setName(e.target.value); setLinked(null); setIsYou(null); }} className="h-12 text-lg" />
            </label>
            <AnimatePresence>
              {isYou && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-2 rounded-xl bg-card p-4">
                  <p>Is this you, {isYou.name}?</p>
                  <div className="flex gap-2">
                    <Button onClick={() => join(joinBody({ name, wish, linked: isYou, typed: '' }), isYou.username === remembered)}>Yes, that's me</Button>
                    <Button variant="secondary" onClick={() => join(joinBody({ name, wish, linked: null, typed: '', newPerson: true }), true)}>No, I'm new</Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <label className="flex flex-col gap-2"><Label>Who do you want to be? (optional)</Label>
              <Input value={wish} maxLength={200} placeholder="A spy, someone funny, anything" onChange={(e) => setWish(e.target.value)} />
            </label>
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">Or type your username</summary>
              <Input className="mt-2" value={typed} maxLength={40} placeholder="nikhil" onChange={(e) => setTyped(e.target.value)} />
            </details>
            <Button size="lg" className="h-12 text-lg" disabled={!name.trim()} onClick={submit}>Join</Button>
          </div>
        )}
      </main>
    </WorldRoom>
  );
}

function Seat({ token, onGone }: { token: string; onGone: () => void }) {
  setSeatToken(token);
  const full = storage.get('detective-full') === '1';
  const { view, status } = useLive<PlayerView>(`/events?token=${encodeURIComponent(token)}${full ? '&full=1' : ''}`);
  const prev = useRef<PlayerView | null>(null);
  const [dots, setDots] = useState<Set<string>>(new Set());
  const [shownError, setShownError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'gone') onGone();
  }, [status, onGone]);

  useEffect(() => {
    if (!view) return;
    sfx?.setSet(view.room?.soundSet);
    const alerts = phoneAlerts(prev.current, view) as { sound: string; text: string; tab: string | null }[];
    prev.current = view;
    if (view.publicError && view.publicError !== shownError) toast.error(view.publicError);
    setShownError(view.publicError ?? null);
    if (!alerts.length) return;
    sfx?.play(alerts[0].sound);
    navigator.vibrate?.(alerts[0].sound === 'call' ? [80, 60, 80] : 60);
    setDots((d) => new Set([...d, ...alerts.map((a) => a.tab).filter((t): t is string => Boolean(t))]));
    const a = alerts.find((x) => x.tab) ?? alerts[0];
    toast(a.text);
  }, [view, shownError]);

  if (!view) {
    return <WorldRoom room={null}><main className="flex min-h-dvh items-center justify-center"><Muted>{status === 'connecting' ? 'Connecting…' : ''}</Muted></main></WorldRoom>;
  }
  return (
    <WorldRoom room={view.room}>
      {status === 'connecting' && <div className="fixed inset-x-0 top-0 z-50 bg-primary/90 py-1 text-center text-xs text-primary-foreground">Reconnecting…</div>}
      {['lobby', 'generating', 'failed'].includes(view.status) && <Waiting view={view} />}
      {view.status === 'reading' && <Reading view={view} />}
      {view.status === 'playing' && <Playing view={view} dots={dots} clearDot={(t) => setDots((d) => { const n = new Set(d); n.delete(t); return n; })} />}
      {view.status === 'final' && <Final view={view} />}
      {view.status === 'reveal' && <Reveal view={view} />}
    </WorldRoom>
  );
}

function Waiting({ view }: { view: PlayerView }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-5 pt-10 pb-16">
      <h1 className="font-display text-4xl">You're in, {view.me.name}</h1>
      <section className="flex flex-col gap-3 rounded-2xl bg-card p-5">
        {view.status === 'generating' && view.progress ? <PlanSteps progress={view.progress} now={now} compact />
          : <p>{view.status === 'failed' ? 'Something went wrong. The host can try again.' : 'Waiting for the host to start.'}</p>}
        <div className="flex flex-wrap gap-2">
          {view.players.map((p, i) => (
            <motion.span key={p.id} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: i * 0.05 }} className="rounded-full bg-muted px-3 py-1 text-sm">{p.name}</motion.span>
          ))}
        </div>
      </section>
      <AnimatePresence mode="wait">
        {view.question && (
          <motion.section key={view.question.id} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="rounded-2xl bg-card p-5">
            <QuestionCard q={view.question} onAnswer={(a) => act('answer', { token: tokenOf(), id: view.question!.id, ...a })} />
          </motion.section>
        )}
      </AnimatePresence>
      {view.profile && (
        <details className="rounded-2xl bg-card p-5">
          <summary className="cursor-pointer">What the game knows about you</summary>
          <div className="mt-4"><ProfilePanel profile={view.profile} onForget={() => act('forget', { token: tokenOf() })} /></div>
        </details>
      )}
      <Muted>Keep this page open. Your card shows up here.</Muted>
    </main>
  );
}

// Each tab keeps its own seat: localStorage is shared by every tab, so it only picks the seat on open.
let seatToken = '';
export function setSeatToken(token: string) {
  seatToken = token;
}
export const tokenOf = () => seatToken;

function Reading({ view }: { view: PlayerView }) {
  const [tab, setTab] = useState<'story' | 'card'>('story');
  const [ask, setAsk] = useDraft(`world-${view.gameId}`);
  const done = view.ready.includes(view.me.id);
  return (
    <Tabs value={tab} onValueChange={(t) => setTab(t as 'story' | 'card')} className="mx-auto max-w-md gap-0 px-5 pt-6 pb-28">
      <main className="flex flex-col gap-5">
      {tab === 'story' ? (
        <>
          <section className="rounded-2xl bg-card p-5"><BriefStep view={view as never} me={view.me.id} /></section>
          <details className="rounded-xl bg-card p-4"><summary className="cursor-pointer">Timeline so far</summary><div className="mt-3"><Timeline timeline={view.timeline} /></div></details>
          <details className="rounded-xl bg-card p-4"><summary className="cursor-pointer">Alibis <span className="text-sm text-muted-foreground">where people say they were</span></summary><div className="mt-3"><Alibis alibis={view.alibis} me={view.me.name} /></div></details>
          <section className="flex flex-col gap-2 rounded-xl bg-card p-4">
            <Label>Ask about the world (free)</Label>
            <Textarea value={ask} maxLength={200} onChange={(e) => setAsk(e.target.value)} placeholder="How far is the town? Type, or use the mic on your keyboard." className="min-h-16" />
            <Button variant="secondary" disabled={!ask.trim() || Boolean(view.publicPending)} onClick={async () => { if (await act('public', { token: tokenOf(), text: ask })) setAsk(''); }}>{view.publicPending ? 'Asking…' : 'Ask everyone'}</Button>
            <News events={view.events.filter((e) => e.kind === 'qa')} />
          </section>
        </>
      ) : (
        <>
          {view.card && <CardFlip card={view.card} caseQuestion={view.caseQuestion} overridesLeft={view.overridesLeft ?? 0} overridesTotal={view.overridesTotal ?? 0} rules={view.rules} profile={view.profile} onForget={() => act('forget', { token: tokenOf() })} />}
          <Button size="lg" disabled={done} onClick={() => act('ready', { token: tokenOf() })}>{done ? 'Ready' : 'Done reading'}</Button>
          <Muted>{view.ready.length} of {view.players.length} ready. Keep your card secret.</Muted>
        </>
      )}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <TabsList variant="line" className="mx-auto grid h-auto group-data-horizontal/tabs:h-auto w-full max-w-md grid-cols-2 gap-0 p-0">
          {(['story', 'card'] as const).map((t) => (
            <TabsTrigger key={t} value={t} className="relative h-auto flex-none py-4 text-sm text-muted-foreground after:hidden data-active:text-primary">{t === 'story' ? 'Story' : 'My card'}</TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
