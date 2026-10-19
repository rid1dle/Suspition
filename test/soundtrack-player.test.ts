import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SoundtrackPlayer, withTimeout } from '../src/lib/soundtrack/player.ts';
import { FIXTURE } from '../src/lib/soundtrack/fixture.ts';

// A stand-in for Tone.js: records what the player builds and plays, makes no sound.
function fakeTone({ failSamples = false } = {}) {
  class Param {
    value = 0;
    ramps: [number, number, number | undefined][] = [];
    rampTo(v: number, time: number, at?: number) { this.ramps.push([v, time, at]); this.value = v; }
    setValueAtTime(v: number) { this.value = v; }
  }
  class Node {
    target: unknown = null;
    connect(t: unknown) { this.target = t; return this; }
    chain() { return this; }
  }
  const gains: Gain[] = [];
  class Gain extends Node {
    gain = new Param();
    constructor(v = 1) { super(); this.gain.value = v; gains.push(this); }
  }
  const voices: Voice[] = [];
  class Voice extends Node {
    triggers: { note: string; at: number; velocity: number }[] = [];
    constructor(public opts: unknown) { super(); voices.push(this); }
    triggerAttackRelease(note: string, _d: number, at: number, velocity: number) { this.triggers.push({ note, at, velocity }); }
  }
  const transport = {
    state: 'stopped',
    bpm: new Param(),
    bar: null as null | ((time: number) => void),
    scheduleRepeat(cb: (time: number) => void) { this.bar = cb; return 1; },
    start() { this.state = 'started'; },
    stop() { this.state = 'stopped'; },
  };
  const tone = {
    starts: 0,
    Gain,
    Sampler: Voice,
    PolySynth: Voice,
    AMSynth: class {},
    Reverb: Node,
    Limiter: Node,
    Analyser: class extends Node { getValue() { return new Float32Array([0.5, -0.5]); } },
    ToneAudioBuffers: class {
      constructor({ onload, onerror }: { onload: () => void; onerror: (e: Error) => void }) {
        queueMicrotask(() => (failSamples ? onerror(new Error('decode failed')) : onload()));
      }
      get(n: string) { return { n }; }
    },
    getDestination: () => new Node(),
    getTransport: () => transport,
    now: () => 10,
    start() { tone.starts += 1; return new Promise<void>(() => {}); },
  };
  return { tone, gains, voices, transport };
}

const [WARM, TICK] = FIXTURE.directions;
const ids = (d: typeof WARM) => [d.lead, d.harmony, d.bass, d.texture, ...d.kit];

async function ready(opts = {}) {
  const fake = fakeTone(opts);
  const player = new SoundtrackPlayer({ importTone: async () => fake.tone as never });
  await player.load(ids(WARM));
  return { player, ...fake };
}

describe('SoundtrackPlayer', () => {
  test('should load the samples even when the browser has not unlocked audio yet', async () => {
    const { player, tone } = await ready();
    assert.equal(tone.starts, 1, 'asked once, not waited on');
    player.play(WARM, 0);
    assert.equal(player.playing, true);
  });

  test('should unlock audio inside the click, once Tone is warm', async () => {
    const fake = fakeTone();
    const player = new SoundtrackPlayer({ importTone: async () => fake.tone as never });
    player.unlock();
    assert.equal(fake.tone.starts, 0, 'nothing to unlock before Tone loads');
    await player.warm();
    player.unlock();
    assert.equal(fake.tone.starts, 1, 'called at once, with no await before it');
  });

  test('should reject when a sample cannot be decoded', async () => {
    const fake = fakeTone({ failSamples: true });
    const player = new SoundtrackPlayer({ importTone: async () => fake.tone as never });
    await assert.rejects(() => player.load(ids(WARM)), /decode failed/);
  });

  test('should give up on samples that never arrive', async () => {
    await assert.rejects(() => withTimeout(new Promise(() => {}), 5, 'The instruments took too long to load.'), /too long/);
  });

  test('should play the bar on the instruments it loaded, with the tension taken at once when asked', async () => {
    const { player, transport, voices } = await ready();
    player.play(WARM, 0);
    player.setIntensity(0.55, true);
    transport.bar!(0);
    const notes = voices.flatMap((v) => v.triggers);
    assert.ok(notes.length > 3);
    assert.ok(voices.some((v) => v.triggers.length && (v.opts as { urls?: unknown }).urls), 'sampled voices play');
  });

  test('should make one crossfade for several changes before the next bar', async () => {
    const { player, transport, gains } = await ready();
    await player.load(ids(TICK));
    player.play(WARM, 0);
    transport.bar!(0);
    const [busA, busB] = gains.slice(1);
    player.setDirection(TICK);
    player.setRound(1);
    player.nextPiece();
    player.setDirection(WARM);
    player.setDirection(TICK);
    transport.bar!(2);
    assert.deepEqual(busA.gain.ramps, [[0, 4, 2]]);
    assert.deepEqual(busB.gain.ramps, [[1, 4, 2]]);
    assert.equal(transport.bpm.value, TICK.tempo);
    transport.bar!(4);
    assert.equal(busA.gain.ramps.length + busB.gain.ramps.length, 2, 'no second crossfade');
  });

  test('should put a stinger on the bus that is playing', async () => {
    const { player, transport, voices, gains } = await ready();
    player.play(WARM, 0);
    player.setDirection(WARM);
    transport.bar!(0);
    const busB = gains[2];
    const before = voices.map((v) => v.triggers.length);
    player.stinger('reveal');
    const played = voices.filter((v, i) => v.triggers.length > (before[i] ?? 0));
    assert.ok(played.length > 0);
    assert.ok(played.every((v) => v.target === busB));
  });

  test('should stay quiet after stop', async () => {
    const { player, transport, voices } = await ready();
    player.play(WARM, 0);
    player.stop();
    transport.bar!(0);
    player.stinger('round');
    assert.equal(voices.flatMap((v) => v.triggers).length, 0);
    assert.deepEqual(player.level(), { rms: 0, peak: 0 });
  });
});
