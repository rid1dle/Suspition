import { Label, Muted } from './label';
import { Timeline } from './panels';

interface Person { id: string; icon?: string; name: string; role: string; player?: string; info: string; kind: string; minor?: boolean; alibi: { time: string; where: string }[]; facts: { fact: string; round: number }[] }

const KINDS: [string, string][] = [['player', 'Players'], ['npc', 'Played by the GM'], ['minor', 'Minor, just part of the place']];

// Everything public about each person: one line each at rest, facts on tap.
export function PeopleList({ people, openAll = false, open = new Set<string>(), seen = {}, onToggle }: { people: Person[] | null | undefined; openAll?: boolean; open?: Set<string>; seen?: Record<string, number>; onToggle?: (id: string, open: boolean) => void }) {
  if (!people?.length) return null;
  const kindOf = (p: Person) => (p.minor ? 'minor' : p.kind);
  return (
    <div className="flex flex-col gap-5">
      {KINDS.map(([kind, title]) => {
        const list = people.filter((p) => kindOf(p) === kind);
        if (!list.length) return null;
        return (
          <div key={kind} className="flex flex-col gap-1">
            <Label>{title}</Label>
            {list.map((p) => {
              const n = p.facts.length;
              const unseen = openAll ? 0 : n - (seen[p.id] ?? 0);
              return (
                <details key={p.id} data-person={p.id} open={openAll || open.has(p.id)} onToggle={(e) => onToggle?.(p.id, (e.target as HTMLDetailsElement).open)}
                  className={`group rounded-lg px-2 py-2 open:bg-muted/40 ${p.minor ? 'text-muted-foreground' : ''}`}>
                  <summary className="flex cursor-pointer list-none items-center gap-2">
                    {p.icon && <span className="text-xl">{p.icon}</span>}
                    <span className="min-w-0 flex-1"><b>{p.name}</b> <span className="text-sm text-muted-foreground">{p.role}{p.player ? ` · ${p.player}` : ''}</span></span>
                    <span data-new={unseen > 0 ? 'true' : undefined} className={`text-xs ${unseen > 0 ? 'rounded-full bg-primary px-2 py-0.5 text-primary-foreground' : 'text-muted-foreground'}`}>{n ? `${n} fact${n === 1 ? '' : 's'}` : ''}</span>
                  </summary>
                  <div className="mt-2 flex flex-col gap-2 pl-1 text-sm">
                    <p>{p.info}</p>
                    {n ? (
                      <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-primary">
                        {p.facts.map((f, i) => <li key={i} className={i < unseen ? 'text-primary' : ''}>{f.fact} <span className="text-xs text-muted-foreground">round {f.round}</span></li>)}
                      </ul>
                    ) : <Muted>Nothing new about them yet.</Muted>}
                    {!!p.alibi.length && <div className="flex flex-col gap-2"><span className="text-muted-foreground">Says they were:</span><Timeline timeline={p.alibi.map((a) => ({ time: a.time, event: a.where }))} /></div>}
                  </div>
                </details>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// One tap to point at someone. Free; the table shows it and they get 20 seconds to defend.
export function PointButtons({ people, me, onPoint }: { people: { id: string; name: string }[] | null | undefined; me: string; onPoint: (id: string) => void }) {
  const others = (people ?? []).filter((p) => p.id !== me);
  if (!others.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <Label>Who do you suspect? Point, out loud</Label>
      <div className="flex flex-wrap gap-2">
        {others.map((p) => (
          <button key={p.id} onClick={() => onPoint(p.id)} className="rounded-full border border-destructive/60 px-3 py-1.5 text-sm hover:bg-destructive/15">Point at {p.name}</button>
        ))}
      </div>
    </div>
  );
}
