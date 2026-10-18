'use client';
import { Button } from '@/components/ui/button';
import { Label, Muted } from '@/components/game/label';

// Going somewhere is a real step in the story: the player says Go first, and everyone sees it.
export function GoConfirm({ place, onAnswer }: { place: string; onAnswer: (yes: boolean) => unknown }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-primary/40">
      <Label>Go to the {place}?</Label>
      <Muted className="text-sm">Everyone will see you go. You stay there until you move again.</Muted>
      <div className="flex gap-2">
        <Button onClick={() => onAnswer(true)}>Go</Button>
        <Button variant="ghost" onClick={() => onAnswer(false)}>Not now</Button>
      </div>
    </div>
  );
}
