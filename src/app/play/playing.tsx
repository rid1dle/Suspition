'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label, Muted } from '@/components/game/label';
import { RoundCard } from '@/components/game/round';
import { Novel } from '@/components/game/novel';
import { PeopleList, PointButtons } from '@/components/game/people';
import { WorldMap, PlacePanel } from '@/components/game/world-map';
import { tripFrom } from '@/lib/map-layout';
import { ReminderCard } from '@/components/game/reminder';
import { SeatCard, type SeatView } from '@/components/game/hot-seat';
import { OfferCard } from '@/components/game/offer';
import { GoConfirm } from '@/components/game/go-confirm';
import { CallBanner } from '@/components/game/call-banner';
import { PlayChip, PlayLine } from '@/components/game/score';
import { Timeline, Alibis, SharedClues, Recap, ScenePicture, Facts, GoalsPanel, KeyObjects } from '@/components/game/panels';
import { useDraft } from '@/lib/live';
import { storage } from '@/lib/api';
import { chatItems, channelItems, targetsFor, unreadIn, introLines, type ChatItem, type Layout, type Target } from '@/lib/chat';
import { countdown, reminderDue, suspicionLabel, callFor, type ReminderState } from '@/lib/phone';
import type { PlayerView } from '@/lib/views';
import { CardFlip } from './card';
import { act, tokenOf } from './play-app';

// The chat is the game: one stream, the composer at the bottom, everything else a tap away in a drawer.
type Drawer = 'card' | 'goals' | 'clues' | 'map' | 'people' | 'case';
const DRAWERS: [Drawer, string][] = [['card', 'Me'], ['goals', 'Goals'], ['clues', 'Clues'], ['map', 'Map'], ['people', 'People'], ['case', 'Case file']];
const STARTERS: [string, string][] = [['Talk to…', 'I ask '], ['Look at…', 'I look at '], ['Secretly…', 'Secretly, I '], ['Remember…', 'I try to remember ']];
const ICONS: Record<string, string> = { event: '🔔', move: '🚶', meeting: '📣', because: '➜', clue: '🔎', timeline: '⏱', hint: '✦', ripple: '〰', refused: '✋', said: '🗣', seat: '🎙', vote: '🗳', point: '👉', note: '💬', voteask: '🗳', sync: '📋', recap: '📋' };

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// Three ways to lay out the chat; Room | Private is the default, the others are a per-phone choice under Me.
const LAYOUTS: [Layout, string][] = [['tabs', 'Room | Private'], ['three', 'Room | GM | People'], ['stream', 'One stream']];
const TABS: Record<Layout, [string, string][]> = {
  tabs: [['room', 'Room'], ['private', 'Private']],
  three: [['room', 'Room'], ['gm', 'GM'], ['people', 'People']],
  stream: [['all', 'All'], ['room', 'Room'], ['private', 'Private']],
};
const layoutKey = 'detective-chat-layout';
const readLayout = (): Layout => {
  const v = storage.get(layoutKey);
  return v === 'three' || v === 'stream' ? v : 'tabs';
};

export function Playing({ view, dots, clearDot }: { view: PlayerView; dots: Set<string>; clearDot: (t: string) => void }) {
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [text, setText] = useDraft(`say-${view.gameId}`);
  const [layout, setLayoutState] = useState<Layout>(readLayout);
  const [tab, setTabState] = useState<string>(layout === 'stream' ? 'all' : 'room');
  const [person, setPerson] = useState<string | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [intro, setIntro] = useState(() => !storage.get(`detective-intro-${view.gameId}`));
  const box = useRef<HTMLTextAreaElement>(null);
  const items = chatItems(view);
  const solo = (view.cast?.players ?? []).length < 2;
  const tabs = TABS[layout].filter(([t]) => !(solo && t === 'people'));
  const [seen, setSeen] = useState<Record<string, number>>({});
  const latest = Math.max(0, ...items.map((i) => (Number.isFinite(i.at) ? i.at : 0)));
  useEffect(() => {
    setSeen((s) => (s[tab] === latest ? s : { ...s, [tab]: latest }));
  }, [tab, latest]);
  const setTab = (t: string) => {
    setTabState(t);
    setTarget(null);
  };
  const setLayout = (l: Layout) => {
    storage.set(layoutKey, l);
    setLayoutState(l);
    setTab(l === 'stream' ? 'all' : 'room');
  };
  const open = (d: Drawer) => {
    setDrawer(d);
    clearDot(d);
  };
  const write = (words: string, to: Target | null = null, fresh = true) => {
    if (to) {
      setTab(to.kind === 'room' ? 'room' : layout === 'three' ? (to.kind === 'gm' ? 'gm' : 'people') : layout === 'stream' ? 'all' : 'private');
      setTarget(to);
    }
    setText(fresh ? words : `${text}${text && !text.endsWith(' ') ? ' ' : ''}${words}`);
    box.current?.focus();
  };
  const closeIntro = () => {
    storage.set(`detective-intro-${view.gameId}`, '1');
    setIntro(false);
  };
  // The bottom bar grows with what is pinned in it; the chat keeps its last line above it.
  const bottom = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(256);
  useEffect(() => {
    const el = bottom.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setRoom(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <TopBar view={view} onOpenCard={() => open('card')} dots={dots} onDrawer={open}>
        <ChatTabs tabs={tabs} tab={tab} onTab={setTab} unread={(t) => unreadIn(channelItems(items, { layout, tab: t }), seen[t] ?? 0)} />
      </TopBar>
      <main className="flex flex-1 flex-col gap-3 px-4 pt-3" style={{ paddingBottom: room + 16 }}>
        <RoundStrip view={view} onIdea={(t) => write(t, GM_TARGET)} />
        {layout === 'three' && tab === 'people' && <PersonPicker view={view} person={person} onPick={setPerson} />}
        <Stream items={channelItems(items, { layout, tab, person })} empty={EMPTY[tab] ?? EMPTY.room} onGo={(d) => open(d)} onTell={(line) => write(line, ROOM_TARGET)} />
      </main>
      <Composer view={view} text={text} setText={setText} layout={layout} tab={tab} person={person} target={target} setTarget={setTarget} box={box} barRef={bottom} onIdea={(t) => write(t, null, false)} />
      <AnimatePresence>{drawer && <Sheet key={drawer} title={DRAWERS.find(([d]) => d === drawer)?.[1] ?? ''} onClose={() => setDrawer(null)}><DrawerBody view={view} drawer={drawer} layout={layout} onLayout={setLayout} onTell={(line) => { setDrawer(null); write(line, ROOM_TARGET); }} /></Sheet>}</AnimatePresence>
      <AnimatePresence>{intro && view.card && <Intro view={view} onPick={(line) => { closeIntro(); write(line, ROOM_TARGET); }} onTry={(idea) => { closeIntro(); write(idea, GM_TARGET); }} onClose={closeIntro} />}</AnimatePresence>
    </div>
  );
}

function TopBar({ view, onOpenCard, dots, onDrawer, children }: { view: PlayerView; onOpenCard: () => void; dots: Set<string>; onDrawer: (d: Drawer) => void; children?: React.ReactNode }) {
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
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-30 flex flex-col gap-2 border-b border-border bg-background px-4 pt-3 pb-2">
      <CallBanner text={callFor(view as Parameters<typeof callFor>[0])} onShow={() => window.scrollTo({ top: 0 })} />
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-heading text-primary">{view.phase ? `Round ${view.phase.number} of ${view.phase.count}: ${view.phase.name}` : ''}</span>
        {timer && <span className={`font-mono tabular-nums ${timer.low ? 'text-destructive' : ''}`}>{timer.text}</span>}
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground">
        <span>{view.here ? `You are in: ${view.here}` : ''}</span>
        <span>Suspicion: {suspicionLabel(view.suspicion)}</span>
      </div>
      <div className="-mx-1 flex gap-1 overflow-x-auto">
        {DRAWERS.map(([d, l]) => (
          <button key={d} onClick={() => onDrawer(d)} className="relative shrink-0 rounded-full border border-border px-3 py-0.5 text-sm">
            {l}{dots.has(d) && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" />}
          </button>
        ))}
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
      {children}
    </header>
  );
}

// What needs you now sits in the bottom bar, above the composer, wherever you are in the chat:
// a meeting, your hot seat, your moment, a move to confirm, a question for you, the vote.
function Pinned({ view }: { view: PlayerView }) {
  const now = useNow();
  const vote = view.round?.vote;
  const meeting = view.meeting as { by: string; reason: string; endsAt: number; mine?: boolean } | null;
  const invite = view.invites?.[0];
  const any = meeting || view.seat || view.moments?.[0] || view.moveConfirm || view.offers?.[0] || vote || invite;
  if (!any) return null;
  return (
    <div data-tray className="flex max-h-[45dvh] flex-col gap-3 overflow-y-auto">
      {meeting && <MeetingCard meeting={meeting} mine={Boolean(meeting.mine)} now={now} />}
      <SeatCard seat={view.seat as SeatView | null} now={now} />
      <Moment view={view} now={now} />
      {view.moveConfirm && <GoConfirm place={view.moveConfirm.place} onAnswer={(yes) => act('move', { token: tokenOf(), yes })} />}
      {invite && !view.moveConfirm && <InviteCard invite={invite} />}
      {view.offers?.[0] && <OfferCard offer={view.offers[0]} onAnswer={(take, text = '') => act('offer', { token: tokenOf(), id: view.offers![0].id, action: take ? 'take' : 'own', text })} />}
      {vote && (
        <section className="rounded-2xl bg-card p-4 shadow-sm ring-2 ring-primary">
          <RoundCard round={view.round} brief={view.voteBrief} voting myVote={view.myRoundVote ?? null} countdown={countdown(vote.endsAt, now).text} onVote={(i) => act('roundvote', { token: tokenOf(), choice: i })} />
        </section>
      )}
    </div>
  );
}

// Someone asked everyone to go somewhere together: come along, or stay.
function InviteCard({ invite }: { invite: { id: string; by: string; place: string } }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-primary/40">
      <Label>{invite.by} asks everyone to come</Label>
      <p className="text-base">To the {invite.place.replace(/^the\s+/i, '')}.</p>
      <div className="flex gap-2">
        <Button onClick={() => act('inviteanswer', { token: tokenOf(), id: invite.id, yes: true })}>Go with them</Button>
        <Button variant="ghost" onClick={() => act('inviteanswer', { token: tokenOf(), id: invite.id, yes: false })}>Not now</Button>
      </div>
    </div>
  );
}

function MeetingCard({ meeting, mine, now }: { meeting: { by: string; reason: string; endsAt: number }; mine: boolean; now: number }) {
  return (
    <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} data-meeting className="flex flex-col gap-1 rounded-2xl bg-primary/20 p-4 ring-2 ring-primary">
      <Label>Meeting · {countdown(meeting.endsAt, now).text}</Label>
      <p className="text-lg font-medium">{meeting.by} called everyone together{meeting.reason ? `: "${meeting.reason}"` : '.'}</p>
      <Muted className="text-xs">Talk it out with the room. Acts and moves wait until it ends.</Muted>
      {mine && <Button size="sm" variant="secondary" className="self-start" onClick={() => act('meetingend', { token: tokenOf() })}>End the meeting</Button>}
    </motion.div>
  );
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

// The round's job in one line; tap it for the pointers and the question the room answers at the end.
function RoundStrip({ view, onIdea }: { view: PlayerView; onIdea: (t: string) => void }) {
  const r = view.round;
  if (!r || r.vote || (!r.objective && !r.question)) return null;
  return (
    <details className="rounded-xl bg-card px-4 py-3">
      <summary className="cursor-pointer text-sm"><span className="text-muted-foreground">This round: </span>{r.objective || r.question}</summary>
      <div className="mt-3"><RoundCard round={r} tappable onIdea={onIdea} /></div>
    </details>
  );
}

// The room's own buttons: call a meeting, ask for a hint, ask to vote early.
function RoomButtons({ view }: { view: PlayerView }) {
  const [reason, setReason] = useState<string | null>(null);
  const vote = view.round?.vote;
  const canVote = view.round?.question && !view.round.done && !vote;
  // Playing alone there is no group to ask: the buttons just do it.
  const solo = view.players.length === 1;
  // One or two players have no clock: a round with no question ends when they choose to move on.
  const canMoveOn = view.players.length < 3 && !view.round?.question && !view.transitioning;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {view.canCallMeeting && reason === null && <button className="hover:text-foreground" onClick={() => setReason('')}>📣 Call a meeting · once a game</button>}
        <button className="hover:text-foreground disabled:opacity-50" disabled={view.hintsLeft < 1 || Boolean(view.hintVote)} onClick={() => act('hint', { token: tokenOf() })}>
          {view.hintsLeft < 1 ? (solo ? 'No hints left' : 'No group hints left') : solo ? `Get a hint · ${view.hintsLeft} left` : `Ask the group for a hint · ${view.hintsLeft} left`}
        </button>
        {canVote && (view.voteAskBlocked
          ? <span className="text-xs">Nobody took your last two requests. You can ask for the vote again next round.</span>
          : <button className={`hover:text-foreground disabled:opacity-50 ${view.round?.ready ? 'font-medium text-primary' : ''}`} disabled={Boolean(view.voteAsk) || view.transitioning} onClick={() => act('voteask', { token: tokenOf() })}>{solo ? 'Answer the round question now' : view.players.length === 2 ? 'Answer now · you both have to agree' : 'Ask to vote now · everyone has to agree'}</button>)}
        {canMoveOn && <button className="hover:text-foreground disabled:opacity-50" disabled={Boolean(view.voteAsk)} onClick={() => act('voteask', { token: tokenOf() })}>{solo ? 'Move on to the next round' : 'Move on · you both have to agree'}</button>}
      </div>
      {reason !== null && (
        <div className="flex flex-col gap-2 rounded-xl bg-card p-3">
          <Label>Call a meeting</Label>
          <Textarea value={reason} maxLength={100} rows={2} onChange={(e) => setReason(e.target.value)} placeholder="Why? (optional) Someone burned the ledger!" />
          <div className="flex gap-2">
            <Button size="sm" onClick={async () => { if (await act('meeting', { token: tokenOf(), reason })) setReason(null); }}>Call everyone</Button>
            <Button size="sm" variant="ghost" onClick={() => setReason(null)}>Not now</Button>
          </div>
          <Muted className="text-xs">Everyone stops and talks it out for 3 minutes. You get one a game.</Muted>
        </div>
      )}
    </div>
  );
}

const GM_TARGET: Target = { kind: 'gm', id: null, label: 'GM' };
const ROOM_TARGET: Target = { kind: 'room', id: null, label: 'Everyone' };
const EMPTY: Record<string, string> = {
  room: 'Nothing yet. Say hello to the room.',
  private: 'Nothing private yet. Talk to the GM, or message someone.',
  gm: 'Nothing yet. Tell the GM what you do.',
  people: 'No messages yet.',
  all: 'Nothing yet. Say hello to the room.',
};

// The chat's tabs: which conversation you are looking at. A dot means something new there.
function ChatTabs({ tabs, tab, onTab, unread }: { tabs: [string, string][]; tab: string; onTab: (t: string) => void; unread: (t: string) => number }) {
  return (
    <div role="tablist" aria-label="Conversations" className="-mb-2 flex gap-5">
      {tabs.map(([t, label]) => {
        const n = t === tab ? 0 : unread(t);
        return (
          <button key={t} role="tab" aria-selected={t === tab} onClick={() => onTab(t)}
            className={`relative py-2 text-sm ${t === tab ? 'font-medium text-primary' : 'text-muted-foreground'}`}>
            {label}{n > 0 && <span className="ml-1 text-xs text-primary">{n}</span>}
            {t === tab && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}

// With several other players, People shows one person's messages at a time.
function PersonPicker({ view, person, onPick }: { view: PlayerView; person: string | null; onPick: (id: string) => void }) {
  const others = (view.cast?.players ?? []).filter((p) => p.id !== view.me.id);
  if (others.length < 2) return null;
  return (
    <div className="flex gap-x-4 gap-y-1 overflow-x-auto text-sm">
      {others.map((p) => <button key={p.id} onClick={() => onPick(p.id)} className={person === p.id ? 'font-medium text-primary' : 'text-muted-foreground'}>{p.name}</button>)}
    </div>
  );
}

function Stream({ items, empty, onGo, onTell }: { items: ChatItem[]; empty: string; onGo: (d: Drawer) => void; onTell: (line: string) => void }) {
  const last = items.at(-1)?.key;
  useEffect(() => {
    window.scrollTo?.({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  }, [items.length, last]);
  if (!items.length) return <Muted>{empty}</Muted>;
  return (
    <div className="flex flex-col gap-2" data-chat>
      {items.map((it, i) => <ChatLine key={it.key} item={it} latest={i === items.length - 1} onGo={onGo} onTell={onTell} />)}
    </div>
  );
}

function ChatLine({ item, latest, onGo, onTell }: { item: ChatItem; latest: boolean; onGo: (d: Drawer) => void; onTell: (line: string) => void }) {
  const fade = latest ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } } : {};
  if (item.kind === 'round-start') return <div className="mt-3 flex items-center gap-2 text-xs tracking-wide text-primary uppercase"><span className="h-px flex-1 bg-border" />{item.text.replace(/^Round (\d+) of \d+: /, 'Round $1 · ')}<span className="h-px flex-1 bg-border" /></div>;
  if (item.dm) return <DmLine item={item} latest={latest} fade={fade} />;
  if (item.side === 'me') return <PrivateLine item={item} latest={latest} fade={fade} onTell={onTell} />;
  if (item.kind === 'opening') return <motion.div {...fade} className="rounded-2xl bg-card p-4"><Label>The story so far</Label><p className="mt-1">{item.text}</p></motion.div>;
  if (['recap', 'sync'].includes(item.kind)) return <motion.div {...fade} className="rounded-xl border border-border bg-card p-3 text-sm"><Label>Where we are now</Label><p className="mt-1">{item.text.replace(/^Where we are now\. /, '')}</p></motion.div>;
  if (item.kind === 'qa' || item.kind === 'asking') {
    return (
      <motion.div {...fade} className="flex flex-col gap-1 rounded-2xl bg-card p-3">
        <Muted className="text-xs">{item.kind === 'asking' ? 'You asked the room · waiting for an answer' : `${item.by} asked the room: ${item.q}`}</Muted>
        {item.kind === 'asking' ? <p>{item.text}</p> : item.lines?.length ? <Novel lines={item.lines} animate={latest} /> : <p>{item.text}</p>}
      </motion.div>
    );
  }
  const tone = item.tone === 'right' ? 'text-correct' : item.tone === 'wrong' ? 'text-destructive' : 'text-muted-foreground';
  const loud = ['because', 'meeting', 'event', 'vote-result'].includes(item.kind);
  return (
    <motion.div {...fade} data-kind={item.kind} className={`flex gap-2 px-1 text-sm ${loud ? 'font-medium' : ''} ${item.kind === 'ripple' ? 'italic text-muted-foreground' : ''}`}>
      <span className={`w-5 shrink-0 text-center ${tone}`}>{item.tone === 'right' ? '✓' : item.tone === 'wrong' ? '✗' : ICONS[item.kind] ?? '·'}</span>
      <span className="min-w-0">{item.text}{item.kind === 'clue' && <button className="ml-1 text-primary" onClick={() => onGo('clues')}>Clues ›</button>}{item.kind === 'timeline' && <button className="ml-1 text-primary" onClick={() => onGo('case')}>Case file ›</button>}</span>
    </motion.div>
  );
}

const WHO: Record<string, string> = { you: 'You · only the GM sees', gm: 'GM · only you', whisper: 'Secret note', system: 'Note', thinking: 'GM' };

// A message between two players: only the two of them see it, and the GM only when one of them asked it in.
function DmLine({ item, latest, fade }: { item: ChatItem; latest: boolean; fade: object }) {
  const m = item.dm!;
  const tint = m.mine ? 'self-end bg-primary/15' : 'bg-card';
  return (
    <motion.div {...fade} className={`flex max-w-[88%] flex-col gap-1 rounded-2xl p-3 ${tint}`}>
      <Label>{m.mine ? `You → ${m.to}` : `${m.from} · only you two`}</Label>
      {m.lines?.length ? <Novel lines={m.lines} animate={latest} /> : <p>{m.text}</p>}
    </motion.div>
  );
}

function PrivateLine({ item, latest, fade, onTell }: { item: ChatItem; latest: boolean; fade: object; onTell: (line: string) => void }) {
  const m = item.entry;
  const mine = item.kind === 'you';
  const tint = mine ? 'self-end bg-primary/15' : item.kind === 'whisper' ? 'bg-layer-hidden/15' : item.kind === 'system' ? 'bg-destructive/15' : 'bg-card';
  return (
    <motion.div {...fade} className={`relative flex max-w-[88%] flex-col gap-1 rounded-2xl p-3 ${tint}`}>
      <Label>{WHO[item.kind] ?? 'GM'}</Label>
      {m?.lines ? <Novel lines={m.lines} animate={latest} /> : <p className={item.kind === 'thinking' ? 'animate-pulse text-muted-foreground' : ''}>{item.text}</p>}
      <PlayLine play={m?.play} />
      <PlayLine play={m?.penalty} />
      {m?.tell && <button className="self-start text-xs text-primary hover:underline" onClick={() => onTell(m.tell!)}>Tell the room</button>}
      {latest && m?.play && <span className="absolute -top-3 right-3"><PlayChip play={m.play} /></span>}
    </motion.div>
  );
}

// One box for everything you say. To: everyone or one person out loud, the GM in private, or a message to one player.
// The GM answers in the room unless switched off, and joins a message between players only when asked in.
function Composer({ view, text, setText, layout, tab, person, target, setTarget, box, barRef, onIdea }: {
  view: PlayerView; text: string; setText: (t: string) => void; layout: Layout; tab: string; person: string | null;
  target: Target | null; setTarget: (t: Target | null) => void; box: React.RefObject<HTMLTextAreaElement | null>;
  barRef: React.RefObject<HTMLDivElement | null>; onIdea: (t: string) => void;
}) {
  const [gmInRoom, setGmInRoom] = useState(true);
  const [gmInDm, setGmInDm] = useState(false);
  const options = composerTargets(view, layout, tab, person);
  const to = (target && options.find((o) => o.kind === target.kind && o.id === target.id)) ?? options[0];
  const busy = to.kind === 'room' ? Boolean(view.publicPending) : to.kind === 'gm' ? Boolean(view.pending) || Boolean(view.round?.vote) || view.transitioning : false;
  const ideas = to.kind === 'gm' ? [...(view.thread ?? [])].reverse().find((m) => m.from === 'gm')?.ideas ?? [] : [];
  const chips: [string, string][] = to.kind === 'gm' ? (ideas.length ? ideas.map((t) => [t, t] as [string, string]) : STARTERS) : [];
  const send = async () => {
    const named = to.id && !new RegExp(`^\\s*${to.label.split(/\s+/)[0]}\\b`, 'i').test(text) ? `${to.label}, ${text}` : text;
    const ok = to.kind === 'gm' ? await act('ask', { token: tokenOf(), kind: 'chat', text })
      : to.kind === 'dm' ? await act('dm', { token: tokenOf(), to: to.id, text, gm: gmInDm })
      : gmInRoom ? await act('public', { token: tokenOf(), text: named })
      : await act('say', { token: tokenOf(), text, to: to.id });
    if (ok) setText('');
  };
  const hint = to.kind === 'gm' ? 'Only you see the answer. Talk and act as much as you like.'
    : to.kind === 'dm' ? (gmInDm ? `Only you and ${to.label} see it, and the GM answers you both.` : `Only you and ${to.label} see it.`)
    : gmInRoom ? 'Everyone hears it. Free.' : 'Everyone hears it. The GM stays quiet.';
  return (
    <div ref={barRef} data-composer className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background pb-[env(safe-area-inset-bottom,0px)]">
      <div className="mx-auto flex max-w-md flex-col gap-2 px-3 pt-2 pb-3">
        <Pinned view={view} />
        <RoomButtons view={view} />
        {chips.length > 0 && (
          <div className="flex gap-1 overflow-x-auto">
            {chips.map(([l, t]) => <button key={l} onClick={() => onIdea(t)} className="shrink-0 rounded-full border border-border px-3 py-1 text-xs">{l}</button>)}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 text-sm">
          <label className="flex min-w-0 items-center gap-2">
            <span className="text-muted-foreground">To</span>
            {options.length < 2 ? <span className="font-medium">{to.label}</span> : (
              <Select value={`${to.kind}:${to.id ?? ''}`} onValueChange={(v) => { const [kind, id] = v.split(':'); setTarget(options.find((o) => o.kind === kind && (o.id ?? '') === id) ?? null); }}>
                <SelectTrigger size="sm" aria-label="Who hears it" className="min-w-0 font-medium"><SelectValue>{to.label}</SelectValue></SelectTrigger>
                <SelectContent>
                  {groupsOf(options).map(([group, list]) => (
                    <SelectGroup key={group || 'all'}>
                      {group && <SelectLabel>{group}</SelectLabel>}
                      {list.map((o) => <SelectItem key={`${o.kind}:${o.id}`} value={`${o.kind}:${o.id ?? ''}`}>{o.label}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            )}
          </label>
          {to.kind === 'room' && <Toggle on={gmInRoom} onChange={setGmInRoom} label="GM answers" />}
          {to.kind === 'dm' && <Toggle on={gmInDm} onChange={setGmInDm} label="Ask the GM in" />}
        </div>
        <div className="flex gap-2">
          <Textarea ref={box} value={text} maxLength={500} rows={3} onChange={(e) => setText(e.target.value)} className="min-h-24 min-w-0 flex-1 bg-card text-base leading-snug"
            placeholder={to.kind === 'gm' ? 'Talk to someone, or do something. "I search the desk."' : to.kind === 'dm' ? `Message ${to.label}` : to.id ? `Say something to ${to.label}, out loud.` : 'Say something to everyone. "Lata, when did the music stop?"'} />
          <Button className="self-end" disabled={!text.trim() || busy} onClick={send}>{busy ? '…' : 'Send'}</Button>
        </div>
        <Muted className="text-xs">{hint}</Muted>
      </div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`shrink-0 text-xs ${on ? 'text-primary' : 'text-muted-foreground'}`}>
      {on ? '✓ ' : ''}{label}
    </button>
  );
}

// Who the box can send to from this tab. One stream offers everything, grouped.
function composerTargets(view: PlayerView, layout: Layout, tab: string, person: string | null): (Target & { group?: string })[] {
  const room = targetsFor(view, 'room');
  const priv = targetsFor(view, 'private');
  if (tab === 'room') return room;
  if (layout === 'three' && tab === 'gm') return [GM_TARGET];
  if (layout === 'three' && tab === 'people') {
    const dms = priv.filter((t) => t.kind === 'dm');
    const one = dms.find((t) => t.id === person);
    return one ? [one] : dms.length ? dms : [GM_TARGET];
  }
  if (tab === 'private') return priv;
  return [...room.map((t) => ({ ...t, group: 'Out loud' })), ...priv.map((t) => ({ ...t, group: 'Private' }))];
}

const groupsOf = (options: (Target & { group?: string })[]): [string, (Target & { group?: string })[]][] => {
  const out = new Map<string, (Target & { group?: string })[]>();
  for (const o of options) out.set(o.group ?? '', [...(out.get(o.group ?? '') ?? []), o]);
  return [...out.entries()];
};

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.section role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()} initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
        className="mx-auto flex max-h-[85dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        <div className="flex items-center justify-between"><h2 className="font-heading text-2xl">{title}</h2><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
        {children}
      </motion.section>
    </motion.div>
  );
}

function DrawerBody({ view, drawer, layout, onLayout, onTell }: { view: PlayerView; drawer: Drawer; layout: Layout; onLayout: (l: Layout) => void; onTell: (line: string) => void }) {
  if (drawer === 'card') {
    const solo = (view.cast?.players ?? []).length < 2;
    return view.card ? (
      <div className="flex flex-col gap-4">
        <CardFlip card={view.card} caseQuestion={view.caseQuestion} overridesLeft={view.overridesLeft ?? 0} overridesTotal={view.overridesTotal ?? 0} persona={view.persona} rules={view.rules} profile={view.profile} onForget={() => act('forget', { token: tokenOf() })} />
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>Chat view:</span>
          {LAYOUTS.filter(([l]) => !(solo && l === 'three')).map(([l, label]) => (
            <button key={l} onClick={() => onLayout(l)} className={l === layout ? 'font-medium text-primary' : 'hover:text-foreground'}>{label}</button>
          ))}
        </div>
      </div>
    ) : null;
  }
  if (drawer === 'goals') return <GoalsPanel caseQuestion={view.caseQuestion} job={view.round?.objective} goal={view.card?.goal} steps={view.card?.goal_steps ?? []} open={view.recap?.open ?? []} watch={view.card?.watch ?? null} watched={Boolean(view.card?.watched)} />;
  if (drawer === 'clues') return <CluesBody view={view} onTell={onTell} />;
  if (drawer === 'map') return <GoSomewhere view={view} />;
  if (drawer === 'people') return <PeopleBody view={view} />;
  return (
    <div className="flex flex-col gap-4">
      <Recap recap={view.recap} />
      <section><Label>Timeline</Label><div className="mt-2"><Timeline timeline={view.timeline} /></div></section>
      <section><Label>Where people say they were</Label><div className="mt-2"><Alibis alibis={view.alibis} me={view.me.name} /></div></section>
      <section><Label>The place and the story so far</Label><div className="mt-2 flex flex-col gap-3"><ScenePicture svg={view.illustration} /><Facts lines={view.background} /></div></section>
    </div>
  );
}

function PeopleBody({ view }: { view: PlayerView }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState<Record<string, number>>({});
  return (
    <div className="flex flex-col gap-5">
      {view.setup?.roundStyle === 'hotseats' && !(view.seat as { status?: string } | null)?.status && (
        <PointButtons people={view.cast?.players} me={view.me.id} onPoint={(to) => act('point', { token: tokenOf(), to })} />
      )}
      <PeopleList people={view.people} ties={view.ties} open={open} seen={seen} onToggle={(id, isOpen) => {
        setOpen((s) => { const n = new Set(s); if (isOpen) n.add(id); else n.delete(id); return n; });
        if (isOpen) setSeen((s) => ({ ...s, [id]: view.people?.find((p: { id: string }) => p.id === id)?.facts.length ?? 0 }));
      }} />
    </div>
  );
}

// Tap a place on the map, or a button under it, then confirm. Going is free and everyone sees it.
function GoSomewhere({ view }: { view: PlayerView }) {
  const [pick, setPick] = useState<string | null>(null);
  const places = ((view.map as { places?: { id: string; name: string; public_info?: string }[] } | null)?.places ?? []);
  const positions = ((view.map as { positions?: Record<string, string> } | null)?.positions ?? {});
  const hereId = places.find((p) => p.name === view.here)?.id ?? positions[view.me.id] ?? null;
  const playing = view.status === 'playing' && !view.meeting;
  const chosen = places.find((p) => p.id === pick);
  const cast = [...(view.cast?.players ?? []), ...(view.cast?.npcs ?? [])] as { id: string; name: string }[];
  return (
    <div className="flex flex-col gap-3">
      <WorldMap view={view} me={view.me.id} selected={pick} onSelect={setPick} className="h-[58dvh]" />
      {chosen ? (
        <PlacePanel name={chosen.name} info={chosen.public_info} here={chosen.id === hereId} canGo={playing}
          people={cast.filter((c) => positions[c.id] === chosen.id && c.id !== view.me.id).map((c) => c.name)}
          trip={tripFrom(view, hereId, chosen.id)}
          onGo={async () => { if (await act('go', { token: tokenOf(), place: chosen.id })) setPick(null); }}
          onInvite={(view.cast?.players ?? []).length > 1 ? async () => { if (await act('invite', { token: tokenOf(), place: chosen.id })) setPick(null); } : undefined} />
      ) : <Muted className="text-xs">Tap a place to see who is there{playing ? ' and go there. Going is free; everyone sees you go' : ''}.</Muted>}
      {view.meeting && <Muted className="text-xs">A meeting is on. Moves wait until it ends.</Muted>}
    </div>
  );
}

export function CluesBody({ view, onTell = () => {} }: { view: PlayerView; onTell?: (line: string) => void }) {
  const key = `detective-notes-${view.gameId}`;
  const [notes, setNotes] = useState(() => storage.get(key) ?? '');
  const shared = new Set((view.sharedClues ?? []).map((c: { id: string }) => c.id));
  return (
    <div className="flex flex-col gap-4">
      <KeyObjects objects={view.keyObjects ?? []} />
      <Label>Your clues</Label>
      {view.clues?.length ? view.clues.map((c) => (
        <div key={c.id} className="flex flex-col gap-1 rounded-xl bg-card p-4">
          <b>{c.name}{c.destroyed && <span className="ml-2 rounded bg-destructive/20 px-1.5 text-xs text-destructive">now gone</span>}</b>
          <p className="text-sm">{c.shows}</p>
          {shared.has(c.id) ? <Muted className="text-xs">Everyone can see this.</Muted>
            : c.told ? (
              <span className="flex flex-wrap items-baseline gap-x-3 text-xs text-muted-foreground">You told the room in your own words.
                <button className="hover:text-foreground" onClick={() => act('share', { token: tokenOf(), clueId: c.id })}>Show all of it</button></span>
            ) : (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Button size="sm" variant="secondary" onClick={() => act('share', { token: tokenOf(), clueId: c.id })}>Show everyone</Button>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => onTell(`I found ${c.name.replace(/^(a|an|the)\s+/i, '').toLowerCase()}: ${c.shows}`)}>Tell it my way</button>
              </span>
            )}
        </div>
      )) : <Muted>Nothing yet. Acts find clues: search a place, look closely at something.</Muted>}
      <Label>Shown to everyone</Label>
      <SharedClues clues={view.sharedClues} />
      <Label>Notes</Label>
      <Muted className="text-xs">Only on this phone.</Muted>
      <Textarea value={notes} onChange={(e) => { setNotes(e.target.value); storage.set(key, e.target.value); }} className="min-h-[25vh] bg-card" />
    </div>
  );
}

// Start from your story: who you are, where you are right now, and what to try first. An old world with no
// first lead falls back to a first line for the room.
function Intro({ view, onPick, onTry, onClose }: { view: PlayerView; onPick: (line: string) => void; onTry: (idea: string) => void; onClose: () => void }) {
  const card = view.card!;
  const lead = (view.thread ?? []).find((m) => m.from === 'gm');
  const ideas = lead?.ideas ?? [];
  const lines = ideas.length ? [] : introLines({ name: card.name, role: card.role, intro_line: card.intro_line ?? '', hook: card.hook });
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.section role="dialog" aria-label="Your story so far" initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }}
        className="mx-auto flex max-h-[90dvh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-3xl bg-background p-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]">
        <Label>Your story so far</Label>
        <h2 className="font-heading text-3xl">{card.name}</h2>
        {card.role && <Muted>{card.role}</Muted>}
        <p className="leading-relaxed">{card.backstory || card.public_info}</p>
        {card.hook && <p className="rounded-xl bg-card p-3 leading-relaxed">{card.hook}</p>}
        {ideas.length > 0 ? (
          <>
            <Label className="mt-2">Right now</Label>
            <div className="flex flex-col gap-1">{(lead?.lines ?? []).map((l, i) => <p key={i} className="leading-relaxed">{l.text}</p>)}</div>
            <Label className="mt-2">Try first</Label>
            <div className="flex flex-col gap-2">
              {ideas.map((t) => <Button key={t} variant="secondary" className="h-auto justify-start py-3 text-left whitespace-normal" onClick={() => onTry(t)}>{t}</Button>)}
            </div>
            <Muted className="text-xs">Tap one and send it to the GM, or write your own. Your card is always under Me.</Muted>
          </>
        ) : (
          <>
            <Label className="mt-2">Introduce yourself to the room</Label>
            <div className="flex flex-col gap-2">
              {lines.map((l) => <Button key={l} variant="secondary" className="h-auto justify-start py-3 text-left whitespace-normal" onClick={() => onPick(l)}>{l}</Button>)}
            </div>
            <Muted className="text-xs">Tap one to start, then change it as you like. Your card is always under Me.</Muted>
          </>
        )}
        <Button variant="ghost" onClick={onClose}>Just look around first</Button>
      </motion.section>
    </motion.div>
  );
}
