import { ScenePicture, CaseBox, Facts } from './panels';
import { Label } from './label';
import { MapView } from './map';

interface Step { kind: string; title: string; lines: string[]; playerId?: string; icon?: string }

// One step of Round 0 ("Meet everyone"), read aloud on the table and shown on phones.
export function BriefStep({ view, me = null }: { view: { briefing?: { step: number; steps: Step[] } | null; card?: { goal: string; goal_why?: string; win: string } | null; illustration?: string | null; [key: string]: unknown }; me?: string | null }) {
  const b = view.briefing;
  const step = b?.steps?.[b.step];
  if (!b || !step) return null;
  let body;
  if (step.kind === 'intro') {
    const mine = step.playerId === me;
    body = (
      <div className={mine ? 'rounded-xl bg-primary/10 p-4' : ''}>
        {step.icon && <div className="text-5xl">{step.icon}</div>}
        {mine && <div className="font-semibold text-primary">Your turn! Stand up and say:</div>}
        <p className="font-heading text-xl leading-relaxed">{mine ? step.lines[0].replace(/^[^"]*"/, '"') : step.lines[0]}</p>
      </div>
    );
  } else if (step.kind === 'map') {
    body = <>{step.lines.map((l, i) => <p key={i}>{l}</p>)}<MapView view={view} me={me} /></>;
  } else if (step.kind === 'scene') {
    body = <><ScenePicture svg={view.illustration} />{step.lines.map((l, i) => <p key={i} className="font-heading text-lg leading-relaxed">{l}</p>)}</>;
  } else if (step.kind === 'story') {
    body = step.lines.map((l, i) => (l.startsWith('The big question: ')
      ? <CaseBox key={i} question={l.slice('The big question: '.length)} />
      : <p key={i} className="font-heading text-lg leading-relaxed">{l}</p>));
  } else if (step.kind === 'goal') {
    const [group, ...rest] = step.lines;
    const card = me ? view.card : null;
    body = (
      <>
        <CaseBox question={group} label="The group's goal" />
        {card && (
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <Label>Your secret goal</Label>
            <div className="mt-1 font-heading text-lg">{card.goal}</div>
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
      <div className="flex items-center justify-between gap-3">
        <Label>Round 0: Meet everyone · {b.step + 1} of {b.steps.length}</Label>
        <div className="flex gap-1">{b.steps.map((_, i) => <span key={i} className={`size-1.5 rounded-full ${i === b.step ? 'bg-primary' : i < b.step ? 'bg-muted-foreground' : 'bg-muted'}`} />)}</div>
      </div>
      <h2 className="font-heading text-2xl">{step.title}</h2>
      {body}
    </div>
  );
}
