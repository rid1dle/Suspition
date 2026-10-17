'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SearchIcon, UploadIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toaster } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { hostApi, hostToken } from '@/lib/host';

type Learning = 'real' | 'test' | 'outlier' | 'playtest';

interface GameSummary {
  id: string;
  title: string;
  day: string;
  status: string;
  players: string[];
  winner: string | null;
  learning: Learning;
  note: string;
}

type ImportAnswer = { imported: string } | { skipped: string } | { ask: { username: string; name: string }[] };

const FILTERS: [Learning | 'all', string][] = [['all', 'All'], ['real', 'Real'], ['test', 'Test'], ['outlier', 'Outlier'], ['playtest', 'Playtest']];
const TAGS: [Learning, string][] = [['real', 'Real'], ['test', 'Test'], ['outlier', 'Outlier']];
const STATUS: Record<string, string> = { lobby: 'In the lobby', generating: 'Being written', reading: 'Reading cards', playing: 'Playing', final: 'Final answers', reveal: 'Finished', failed: 'Failed' };

function summaryLine(g: GameSummary) {
  const parts = [g.day, g.players.join(', ') || 'No players', STATUS[g.status] ?? g.status];
  if (g.winner) parts.push(g.winner === 'investigators' ? 'Detectives won' : 'Culprits got away');
  return parts.join(' · ');
}

function NoteField({ game, onSave }: { game: GameSummary; onSave: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(game.note);
  if (!open && !game.note) {
    return <button className="self-start text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen(true)}>Add a note</button>;
  }
  return (
    <Input
      className="h-7 text-xs"
      autoFocus={open}
      value={text}
      placeholder="Why this game is tagged this way"
      maxLength={300}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setOpen(false);
        if (text !== game.note) onSave(text);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function GamesList() {
  const [games, setGames] = useState<GameSummary[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Learning | 'all'>('all');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<{ game: unknown; ask: { username: string; name: string }[]; answers: Record<string, 'same' | 'different'> } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    hostApi<{ games: GameSummary[] }>('games').then((d) => setGames(d.games)).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const withPlayers = (games ?? []).filter((g) => g.players.length);
    const c: Record<string, number> = { all: withPlayers.length };
    for (const g of withPlayers) c[g.learning] = (c[g.learning] ?? 0) + 1;
    return c;
  }, [games]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (games ?? []).filter((g) => g.players.length && (filter === 'all' || g.learning === filter)
      && (!q || `${g.title} ${g.players.join(' ')} ${g.note}`.toLowerCase().includes(q)));
  }, [games, filter, search]);

  const update = async (g: GameSummary, change: { learning?: Learning; note?: string }) => {
    const next = { ...g, ...change };
    setGames((list) => list?.map((x) => (x.id === g.id ? next : x)) ?? null);
    try {
      await hostApi('games/learning', { id: g.id, learning: next.learning, note: next.note });
      if (change.learning) toast(change.learning === 'real' ? `"${g.title || 'Untitled'}" now teaches the game.` : `"${g.title || 'Untitled'}" is left out of learning.`);
    } catch (e) {
      toast.error((e as Error).message);
      load();
    }
  };

  const sendImport = async (game: unknown, answers: Record<string, 'same' | 'different'> = {}) => {
    try {
      const out = await hostApi<ImportAnswer>('games/import', { game, people: answers });
      if ('ask' in out) return setPending({ game, ask: out.ask, answers: {} });
      setPending(null);
      toast('imported' in out ? 'Game added.' : 'That game is already here.');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const readFile = async (file: File) => {
    try {
      await sendImport(JSON.parse(await file.text()));
    } catch {
      toast.error('That file is not a saved game.');
    }
  };

  if (!hostToken()) {
    return <p className="text-muted-foreground">Open this page from the table screen. It needs the host link.</p>;
  }

  return (
    <div
      className="flex flex-col gap-6"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) readFile(file);
      }}
    >
      <Toaster theme="dark" position="bottom-center" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Saved games</h1>
          <p className="text-sm text-muted-foreground">Only games marked Real teach the game. Nothing here is ever deleted.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
          <UploadIcon /> Import a game
        </Button>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
      </header>

      {pending && (
        <section className="flex flex-col gap-3 rounded-lg bg-card p-4">
          <p className="text-sm">Some names in that game are already here. Is each one the same person?</p>
          {pending.ask.map((p) => (
            <div key={p.username} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="min-w-32">{p.name} <span className="text-muted-foreground">({p.username})</span></span>
              <ToggleGroup type="single" variant="outline" size="sm" value={pending.answers[p.username] ?? ''}
                onValueChange={(v) => v && setPending({ ...pending, answers: { ...pending.answers, [p.username]: v as 'same' | 'different' } })}>
                <ToggleGroupItem value="same">Same person</ToggleGroupItem>
                <ToggleGroupItem value="different">Different person</ToggleGroupItem>
              </ToggleGroup>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending.ask.some((p) => !pending.answers[p.username])} onClick={() => sendImport(pending.game, pending.answers)}>Add the game</Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
          </div>
        </section>
      )}

      <div className="flex flex-nowrap items-center gap-3">
        <div className="relative min-w-32 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="border-0 bg-transparent pl-8 shadow-none" placeholder="Search by title, player or note" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex shrink-0 gap-3 text-sm">
          {FILTERS.filter(([value]) => value === 'all' || value === filter || counts[value]).map(([value, label]) => (
            <button key={value} onClick={() => setFilter(value)}
              className={cn('whitespace-nowrap text-muted-foreground hover:text-foreground', filter === value && 'font-medium text-foreground')}>
              {label} {counts[value] ?? 0}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!games && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {games && !shown.length && <p className="text-sm text-muted-foreground">No games here yet.</p>}

      <ul className="flex flex-col divide-y divide-border/50">
        {shown.map((g) => (
          <li key={g.id} className={cn('flex flex-wrap items-start justify-between gap-3 py-4', g.learning !== 'real' && 'text-muted-foreground')}>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={cn('font-medium', g.learning === 'real' && 'text-foreground')}>{g.title || (g.status === 'failed' ? 'A game that never started' : 'Untitled game')}</span>
              <span className="text-xs">{summaryLine(g)}</span>
              <NoteField game={g} onSave={(note) => update(g, { note })} />
            </div>
            {g.learning === 'playtest' ? (
              <Badge variant="secondary">Playtest</Badge>
            ) : (
              <ToggleGroup type="single" variant="outline" size="sm" value={g.learning}
                onValueChange={(v) => v && v !== g.learning && update(g, { learning: v as Learning })}>
                {TAGS.map(([value, label]) => <ToggleGroupItem key={value} value={value}>{label}</ToggleGroupItem>)}
              </ToggleGroup>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
