// @ts-nocheck -- ported from public/music.js; typed when the screens settle
import { PROGRESSION, degreeToMidi, midiToFreq, triad, sanitizeMusic } from './music-theory.ts';
import { SoundtrackPlayer } from './soundtrack/player.ts';
import { instrumentsOf } from './soundtrack/instruments.ts';

const LOOKAHEAD = 0.15;
const BEATS_PER_CHORD = 8;

export class Score {
  constructor() {
    this.ctx = null;
    this.theme = sanitizeMusic(null, 'cozy');
    this.intensity = 0.1;
    this.target = 0.1;
    this.volume = 0.6;
    this.beat = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  get playing() {
    return Boolean(this.ctx && this.ctx.state === 'running' && this.timer);
  }

  async start() {
    if (!this.ctx) this.build();
    await this.ctx.resume();
    if (!this.timer) {
      this.nextTime = this.ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 40);
    }
    this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.5);
  }

  stop() {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    clearInterval(this.timer);
    this.timer = null;
    setTimeout(() => this.ctx?.suspend(), 1200);
  }

  setVolume(v) {
    this.volume = v;
    if (this.playing) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.2);
  }

  duck(on) {
    this.ducked = on;
    if (this.playing) this.master.gain.setTargetAtTime(on ? this.volume * 0.3 : this.volume, this.ctx.currentTime, 0.25);
  }

  setTheme(music, tone) {
    this.theme = sanitizeMusic(music, tone);
  }

  setIntensity(x) {
    this.target = Math.max(0, Math.min(1, x));
  }

  level() {
    if (!this.analyser) return { rms: 0, peak: 0 };
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    let peak = 0;
    for (const s of buf) {
      sum += s * s;
      peak = Math.max(peak, Math.abs(s));
    }
    return { rms: Math.sqrt(sum / buf.length), peak };
  }

  build() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(3.2);
    this.dry.connect(comp);
    this.wet.connect(reverb).connect(comp);
    comp.connect(this.master).connect(this.analyser).connect(ctx.destination);
    this.noise = this.noiseBuffer();
  }

  impulse(seconds) {
    const { ctx } = this;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
    }
    return buf;
  }

  noiseBuffer() {
    const { ctx } = this;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  out(node, wet = 0.5) {
    node.connect(this.dry);
    if (wet > 0) {
      const send = this.ctx.createGain();
      send.gain.value = wet;
      node.connect(send).connect(this.wet);
    }
  }

  envelope(gain, t, { attack, hold = 0, release, peak }) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.setValueAtTime(peak, t + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return t + attack + hold + release;
  }

  osc(type, freq, t, end, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.start(t);
    o.stop(end + 0.05);
    return o;
  }

  voice(palette, midi, t, dur, level) {
    const { ctx } = this;
    const f = midiToFreq(midi);
    const g = ctx.createGain();
    const parts = [];
    let end;
    let wet = 0.5;
    const lp = (freq, q = 0.7) => {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq;
      filter.Q.value = q;
      return filter;
    };
    switch (palette) {
      case 'strings': {
        end = this.envelope(g, t, { attack: 0.35, hold: dur * 0.6, release: 0.8, peak: level * 0.5 });
        const filter = lp(1800);
        for (const d of [-7, 7]) parts.push([this.osc('sawtooth', f, t, end, d), filter]);
        break;
      }
      case 'synth_pad': {
        end = this.envelope(g, t, { attack: 0.9, hold: dur * 0.5, release: 1.4, peak: level * 0.45 });
        const filter = lp(900);
        for (const d of [-10, 0, 10]) parts.push([this.osc('sawtooth', f, t, end, d), filter]);
        wet = 0.8;
        break;
      }
      case 'organ':
        end = this.envelope(g, t, { attack: 0.05, hold: dur * 0.8, release: 0.25, peak: level * 0.35 });
        for (const m of [1, 2, 3]) parts.push([this.osc('sine', f * m, t, end), null, 1 / m]);
        break;
      case 'piano':
        end = this.envelope(g, t, { attack: 0.01, release: 1.4, peak: level * 0.7 });
        parts.push([this.osc('triangle', f, t, end), lp(2600)], [this.osc('sine', f * 2, t, end), null, 0.25]);
        break;
      case 'music_box':
        end = this.envelope(g, t, { attack: 0.005, release: 0.9, peak: level * 0.55 });
        parts.push([this.osc('sine', f * 2, t, end)], [this.osc('sine', f * 8, t, end), null, 0.08]);
        wet = 0.7;
        break;
      case 'plucked': {
        end = this.envelope(g, t, { attack: 0.005, release: 0.45, peak: level * 0.5 });
        const filter = lp(3000, 4);
        filter.frequency.setValueAtTime(3000, t);
        filter.frequency.exponentialRampToValueAtTime(400, t + 0.4);
        parts.push([this.osc('square', f, t, end), filter]);
        break;
      }
      case 'marimba':
        end = this.envelope(g, t, { attack: 0.004, release: 0.5, peak: level * 0.75 });
        parts.push([this.osc('sine', f, t, end)], [this.osc('sine', f * 4, t, t + 0.08), null, 0.2]);
        wet = 0.3;
        break;
      case 'bells':
      default:
        end = this.envelope(g, t, { attack: 0.004, release: 2.2, peak: level * 0.45 });
        parts.push([this.osc('sine', f * 2, t, end)], [this.osc('sine', f * 2 * 2.76, t, end), null, 0.18]);
        wet = 0.8;
    }
    for (const [o, filter, gain = 1] of parts) {
      let node = o;
      if (gain !== 1) {
        const pg = ctx.createGain();
        pg.gain.value = gain;
        node = node.connect(pg);
      }
      if (filter) node = node.connect(filter);
      node.connect(g);
    }
    this.out(g, wet);
  }

  hit(kind, t, level) {
    const { ctx } = this;
    const g = ctx.createGain();
    if (kind === 'thump') {
      const o = this.osc('sine', 70, t, t + 0.35);
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
      this.envelope(g, t, { attack: 0.005, release: 0.3, peak: level });
      o.connect(g);
      this.out(g, 0.1);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    const shapes = {
      tick: ['highpass', 6000, 0.03, level * 0.25],
      brush: ['bandpass', 2500, 0.18, level * 0.18],
      tom: ['lowpass', 300, 0.25, level * 0.8],
    }[kind];
    filter.type = shapes[0];
    filter.frequency.value = shapes[1];
    this.envelope(g, t, { attack: 0.003, release: shapes[2], peak: shapes[3] });
    src.connect(filter).connect(g);
    src.start(t);
    src.stop(t + shapes[2] + 0.05);
    this.out(g, 0.2);
  }

  schedule() {
    const { ctx } = this;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.intensity += (this.target - this.intensity) * 0.08;
      this.playBeat(this.beat, this.nextTime);
      const tempo = this.theme.tempo * (1 + 0.15 * this.intensity);
      this.nextTime += 60 / tempo;
      this.beat += 1;
    }
  }

  playBeat(b, t) {
    const th = this.theme;
    const x = this.intensity;
    const spb = 60 / (th.tempo * (1 + 0.15 * x));
    const inBar = b % 4;
    const chordIdx = Math.floor(b / BEATS_PER_CHORD) % PROGRESSION.length;
    const degree = PROGRESSION[chordIdx];
    const melodic = ['piano', 'music_box', 'plucked', 'marimba', 'bells'].includes(th.palette);
    const padPalette = melodic ? 'strings' : th.palette;

    if (b % BEATS_PER_CHORD === 0) {
      for (const n of triad(th, degree, 3)) this.voice(padPalette, n, t, spb * BEATS_PER_CHORD, 0.16 + 0.1 * x);
    }
    if (inBar === 0 || (x > 0.4 && inBar === 2) || x > 0.75) {
      this.voice(x > 0.6 ? 'plucked' : 'organ', degreeToMidi(th, degree, 1), t, spb * 0.9, 0.35 + 0.25 * x);
    }

    const phraseLen = th.motif.length;
    const phrase = Math.floor(b / phraseLen);
    const playMotif = x > 0.5 || phrase % 2 === 0;
    if (playMotif && b % (x > 0.7 ? 1 : 2) === 0) {
      const step = b % phraseLen;
      const lift = phrase % 4 === 3 ? 2 : 0;
      this.voice(melodic ? th.palette : 'bells', degreeToMidi(th, th.motif[step] + lift, 4), t, spb * 1.5, 0.22 + 0.12 * x);
    }

    if (x > 0.25 || th.percussion === 'soft_tick') this.percussion(th.percussion, b, t, spb, x);

    if (x > 0.6 && inBar === 0) {
      const shimmer = (x - 0.6) * 0.5;
      const root = degreeToMidi(th, degree, 5);
      for (const n of [root, root + 1]) this.voice('synth_pad', n, t, spb * 4, shimmer);
    }
  }

  percussion(kind, b, t, spb, x) {
    const inBar = b % 4;
    switch (kind) {
      case 'heartbeat':
        if (inBar === 0 || x > 0.7) {
          this.hit('thump', t, 0.5 + 0.4 * x);
          this.hit('thump', t + spb * 0.28, 0.3 + 0.3 * x);
        }
        break;
      case 'soft_tick':
        this.hit('tick', t, 0.4 + 0.4 * x);
        if (x > 0.5) this.hit('tick', t + spb / 2, 0.25 + 0.3 * x);
        break;
      case 'brush':
        if (inBar % 2 === 1) this.hit('brush', t, 0.5 + 0.5 * x);
        if (inBar === 0) this.hit('thump', t, 0.3 + 0.2 * x);
        break;
      case 'tribal':
        if (inBar === 0 || inBar === 2) this.hit('tom', t, 0.5 + 0.4 * x);
        if (inBar === 2 || x > 0.6) this.hit('tom', t + spb / 2, 0.3 + 0.3 * x);
        break;
      default:
    }
  }

  cue(kind) {
    if (!this.playing) return;
    const t = this.ctx.currentTime + 0.05;
    const th = this.theme;
    if (kind === 'hint') {
      [0, 2, 4, 7].forEach((d, i) => this.voice('bells', degreeToMidi(th, d, 5), t + i * 0.12, 1, 0.35));
    } else if (kind === 'phase') {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(400, t);
      filter.frequency.exponentialRampToValueAtTime(5000, t + 2.2);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 2.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      src.connect(filter).connect(g);
      this.out(g, 0.6);
      src.start(t);
      src.stop(t + 2.5);
      this.hit('thump', t + 2.3, 0.9);
      for (const n of triad(th, 0, 2)) this.voice('synth_pad', n, t + 2.3, 3, 0.25);
    } else if (kind === 'final') {
      const root = degreeToMidi(th, 0, 3);
      for (const n of [root, root + 1, root + 6, root + 7]) this.voice('strings', n, t, 4, 0.22);
    } else if (kind === 'reveal') {
      const warm = { ...th, mode: 'major' };
      [[4, 0], [0, 2.2]].forEach(([deg, at]) => {
        for (const n of triad(warm, deg, 3)) this.voice('strings', n, t + at, 2.4, 0.3);
      });
      [0, 4, 7, 9].forEach((d, i) => this.voice('bells', degreeToMidi(warm, d, 5), t + 2.2 + i * 0.25, 2, 0.3));
    }
  }
}

const PREVIEW_MS = 10_000;
const PREVIEW_X = 0.55;
const STINGER_FOR = { phase: 'round', seat: 'seat', vote: 'vote', final: 'vote', reveal: 'reveal', hint: 'hint' };

const ready = (s) => (s?.status === 'ready' && s.directions?.length ? s : null);
const gameKey = (s) => s.directions.map((d) => `${d.name}/${d.tempo}/${d.root}/${d.lead}`).join('|');
const choiceKey = (s) => `${gameKey(s)}#${s.chosen ?? 0}`;
const chosenOf = (s) => s.directions[s.chosen ?? 0] ?? s.directions[0];

// What the table plays: the GM's composed soundtrack once its samples load, and the simple Score
// until then, whenever there is no soundtrack, or for the rest of the game if the samples fail.
// Same members as Score, so the table treats it the same way.
export class Music {
  constructor({ makeScore = () => new Score(), makePlayer = () => new SoundtrackPlayer(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    this.score = makeScore();
    this.makePlayer = makePlayer;
    this.sleep = sleep;
    this.player = null;
    this.soundtrack = null;
    this.round = 0;
    this.intensity = 0.1;
    this.on = false;
    this.composed = false;
    this.failedKey = null;
    this.token = 0;
    this.previewing = null;
    this.previewWasOn = false;
    this.vol = this.score.volume ?? 0.6;
  }

  get volume() {
    return this.vol;
  }

  set volume(v) {
    this.vol = v;
    this.score.setVolume(v);
    this.player?.setVolume(v);
  }

  get playing() {
    return Boolean((this.composed && this.player?.playing) || this.score.playing);
  }

  get source() {
    const s = ready(this.soundtrack);
    if (!s || this.failedKey === gameKey(s)) return 'simple';
    return this.composed ? 'composed' : 'loading';
  }

  canCompose() {
    return this.source !== 'simple';
  }

  ensurePlayer() {
    if (!this.player) {
      this.player = this.makePlayer();
      this.player.setVolume(this.vol);
    }
    return this.player;
  }

  async start() {
    this.on = true;
    this.previewing = null;
    if (!this.composed || !this.player?.playing) await this.score.start();
    if (this.canCompose()) this.switchTo(chosenOf(this.soundtrack));
  }

  stop() {
    this.on = false;
    this.token += 1;
    this.previewing = null;
    this.score.stop();
    this.player?.stop();
    this.composed = false;
  }

  setVolume(v) {
    this.volume = v;
  }

  duck(on) {
    this.score.duck(on);
    this.player?.duck(on);
  }

  setTheme(music, tone) {
    this.score.setTheme(music, tone);
  }

  setIntensity(x) {
    this.intensity = x;
    this.score.setIntensity(x);
    if (this.previewing == null) this.player?.setIntensity(x);
  }

  setRound(i) {
    if (i === this.round) return;
    this.round = i;
    if (this.composed && this.previewing == null) this.player.setRound(i);
  }

  setSoundtrack(s) {
    const before = ready(this.soundtrack);
    this.soundtrack = s;
    const now = ready(s);
    if (!now) {
      if (this.composed) this.fallBack();
      return;
    }
    if (before && choiceKey(before) === choiceKey(now)) return;
    if (!this.on || this.previewing != null || !this.canCompose()) return;
    this.switchTo(chosenOf(now));
  }

  switchTo(d) {
    const t = (this.token += 1);
    const s = this.soundtrack;
    this.ensurePlayer().load(instrumentsOf(d)).then(() => {
      if (t === this.token) this.begin(d, this.round, this.intensity);
    }, () => {
      if (t !== this.token) return;
      this.failedKey = gameKey(s);
      this.fallBack();
    });
  }

  begin(d, round, x) {
    const p = this.player;
    if (this.composed && p.playing) {
      p.setDirection(d);
      p.setRound(round);
    } else {
      p.play(d, round);
      this.composed = true;
      this.score.stop();
    }
    p.setIntensity(x);
  }

  fallBack() {
    if (this.composed) this.player?.stop();
    this.composed = false;
    if (this.on && !this.score.playing) this.score.start();
  }

  async preview(index) {
    const s = ready(this.soundtrack);
    const d = s?.directions[index];
    if (!d || this.failedKey === gameKey(s)) return;
    if (this.previewing == null) this.previewWasOn = this.on;
    this.previewing = index;
    const t = (this.token += 1);
    try {
      await this.ensurePlayer().load(instrumentsOf(d));
    } catch {
      if (t !== this.token) return;
      this.previewing = null;
      this.failedKey = gameKey(s);
      this.fallBack();
      return;
    }
    if (t !== this.token) return;
    this.begin(d, 0, PREVIEW_X);
    await this.sleep(PREVIEW_MS);
    if (t !== this.token) return;
    this.previewing = null;
    if (this.previewWasOn) {
      this.switchTo(chosenOf(this.soundtrack));
    } else {
      this.token += 1;
      this.player.stop();
      this.composed = false;
    }
  }

  nextPiece() {
    if (this.composed) this.player.nextPiece();
  }

  cue(kind) {
    if (this.composed && this.player?.playing) {
      const stinger = STINGER_FOR[kind];
      if (stinger) this.player.stinger(stinger);
    } else this.score.cue(kind);
  }

  level() {
    return this.composed && this.player?.playing ? this.player.level() : this.score.level();
  }
}
