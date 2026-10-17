// @ts-nocheck -- ported from public/sfx.js; typed when the screens settle
const note = (n) => 440 * 2 ** ((n - 69) / 12);

// Short sounds for news. Notes are MIDI numbers: [note, start in seconds, length, wave].
const SOUNDS = {
  news: [[76, 0, 0.5], [81, 0.12, 0.7]],
  said: [[55, 0, 0.35, 'triangle'], [60, 0.14, 0.5, 'triangle']],
  clue: [[84, 0, 0.3], [88, 0.08, 0.3], [91, 0.16, 0.6]],
  good: [[72, 0, 0.4], [76, 0.1, 0.4], [79, 0.2, 0.4], [84, 0.3, 0.9]],
  bad: [[67, 0, 0.45, 'triangle'], [63, 0.18, 0.45, 'triangle'], [60, 0.36, 0.9, 'triangle']],
  call: [[45, 0, 2.4], [57, 0, 2], [64, 0.02, 1.6]],
  vote: [[69, 0, 0.25], [81, 0.15, 0.25], [69, 0.4, 0.25], [81, 0.55, 0.5]],
  hint: [[84, 0, 0.8], [91, 0.15, 1.1]],
  phase: [[50, 0, 1.6, 'triangle'], [57, 0.1, 1.6], [62, 0.2, 1.8]],
  soft: [[72, 0, 0.4]],
  private: [[86, 0, 0.25], [86, 0.16, 0.45]],
  secret: [[83, 0, 0.3], [78, 0.14, 0.6]],
};

// Each world's sound set plays the same cues in its own voice: soft rings longer on sine tones,
// tense keeps the original, playful jumps an octave up on brighter waves and moves faster.
export function notesFor(kind, set = 'tense') {
  const notes = SOUNDS[kind] ?? [];
  if (set === 'soft') return notes.map(([n, at, len]) => [n - 5, at * 1.25, len * 1.6, 'sine']);
  if (set === 'playful') return notes.map(([n, at, len, wave]) => [n + 12, at * 0.8, len * 0.8, wave === 'triangle' ? 'square' : 'triangle']);
  return notes;
}

export class Sfx {
  constructor({ volume = 0.35 } = {}) {
    this.ctx = null;
    this.enabled = true;
    this.volume = volume;
    this.set = 'tense';
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchend']) globalThis.addEventListener?.(ev, unlock, { passive: true });
  }

  unlock() {
    const Ctx = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Ctx) return;
    this.ctx ??= new Ctx();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setSet(set) {
    this.set = ['soft', 'tense', 'playful'].includes(set) ? set : 'tense';
  }

  play(kind) {
    const notes = SOUNDS[kind] && notesFor(kind, this.set);
    if (!this.enabled || !notes || !this.ctx || this.ctx.state !== 'running') return false;
    const t0 = this.ctx.currentTime + 0.03;
    const out = this.ctx.createGain();
    out.gain.value = this.volume;
    out.connect(this.ctx.destination);
    for (const [n, at, len, wave = 'sine'] of notes) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = wave;
      osc.frequency.value = note(n);
      const t = t0 + at;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(wave === 'square' ? 0.18 : 0.5, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + len + 0.05);
    }
    return true;
  }
}

export const SOUND_NAMES = Object.keys(SOUNDS);
