import { ROOTS } from '../music-theory.ts';

export function noteName(midi: number): string {
  return `${ROOTS[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function noteMidi(name: string): number {
  const m = /^([A-G]#?)(-?\d+)$/.exec(name);
  if (!m) return NaN;
  return ROOTS.indexOf(m[1]) + 12 * (Number(m[2]) + 1);
}
