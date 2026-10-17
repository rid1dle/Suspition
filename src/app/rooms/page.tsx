import { WorldRoom } from '@/components/world/room';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { roomTheme, guessRoom } from '../../../server/room.ts';

// A look at one world's room without a game: /rooms?setting=a monsoon wedding&tone=tense
export default async function RoomsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const room = roomTheme({ ...guessRoom(q.setting ?? '', q.tone ?? 'tense'), ...(q.seed ? { seed_color: `#${q.seed}` } : {}), ...(q.font ? { font_pair: q.font } : {}), ...(q.ambient ? { ambient: q.ambient } : {}), ...(q.intensity ? { intensity: q.intensity } : {}) } as never);
  return (
    <WorldRoom room={room}>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        <p className="text-sm text-muted-foreground">Room preview · {room.fontPair} · {room.texture} · {room.ambient}</p>
        <h1 className="text-4xl">The Monsoon Wedding</h1>
        <div className="rounded-xl bg-card p-5">
          <p className="text-xs tracking-widest text-muted-foreground uppercase">The big question</p>
          <p className="mt-1 text-2xl">Who switched off the lights before the vows?</p>
          <p className="mt-3 text-muted-foreground">Round 1 of 3 · Ask the caterer where the fuse box key went.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button>Ask out loud</Button>
            <Button variant="secondary">Ask in private</Button>
            <Badge>+1 Searching</Badge>
          </div>
        </div>
        <p className="leading-relaxed">Rain drums on the tin roof. The band has stopped. Somebody in this room knows why the lights went out at 9:40.</p>
      </main>
    </WorldRoom>
  );
}
