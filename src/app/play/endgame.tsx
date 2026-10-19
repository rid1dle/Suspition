'use client';

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label, Muted } from '@/components/game/label';
import { SkillBars, TotalLine } from '@/components/game/score';
import { StoryShape } from '@/components/game/panels';
import { emptyAnswers } from '@/lib/phone';
import { useDraft } from '@/lib/live';
import type { PlayerView } from '@/lib/views';
import { act, tokenOf } from './play-app';

export const findLine = (n: number) => (n === 1 ? 'There is 1 culprit. Pick 1.' : `There are ${n} culprits. Pick ${n}.`);

export function Final({ view }: { view: PlayerView }) {
  const [pickedText, setPickedText] = useDraft(`final-picks-${view.gameId}`);
  const [how, setHow] = useDraft(`final-how-${view.gameId}`);
  const [why, setWhy] = useDraft(`final-why-${view.gameId}`);
  const [goal, setGoal] = useDraft(`final-goal-${view.gameId}`);
  const picked = new Set(pickedText ? pickedText.split(',') : []);
  const setPicked = (next: (s: Set<string>) => Set<string>) => setPickedText([...next(picked)].join(','));
  const [warn, setWarn] = useState<string | null>(null);
  if (view.submission) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 px-5 pt-12">
        <h1 className="font-display text-3xl">Your answer is in.</h1>
        <Muted>Waiting for {view.players.length - view.submitted.length} more. {view.scoring ? 'The GM is checking the answers…' : ''}</Muted>
      </main>
    );
  }
  const cast = view.cast!;
  const count = view.culpritCount ?? 0;
  const suspects = view.setup?.npcRole === 'background' ? [] : cast.npcs.filter((n) => !n.minor);
  const people = [...cast.players.filter((c) => c.id !== view.me.id), ...suspects, ...cast.players.filter((c) => c.id === view.me.id)];
  const send = async () => {
    if (!await act('submit', { token: tokenOf(), culprit_ids: [...picked], how, why, goal })) return;
    for (const clear of [setPickedText, setHow, setWhy, setGoal]) clear('');
  };
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-5 pt-8 pb-16">
      <div>
        <h1 className="font-display text-4xl">Who did it?</h1>
        {count > 0 && <p className="font-semibold">{findLine(count)}</p>}
        <Muted>{view.players.length === 1 ? 'Name who did it.' : view.players.length === 2 ? 'You both pick. A culprit who knows does not count.' : 'Everyone picks. Culprits too. Most votes decides who wins.'}</Muted>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {people.map((c, i) => {
          const on = picked.has(c.id);
          return (
            <motion.button key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} whileTap={{ scale: 0.95 }}
              aria-pressed={on} onClick={() => setPicked((s) => { const n = new Set(s); if (on) n.delete(c.id); else n.add(c.id); return n; })}
              className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${on ? 'border-primary bg-primary/20 ring-2 ring-primary' : 'border-border bg-card'}`}>
              {'icon' in c && c.icon && <span className="text-2xl">{c.icon}</span>}
              <b>{c.name}</b>
              <span className="text-xs text-muted-foreground">{c.role}{c.id === view.me.id ? ' (you)' : ''}</span>
            </motion.button>
          );
        })}
      </div>
      <Muted className="text-xs">Type, or tap the 🎤 mic on your keyboard to speak.</Muted>
      {([['How?', how, setHow, true, 600], ['Why?', why, setWhy, true, 600], ['Did you get your goal?', goal, setGoal, false, 400]] as const).map(([label, value, set, points, max]) => (
        <label key={label} className="flex flex-col gap-1">
          <Label>{label} {points && <span className="normal-case tracking-normal">(up to 2 points, one line is enough)</span>}</Label>
          <Textarea value={value} maxLength={max} onChange={(e) => set(e.target.value)} className="min-h-20 bg-card" />
        </label>
      ))}
      {warn && (
        <div className="flex flex-col gap-2 rounded-xl border border-primary/50 bg-primary/10 p-3">
          <p className="text-sm">{warn}</p>
          <div className="flex gap-2"><Button size="sm" onClick={send}>Send</Button><Button size="sm" variant="ghost" onClick={() => setWarn(null)}>Go back</Button></div>
        </div>
      )}
      <Button size="lg" disabled={count ? picked.size !== count : !picked.size} onClick={() => { const w = emptyAnswers({ how, why }); if (w) setWarn(w); else send(); }}>Send my answer</Button>
    </main>
  );
}

export function Reveal({ view }: { view: PlayerView }) {
  const r = view.reveal!;
  const mine = r.players.find((p: { player_id: string }) => p.player_id === view.me.id) ?? {};
  const win = r.verdict.winner === 'investigators';
  const card = r.cards.find((c: { id: string }) => c.id === view.me.id);
  const best = r.bestPlay?.includes(view.me.id);
  useEffect(() => {
    if (mine.culprit_correct || best) confetti({ particleCount: 120, spread: 70, origin: { y: 0.3 }, disableForReducedMotion: true });
  }, [mine.culprit_correct, best]);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-5 pt-10 pb-16">
      <motion.h1 initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="font-display text-4xl">{win ? 'The detectives win' : 'The culprits got away'}</motion.h1>
      <Muted>The full story is on the big screen.</Muted>
      <section className="flex flex-col gap-3 rounded-2xl bg-card p-5">
        <Label>How you did</Label>
        <div className="text-lg"><TotalLine result={mine} /></div>
        <div className="text-sm text-muted-foreground">Culprit {mine.culprit_correct ? '✓' : '✗'} · How {mine.method_score ?? 0}/2 · Why {mine.motive_score ?? 0}/2 · Goal {mine.goal_achieved ? '✓' : '✗'}</div>
        {best && <p className="font-semibold text-primary">Best play this game.</p>}
        {mine.goal_outcome && <p className="text-sm">{mine.goal_outcome}</p>}
        {mine.comment && <Muted>{mine.comment}</Muted>}
        {Object.keys(mine.skills ?? {}).length > 0 && (<><Label>Your skills this game</Label><SkillBars skills={Object.entries(mine.skills as Record<string, number>).map(([skill, points]) => ({ skill, points }))} /></>)}
        {mine.coaching && <p className="text-sm"><b>Tip:</b> {mine.coaching}</p>}
      </section>
      {card && (
        <section className="flex flex-col gap-2 rounded-2xl border-l-4 border-l-violet-400/70 bg-card p-5">
          <Label>What you never knew</Label>
          {card.hidden_facts.map((f: string, i: number) => <p key={i}>{f}</p>)}
        </section>
      )}
      <section className="flex flex-col gap-2 rounded-2xl bg-card p-5">
        <Label>What really happened</Label>
        <p className="whitespace-pre-wrap leading-relaxed">{r.reveal_story}</p>
        <StoryShape line={r.story_shape} />
      </section>
    </main>
  );
}
