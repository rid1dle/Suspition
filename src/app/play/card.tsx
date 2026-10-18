'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import type { CardView, ProfileView } from '@/lib/views';
import { CaseBox, Facts, Night } from '@/components/game/panels';
import { Label, Muted } from '@/components/game/label';
import { ProfilePanel } from '@/components/game/lobby';

const SIDES: Record<string, string> = { investigator: 'Detective', culprit: 'Culprit', wildcard: 'Wildcard' };

function Section({ title, children, tone = 'private' }: { title: string; children: React.ReactNode; tone?: 'private' | 'public' | 'hidden' }) {
  const border = tone === 'public' ? 'border-l-sky-400/70' : tone === 'hidden' ? 'border-l-violet-400/70' : 'border-l-primary';
  return (
    <section className={`flex flex-col gap-2 rounded-xl border-l-4 bg-card p-4 ${border}`}>
      <Label>{title}</Label>
      {children}
    </section>
  );
}

// Front: who you are and what you want. Back: what you hide and what you do not know yet.
export function CardFlip({ card, caseQuestion, overridesLeft, overridesTotal, persona, rules = [], profile = null, onForget }: { card: CardView; caseQuestion: string; overridesLeft: number; overridesTotal: number; persona?: { intent: string; persona: string } | null; rules?: string[]; profile?: ProfileView | null; onForget?: () => void }) {
  const [back, setBack] = useState(false);
  const side = SIDES[card.side] ?? card.side;
  return (
    <div className="flex flex-col gap-4">
      <button onClick={() => setBack((b) => !b)} className="text-left [perspective:1200px]" aria-label={back ? 'Show who you are' : 'Show what you hide'}>
        <motion.div animate={{ rotateY: back ? 180 : 0 }} transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1] }} className="relative [transform-style:preserve-3d]">
          <div data-face="front" className="flex flex-col gap-2 rounded-2xl bg-gradient-to-br from-primary/25 via-card to-card p-5 shadow-xl [backface-visibility:hidden]">
            <Label>{side}</Label>
            <h1 className="font-display text-3xl leading-tight">{card.name}</h1>
            <div className="text-muted-foreground">{card.role}</div>
            <p className="mt-2">{card.public_info}</p>
            <Muted className="mt-3 text-xs">Tap to see what you hide</Muted>
          </div>
          <div data-face="back" className="absolute inset-0 flex flex-col gap-2 overflow-auto rounded-2xl bg-card p-5 shadow-xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <Label>Only you know</Label>
            <p>{card.private_info}</p>
            <Muted className="text-xs">{card.side_explanation}</Muted>
            <Muted className="mt-auto text-xs">Tap to turn back</Muted>
          </div>
        </motion.div>
      </button>

      {card.backstory && (
        <Section title="Your story so far">
          <p>{card.backstory}</p>
        </Section>
      )}

      {card.hook && (
        <Section title="Who you are tonight">
          <p className="text-lg font-medium">{card.hook}</p>
          {card.distrusts && <p className="text-sm">You don't trust {card.distrusts}. {card.distrust_why}</p>}
        </Section>
      )}

      {persona && (persona.intent || persona.persona) && (
        <Section title="How you are playing it">
          {persona.intent && <p>{persona.intent}</p>}
          {persona.persona && <Muted>{persona.persona}</Muted>}
        </Section>
      )}

      <div className="flex flex-col gap-3">
        <CaseBox question={caseQuestion} label="The group's goal" />
        <Section title="Your secret goal">
          <p className="text-lg font-medium">{card.goal}</p>
          {card.goal_why && <p className="text-sm">{card.goal_why}</p>}
          <p className="text-sm"><b>You are a {side}.</b> {card.win}</p>
        </Section>
      </div>

      {card.locked?.includes('drives') && (
        <Section title="What drives you" tone="hidden"><Muted>Unlocks after your first hot seat.</Muted></Section>
      )}
      {card.locked?.includes('reasons') && !card.locked?.includes('drives') && (
        <Section title="Why you did what you did" tone="hidden"><Muted>Unlocks after your second hot seat, or when the room votes for you.</Muted></Section>
      )}
      {(card.wants || card.fears || card.reasons?.length > 0) && (
        <Section title="What drives you">
          {card.wants && <p>{card.wants}</p>}
          {card.fears && <p>{card.fears}</p>}
          {card.reasons?.length > 0 && <><Muted className="text-xs">Why you did what you did</Muted><Facts lines={card.reasons} /></>}
        </Section>
      )}
      {card.night?.length > 0 && <Section title="Your night: where you really were"><Night card={card} /></Section>}
      <Section title="Everyone knows" tone="public"><p>{card.public_info}</p></Section>
      <Section title="Only you know">
        <p>{card.private_info}</p>
        <Muted className="text-xs">{card.side_explanation}</Muted>
        <p className="text-sm"><b>Overrides left:</b> {overridesLeft} of {overridesTotal}</p>
        {card.starting_knowledge && <p className="text-sm"><b>You also know:</b> {card.starting_knowledge}</p>}
      </Section>
      <Section title="You don't know yet" tone="hidden">
        {card.hidden_known.map((f, i) => <p key={i}>✦ {f}</p>)}
        <Muted className="text-xs">{card.hidden_unknown ? `${card.hidden_unknown} secret${card.hidden_unknown > 1 ? 's' : ''} about you. Ask the GM about your past to find out.` : 'You found out everything about yourself.'}</Muted>
      </Section>
      {rules.length > 0 && (
        <Section title="How to play" tone="public">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">{rules.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </Section>
      )}
      {profile && (
        <details className="rounded-xl bg-card p-4">
          <summary className="cursor-pointer">What the game knows about you</summary>
          <div className="mt-4"><ProfilePanel profile={profile} onForget={onForget} /></div>
        </details>
      )}
    </div>
  );
}
