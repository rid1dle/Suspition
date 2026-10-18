'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { tensionTick, beatBetween } from '@/lib/story-look';
import { MotionConfig } from 'motion/react';
import type { Room } from '@/lib/views';
import { HOUSE_ROOM } from '@/lib/house-room';

// Turns the world's room into the screen's look: colours as the CSS variables shadcn reads,
// the font pair and texture as data attributes, and a gentle ambient effect layer.
export function roomStyle(room: Room | null): CSSProperties {
  if (!room) return {};
  const c = room.colors;
  return {
    '--background': c.bg,
    '--foreground': c.text,
    '--card': c.surface,
    '--card-foreground': c.text,
    '--popover': c.surfaceAlt,
    '--popover-foreground': c.text,
    '--muted': c.surfaceAlt,
    '--muted-foreground': c.muted,
    '--secondary': c.surfaceAlt,
    '--secondary-foreground': c.text,
    '--accent': c.surfaceAlt,
    '--accent-foreground': c.text,
    '--primary': c.accent,
    '--primary-foreground': c.accentText,
    '--destructive': c.danger,
    '--border': `color-mix(in oklab, ${c.text} 12%, transparent)`,
    '--input': `color-mix(in oklab, ${c.text} 16%, transparent)`,
    '--ring': c.accent,
  } as CSSProperties;
}

export function AmbientLayer({ ambient, intensity }: { ambient: string; intensity: string }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const onChange = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return (
    <div aria-hidden className="ambient" data-effect={ambient} data-intensity={intensity} data-paused={paused ? 'true' : undefined}>
      <i />
      <i />
      <i />
    </div>
  );
}

const BEAT_MS = 2500;

// The story's tension slowly darkens and warms the screen edges and quickens the ambient a little;
// each story turn (a beat counter that goes up) glows the edges once. The reading column never changes.
export function WorldRoom({ room: given, calm = false, particles = false, className = '', tension = 0, beat = 0, backdrop = null, children }: { room: Room | null; calm?: boolean; particles?: boolean; className?: string; tension?: number; beat?: number; backdrop?: string | null; children?: ReactNode }) {
  const room = given ?? HOUSE_ROOM;
  // particles: the table's particle layer already draws this ambient, so the CSS one stays off.
  const effect = room && !calm && !particles && room.ambient !== 'none' ? room.ambient : null;
  const [glow, setGlow] = useState(false);
  useEffect(() => {
    if (!beat) return;
    setGlow(true);
    const t = setTimeout(() => setGlow(false), BEAT_MS);
    return () => clearTimeout(t);
  }, [beat]);
  useEffect(() => {
    for (const el of document.querySelectorAll('.ambient i')) for (const a of el.getAnimations()) a.playbackRate = 1 + 0.5 * tension;
  }, [tension, effect]);
  return (
    <div
      className={`world relative min-h-dvh bg-background text-foreground ${className}`}
      style={{ ...roomStyle(room), '--tension': tension } as CSSProperties}
      data-font={room?.fontPair ?? 'noir-serif'}
      data-texture={room?.texture ?? 'none'}
      data-beat={glow ? 'on' : undefined}
    >
      {backdrop && !calm && <div aria-hidden className="backdrop" style={{ backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(backdrop)}")` }} />}
      <div aria-hidden className="story-edge"><i className="story-vignette" /></div>
      {effect && <AmbientLayer ambient={effect} intensity={room!.intensity} />}
      <MotionConfig reducedMotion="user"><div className="relative z-10">{children}</div></MotionConfig>
    </div>
  );
}

// Tension and story beats for a live view; the clock is re-read every 5 s for the last-minute push.
export function useStoryLook(view: { gameId?: string; status?: string; events?: { kind: string }[] } | null) {
  const last = useRef<typeof view>(null);
  const [beat, setBeat] = useState(0);
  const [tension, setTension] = useState(0);
  useEffect(() => {
    if (beatBetween(last.current, view)) setBeat((b) => b + 1);
    last.current = view;
    setTension((t) => tensionTick(t, view));
  }, [view]);
  useEffect(() => {
    const t = setInterval(() => setTension((prev) => tensionTick(prev, last.current)), 5000);
    return () => clearInterval(t);
  }, []);
  return { tension, beat };
}
