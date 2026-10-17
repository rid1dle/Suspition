'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProfileView } from '@/lib/views';
import { SkillBars } from './score';
import { Label, Muted } from './label';

// One quick question while people wait: four taps, or say it your way, or skip.
export function QuestionCard({ q, onAnswer }: { q: { id: string; question: string; choices: string[] }; onAnswer?: (a: { choice?: number; text?: string }) => void }) {
  const [own, setOwn] = useState('');
  return (
    <motion.div key={q.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-3">
      <Label>Quick question</Label>
      <p className="font-heading text-xl">{q.question}</p>
      <div className="grid grid-cols-2 gap-2">
        {q.choices.map((c, i) => (
          <motion.button key={c} data-choice={i} whileTap={{ scale: 0.95 }} onClick={() => onAnswer?.({ choice: i })}
            className="rounded-xl border border-border bg-muted/40 px-3 py-3 text-left text-sm transition hover:border-primary">{c}</motion.button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={own} maxLength={200} placeholder="Or say it your way" onChange={(e) => setOwn(e.target.value)} />
        <Button variant="secondary" disabled={!own.trim()} onClick={() => own.trim() && onAnswer?.({ text: own })}>Send</Button>
      </div>
      <button className="self-start text-sm text-muted-foreground hover:text-foreground" onClick={() => onAnswer?.({})}>Skip</button>
    </motion.div>
  );
}

export function ProfilePanel({ profile, onForget }: { profile: ProfileView; onForget?: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Muted>{profile.games ? `${profile.games} game${profile.games === 1 ? '' : 's'} played.` : 'Your first game.'} Only you see this.</Muted>
      <SkillBars skills={profile.skills} />
      {profile.change && <p className="text-sm"><b>Since last game:</b> {profile.change}</p>}
      {profile.coaching && <p className="text-sm"><b>Tip:</b> {profile.coaching}</p>}
      {profile.answers && (
        <div className="flex flex-col gap-1">
          <Label>Your answers</Label>
          {profile.answers.length ? profile.answers.map((a, i) => <div key={i} className="text-sm">{a.question} <b>{a.answer}</b></div>) : <Muted>None yet.</Muted>}
          <button className="self-start text-sm text-muted-foreground hover:text-destructive" onClick={onForget}>Clear my answers</button>
        </div>
      )}
    </div>
  );
}
