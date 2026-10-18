'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label, Muted } from '@/components/game/label';

export type Offer = { id: string; text: string; choice: string };

// The story asks this player first, in private, before anyone else may say what their character did.
export function OfferCard({ offer, onAnswer }: { offer: Offer; onAnswer: (take: boolean, text?: string) => Promise<unknown> | void }) {
  const [own, setOwn] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-primary/40">
      <Label>The story asks you first</Label>
      <p className="text-base">{offer.text}</p>
      {own !== null ? (
        <div className="flex flex-col gap-2">
          <Textarea autoFocus value={own} maxLength={200} rows={2} onChange={(e) => setOwn(e.target.value)} placeholder="Say what your character did" />
          <div className="flex gap-2">
            <Button disabled={!own.trim()} onClick={async () => { await onAnswer(false, own); setOwn(null); }}>Send</Button>
            <Button variant="ghost" onClick={() => setOwn(null)}>Back</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {offer.choice && <Button onClick={() => onAnswer(true)}>{offer.choice}</Button>}
          <Button variant="ghost" onClick={() => setOwn('')}>Say it my way</Button>
        </div>
      )}
      <Muted className="text-xs">Only you see this. Nobody hears it until you answer.</Muted>
    </div>
  );
}
