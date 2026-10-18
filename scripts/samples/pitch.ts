// Pitch of a recorded note, read from raw PCM by autocorrelation. Build-only: the VSCO file names
// are not scientific pitch, so every sample is named by what it measures.
export { noteName, noteMidi } from '../../src/lib/soundtrack/notes.ts';

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function measurePitch(pcm: Float32Array, sampleRate: number): number | null {
  const minLag = Math.floor(sampleRate / 4500);
  const maxLag = Math.ceil(sampleRate / 25);
  const start = Math.min(Math.floor(0.8 * sampleRate), Math.floor(pcm.length * 0.25));
  const size = Math.min(2 * sampleRate, pcm.length - start - maxLag - 2);
  if (size < sampleRate / 10) return null;
  let energy = 0;
  for (let i = start; i < start + size; i += 1) energy += pcm[i] * pcm[i];
  if (Math.sqrt(energy / size) < 1e-4) return null;

  const r = new Float64Array(maxLag + 2);
  for (let lag = minLag - 1; lag <= maxLag + 1; lag += 1) {
    let xy = 0;
    let yy = 0;
    for (let i = start; i < start + size; i += 1) {
      const y = pcm[i + lag];
      xy += pcm[i] * y;
      yy += y * y;
    }
    r[lag] = yy > 0 ? xy / Math.sqrt(energy * yy) : 0;
  }
  const peaks: number[] = [];
  for (let lag = minLag; lag <= maxLag; lag += 1) if (r[lag] > r[lag - 1] && r[lag] >= r[lag + 1] && r[lag] > 0) peaks.push(lag);
  if (!peaks.length) return null;
  const best = Math.max(...peaks.map((l) => r[l]));
  if (best < 0.3) return null;
  const lag = peaks.find((l) => r[l] >= 0.9 * best)!;
  const [a, b, c] = [r[lag - 1], r[lag], r[lag + 1]];
  const bend = a - 2 * b + c;
  const shift = bend === 0 ? 0 : (0.5 * (a - c)) / bend;
  return sampleRate / (lag + shift);
}
