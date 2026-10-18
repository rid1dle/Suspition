'use client';

import { mapHtml as drawMap } from '@/lib/map';

const mapHtml = drawMap as (view: unknown, opts: { me?: string | null }) => string;

// The map is drawn by the same code as before (an escaped SVG string), shown inside React.
// With onPlace, tapping a place picks it (each place carries data-place).
export function MapView({ view, me = null, onPlace }: { view: Record<string, unknown>; me?: string | null; onPlace?: (id: string) => void }) {
  const html = mapHtml(view, { me });
  if (!html) return null;
  const pick = onPlace ? (e: React.MouseEvent) => {
    const id = (e.target as HTMLElement).closest?.('[data-place]')?.getAttribute('data-place');
    if (id) onPlace(id);
  } : undefined;
  return <div className={`map-view${onPlace ? ' cursor-pointer' : ''}`} onClick={pick} dangerouslySetInnerHTML={{ __html: html }} />;
}
