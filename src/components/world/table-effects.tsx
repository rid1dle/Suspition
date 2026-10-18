'use client';

import { useEffect, useMemo, useState } from 'react';
import { MeshGradient } from '@paper-design/shaders-react';
import { Particles, ParticlesProvider } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { ISourceOptions } from '@tsparticles/engine';
import type { Room } from '@/lib/views';
import { PARTICLE_AMBIENTS, SLOW_SECONDS, slowStreak } from '@/lib/effects';

// Watches the frame rate while the tab is visible; turns true after a few slow seconds in a row.
export function useLowFrameRate() {
  const [low, setLow] = useState(false);
  useEffect(() => {
    let frames = 0;
    let streak = 0;
    let raf = 0;
    const loop = () => { frames += 1; raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const t = setInterval(() => {
      if (!document.hidden) {
        streak = slowStreak(streak, frames);
        if (streak >= SLOW_SECONDS) setLow(true);
      }
      frames = 0;
    }, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(t); };
  }, []);
  return low;
}

function particleOptions(ambient: string, color: string): ISourceOptions {
  const base = { fullScreen: { enable: false }, fpsLimit: 40, detectRetina: false, background: { color: 'transparent' } };
  if (ambient === 'snow') return { ...base, particles: { number: { value: 90 }, paint: { fill: { enable: true, color: { value: '#ffffff' } } }, opacity: { value: { min: 0.3, max: 0.8 } }, size: { value: { min: 1, max: 3.5 } }, move: { enable: true, direction: 'bottom', speed: { min: 0.4, max: 1.4 }, straight: false, drift: { min: -0.4, max: 0.4 } } } };
  if (ambient === 'embers') return { ...base, particles: { number: { value: 55 }, paint: { fill: { enable: true, color: { value: ['#ffb347', '#ff7a3d', color] } } }, opacity: { value: { min: 0.2, max: 0.9 }, animation: { enable: true, speed: 0.8 } }, size: { value: { min: 0.8, max: 2.6 } }, move: { enable: true, direction: 'top', speed: { min: 0.3, max: 1.2 }, random: true } } };
  if (ambient === 'fireflies') return { ...base, particles: { number: { value: 35 }, paint: { fill: { enable: true, color: { value: '#e8ff8a' } } }, opacity: { value: { min: 0.1, max: 1 }, animation: { enable: true, speed: 0.6 } }, size: { value: { min: 1.5, max: 3 } }, move: { enable: true, speed: 0.4, random: true } } };
  return { ...base, particles: { number: { value: 70 }, paint: { fill: { enable: true, color: { value: '#ffffff' } } }, opacity: { value: { min: 0.05, max: 0.3 } }, size: { value: { min: 0.5, max: 1.5 } }, move: { enable: true, speed: 0.15, random: true } } };
}

// One init for the whole app: ParticlesProvider throws if its init changes while the engine loads.
const initEngine = async (engine: Parameters<typeof loadSlim>[0]) => {
  await loadSlim(engine);
};

// The table's living background: a slow colour field from the room's palette, plus particles
// for embers, fireflies, snow and dust. Only on the table; never on phones.
export default function TableEffects({ room }: { room: Room }) {
  const particles = PARTICLE_AMBIENTS.has(room.ambient);
  const c = room.colors;
  const options = useMemo(() => particleOptions(room.ambient, c.accent), [room.ambient, c.accent]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <MeshGradient className="absolute inset-0 opacity-40" colors={[c.bg, c.surface, c.surfaceAlt, c.accent]} distortion={0.6} swirl={0.3} speed={room.intensity === 'medium' ? 0.25 : 0.12} maxPixelCount={1280 * 720} minPixelRatio={1} />
      {particles && (
        <ParticlesProvider init={initEngine}>
          <Particles id="table-particles" className="absolute inset-0" options={options} />
        </ParticlesProvider>
      )}
    </div>
  );
}
