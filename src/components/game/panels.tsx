import type { GameEvent } from '@/lib/views';
import { Label, Muted } from './label';
import { Novel } from './novel';

export function ScenePicture({ svg, className = '' }: { svg: string | null | undefined; className?: string }) {
  if (!svg) return null;
  return <img className={`w-full rounded-xl ${className}`} alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} />;
}

export function Facts({ lines }: { lines: string[] }) {
  if (!lines?.length) return null;
  return <ul className="flex list-disc flex-col gap-1 pl-5 marker:text-primary">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>;
}

export function Timeline({ timeline }: { timeline: { time?: string; event: string }[] | null | undefined }) {
  if (!timeline?.length) return <Muted>Nothing yet.</Muted>;
  return (
    <ol className="flex flex-col gap-2 border-l border-border pl-4">
      {timeline.map((t, i) => (
        <li key={i} className="relative grid grid-cols-[4.5rem_1fr] gap-2">
          <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" />
          <span className="font-mono text-sm text-primary tabular-nums">{t.time || '?'}</span>
          <span>{t.event}</span>
        </li>
      ))}
    </ol>
  );
}

export function News({ events }: { events: GameEvent[] }) {
  const items = (events ?? []).filter((e) => e.kind !== 'opening').slice().reverse();
  if (!items.length) return <Muted>No news yet.</Muted>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((e, i) => (
        <li key={`${e.at}-${i}`} data-kind={e.kind} className="leading-snug">
          {e.kind === 'qa' && <Muted className="text-xs">{e.by} asked: {e.q}</Muted>}
          {e.lines?.length ? <Novel lines={e.lines} /> : e.text}
        </li>
      ))}
    </ul>
  );
}

export function SharedClues({ clues }: { clues: { id?: string; name: string; by: string; shows: string }[] | null | undefined }) {
  if (!clues?.length) return <Muted>No clues shared yet. Find one, then tap &ldquo;Show everyone&rdquo;.</Muted>;
  return (
    <div className="flex flex-col gap-3">
      {clues.map((c, i) => (
        <div key={c.id ?? i} className="rounded-lg bg-muted/60 p-3">
          <b>{c.name}</b> <span className="text-xs text-muted-foreground">from {c.by}</span>
          <p className="text-sm">{c.shows}</p>
        </div>
      ))}
    </div>
  );
}

export function CaseBox({ question, label = 'The big question' }: { question: string | null | undefined; label?: string }) {
  if (!question) return null;
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <Label>{label}</Label>
      <div className="mt-1 font-heading text-xl leading-snug">{question}</div>
    </div>
  );
}

export function Night({ card }: { card: { night?: { time: string; where: string; doing: string }[]; alibi?: { time: string; where: string }[] } }) {
  if (!card?.night?.length) return null;
  const told = (time: string) => card.alibi?.find((a) => a.time === time)?.where;
  return (
    <ol className="flex flex-col gap-2">
      {card.night.map((n, i) => {
        const said = told(n.time);
        const differs = said && said.toLowerCase() !== String(n.where).toLowerCase();
        return (
          <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-2">
            <span className="font-mono text-sm text-primary tabular-nums">{n.time}</span>
            <span><b>{n.where}</b>. {n.doing}{differs && <span className="block text-sm text-destructive"> You told people: {said}.</span>}</span>
          </li>
        );
      })}
    </ol>
  );
}

interface AlibiTable { times: { time: string; what: string }[]; rows: { name: string; kind: string; minor: boolean; cells: string[] }[] }

export function Alibis({ alibis, me = null }: { alibis: AlibiTable | null | undefined; me?: string | null }) {
  if (!alibis?.rows?.length) return <Muted>Nobody has said where they were yet.</Muted>;
  const isMe = (name: string) => Boolean(me && name === me);
  return (
    <div className="@container flex flex-col gap-2">
      {/* Narrow (a phone): one block per time, each person's claim on its own row. */}
      <div className="flex flex-col gap-4 @2xl:hidden">
        {alibis.times.map((t, j) => (
          <section key={j} data-time={t.time} className="flex flex-col gap-1.5 border-l border-border pl-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono text-sm whitespace-nowrap text-primary tabular-nums">{t.time}</span>
              {t.what && <span className="text-sm text-muted-foreground">{t.what}</span>}
            </div>
            <ul className="flex flex-col">
              {alibis.rows.map((r, i) => (
                <li key={i} data-kind={r.kind} data-me={isMe(r.name) ? 'true' : undefined}
                  className={`grid grid-cols-[minmax(6rem,38%)_1fr] gap-3 rounded-md px-2 py-1 ${isMe(r.name) ? 'bg-primary/10' : ''} ${r.minor ? 'text-muted-foreground' : ''}`}>
                  <span className="font-medium">{r.name}</span>
                  <span>{r.cells[j] || <span className="text-muted-foreground">?</span>}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {/* Wide (the table screen): the full grid. */}
      <div className="hidden overflow-x-auto @2xl:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr><th />{alibis.times.map((t, i) => <th key={i} className="min-w-32 px-2 pb-2 text-left align-bottom font-normal"><span className="block font-mono whitespace-nowrap text-primary">{t.time}</span><span className="line-clamp-3 text-xs text-muted-foreground">{t.what}</span></th>)}</tr>
          </thead>
          <tbody>
            {alibis.rows.map((r, i) => (
              <tr key={i} data-kind={r.kind} data-me={me && r.name === me ? 'true' : undefined} className={`border-t border-border ${r.minor ? 'text-muted-foreground' : ''} ${me && r.name === me ? 'bg-primary/10' : ''}`}>
                <th className="py-1.5 pr-2 text-left font-medium whitespace-nowrap">{r.name}</th>
                {r.cells.map((c, j) => <td key={j} className="px-2 py-1.5">{c || <span className="text-muted-foreground">?</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Muted className="text-xs">What each person says. Someone may be lying.</Muted>
    </div>
  );
}

export function Recap({ recap }: { recap: { lines?: string[]; open?: string[] } | null | undefined }) {
  if (!recap?.lines?.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <Label>Where we are now</Label>
      <Facts lines={recap.lines} />
      {!!recap.open?.length && (<><Muted className="mt-1 text-xs">Still open</Muted><Facts lines={recap.open} /></>)}
    </div>
  );
}

export function Results({ results }: { results: { kind?: string; phaseIndex: number; question: string; correct: boolean | null; pickedText: string | null }[] | null | undefined }) {
  if (!results?.length) return null;
  return (
    <div className="flex flex-col gap-1 text-sm">
      {results.map((r, i) => <div key={i}><b>Round {r.phaseIndex + 1}:</b> {r.question} {r.kind === 'spotlight' ? '' : r.correct ? '✓' : '✗'} {r.pickedText ?? (r.kind === 'spotlight' ? 'the room was split' : 'no agreement')}</div>)}
    </div>
  );
}
