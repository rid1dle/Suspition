'use client';

import { motion } from 'motion/react';

// A small card that slides in now and then so a player remembers who they are.
export function ReminderCard({ name, line, seconds = 12, onOpen, onDismiss }: { name: string; line: string; seconds?: number; onOpen?: () => void; onDismiss?: () => void }) {
  return (
    <motion.div role="status" drag="x" dragConstraints={{ left: 0, right: 0 }} onDragEnd={(_, i) => Math.abs(i.offset.x) > 80 && onDismiss?.()}
      initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      onClick={onOpen}
      className="relative flex cursor-pointer items-start gap-3 overflow-hidden rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-sm">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-heading text-lg text-primary-foreground">{name.trim()[0]?.toUpperCase()}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">Remember · {name}</span>
        <span className="text-sm leading-snug">{line}</span>
      </span>
      <motion.i className="absolute bottom-0 left-0 h-0.5 bg-primary" initial={{ width: '100%' }} animate={{ width: 0 }} transition={{ duration: seconds, ease: 'linear' }} onAnimationComplete={onDismiss} />
    </motion.div>
  );
}
