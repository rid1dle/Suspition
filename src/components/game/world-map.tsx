'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { layoutMap, CARD_W } from '@/lib/map-layout';

type Person = { id: string; name: string; label: string; kind: string; minor: boolean; me: boolean; moved: boolean };
type Place = { id: string; name: string; icon: string; info: string; x: number; y: number; here: boolean; people: Person[] };
type Path = { from: string; to: string; kind: string; x1: number; y1: number; x2: number; y2: number; near: boolean | null };
type Layout = { width: number; height: number; places: Place[]; paths: Path[]; here: string | null; terrain: string | null; hasMinor: boolean };

const layout = layoutMap as (view: unknown, opts: { me?: string | null; before?: Record<string, string> | null; aspect?: number }) => Layout | null;
const MIN = 0.35;
const MAX = 2.5;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const DASH: Record<string, string | undefined> = { stairs: '3 5', water: '8 5' };

// A soft curve between two places, bent a little so lines that share a row do not sit on top of each other.
function curve(p: Path) {
  const mx = (p.x1 + p.x2) / 2;
  const my = (p.y1 + p.y2) / 2;
  const bend = 0.12;
  return `M${p.x1} ${p.y1} Q${mx - (p.y2 - p.y1) * bend} ${my + (p.x2 - p.x1) * bend} ${p.x2} ${p.y2}`;
}

// The world's map, the same on the big screen and the phone: places and the people in them, paths between.
// Zoom with the buttons, the wheel or a pinch; drag to look around. With onSelect, tapping a place picks it.
export function WorldMap({ view, me = null, before = null, selected = null, onSelect, className = '', tall = false }: {
  view: Record<string, unknown>; me?: string | null; before?: Record<string, string> | null; selected?: string | null;
  onSelect?: (id: string) => void; className?: string; tall?: boolean;
}) {
  // className sizes the map itself (its height); the key sits under it.
  const plan = layout(view, { me, before, aspect: tall ? 0.75 : 1.6 });
  const box = useRef<HTMLDivElement>(null);
  const [cam, setCam] = useState({ s: 1, x: 0, y: 0 });
  const [fitted, setFitted] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: boolean; dist: number; s: number } | null>(null);
  const width = plan?.width ?? 0;
  const height = plan?.height ?? 0;

  const fit = useCallback(() => {
    const el = box.current;
    if (!el || !width) return;
    const s = clamp(Math.min(el.clientWidth / width, el.clientHeight / height) * 0.96, MIN, 1.15);
    setCam({ s, x: (el.clientWidth - width * s) / 2, y: (el.clientHeight - height * s) / 2 });
  }, [width, height]);

  useLayoutEffect(() => {
    if (!fitted && width) {
      fit();
      setFitted(true);
    }
  }, [fit, fitted, width]);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setCam((c) => {
      const s = clamp(c.s * factor, MIN, MAX);
      const k = s / c.s;
      return { s, x: px - (px - c.x) * k, y: py - (py - c.y) * k };
    });
  }, []);

  // The wheel zooms where the pointer is; it needs a listener that may stop the page from scrolling.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [zoomAt]);

  if (!plan) return null;

  const down = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    drag.current = { moved: false, dist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0, s: cam.s };
  };
  const move = (e: React.PointerEvent) => {
    const last = pointers.current.get(e.pointerId);
    if (!last || !drag.current) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    if (pts.length === 2) {
      const r = box.current!.getBoundingClientRect();
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (drag.current.dist) zoomAt(dist / drag.current.dist, (pts[0].x + pts[1].x) / 2 - r.left, (pts[0].y + pts[1].y) / 2 - r.top);
      drag.current.dist = dist;
      drag.current.moved = true;
      return;
    }
    if (!drag.current.moved && Math.hypot(dx, dy) < 3) return;
    if (!drag.current.moved) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current.moved = true;
    setCam((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) setTimeout(() => { drag.current = null; }, 0);
  };
  const pick = (id: string) => {
    if (drag.current?.moved) return;
    onSelect?.(id);
  };
  const centre = (factor: number) => {
    const el = box.current;
    if (el) zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
  };

  return (
    <div className="flex flex-col gap-2">
      <div ref={box} data-world-map data-terrain={plan.terrain ?? undefined}
        className={`world-map relative min-h-64 touch-none select-none overflow-hidden rounded-xl border border-border bg-card ${className}`}
        style={className ? undefined : { aspectRatio: `${width} / ${height}`, maxHeight: '64vh' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
        <div className="absolute left-0 top-0 origin-top-left" style={{ width, height, transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})` }}>
          <svg className="absolute inset-0" width={width} height={height} aria-hidden="true">
            {plan.paths.map((p) => (
              <path key={`${p.from}-${p.to}`} d={curve(p)} fill="none" strokeLinecap="round"
                className={p.near ? 'stroke-primary' : 'stroke-muted-foreground'}
                strokeOpacity={p.near === false ? 0.25 : p.near ? 0.9 : 0.45} strokeWidth={p.kind === 'road' || p.kind === 'corridor' ? 4 : 2.5} strokeDasharray={DASH[p.kind]} />
            ))}
          </svg>
          {plan.places.map((p) => (
            <button key={p.id} type="button" data-place={p.id} title={p.info || p.name} onClick={() => pick(p.id)} disabled={!onSelect}
              className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-xl border bg-background px-3 py-2.5 text-center shadow-sm transition-colors disabled:cursor-default ${p.here ? 'border-primary ring-2 ring-primary/40' : selected === p.id ? 'border-primary' : 'border-border enabled:hover:border-primary/60'}`}
              style={{ left: p.x, top: p.y, width: CARD_W }}>
              <span className="flex max-w-full items-center gap-1.5 text-[0.95rem] font-semibold leading-tight">
                {p.icon && <span aria-hidden="true">{p.icon}</span>}
                <span className="line-clamp-2">{p.name}</span>
              </span>
              {p.people.length > 0 && (
                <span className="flex flex-wrap justify-center gap-1">
                  {p.people.map((c) => (
                    <span key={c.id} title={c.name} className={`who ${c.kind}${c.minor ? ' minor' : ''}${c.me ? ' me' : ''}${c.moved ? ' moved' : ''}`}>{c.label}</span>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="absolute bottom-2 right-2 flex overflow-hidden rounded-lg border border-border bg-background/90 text-sm shadow-sm backdrop-blur">
          <button type="button" aria-label="Zoom out" className="px-3 py-1.5 hover:bg-muted" onClick={() => centre(1 / 1.3)}>−</button>
          <button type="button" aria-label="Fit the map" className="border-x border-border px-3 py-1.5 text-xs hover:bg-muted" onClick={fit}>Fit</button>
          <button type="button" aria-label="Zoom in" className="px-3 py-1.5 hover:bg-muted" onClick={() => centre(1.3)}>+</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {me && <span className="who player me">You</span>}
        <span className="who player">Player</span>
        <span className="who npc">Played by the GM</span>
        {plan.hasMinor && <span className="who npc minor">Minor</span>}
      </div>
    </div>
  );
}

// What a tap on a place shows on the phone: who is there, how far it is, and the way to go.
export function PlacePanel({ name, info, people, trip, here, canGo, onGo }: {
  name: string; info?: string; people: string[]; trip: string | null; here: boolean; canGo: boolean; onGo: () => void;
}) {
  return (
    <div data-place-panel className="flex items-start gap-3 rounded-xl bg-card p-3">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{name}</div>
        {info && <p className="text-sm text-muted-foreground">{info}</p>}
        <p className="mt-1 text-sm">{people.length ? `Here: ${people.join(', ')}` : 'Nobody is here.'}</p>
        <p className="text-sm text-muted-foreground">{here ? 'You are here.' : trip ? `${trip[0].toUpperCase()}${trip.slice(1)} from you.` : ''}</p>
      </div>
      {!here && canGo && <button type="button" onClick={onGo} className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Go there</button>}
    </div>
  );
}
