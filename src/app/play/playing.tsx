'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label, Muted } from '@/components/game/label';
import { RoundCard } from '@/components/game/round';
import { Feed } from '@/components/game/feed';
import { Novel } from '@/components/game/novel';
import { PeopleList, PointButtons } from '@/components/game/people';
import { MapView } from '@/components/game/map';
import { ReminderCard } from '@/components/game/reminder';
import { SeatCard, type SeatView } from '@/components/game/hot-seat';
import { OfferCard } from '@/components/game/offer';
import { GoConfirm } from '@/components/game/go-confirm';
import { CallBanner } from '@/components/game/call-banner';
import { PlayChip, PlayLine } from '@/components/game/score';
import { Timeline, Alibis, SharedClues, Recap, ScenePicture, Facts, GoalsPanel, KeyObjects } from '@/components/game/panels';
import { useDraft } from '@/lib/live';
import { storage } from '@/lib/api';
import { countdown, reminderDue, suspicionLabel, callFor, type ReminderState } from '@/lib/phone';
import type { PlayerView, ThreadEntry } from '@/lib/views';
import { CardFlip } from './card';
import { act, tokenOf } from './play-app';

type Tab = 'story' | 'card' | 'ask' | 'people' | 'clues';
const TABS: [Tab, string][] = [['story', 'Story'], ['card', 'Card'], ['ask', 'Ask'], ['people', 'People'], ['clues', 'Clues']];
const STARTERS: [string, string][] = [['Talk to…', 'I ask '], ['Look at…', 'I look at '], ['Secretly…', 'Secretly, I '], ['Remember…', 'I try to remember ']];
const LABEL: Record<string, string> = { you: 'You', gm: 'GM', whisper: 'Secret note', system: 'Problem' };

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Playing({ view, dots, clearDot }: { view: PlayerView; dots: Set<string>; clearDot: (t: string) => void }) {
  const [tab, setTab] = useState<Tab>('story');
  const go = (t: Tab) => {
    setTab(t);
    clearDot(t);
    window.scrollTo({ top: 0 });
  };
  return (
    <Tabs value={tab} onValueChange={(t) => go(t as Tab)} className="mx-auto max-w-md gap-0 pb-28">
      <TopBar view={view} onOpenCard={() => go('card')} onCall={() => go('story')} />
      <main className="flex flex-col gap-5 px-4 pt-4">
        <SeatNow seat={view.seat as SeatView | null} />
        <Moment view={view} now={Date.now()} />
        {view.moveConfirm && <GoConfirm place={view.moveConfirm.place} onAnswer={(yes) => act('move', { token: tokenOf(), yes })} />}
        {view.offers?.[0] && <OfferCard offer={view.offers[0]} onAnswer={(take, text = '') => act('offer', { token: tokenOf(), id: view.offers![0].id, action: take ? 'take' : 'own', text })} />}
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {tab === 'story' && <StoryTab view={view} onAskTab={() => go('ask')} onGo={(t) => go(t === 'clues' ? 'clues' : 'story')} />}
            {tab === 'card' && view.card && <CardFlip card={view.card} caseQuestion={view.caseQuestion} overridesLeft={view.overridesLeft ?? 0} overridesTotal={view.overridesTotal ?? 0} persona={view.persona} rules={view.rules} profile={view.profile} onForget={() => act('forget', { token: tokenOf() })} />}
            {tab === 'ask' && <AskTab view={view} />}
            {tab === 'people' && <PeopleTab view={view} />}
            {tab === 'clues' && <CluesTab view={view} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <TabsList variant="line" className="mx-auto grid h-auto group-data-horizontal/tabs:h-auto w-full max-w-md grid-cols-5 gap-0 p-0">
          {TABS.map(([t, l]) => (
            <TabsTrigger key={t} value={t} className="relative h-auto flex-none py-4 text-sm text-muted-foreground after:hidden data-active:text-primary">
              {l}
              {tab === t && <motion.span layoutId="tab-line" className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-primary" />}
              {dots.has(t) && tab !== t && <span className="absolute top-3 right-[22%] size-2 rounded-full bg-primary" />}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}

function TopBar({ view, onOpenCard, onCall }: { view: PlayerView; onOpenCard: () => void; onCall: () => void }) {
  const now = useNow();
  const timer = view.phase?.endsAt ? countdown(view.phase.endsAt, now) : null;
  const [reminder, setReminder] = useState<string | null>(null);
  const rem = useRef<ReminderState>({ round: null, at: 0, next: Number(storage.get(`detective-reminder-${view.gameId}`)) || 0 });
  useEffect(() => {
    const out = reminderDue(rem.current, view, now);
    rem.current = out.state;
    if (out.show) {
      setReminder(out.show);
      storage.set(`detective-reminder-${view.gameId}`, String(out.state.next));
    }
  }, [now, view]);
  const hv = view.hintVote as { proposer: string; yes: number; need: number } | null;
  const va = view.voteAsk as { proposer: string; yes: number; need: number } | null;
  return (
    <header className="sticky top-0 z-30 flex flex-col gap-2 border-b border-border bg-background/85 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 backdrop-blur">
      <CallBanner text={callFor(view as Parameters<typeof callFor>[0])} onShow={onCall} />
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-heading text-primary">{view.phase ? `Round ${view.phase.number} of ${view.phase.count}: ${view.phase.name}` : ''}</span>
        {timer && <span className={`font-mono tabular-nums ${timer.low ? 'text-destructive' : ''}`}>{timer.text}</span>}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{view.questionsLeft} private question{view.questionsLeft === 1 ? '' : 's'} left{view.here ? ` · You are in: ${view.here}` : ''}</span>
        <span>Suspicion: {suspicionLabel(view.suspicion)}</span>
      </div>
      {hv && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-card p-2 text-sm">
          <span><b>{hv.proposer}</b> wants a hint ({hv.yes} of {hv.need} yes).</span>
          <span className="flex gap-1"><Button size="sm" onClick={() => act('vote', { token: tokenOf(), yes: true })}>Yes</Button><Button size="sm" variant="secondary" onClick={() => act('vote', { token: tokenOf(), yes: false })}>No</Button></span>
        </div>
      )}
      {va && (view.myVoteAsk == null ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-card p-2 text-sm">
          <span><b>{va.proposer}</b> wants to vote now.</span>
          <span className="flex gap-1"><Button size="sm" onClick={() => act('voteaskanswer', { token: tokenOf(), yes: true })}>Yes</Button><Button size="sm" variant="secondary" onClick={() => act('voteaskanswer', { token: tokenOf(), yes: false })}>Not yet</Button></span>
        </div>
      ) : <div className="rounded-lg bg-card p-2 text-sm text-muted-foreground">{va.yes} of {va.need} ready to vote. Everyone has to say yes.</div>)}
      <AnimatePresence>
        {reminder && view.card && (
          <ReminderCard key={reminder} name={view.card.name} line={reminder} onOpen={() => { setReminder(null); onOpenCard(); }} onDismiss={() => setReminder(null)} />
        )}
      </AnimatePresence>
    </header>
  );
}

function SeatNow({ seat }: { seat: SeatView | null }) {
  const now = useNow();
  return <SeatCard seat={seat} now={now} />;
}

function Moment({ view, now }: { view: PlayerView; now: number }) {
  const m = view.moments?.[0];
  const [editing, setEditing] = useState(false);
  const [ownText, setOwnText] = useDraft(`moment-${view.gameId}`);
  const own = editing || ownText ? ownText : null;
  const setOwn = (text: string | null) => {
    setEditing(text !== null);
    setOwnText(text ?? '');
  };
  if (!m) return null;
  const left = view.overridesLeft ?? 0;
  const ready = m.status === 'getready';
  const secs = Math.max(0, Math.round(((m.readyAt ?? now) - now) / 1000));
  const send = (action: string, text = '') => act('moment', { token: tokenOf(), id: m.id, action, text }).then((r) => r && setOwn(null));
  return (
    <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      className={`flex flex-col gap-2 rounded-2xl p-4 ${ready ? 'bg-card' : 'bg-primary/20 ring-2 ring-primary'}`}>
      <Label>{ready ? `Get ready. You are up in ${secs}s` : 'Your moment. Everyone is listening.'}</Label>
      {m.why && <Muted className="text-xs">{m.why}</Muted>}
      <p className="text-xl font-medium">&ldquo;{m.line}&rdquo;</p>
      {own !== null ? (
        <div className="flex flex-col gap-2">
          <Textarea autoFocus value={own} maxLength={200} rows={2} onChange={(e) => setOwn(e.target.value)} placeholder="Type what you said, or use the mic on your keyboard" />
          <div className="flex gap-2"><Button disabled={!own.trim()} onClick={() => send('own', own)}>Post it for everyone</Button><Button variant="ghost" onClick={() => setOwn(null)}>Back</Button></div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {ready ? <Button variant="secondary" onClick={() => send('ready')}>I'm ready, call me now</Button> : <Button onClick={() => send('said')}>I said it</Button>}
          <Button variant="ghost" disabled={left < 1} onClick={() => send('quiet')}>Stay quiet</Button>
          <Button variant="ghost" disabled={left < 1} onClick={() => setOwn('')}>Say it my way</Button>
        </div>
      )}
      <Muted className="text-xs">{left < 1 ? 'No overrides left. You have to say it.' : `Staying quiet or saying it your way uses 1 override (${left} left).`}</Muted>
    </motion.div>
  );
}

function StoryTab({ view, onAskTab, onGo }: { view: PlayerView; onAskTab: () => void; onGo: (tab: string) => void }) {
  const [text, setText] = useDraft(`say-${view.gameId}`);
  const box = useRef<HTMLTextAreaElement>(null);
  const now = useNow();
  const vote = view.round?.vote;
  const left = view.questionsLeft ?? 0;
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl bg-card p-5 shadow-sm">
        <RoundCard round={view.round} voting myVote={view.myRoundVote ?? null} countdown={vote ? countdown(vote.endsAt, now).text : ''} tappable
          onVote={(i) => act('roundvote', { token: tokenOf(), choice: i })}
          onIdea={(t) => { setText(t); box.current?.focus(); }} />
      </section>
      <GoalsPanel caseQuestion={view.caseQuestion} job={view.round?.objective} goal={view.card?.goal} open={view.recap?.open ?? []} />
      <KeyObjects objects={view.keyObjects ?? []} />
      <section className="flex flex-col gap-2">
        <Textarea ref={box} value={text} maxLength={200} rows={2} onChange={(e) => setText(e.target.value)} placeholder='Ask anyone anything. "Lata, when did the music stop?"'
          className="bg-card text-base" />
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={!text.trim() || Boolean(view.publicPending)} onClick={async () => { if (await act('public', { token: tokenOf(), text })) setText(''); }}>{view.publicPending ? 'Asking…' : 'Ask out loud'}</Button>
          <Button variant="secondary" disabled={!text.trim() || left < 1 || Boolean(view.pending) || Boolean(vote) || view.transitioning}
            onClick={async () => { if (await act('ask', { token: tokenOf(), kind: 'chat', text })) { setText(''); onAskTab(); } }}>Ask in private</Button>
        </div>
        <Muted className="text-xs">Out loud: free, everyone hears. In private: only you, uses 1 question ({left} left). Tap the 🎤 on your keyboard to speak.</Muted>
      </section>
      <Recap recap={view.recap} />
      {view.round?.question && !view.round.done && !vote && (view.voteAskBlocked
        ? <Muted className="text-xs">Nobody took your last two requests. You can ask for the vote again next round.</Muted>
        : <button className="self-start text-sm text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={Boolean(view.voteAsk) || view.transitioning} onClick={() => act('voteask', { token: tokenOf() })}>
          Ask to vote now · everyone has to agree
        </button>)}
      <button className="self-start text-sm text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={view.hintsLeft < 1 || Boolean(view.hintVote)} onClick={() => act('hint', { token: tokenOf() })}>
        {view.hintsLeft < 1 ? 'No group hints left' : `Ask the group for a hint · ${view.hintsLeft} left`}
      </button>
      <Feed events={view.events} onGo={onGo} />
      <div className="flex flex-col gap-2">
        <details className="rounded-xl bg-card p-4"><summary className="cursor-pointer">Timeline <span className="text-sm text-muted-foreground">{view.timeline?.length || ''}</span></summary><div className="mt-3"><Timeline timeline={view.timeline} /></div></details>
        <details className="rounded-xl bg-card p-4"><summary className="cursor-pointer">Alibis <span className="text-sm text-muted-foreground">where people say they were</span></summary><div className="mt-3"><Alibis alibis={view.alibis} me={view.me.name} /></div></details>
        <details className="rounded-xl bg-card p-4"><summary className="cursor-pointer">Shared clues <span className="text-sm text-muted-foreground">{view.sharedClues?.length || ''}</span></summary><div className="mt-3"><SharedClues clues={view.sharedClues} /></div></details>
        <details className="rounded-xl bg-card p-4"><summary className="cursor-pointer">The place and the story so far</summary><div className="mt-3 flex flex-col gap-3"><ScenePicture svg={view.illustration} /><Facts lines={view.background} /></div></details>
      </div>
    </div>
  );
}

function Message({ m, latest }: { m: ThreadEntry; latest: boolean }) {
  const mine = m.from === 'you';
  return (
    <motion.div initial={latest ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }}
      className={`relative flex max-w-[88%] flex-col gap-1 rounded-2xl p-3 ${mine ? 'self-end bg-primary/15' : m.from === 'whisper' ? 'bg-violet-500/15' : m.from === 'system' ? 'bg-destructive/15' : 'bg-card'}`}>
      <Label>{LABEL[m.from]}{mine && m.kind && m.kind !== 'question' ? ` · ${m.kind === 'action' ? 'secret' : 'about you'}` : ''}</Label>
      {m.lines ? <Novel lines={m.lines} animate={latest} /> : <p>{m.text}</p>}
      <PlayLine play={m.play} />
      <PlayLine play={m.penalty} />
      {latest && m.play && <span className="absolute -top-3 right-3"><PlayChip play={m.play} /></span>}
    </motion.div>
  );
}

function AskTab({ view }: { view: PlayerView }) {
  const [text, setText] = useDraft(`ask-${view.gameId}`);
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const thread = view.thread ?? [];
  const items: ThreadEntry[] = view.pending ? [...thread, { from: 'you', text: view.pending.text, at: 0 }, { from: 'gm', text: 'Thinking…', at: 0 }] : thread;
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items.length]);
  const ideas = [...thread].reverse().find((m) => m.from === 'gm')?.ideas ?? [];
  const insert = (words: string, fresh = false) => {
    const base = fresh ? '' : text;
    setText(`${base}${base && !base.endsWith(' ') ? ' ' : ''}${words}`);
    box.current?.focus();
  };
  const targets = [...(view.cast?.npcs ?? []).map((n) => n.name), ...(view.cast?.locations ?? []).map((l) => l.name)];
  return (
    <div className="flex flex-col gap-3">
      <Muted className="text-xs">Private chat with the GM. Write what you do, in your own words. To speak instead, tap the 🎤 mic on your keyboard.</Muted>
      <div className="flex flex-col gap-3">
        {items.length ? items.map((m, i) => <Message key={`${m.at}-${i}`} m={m} latest={i === items.length - 1 && m.from !== 'you'} />)
          : <Muted>Nothing yet. Try: &ldquo;I ask the cook where he was at nine.&rdquo;</Muted>}
        <div ref={end} />
      </div>
      <div className="sticky bottom-20 flex flex-col gap-2 rounded-2xl border border-border bg-background/95 p-3 backdrop-blur">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(ideas.length ? ideas.map((t) => [t, t] as [string, string]) : STARTERS).map(([l, t]) => (
            <button key={l} onClick={() => insert(t, true)} className="shrink-0 rounded-full border border-border px-3 py-1 text-sm">{l}</button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {targets.map((n) => <button key={n} onClick={() => insert(n)} className="shrink-0 rounded-full bg-muted/60 px-3 py-1 text-xs">{n}</button>)}
        </div>
        <div className="flex gap-2">
          <Textarea ref={box} value={text} maxLength={500} rows={2} onChange={(e) => setText(e.target.value)} placeholder="I ask the cook where he was at nine." className="min-w-0 flex-1" />
          <Button className="self-end" disabled={!text.trim() || Boolean(view.pending) || (view.questionsLeft ?? 0) < 1}
            onClick={async () => { if (await act('ask', { token: tokenOf(), kind: 'chat', text })) setText(''); }}>Send</Button>
        </div>
      </div>
    </div>
  );
}

function PeopleTab({ view }: { view: PlayerView }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState<Record<string, number>>({});
  return (
    <div className="flex flex-col gap-5">
      {view.setup?.roundStyle === 'hotseats' && !(view.seat as { status?: string } | null)?.status && (
        <PointButtons people={view.cast?.players} me={view.me.id} onPoint={(to) => act('point', { token: tokenOf(), to })} />
      )}
      <PeopleList people={view.people} open={open} seen={seen} onToggle={(id, isOpen) => {
        setOpen((s) => { const n = new Set(s); if (isOpen) n.add(id); else n.delete(id); return n; });
        if (isOpen) setSeen((s) => ({ ...s, [id]: view.people?.find((p: { id: string }) => p.id === id)?.facts.length ?? 0 }));
      }} />
      <h3 className="font-heading text-xl">Who is where now</h3>
      <GoSomewhere view={view} />
    </div>
  );
}

// Tap a place on the map, or a button under it, then confirm. Going is free and everyone sees it.
function GoSomewhere({ view }: { view: PlayerView }) {
  const [pick, setPick] = useState<string | null>(null);
  const places = ((view.map as { places?: { id: string; name: string }[] } | null)?.places ?? []);
  const here = view.here ?? '';
  const playing = view.status === 'playing';
  const chosen = places.find((p) => p.id === pick);
  return (
    <div className="flex flex-col gap-3">
      <MapView view={view} me={view.me.id} onPlace={playing ? setPick : undefined} />
      {playing && (
        <>
          <Muted className="text-xs">{here ? `You are in: ${here}. ` : ''}Tap a place to go there.</Muted>
          <div className="flex flex-wrap gap-2">
            {places.filter((p) => p.name !== here).map((p) => (
              <Button key={p.id} size="sm" variant="secondary" onClick={() => setPick(p.id)}>Go to {p.name}</Button>
            ))}
          </div>
          {chosen && chosen.name !== here && (
            <GoConfirm place={chosen.name.replace(/^the\s+/i, '')} onAnswer={async (yes) => { if (yes) await act('go', { token: tokenOf(), place: chosen.id }); setPick(null); }} />
          )}
        </>
      )}
    </div>
  );
}

function CluesTab({ view }: { view: PlayerView }) {
  const key = `detective-notes-${view.gameId}`;
  const [notes, setNotes] = useState(() => storage.get(key) ?? '');
  const shared = new Set((view.sharedClues ?? []).map((c: { id: string }) => c.id));
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-2xl">Your clues</h2>
      {view.clues?.length ? view.clues.map((c) => (
        <motion.div key={c.id} initial={{ rotateX: 70, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} className="flex flex-col gap-1 rounded-xl bg-card p-4">
          <b>{c.name}{c.destroyed && <span className="ml-2 rounded bg-destructive/20 px-1.5 text-xs text-destructive">now gone</span>}</b>
          <p className="text-sm">{c.shows}</p>
          {shared.has(c.id) ? <Muted className="text-xs">Everyone can see this.</Muted>
            : <Button size="sm" variant="secondary" className="self-start" onClick={() => act('share', { token: tokenOf(), clueId: c.id })}>Show everyone</Button>}
        </motion.div>
      )) : <Muted>Nothing yet. Use Ask to look around and talk to people.</Muted>}
      <h2 className="mt-2 font-heading text-2xl">Notes</h2>
      <Muted className="text-xs">Only on this phone.</Muted>
      <Textarea value={notes} onChange={(e) => { setNotes(e.target.value); storage.set(key, e.target.value); }} className="min-h-[30vh] bg-card" />
    </div>
  );
}
