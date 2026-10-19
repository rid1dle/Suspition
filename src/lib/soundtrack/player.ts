// The composed soundtrack on the table: Tone.js samplers play what the arranger writes, bar by bar.
// Tone is loaded only here, inside load(), so phones and tests never fetch it.
import type { Gain, Analyser, Sampler, PolySynth, ToneAudioBuffer } from 'tone';
import { MANIFEST } from './manifest.ts';
import { noteName } from './notes.ts';
import { arrangeBar, roundPlan, stingerNotes } from './arrange.ts';
import { VARIATIONS } from './types.ts';
import type { Direction, InstrumentId, KitId, NoteEvent, Part, StingerKind, Variation } from './types.ts';

type ToneLib = typeof import('tone');
type Voice = Sampler | PolySynth;

export const PART_GAIN: Record<Part, number> = { drone: 0.25, pad: 0.35, bass: 0.6, chords: 0.45, pulse: 0.4, melody: 0.7, counter: 0.35, groove: 0.5, stinger: 0.8 };
export const LOAD_MS = 20_000;
const FADE_S = 4;
const EASE = 0.08;
const MAKEUP = 1.8;
const KIT_NOTE = 'C4';
const KIT_RELEASE: Record<KitId, number> = { kick: 0.3, snare: 0.3, shaker: 0.2, woodblock: 0.2, triangle: 1, cymbal: 1.5, timpani_roll: 1.5 };

export interface PlayerLike {
  warm(): Promise<void>;
  unlock(): void;
  load(ids: (InstrumentId | KitId)[]): Promise<void>;
  play(d: Direction, roundIndex: number): void;
  setRound(i: number): void;
  setDirection(d: Direction): void;
  setIntensity(x: number, now?: boolean): void;
  stinger(kind: StingerKind | 'hint'): void;
  nextPiece(): void;
  setVolume(v: number): void;
  duck(on: boolean): void;
  stop(): void;
  level(): { rms: number; peak: number };
  readonly playing: boolean;
}

export function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, fail) => { timer = setTimeout(() => fail(new Error(message)), ms); });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export class SoundtrackPlayer implements PlayerLike {
  private tone: ToneLib | null = null;
  private buffers = new Map<string, Record<string, ToneAudioBuffer>>();
  private loads = new Map<string, Promise<void>>();
  private voices: Map<string, Voice>[] = [new Map(), new Map()];
  private buses: Gain[] = [];
  private master: Gain | null = null;
  private analyser: Analyser | null = null;
  private repeat: number | null = null;
  private direction: Direction | null = null;
  private next: Direction | null = null;
  private round = 0;
  private variation: Variation | null = null;
  private change = false;
  private bar = 0;
  private voicing: number[] | null = null;
  private active = 0;
  private target = 0.1;
  private x = 0.1;
  private volume = 0.6;
  private ducked = false;
  playing = false;
  private importTone: () => Promise<ToneLib>;

  constructor({ importTone = () => import('tone') }: { importTone?: () => Promise<ToneLib> } = {}) {
    this.importTone = importTone;
  }

  // Fetch the Tone code ahead of the first click, so unlock() can run inside that click.
  async warm(): Promise<void> {
    this.tone ??= await this.importTone();
  }

  // Browsers (Safari most of all) only start audio inside a click: call this first thing in one.
  unlock() {
    this.tone?.start().catch(() => {});
  }

  // Samples load and decode even while audio is still locked; the music starts once it unlocks.
  async load(ids: (InstrumentId | KitId)[]): Promise<void> {
    const work = (async () => {
      await this.warm();
      const Tone = this.tone!;
      this.unlock();
      this.build(Tone);
      await Promise.all(ids.filter((id) => id !== 'pad').map((id) => this.loadOne(Tone, id)));
    })();
    await withTimeout(work, LOAD_MS, 'The instruments took too long to load.');
  }

  private loadOne(Tone: ToneLib, id: string): Promise<void> {
    if (this.buffers.has(id)) return Promise.resolve();
    const pending = this.loads.get(id);
    if (pending) return pending;
    const entry = MANIFEST[id];
    if (!entry) return Promise.reject(new Error(`No samples for ${id}.`));
    const p = new Promise<void>((ok, fail) => {
      const set = new Tone.ToneAudioBuffers({
        urls: entry.notes,
        baseUrl: '/samples/',
        onload: () => {
          this.buffers.set(id, Object.fromEntries(Object.keys(entry.notes).map((n) => [n === 'hit' ? KIT_NOTE : n, set.get(n)])));
          ok();
        },
        onerror: (err) => fail(err instanceof Error ? err : new Error(String(err))),
      });
    });
    this.loads.set(id, p);
    p.catch(() => this.loads.delete(id));
    return p;
  }

  private build(Tone: ToneLib) {
    if (this.master) return;
    this.master = new Tone.Gain(0);
    const reverb = new Tone.Reverb({ decay: 3, wet: 0.25 });
    const limiter = new Tone.Limiter(-1);
    this.analyser = new Tone.Analyser('waveform', 1024);
    this.master.chain(reverb, limiter, Tone.getDestination());
    limiter.connect(this.analyser);
    this.buses = [new Tone.Gain(1).connect(this.master), new Tone.Gain(0).connect(this.master)];
  }

  private voice(bus: number, id: InstrumentId | KitId): Voice | null {
    const Tone = this.tone;
    if (!Tone) return null;
    const have = this.voices[bus].get(id);
    if (have) return have;
    let v: Voice;
    if (id === 'pad') {
      v = new Tone.PolySynth(Tone.AMSynth, { envelope: { attack: 1.2, decay: 0.4, sustain: 0.8, release: 2.5 }, volume: -10 });
    } else {
      const urls = this.buffers.get(id);
      if (!urls) return null;
      v = new Tone.Sampler({ urls, release: id in KIT_RELEASE ? KIT_RELEASE[id as KitId] : 1.2 });
    }
    v.connect(this.buses[bus]);
    this.voices[bus].set(id, v);
    return v;
  }

  private gainNow() {
    return this.volume * MAKEUP * (this.ducked ? 0.3 : 1);
  }

  play(d: Direction, roundIndex: number) {
    const Tone = this.tone;
    if (!Tone || !this.master) return;
    this.direction = d;
    this.next = null;
    this.round = roundIndex;
    this.variation = null;
    this.change = false;
    this.bar = 0;
    this.voicing = null;
    const transport = Tone.getTransport();
    transport.bpm.value = d.tempo;
    if (this.repeat == null) this.repeat = transport.scheduleRepeat((time) => this.onBar(time), '1m');
    if (transport.state !== 'started') transport.start('+0.05');
    this.master.gain.rampTo(this.gainNow(), 1);
    this.playing = true;
  }

  private onBar(time: number) {
    const Tone = this.tone;
    if (!Tone || !this.playing) return;
    if (this.change) {
      this.change = false;
      if (this.next) this.direction = this.next;
      this.next = null;
      const from = this.active;
      this.active = 1 - from;
      this.buses[from].gain.rampTo(0, FADE_S, time);
      this.buses[this.active].gain.rampTo(1, FADE_S, time);
      Tone.getTransport().bpm.setValueAtTime(this.direction!.tempo, time);
      this.bar = 0;
      this.voicing = null;
    }
    const d = this.direction;
    if (!d) return;
    for (let i = 0; i < 4; i += 1) this.x += (this.target - this.x) * EASE;
    const { events, voicing } = arrangeBar(d, this.round, this.bar, this.x, this.voicing, this.variation ?? undefined);
    this.voicing = voicing;
    this.bar += 1;
    this.schedule(events, time, this.active, d.tempo);
  }

  private schedule(events: NoteEvent[], time: number, bus: number, tempo: number) {
    const spb = 60 / tempo;
    for (const e of events) {
      const v = this.voice(bus, e.instrument);
      if (!v) continue;
      const note = e.instrument in KIT_RELEASE ? KIT_NOTE : noteName(e.midi);
      v.triggerAttackRelease(note, e.beats * spb, time + e.at * spb, Math.min(1, e.velocity * PART_GAIN[e.part]));
    }
  }

  setDirection(d: Direction) {
    this.next = d;
    this.variation = null;
    this.change = true;
  }

  setRound(i: number) {
    if (i === this.round) return;
    this.round = i;
    this.variation = null;
    this.change = true;
  }

  setIntensity(x: number, now = false) {
    this.target = Math.max(0, Math.min(1, x));
    if (now) this.x = this.target;
  }

  stinger(kind: StingerKind | 'hint') {
    const Tone = this.tone;
    const d = this.direction;
    if (!Tone || !d || !this.playing) return;
    this.schedule(stingerNotes(d, kind), Tone.now() + 0.05, this.active, d.tempo);
  }

  nextPiece() {
    const d = this.next ?? this.direction;
    if (!d) return;
    const now = this.variation ?? roundPlan(d, this.round).variation;
    this.variation = VARIATIONS[(VARIATIONS.indexOf(now) + 1) % VARIATIONS.length];
    this.change = true;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.playing) this.master?.gain.rampTo(this.gainNow(), 0.2);
  }

  duck(on: boolean) {
    this.ducked = on;
    if (this.playing) this.master?.gain.rampTo(this.gainNow(), 0.25);
  }

  stop() {
    if (!this.tone || !this.master) return;
    this.playing = false;
    this.master.gain.rampTo(0, 0.4);
    this.tone.getTransport().stop('+0.5');
  }

  level() {
    if (!this.analyser || !this.playing) return { rms: 0, peak: 0 };
    const buf = this.analyser.getValue() as Float32Array;
    let sum = 0;
    let peak = 0;
    for (const s of buf) {
      sum += s * s;
      peak = Math.max(peak, Math.abs(s));
    }
    return { rms: Math.sqrt(sum / buf.length), peak };
  }
}
