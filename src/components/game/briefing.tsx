'use client';

import { motion, useDragControls } from 'motion/react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { swipeTo, swipeAllowed } from '@/lib/brief';
import { ScenePicture, CaseBox, Facts } from './panels';
import { Label } from './label';
import { WorldMap } from './world-map';

interface Step { kind: string; title: string; lines: string[]; playerId?: string; icon?: string }

// One step of Round 0 ("Meet everyone"), read aloud on the table and shown on phones.
type BriefView = { briefing?: { step: number; steps: Step[] } | null; card?: { goal: string; goal_why?: string; win: string } | null; illustration?: string | null; [key: string]: unknown };

export function BriefStep({ view, me = null, at }: { view: BriefView; me?: string | null; at?: number }) {
  const b = view.briefing;
  const index = at ?? b?.step ?? 0;
  const step = b?.steps?.[index];
  if (!b || !step) return null;
  let body;
  if (step.kind === 'intro') {
    const mine = step.playerId === me;
    body = (
      <div className={mine ? 'rounded-xl bg-primary/10 p-4' : ''}>
        {step.icon && <div className="text-5xl">{step.icon}</div>}
        {mine && <div className="font-semibold text-primary">Your turn! Stand up and say:</div>}
        <p className="text-xl leading-relaxed">{mine ? step.lines[0].replace(/^[^"]*"/, '"') : step.lines[0]}</p>
      </div>
    );
  } else if (step.kind === 'map') {
    body = <>{step.lines.map((l, i) => <p key={i}>{l}</p>)}<div data-no-swipe><WorldMap view={view} me={me} className={me ? "h-[50dvh]" : ""} /></div></>;
  } else if (step.kind === 'scene') {
    body = <><ScenePicture svg={view.illustration} />{step.lines.map((l, i) => <p key={i} className="text-lg leading-relaxed">{l}</p>)}</>;
  } else if (step.kind === 'story') {
    body = step.lines.map((l, i) => (l.startsWith('The big question: ')
      ? <CaseBox key={i} question={l.slice('The big question: '.length)} />
      : <p key={i} className="text-lg leading-relaxed">{l}</p>));
  } else if (step.kind === 'goal') {
    const [group, ...rest] = step.lines;
    const card = me ? view.card : null;
    body = (
      <>
        <CaseBox question={group} label="The group's goal" />
        {card && (
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <Label>Your secret goal</Label>
            <div className="mt-1 text-lg">{card.goal}</div>
            {card.goal_why && <div className="text-sm">{card.goal_why}</div>}
            <div className="text-sm text-muted-foreground">{card.win}</div>
          </div>
        )}
        <Facts lines={rest} />
      </>
    );
  } else {
    body = <Facts lines={step.lines} />;
  }
  return (
    <div className="flex flex-col gap-3">
      <Label>Round 0: Meet everyone · {index + 1} of {b.steps.length}</Label>
      <h2 className="font-heading text-2xl">{step.title}</h2>
      {body}
    </div>
  );
}

// The briefing with its own controls: Back, a dot per card, and Next naming the card it opens.
// The table moves everyone; a phone can also page alone and swipe.
export function BriefPager({ view, me = null, at, onGo, swipe = false, tableStep, finish }: {
  view: BriefView; me?: string | null; at: number; onGo: (i: number) => void; swipe?: boolean; tableStep?: number;
  finish?: { label: string; onClick: () => void };
}) {
  const drag = useDragControls();
  const steps = view.briefing?.steps ?? [];
  if (!steps.length) return null;
  const last = at >= steps.length - 1;
  const next = steps[at + 1];
  return (
    <div className="flex flex-col gap-5">
      <motion.div key={at} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} drag={swipe ? 'x' : false} dragControls={drag} dragListener={false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.25} dragSnapToOrigin
        onPointerDown={(e) => { if (swipe && swipeAllowed(e.target as Element)) drag.start(e); }}
        onDragEnd={(_, info) => onGo(swipeTo(at, steps.length, info.offset.x))} className={swipe ? 'touch-pan-y' : undefined}>
        <BriefStep view={view} me={me} at={at} />
      </motion.div>
      {tableStep != null && tableStep !== at && (
        <button type="button" className="self-start text-sm text-primary underline underline-offset-4" onClick={() => onGo(tableStep)}>
          The big screen is on card {tableStep + 1}. Go there
        </button>
      )}
      <div role="group" aria-label="Briefing cards" className="flex flex-col gap-3">
        <div className="flex flex-wrap justify-center gap-1">
          {steps.map((s, i) => (
            <button key={i} type="button" onClick={() => onGo(i)} aria-label={`Card ${i + 1}: ${s.title}`} aria-current={i === at ? 'step' : undefined} className="p-1.5">
              <span className={`block size-2.5 rounded-full transition ${i === at ? 'bg-primary' : i < at ? 'bg-muted-foreground' : 'bg-muted'}`} />
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" disabled={at === 0} onClick={() => onGo(at - 1)}><ChevronLeftIcon /> Back</Button>
          {!last && <Button size="lg" className="min-w-0 flex-1" onClick={() => onGo(at + 1)}><span className="truncate">Next: {next.title}</span> <ChevronRightIcon /></Button>}
          {last && finish && <Button size="lg" className="flex-1" onClick={finish.onClick}>{finish.label}</Button>}
        </div>
      </div>
    </div>
  );
}
