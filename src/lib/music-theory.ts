// @ts-nocheck -- ported from public/music-theory.js; typed when the screens settle
export const ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
};
export const PALETTES = ['strings', 'piano', 'music_box', 'synth_pad', 'plucked', 'organ', 'marimba', 'bells'];
export const PERCUSSION = ['none', 'heartbeat', 'soft_tick', 'brush', 'tribal'];

const TONE_DEFAULTS = {
  cozy: { root: 'F', mode: 'lydian', tempo: 78, palette: 'piano', percussion: 'brush', motif: [0, 2, 4, 2, 5, 4] },
  tense: { root: 'D', mode: 'harmonic_minor', tempo: 92, palette: 'strings', percussion: 'heartbeat', motif: [0, 1, 0, 4, 3, 1] },
  dark: { root: 'C#', mode: 'phrygian', tempo: 64, palette: 'synth_pad', percussion: 'heartbeat', motif: [0, 1, 0, 6, 5, 1, 0] },
  funny: { root: 'G', mode: 'major', tempo: 112, palette: 'marimba', percussion: 'soft_tick', motif: [0, 4, 2, 5, 4, 7, 4] },
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function sanitizeMusic(music, tone = 'tense') {
  const base = TONE_DEFAULTS[tone] ?? TONE_DEFAULTS.tense;
  const m = music && typeof music === 'object' ? music : {};
  const motif = Array.isArray(m.motif) ? m.motif.map(Number).filter(Number.isInteger).map((d) => clamp(d, 0, 7)).slice(0, 8) : [];
  return {
    root: ROOTS.includes(m.root) ? m.root : base.root,
    mode: MODES[m.mode] ? m.mode : base.mode,
    tempo: Number.isFinite(Number(m.tempo)) ? clamp(Math.round(Number(m.tempo)), 50, 140) : base.tempo,
    palette: PALETTES.includes(m.palette) ? m.palette : base.palette,
    percussion: PERCUSSION.includes(m.percussion) ? m.percussion : base.percussion,
    motif: motif.length >= 3 ? motif : base.motif,
  };
}

export function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function degreeToMidi(music, degree, octave = 4) {
  const scale = MODES[music.mode];
  const steps = scale.length;
  const oct = Math.floor(degree / steps);
  const idx = ((degree % steps) + steps) % steps;
  return 12 * (octave + 1 + oct) + ROOTS.indexOf(music.root) + scale[idx];
}

export const PROGRESSION = [0, 5, 3, 4];

export function triad(music, degree, octave = 3) {
  return [0, 2, 4].map((step) => degreeToMidi(music, degree + step, octave));
}

export function intensityFor(view, now = Date.now()) {
  if (!view) return 0.1;
  switch (view.status) {
    case 'lobby':
    case 'failed':
      return 0.1;
    case 'generating':
      return 0.2;
    case 'reading':
      return 0.25;
    case 'final':
      return 0.85;
    case 'reveal':
      return 0.3;
    case 'playing': {
      const phase = view.phase ? (view.phase.index + 1) / view.phase.count : 0;
      const suspicion = (view.suspicion ?? 0) / 100;
      const lastMinute = view.phase?.endsAt && view.phase.endsAt - now < 60_000 ? 0.15 : 0;
      return clamp(0.3 + phase * 0.35 + suspicion * 0.25 + lastMinute, 0, 1);
    }
    default:
      return 0.2;
  }
}

export function cuesBetween(prev, next) {
  if (!prev || !next || prev.gameId !== next.gameId) return [];
  const cues = [];
  if (next.status === 'reveal' && prev.status !== 'reveal') cues.push('reveal');
  if (next.phase && prev.phase && (next.phase.index !== prev.phase.index || next.phase.number !== prev.phase.number)) cues.push('phase');
  if (next.status === 'playing' && prev.status === 'reading') cues.push('phase');
  if (next.hintsLeft != null && prev.hintsLeft != null && next.hintsLeft < prev.hintsLeft) cues.push('hint');
  if (next.status === 'final' && prev.status === 'playing') cues.push('final');
  return cues;
}
