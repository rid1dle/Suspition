'use client';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Label, Muted } from '@/components/game/label';

// Host only: a dropped player scans their own code and is back in their seat, card and all.
export function RejoinPanel({ players, code, onPick, onClose }: { players: { id: string; name: string }[]; code: { name: string; url: string } | null; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <Label>Rejoin a player</Label>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {players.map((p) => <Button key={p.id} size="sm" variant={code?.name === p.name ? 'default' : 'secondary'} onClick={() => onPick(p.id)}>{p.name}</Button>)}
      </div>
      {code && (
        <div className="flex flex-col items-start gap-2">
          <div className="rounded-xl bg-white p-3"><QRCodeSVG value={code.url} size={180} /></div>
          <Muted className="break-all text-xs">{code.name}: scan this, or open {code.url}</Muted>
          <Muted className="text-xs">Only show it to {code.name}: it opens their card.</Muted>
        </div>
      )}
    </div>
  );
}
