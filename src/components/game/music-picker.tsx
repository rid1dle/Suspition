'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label, Muted } from '@/components/game/label';
import type { TableSoundtrack } from '@/lib/soundtrack/types';

const PREVIEW_S = 10;

type Source = 'composed' | 'loading' | 'simple';

// The short line on the music bar: what plays now, in plain words.
export function musicLine(source: Source, soundtrack: TableSoundtrack | null, oldTheme: string | null): string {
  if (!soundtrack) return oldTheme ?? '';
  if (source === 'composed') return soundtrack.directions?.[soundtrack.chosen ?? 0]?.line ?? '';
  if (source === 'loading') return 'Loading the instruments…';
  return 'Simple music';
}

function useCountdown(running: boolean) {
  const [left, setLeft] = useState(PREVIEW_S);
  useEffect(() => {
    setLeft(PREVIEW_S);
    if (!running) return;
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);
  return left;
}

export function MusicPicker({ soundtrack, host, previewing, onListen, onPick }: { soundtrack: TableSoundtrack | null; host: boolean; previewing: number | null; onListen: (i: number) => void; onPick: (i: number) => void }) {
  const left = useCountdown(previewing != null);
  if (!soundtrack) return null;
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-card p-5">
      <Label>Music for this game</Label>
      {soundtrack.status === 'writing' && <Muted>The GM is writing the music. Simple music plays until it is ready.</Muted>}
      {soundtrack.status === 'failed' && <Muted>Simple music this game. The GM could not write a soundtrack.</Muted>}
      {soundtrack.status === 'ready' && (
        <ul className="flex flex-col gap-3">
          {(soundtrack.directions ?? []).map((d, i) => {
            const chosen = i === (soundtrack.chosen ?? 0);
            return (
              <li key={i} className={`flex flex-col gap-2 rounded-xl p-3 ${chosen ? 'bg-primary/10 ring-1 ring-primary' : 'bg-muted/40'}`}>
                <div className="font-heading text-lg leading-snug">{d.name}</div>
                {d.line && <p className="text-sm">{d.line}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => onListen(i)}>{previewing === i ? `Playing… ${left}s` : 'Listen'}</Button>
                  {chosen ? <Badge>Chosen</Badge> : host && <Button size="sm" onClick={() => onPick(i)}>Use this</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
