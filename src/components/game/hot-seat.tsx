'use client';

import { motion } from 'motion/react';
import { countdown } from '@/lib/phone';
import { Label, Muted } from './label';

export interface SeatView {
  name?: string;
  status?: 'getready' | 'live';
  liveAt?: number;
  endsAt?: number;
  waiting: number;
  mine?: { role: 'seated' | 'asker' | 'listener'; whisper?: string[]; question?: string; followup?: string } | null;
}

const left = (seat: SeatView, now: number) => countdown(seat.status === 'getready' ? seat.liveAt! : seat.endsAt!, now).text;

// The table: who is up, and the clock. Nothing private.
export function SeatBanner({ seat, now }: { seat: SeatView; now: number }) {
  if (!seat.status) return null;
  return (
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center justify-between gap-4 rounded-2xl bg-primary p-5 text-primary-foreground shadow-xl">
      <div>
        <div className="text-xs tracking-widest uppercase opacity-80">Hot seat</div>
        <div className="font-heading text-3xl">{seat.name}</div>
        <div className="text-sm opacity-90">{seat.status === 'getready' ? 'Getting ready. Questions start soon.' : 'Ask your questions out loud.'}</div>
      </div>
      <div className="font-mono text-5xl tabular-nums">{left(seat, now)}</div>
    </motion.div>
  );
}

// A phone: the seated player reads their whisper; an asker reads their own question; everyone else listens.
export function SeatCard({ seat, now }: { seat: SeatView | null | undefined; now: number }) {
  const mine = seat?.mine;
  if (!seat?.status || !mine) return null;
  return (
    <motion.section initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex flex-col gap-2 rounded-2xl bg-primary/15 p-4 ring-2 ring-primary">
      <div className="flex items-baseline justify-between">
        <Label>{mine.role === 'seated' ? "You're up" : `Hot seat: ${seat.name}`}</Label>
        <span className="font-mono tabular-nums">{left(seat, now)}</span>
      </div>
      {mine.role === 'seated' && (
        <>
          <Muted className="text-xs">Only you see this. Questions come out loud.</Muted>
          {(mine.whisper ?? []).map((l, i) => <p key={i} className="text-lg">{l}</p>)}
        </>
      )}
      {mine.role === 'asker' && (
        <>
          <Muted className="text-xs">Ask this out loud:</Muted>
          <p className="text-xl font-medium">&ldquo;{mine.question}&rdquo;</p>
          {mine.followup && <p className="text-sm text-muted-foreground">{mine.followup}</p>}
        </>
      )}
      {mine.role === 'listener' && <p>Listen to {seat.name}. Do you believe them?</p>}
    </motion.section>
  );
}
