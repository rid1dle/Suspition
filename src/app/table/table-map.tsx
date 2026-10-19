'use client';

import { useEffect, useRef, useState } from 'react';
import { mapHtml as drawMap } from '@/lib/map';
import { Button } from '@/components/ui/button';
import { Muted } from '@/components/game/label';
import { WorldMap } from '@/components/game/world-map';
import type { TableProps } from './table-app';

const mapHtml = drawMap as (view: unknown, opts: { before?: Record<string, string> | null; editing?: boolean }) => string;

// The table's map: who is where now (moves glow), and for the host, drag places and name real spots.
export function TableMap({ view, host, act }: Pick<TableProps, 'view' | 'host' | 'act'>) {
  const box = useRef<HTMLDivElement>(null);
  const before = useRef<Record<string, string> | null>(null);
  const dragging = useRef(false);
  const [editing, setEditing] = useState(false);

  const [moved, setMoved] = useState<Record<string, string> | null>(null);
  // Who moved since the last update glows for a moment.
  useEffect(() => {
    if (editing) return;
    setMoved(before.current);
    before.current = (view.map as { positions?: Record<string, string> } | null)?.positions ?? null;
  }, [view, editing]);

  // Editing keeps the old drawing: drag a place, type where it is in your room.
  useEffect(() => {
    const el = box.current;
    if (!editing || !el || dragging.current || document.activeElement?.classList.contains('room-input')) return;
    el.innerHTML = mapHtml(view, { editing });
    const area = el.querySelector<HTMLElement>('.map');
    for (const place of el.querySelectorAll<HTMLElement>('.place.editing')) {
      let at: { x?: number; y?: number } = {};
      place.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement).closest('input')) return;
        e.preventDefault();
        try { place.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
        place.classList.add('dragging');
        dragging.current = true;
        at = {};
      });
      place.addEventListener('pointermove', (e) => {
        if (!dragging.current || !area) return;
        const r = area.getBoundingClientRect();
        at = { x: Math.max(6, Math.min(94, ((e.clientX - r.left) / r.width) * 100)), y: Math.max(8, Math.min(92, ((e.clientY - r.top) / r.height) * 100)) };
        place.style.left = `${at.x}%`;
        place.style.top = `${at.y}%`;
      });
      const drop = async () => {
        if (!dragging.current) return;
        dragging.current = false;
        place.classList.remove('dragging');
        if (at.x !== undefined) await act('place', { id: place.dataset.place, x: at.x, y: at.y });
      };
      place.addEventListener('pointerup', drop);
      place.addEventListener('pointercancel', drop);
    }
    for (const input of el.querySelectorAll<HTMLInputElement>('.room-input')) {
      input.addEventListener('change', () => act('place', { id: input.dataset.room, room: input.value }));
      input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
    }
  }, [view, editing, act]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Muted className="text-xs">Who is where right now</Muted>
        {host && <Button size="sm" variant={editing ? 'default' : 'ghost'} onClick={() => setEditing((e) => !e)}>{editing ? 'Done' : 'Edit map'}</Button>}
      </div>
      {editing && <Muted className="text-xs">Drag places to move them. Type where each place is in your room.</Muted>}
      {editing ? <div ref={box} /> : <WorldMap view={view} before={moved} className="h-[min(62vh,620px)]" />}
    </div>
  );
}
