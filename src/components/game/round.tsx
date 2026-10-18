'use client';

import { motion } from 'motion/react';
import type { Round, VoteBriefView } from '@/lib/views';
import { cn } from '@/lib/utils';
import { Label, Muted } from './label';

// Everyone votes from the same picture: where things stand, what is still open, one public line per person.
export function VoteBrief({ brief }: { brief: VoteBriefView | null | undefined }) {
  if (!brief || !(brief.lines.length || brief.open.length || brief.people.some((p) => p.line))) return null;
  return (
    <div data-vote-brief className="flex flex-col gap-1 rounded-xl bg-muted/50 p-3 text-sm">
      <Label>Before you vote</Label>
      {brief.lines.map((l) => <p key={l}>{l}</p>)}
      {brief.open.length > 0 && <p className="text-muted-foreground">Still open: {brief.open.join(' ')}</p>}
      {brief.people.filter((p) => p.line).map((p) => <p key={p.name}><b>{p.name}:</b> {p.line}</p>)}
    </div>
  );
}

// The round's job (what to do now), its pointers, and the question everyone votes on at the end.
export function RoundCard({ round, voting = false, myVote = null, countdown = '', tappable = false, brief = null, onVote, onIdea }: {
  round: Round | null | undefined; voting?: boolean; myVote?: number | null; countdown?: string; tappable?: boolean;
  brief?: VoteBriefView | null; onVote?: (i: number) => void; onIdea?: (text: string) => void;
}) {
  if (!round) return null;
  const vote = round.vote;
  const tips = !round.tips?.length ? null : tappable ? (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Try:</span>
      {round.tips.map((t) => (
        <button key={t} data-idea={t} onClick={() => onIdea?.(t)} className="rounded-full border border-border bg-muted/50 px-3 py-1 text-sm transition hover:border-primary hover:text-primary active:scale-95">{t}</button>
      ))}
    </div>
  ) : (
    <ul className="mt-2 list-disc pl-5 text-muted-foreground marker:text-primary">{round.tips.map((t) => <li key={t}>{t}</li>)}</ul>
  );
  const job = round.objective && !vote ? (
    <div>
      <Label>This round, your job</Label>
      <div className="mt-1 font-heading text-xl leading-snug">{round.objective}</div>
      {tips}
    </div>
  ) : null;
  if (!round.question) return <div>{job}</div>;
  const head = vote ? `Vote now${countdown ? ` · ${countdown}` : ''}` : round.done ? 'Done' : job ? 'At the end, answer together' : "This round's goal";
  return (
    <div className="flex flex-col gap-2">
      {job}
      {vote && <VoteBrief brief={brief} />}
      <Label className={job ? 'mt-3' : ''}>{head}</Label>
      <div className={job ? 'text-lg' : 'font-heading text-xl'}>{round.question}</div>
      {voting && vote ? (
        <div className="mt-1 grid gap-2">
          {round.options.map((o, i) => (
            <motion.button key={o} whileTap={{ scale: 0.97 }} aria-pressed={myVote === i} onClick={() => onVote?.(i)}
              className={cn('rounded-xl border px-4 py-3 text-left transition', myVote === i ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-muted/40 hover:border-primary')}>
              {o}
            </motion.button>
          ))}
        </div>
      ) : (
        <ul className="list-disc pl-5 text-muted-foreground">{round.options.map((o) => <li key={o}>{o}</li>)}</ul>
      )}
      {vote && <Muted>{vote.voted} of {vote.of} voted</Muted>}
    </div>
  );
}
