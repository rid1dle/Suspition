'use client';

import { useEffect, useRef, useState } from 'react';
import { PlayIcon, SquareIcon, SkipForwardIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Label, Muted } from '@/components/game/label';
import { Music } from '@/lib/music';
import { FIXTURE } from '@/lib/soundtrack/fixture';
import { cleanSoundtrack } from '@/lib/soundtrack/clean';
import type { Direction } from '@/lib/soundtrack/types';

const STINGERS: [cue: string, label: string][] = [['phase', 'Round starts'], ['seat', 'Hot seat'], ['vote', 'Vote opens'], ['reveal', 'Reveal'], ['hint', 'Hint']];
const SOURCE: Record<string, string> = { composed: 'Real instruments', loading: 'Loading the instruments…', simple: 'Simple music' };

// A pasted soundtrack: the GM's whole answer, or just a list of directions. Cleaned like the GM's output.
export function parseSoundtrack(text: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const obj = Array.isArray(raw) ? { directions: raw } : raw;
  const list = (obj as { directions?: { rounds?: unknown[] }[] })?.directions;
  const rounds = Array.isArray(list) ? Math.max(1, ...list.map((d) => (Array.isArray(d?.rounds) ? d.rounds.length : 0))) : 1;
  return cleanSoundtrack(obj, { rounds, names: [] });
}

export function MusicLab() {
  const music = useRef<Music | null>(null);
  if (!music.current && typeof window !== 'undefined') music.current = new Music();
  const [directions, setDirections] = useState<Direction[]>(FIXTURE.directions);
  const [chosen, setChosen] = useState(0);
  const [round, setRound] = useState(0);
  const [tension, setTension] = useState(0.3);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState('');
  const [, tick] = useState(0);
  const [level, setLevel] = useState(0);
  const m = music.current;

  useEffect(() => {
    m?.setSoundtrack({ status: 'ready', directions, chosen });
  }, [m, directions, chosen]);
  useEffect(() => {
    m?.setRound(round);
  }, [m, round]);
  useEffect(() => {
    m?.setIntensity(tension);
  }, [m, tension]);
  useEffect(() => {
    const t = setInterval(() => {
      setLevel(m?.playing ? m.level().rms : 0);
      tick((n) => n + 1);
    }, 250);
    return () => {
      clearInterval(t);
      m?.stop();
    };
  }, [m]);

  const d = directions[chosen] ?? directions[0];
  const usePasted = () => {
    const s = parseSoundtrack(pasted);
    if (!s) return setError('That is not a soundtrack the game can play.');
    setError('');
    setDirections(s.directions);
    setChosen(0);
    setRound(0);
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-1 rounded-2xl bg-card p-6">
        <h1 className="font-heading text-3xl">Music lab</h1>
        <Muted>Try a soundtrack without a game. Pick a direction, a round and the tension, then press Play.</Muted>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-card p-5">
        <Label>Direction</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {directions.map((x, i) => (
            <button key={i} type="button" aria-pressed={i === chosen} onClick={() => setChosen(i)}
              className={`flex flex-col gap-1 rounded-xl p-3 text-left transition ${i === chosen ? 'bg-primary/15 ring-2 ring-primary' : 'bg-muted/40 hover:bg-muted/70'}`}>
              <span className="font-heading text-lg">{x.name}</span>
              <span className="text-sm">{x.line}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl bg-card p-5">
        <div className="flex flex-col gap-2">
          <Label>Round</Label>
          <div className="flex flex-wrap gap-2">
            {(d?.rounds ?? []).map((r, i) => (
              <Button key={i} size="sm" variant={i === round ? 'default' : 'outline'} title={r.mood} onClick={() => setRound(i)}>{`Round ${i + 1}`}</Button>
            ))}
          </div>
          {d?.rounds[round]?.mood && <Muted>{d.rounds[round].mood}</Muted>}
        </div>
        <div className="flex flex-col gap-2">
          <Label>Tension: {tension.toFixed(2)}</Label>
          <Slider min={0} max={1} step={0.05} value={[tension]} aria-label="Tension" className="max-w-md" onValueChange={([v]) => setTension(v)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={async () => { if (m?.playing) m.stop(); else await m?.start(); tick((n) => n + 1); }}>
            {m?.playing ? <SquareIcon /> : <PlayIcon />}{m?.playing ? 'Stop' : 'Play'}
          </Button>
          <Button variant="outline" onClick={() => m?.nextPiece()}><SkipForwardIcon />Next piece</Button>
          <span className="text-sm text-muted-foreground">{SOURCE[m?.source ?? 'simple']}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {STINGERS.map(([cue, label]) => <Button key={cue} size="sm" variant="secondary" onClick={() => m?.cue(cue)}>{label}</Button>)}
        </div>
        <div className="flex items-center gap-3">
          <Label>Level</Label>
          <div className="h-2 w-48 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Music level" aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(level.toFixed(3))}>
            <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.min(100, level * 600)}%` }} />
          </div>
          <span className="font-mono text-xs text-muted-foreground">{level.toFixed(3)}</span>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl bg-card p-5">
        <Label>Paste a soundtrack</Label>
        <Muted>Paste the GM&apos;s soundtrack JSON to hear it. It is cleaned the same way as in a game.</Muted>
        <Textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} aria-label="Soundtrack JSON" className="font-mono text-xs" />
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={usePasted}>Use this JSON</Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      </section>
    </div>
  );
}
