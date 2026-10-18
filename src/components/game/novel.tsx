'use client';

import { motion } from 'motion/react';

export interface Line { speaker: string; text: string }

// A reply as a page of a novel: narration in italics, speech with the speaker named once per run.
export function Novel({ lines, animate = false }: { lines: Line[]; animate?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((l, i) => {
        const same = lines[i - 1]?.speaker === l.speaker;
        const body = !l.speaker ? (
          <p data-line="act" className="italic">{l.text}</p>
        ) : (
          <p data-line="say">
            {!same && <span data-speaker className="mr-1.5 font-heading font-semibold text-primary">{l.speaker}</span>}
            &ldquo;{l.text}&rdquo;
          </p>
        );
        return animate ? (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.35, duration: 0.35 }}>{body}</motion.div>
        ) : <div key={i}>{body}</div>;
      })}
    </div>
  );
}
