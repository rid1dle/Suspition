'use client';

import { mapHtml as drawMap } from '@/lib/map';

const mapHtml = drawMap as (view: unknown, opts: { me?: string | null }) => string;

// The map is drawn by the same code as before (an escaped SVG string), shown inside React.
export function MapView({ view, me = null }: { view: Record<string, unknown>; me?: string | null }) {
  const html = mapHtml(view, { me });
  if (!html) return null;
  return <div className="map-view" dangerouslySetInnerHTML={{ __html: html }} />;
}
