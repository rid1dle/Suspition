'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
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

export function WorldRoom({ room: given, calm = false, className = '', children }: { room: Room | null; calm?: boolean; className?: string; children?: ReactNode }) {
  const room = given ?? HOUSE_ROOM;
  const effect = room && !calm && room.ambient !== 'none' ? room.ambient : null;
  return (
    <div
      className={`world relative min-h-dvh bg-background text-foreground ${className}`}
      style={roomStyle(room)}
      data-font={room?.fontPair ?? 'noir-serif'}
      data-texture={room?.texture ?? 'none'}
    >
      {effect && <AmbientLayer ambient={effect} intensity={room!.intensity} />}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
