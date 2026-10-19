'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { mapPlan, plainMapSvg, placeLabelHtml, routeFrom, MAP_W, MAP_H } from '@/lib/map-layout';

type Spot = { x: number; y: number };
type Person = { id: string; name: string; label: string; kind: string; minor: boolean; me: boolean; moved: boolean };
type Place = { id: string; name: string; icon: string; room: string; x: number; y: number; h: number; here: boolean; people: Person[] };
type Path = { from: string; to: string; kind: string; m: number; points: Spot[]; label: string; lx?: number; ly?: number; near: boolean | null };
type Plan = { width: number; height: number; places: Place[]; paths: Path[]; here: string | null; art: string | null; terrain: string | null; hasMinor: boolean };

const plan = mapPlan as (view: unknown, opts: { me?: string | null; before?: Record<string, string> | null }) => Plan | null;
const route = routeFrom as (view: unknown, from: string | null, to: string | null) => { metres: number; steps: string[] } | null;
// Leaflet's flat map: y grows upward, so a spot drawn at y from the top sits at MAP_H - y.
const at = (L: typeof Leaflet, p: Spot) => L.latLng(MAP_H - p.y, p.x);

// The world's map, the same on the big screen and the phone: the GM's drawing of the world, each place named on it
// with the people there, the paths with their distances. Drag, wheel, pinch and the buttons move and zoom it.
// With onSelect, tapping a place picks it and lights the way there from your place.
export function WorldMap({ view, me = null, before = null, selected = null, onSelect, className = '' }: {
  view: Record<string, unknown>; me?: string | null; before?: Record<string, string> | null; selected?: string | null;
  onSelect?: (id: string) => void; className?: string;
}) {
  const data = useMemo(() => plan(view, { me, before }), [view, me, before]);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const lib = useRef<typeof Leaflet | null>(null);
  const art = useRef<{ layer: Leaflet.Layer; svg: string } | null>(null);
  const marks = useRef<Leaflet.LayerGroup | null>(null);
  const pick = useRef(onSelect);
  pick.current = onSelect;
  const [ready, setReady] = useState(false);

  // Leaflet needs the browser, so it loads after the first paint and builds the map once.
  useEffect(() => {
    let gone = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (gone || !box.current || map.current) return;
      const bounds = L.latLngBounds([0, 0], [MAP_H, MAP_W]);
      const m = L.map(box.current, { crs: L.CRS.Simple, minZoom: -3, maxZoom: 2, zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 120, attributionControl: false, zoomControl: false, maxBounds: bounds.pad(0.25), maxBoundsViscosity: 0.8 });
      L.control.zoom({ position: 'bottomright', zoomInTitle: 'Zoom in', zoomOutTitle: 'Zoom out' }).addTo(m);
      const Fit = L.Control.extend({
        onAdd: () => {
          const b = L.DomUtil.create('button', 'map-fit');
          b.type = 'button';
          b.textContent = 'Fit';
          b.title = 'Fit the map';
          L.DomEvent.on(b, 'click', (e) => { L.DomEvent.stop(e); m.fitBounds(bounds, { padding: [8, 8] }); });
          return b;
        },
      });
      new Fit({ position: 'bottomright' }).addTo(m);
      m.fitBounds(bounds, { padding: [8, 8] });
      marks.current = L.layerGroup().addTo(m);
      // A drawer that slides open changes the box's size: the map measures itself again.
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => m.invalidateSize()).observe(box.current);
      lib.current = L;
      map.current = m;
      setReady(true);
    })();
    return () => {
      gone = true;
      map.current?.remove();
      map.current = null;
      art.current = null;
    };
  }, []);

  // The picture under everything: the GM's drawing, or a plain one from the same spots.
  useEffect(() => {
    const L = lib.current;
    const m = map.current;
    if (!ready || !L || !m || !data) return;
    const svg = data.art ?? plainMapSvg(data);
    if (art.current?.svg === svg) return;
    if (art.current) m.removeLayer(art.current.layer);
    const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement as unknown as SVGElement;
    el.setAttribute('preserveAspectRatio', 'none');
    const layer = L.svgOverlay(el, L.latLngBounds([0, 0], [MAP_H, MAP_W]), { interactive: false }).addTo(m);
    layer.bringToBack();
    art.current = { layer, svg };
  }, [ready, data]);

  // Paths, distances and places on top, redrawn whenever someone moves or a place is picked.
  useEffect(() => {
    const L = lib.current;
    const group = marks.current;
    if (!ready || !L || !group || !data) return;
    group.clearLayers();
    const way = me && selected ? route(view, data.here, selected) : null;
    const onWay = (p: Path) => Boolean(way && way.steps.some((s, i) => i > 0 && ((way.steps[i - 1] === p.from && s === p.to) || (way.steps[i - 1] === p.to && s === p.from))));
    for (const p of data.paths) {
      const lit = onWay(p);
      L.polyline(p.points.map((q) => at(L, q)), { color: lit ? 'var(--primary)' : '#e8dcc0', weight: lit ? 5 : 2, opacity: lit ? 0.95 : 0.35, dashArray: lit ? undefined : '6 8', interactive: false, className: 'map-path' }).addTo(group);
      // On a phone only the distances from your place, and the way you picked, are written on the map.
      if (p.label && p.lx !== undefined && p.ly !== undefined && (!me || p.near || lit)) {
        L.marker(at(L, { x: p.lx, y: p.ly }), { interactive: false, keyboard: false, icon: L.divIcon({ className: 'map-distance-icon', html: `<span class="map-distance${lit || p.near ? ' near' : ''}">${p.label}</span>`, iconSize: [0, 0] }) }).addTo(group);
      }
    }
    for (const p of data.places) {
      const marker = L.marker(at(L, p), { keyboard: Boolean(pick.current), interactive: Boolean(pick.current), riseOnHover: true, icon: L.divIcon({ className: 'map-place-icon', html: placeLabelHtml(p, { selected: selected === p.id }), iconSize: [0, 0] }) });
      marker.on('click', () => pick.current?.(p.id));
      marker.addTo(group);
    }
  }, [ready, data, selected, me, view]);

  if (!data) return null;
  return (
    <div className="flex flex-col gap-2">
      <div ref={box} data-world-map data-terrain={data.terrain ?? undefined}
        className={`world-map relative z-0 overflow-hidden rounded-xl border border-border bg-card ${className}`}
        style={className ? undefined : { aspectRatio: `${MAP_W} / ${MAP_H}`, maxHeight: '64vh' }}>
        {!ready && <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Unfolding the map…</div>}
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {me && <span className="who player me">You</span>}
        <span className="who player">Player</span>
        <span className="who npc">Played by the GM</span>
        {data.hasMinor && <span className="who npc minor">Minor</span>}
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
