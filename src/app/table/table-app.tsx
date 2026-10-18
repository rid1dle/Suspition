'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useReducedMotion } from 'motion/react';
import { useLowFrameRate } from '@/components/world/table-effects';
import { PARTICLE_AMBIENTS, richEffects } from '@/lib/effects';
import { toast } from 'sonner';
import { Music2Icon, Volume2Icon, VolumeXIcon, MicIcon, SparklesIcon, LibraryIcon } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { WorldRoom, useStoryLook } from '@/components/world/room';
import { useLive } from '@/lib/live';
import { api, storage } from '@/lib/api';
import { Score } from '@/lib/music';
import { intensityFor, cuesBetween } from '@/lib/music-theory';
import { Narrator, narrationFor } from '@/lib/narration';
import { tableSound } from '@/lib/alerts';
import { Sfx } from '@/lib/sfx';
import type { TableView } from '@/lib/views';
import { RejoinPanel } from '@/components/game/rejoin';
import { Setup, Generating, Failed } from './setup';
import { Reading } from './reading';
import { Playing } from './playing';
import { FinalWait, Reveal } from './endgame';

const TableEffects = dynamic(() => import('@/components/world/table-effects'), { ssr: false });

export function useHost() {
  const [host, setHost] = useState<string | null>(null);
  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('host');
    if (fromHash) storage.set('detective-host', fromHash);
    setHost(fromHash || storage.get('detective-host'));
  }, []);
  return [host, (h: string) => { storage.set('detective-host', h); history.replaceState(null, '', `#host=${h}`); setHost(h); }] as const;
}

export function hostAct(host: string | null) {
  return (path: string, body: Record<string, unknown> = {}) => api(path, { host, ...body }).catch((err: Error) => {
    toast.error(err.message);
    return null;
  });
}

// The music, narrator and sound classes are untyped JS ports; their fields are used loosely here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Media { score: any; narrator: any; sfx: any }

function useMedia(view: TableView | null) {
  const media = useRef<Media | null>(null);
  const last = useRef<TableView | null>(null);
  if (!media.current && typeof window !== 'undefined') {
    const score = new Score();
    media.current = { score, narrator: new Narrator({ onStart: () => score.duck(true), onEnd: () => score.duck(false) }), sfx: new Sfx() };
    media.current.score.volume = Number(storage.get('detective-music-volume') ?? 0.6);
    media.current.sfx.enabled = storage.get('detective-sfx') !== 'off';
    media.current.narrator.voiceName = storage.get('detective-voice');
  }
  useEffect(() => {
    const m = media.current;
    if (!m || !view) return;
    m.score.setTheme(view.music, view.setup?.tone);
    m.sfx.setSet(view.room?.soundSet);
    m.score.setIntensity(intensityFor(view));
    const cues = cuesBetween(last.current, view) as string[];
    for (const cue of cues) m.score.cue(cue);
    const sound = tableSound(last.current, view);
    if (sound && !(m.score.playing && ((sound === 'phase' && cues.includes('phase')) || (sound === 'hint' && cues.includes('hint'))))) m.sfx.play(sound);
    m.narrator.say(narrationFor(last.current, view));
    last.current = view;
  }, [view]);
  return media.current;
}

function MediaBar({ media, view, host, calm, setCalm }: { media: Media | null; view: TableView | null; host: string | null; calm: boolean; setCalm: (c: boolean) => void }) {
  const [, force] = useState(0);
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      if (media?.score.playing) setLevel(Math.min(1.2, media.score.level().rms * 6));
      force((n) => n + 1);
    }, 250);
    return () => clearInterval(t);
  }, [media]);
  if (!media) return null;
  const { score, narrator, sfx } = media;
  const locked = sfx.enabled && sfx.ctx?.state !== 'running';
  const chip = (on: boolean) => `flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${on ? 'border-primary text-primary' : 'border-border text-muted-foreground'}`;
  return (
    <aside className="fixed inset-x-0 bottom-0 z-40 flex flex-wrap items-center gap-2 border-t border-border bg-background/85 px-4 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur">
      <button className={chip(score.playing)} aria-pressed={score.playing} onClick={async () => {
        if (score.playing) { score.stop(); storage.set('detective-music', 'off'); } else { await score.start(); storage.set('detective-music', 'on'); }
        force((n) => n + 1);
      }}>
        <Music2Icon className="size-3.5" style={{ transform: `scale(${1 + level * 0.4})` }} /> {score.playing ? 'Music on' : 'Music off'}
      </button>
      <Slider min={0} max={1} step={0.05} defaultValue={[score.volume]} aria-label="Music volume" className="w-24"
        onValueChange={([v]) => { score.setVolume(v); storage.set('detective-music-volume', String(v)); }} />
      {narrator.available && (
        <button className={chip(narrator.enabled)} aria-pressed={narrator.enabled} onClick={() => {
          narrator.enabled = !narrator.enabled;
          if (!narrator.enabled) narrator.stop(); else narrator.say(['Voice on.']);
          storage.set('detective-voice-on', narrator.enabled ? 'on' : 'off');
          force((n) => n + 1);
        }}><MicIcon className="size-3.5" /> {narrator.enabled ? 'Voice on' : 'Voice off'}</button>
      )}
      {narrator.enabled && narrator.voices().length > 1 && (
        <Select defaultValue={narrator.voiceName ?? undefined}
          onValueChange={(name) => { narrator.voiceName = name; storage.set('detective-voice', name); narrator.stop(); narrator.say(['This is my voice.']); }}>
          <SelectTrigger size="sm" aria-label="Narrator voice" className="text-xs"><SelectValue placeholder="Voice" /></SelectTrigger>
          <SelectContent>
            {narrator.voices().map((v: SpeechSynthesisVoice) => <SelectItem key={v.name} value={v.name}>{v.name}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <button className={chip(sfx.enabled && !locked)} aria-pressed={sfx.enabled} onClick={() => {
        if (sfx.enabled && locked) { sfx.unlock(); setTimeout(() => sfx.play('news'), 60); return; }
        sfx.enabled = !sfx.enabled;
        storage.set('detective-sfx', sfx.enabled ? 'on' : 'off');
        sfx.unlock();
        if (sfx.enabled) setTimeout(() => sfx.play('news'), 60);
        force((n) => n + 1);
      }}>{sfx.enabled ? <Volume2Icon className="size-3.5" /> : <VolumeXIcon className="size-3.5" />} {!sfx.enabled ? 'Sounds off' : locked ? 'Tap anywhere for sounds' : 'Sounds on'}</button>
      <button className={chip(!calm)} aria-pressed={!calm} onClick={() => { setCalm(!calm); storage.set('detective-calm', calm ? 'off' : 'on'); }}><SparklesIcon className="size-3.5" /> {calm ? 'Calm screen' : 'Effects on'}</button>
      {host && <a className={chip(false)} href={`/games#host=${encodeURIComponent(host)}`} target="_blank"><LibraryIcon className="size-3.5" /> Saved games</a>}
      {host && view && ['reading', 'playing', 'final'].includes(view.status) && <Rejoin host={host} players={view.players} chip={chip(false)} />}
      <span className="ml-auto truncate text-xs text-muted-foreground">{view?.musicDescription ?? ''}</span>
    </aside>
  );
}

function Rejoin({ host, players, chip }: { host: string; players: { id: string; name: string }[]; chip: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<{ name: string; url: string } | null>(null);
  const pick = async (id: string) => {
    const res = await fetch(`/api/rejoin?host=${encodeURIComponent(host)}&player=${encodeURIComponent(id)}`);
    if (res.ok) setCode(await res.json());
  };
  return (
    <>
      <button className={chip} onClick={() => setOpen((o) => !o)}>Rejoin a player</button>
      {open && (
        <div className="fixed bottom-16 left-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
          <RejoinPanel players={players} code={code} onPick={pick} onClose={() => { setOpen(false); setCode(null); }} />
        </div>
      )}
    </>
  );
}

export function TableApp() {
  const [host, setHost] = useHost();
  const { view } = useLive<TableView>('/events');
  const media = useMedia(view);
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    setCalm(storage.get('detective-calm') === 'on');
  }, []);
  const act = hostAct(host);
  const readNow = (lines: string[]) => {
    const n = media?.narrator;
    if (!n?.available) return toast('This browser cannot read out loud.');
    const was = n.enabled;
    n.enabled = true;
    n.stop();
    n.say(lines);
    n.enabled = was;
  };
  const props = { view: view!, host, act, readNow, onNewGame: (h: string) => setHost(h) };
  const low = useLowFrameRate();
  const reduced = Boolean(useReducedMotion());
  const room = view?.room ?? null;
  const rich = richEffects({ room, calm, low, reduced });
  const look = useStoryLook(view);
  return (
    <WorldRoom room={room} calm={calm} particles={rich && PARTICLE_AMBIENTS.has(room!.ambient)} tension={calm ? 0 : look.tension} beat={calm ? 0 : look.beat} backdrop={view?.picture ?? view?.illustration ?? null}>
      {rich && <TableEffects room={room!} tension={calm ? 0 : look.tension} />}
      <Toaster theme="dark" position="top-center" />
      <div className="min-h-dvh pb-16">
        {!view && <div className="flex min-h-dvh items-center justify-center text-muted-foreground">Connecting…</div>}
        {view?.status === 'lobby' && <Setup {...props} />}
        {view?.status === 'generating' && <Generating {...props} />}
        {view?.status === 'failed' && <Failed {...props} />}
        {view?.status === 'reading' && <Reading {...props} />}
        {view?.status === 'playing' && <Playing {...props} />}
        {view?.status === 'final' && <FinalWait {...props} />}
        {view?.status === 'reveal' && <Reveal {...props} />}
      </div>
      <MediaBar media={media} view={view} host={host} calm={calm} setCalm={setCalm} />
    </WorldRoom>
  );
}

export type TableProps = { view: TableView; host: string | null; act: ReturnType<typeof hostAct>; readNow: (lines: string[]) => void; onNewGame: (host: string) => void };
