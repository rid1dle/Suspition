import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Music } from '../src/lib/music.ts';
import { cleanSoundtrack } from '../src/lib/soundtrack/clean.ts';
import type { Direction, TableSoundtrack } from '../src/lib/soundtrack/types.ts';

const raw = (name: string, lead: string) => ({
  name, line: `${name} line.`, tempo: 80, root: 'C', mode: 'minor', lead, harmony: 'violins', bass: 'cellos', texture: 'harp', kit: ['kick'],
  theme: [0, 1, 2, 3, 4, 2].map((degree) => ({ degree, beats: 1 })), rounds: [{}], stingers: {},
});
const DIRECTIONS = cleanSoundtrack({ directions: [raw('One', 'piano'), raw('Two', 'flute'), raw('Three', 'oboe')] }, { rounds: 3, names: [] })!.directions;
const ready = (chosen = 0): TableSoundtrack => ({ status: 'ready', directions: DIRECTIONS, chosen });

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setImmediate(r));

class FakeScore {
  playing = false;
  volume = 0.6;
  cues: string[] = [];
  intensity = 0;
  async start() { this.playing = true; }
  stop() { this.playing = false; }
  setVolume(v: number) { this.volume = v; }
  duck() {}
  setTheme() {}
  setIntensity(x: number) { this.intensity = x; }
  cue(kind: string) { this.cues.push(kind); }
  level() { return { rms: 0.1, peak: 0.2 }; }
}

class FakePlayer {
  playing = false;
  loads: { ids: string[]; d: ReturnType<typeof deferred> }[] = [];
  plays: [Direction, number][] = [];
  switches: Direction[] = [];
  rounds: number[] = [];
  stingers: string[] = [];
  intensity: number | null = null;
  stops = 0;
  pieces = 0;
  unlocks = 0;
  warms = 0;
  async warm() { this.warms += 1; }
  unlock() { this.unlocks += 1; }
  load(ids: string[]) {
    const d = deferred();
    this.loads.push({ ids, d });
    return d.promise;
  }
  play(d: Direction, round: number) { this.plays.push([d, round]); this.playing = true; }
  setDirection(d: Direction) { this.switches.push(d); }
  setRound(i: number) { this.rounds.push(i); }
  snapped: number[] = [];
  setIntensity(x: number, now = false) { this.intensity = x; if (now) this.snapped.push(x); }
  stinger(kind: string) { this.stingers.push(kind); }
  nextPiece() { this.pieces += 1; }
  setVolume() {}
  duck() {}
  stop() { this.playing = false; this.stops += 1; }
  level() { return { rms: 0.3, peak: 0.5 }; }
}

function setup() {
  const score = new FakeScore();
  const player = new FakePlayer();
  let made = 0;
  let wake: (() => void) | null = null;
  const music = new Music({
    makeScore: () => score as never,
    makePlayer: () => { made += 1; return player as never; },
    sleep: () => new Promise<void>((r) => { wake = r; }),
  });
  return { music, score, player, made: () => made, wake: () => wake?.() };
}

describe('Music', () => {
  test('should play the simple music until the composed music loads, then switch', async () => {
    const { music, score, player } = setup();
    music.setSoundtrack(ready());
    await music.start();
    assert.equal(score.playing, true);
    assert.equal(music.source, 'loading');
    assert.deepEqual(player.loads[0].ids, ['piano', 'violins', 'cellos', 'harp', 'kick']);
    player.loads[0].d.resolve();
    await flush();
    assert.deepEqual(player.plays, [[DIRECTIONS[0], 0]]);
    assert.equal(score.playing, false);
    assert.equal(music.source, 'composed');
    assert.equal(music.playing, true);
  });

  test('should keep the simple music for the game when the samples fail to load', async () => {
    const { music, score, player } = setup();
    music.setSoundtrack(ready());
    await music.start();
    player.loads[0].d.reject(new Error('404'));
    await flush();
    assert.equal(music.source, 'simple');
    assert.equal(score.playing, true);
    music.setSoundtrack(ready(1));
    await flush();
    assert.equal(player.loads.length, 1, 'does not try again this game');
    assert.equal(music.source, 'simple');
  });

  test('should play only the last direction after quick switches', async () => {
    const { music, player } = setup();
    music.setSoundtrack(ready(0));
    await music.start();
    music.setSoundtrack(ready(1));
    music.setSoundtrack(ready(2));
    for (const l of player.loads) l.d.resolve();
    await flush();
    assert.deepEqual(player.plays, [[DIRECTIONS[2], 0]]);
    assert.deepEqual(player.switches, []);
  });

  test('should crossfade to a new direction once the music is composed', async () => {
    const { music, player } = setup();
    music.setSoundtrack(ready(0));
    await music.start();
    player.loads[0].d.resolve();
    await flush();
    music.setSoundtrack(ready(0));
    assert.equal(player.loads.length, 1, 'the same choice changes nothing');
    music.setSoundtrack(ready(1));
    player.loads[1].d.resolve();
    await flush();
    assert.deepEqual(player.switches, [DIRECTIONS[1]]);
  });

  test('should turn the music off again after a preview started from silence', async () => {
    const { music, score, player, wake } = setup();
    music.setSoundtrack(ready(0));
    const done = music.preview(1);
    assert.equal(music.previewing, 1);
    player.loads[0].d.resolve();
    await flush();
    assert.deepEqual(player.plays, [[DIRECTIONS[1], 0]]);
    assert.equal(player.intensity, 0.55);
    music.setIntensity(0.1);
    assert.equal(player.intensity, 0.55, 'the preview keeps its own tension');
    wake();
    await done;
    assert.equal(music.previewing, null);
    assert.equal(player.playing, false);
    assert.equal(score.playing, false);
    assert.equal(music.playing, false);
  });

  test('should bring the preview tension and a fresh start in at once, not eased', async () => {
    const { music, player } = setup();
    music.setSoundtrack(ready(0));
    music.setIntensity(0.4);
    await music.start();
    player.loads[0].d.resolve();
    await flush();
    assert.deepEqual(player.snapped, [0.4], 'a fresh start matches the tension right away');
    music.preview(1);
    player.loads[1].d.resolve();
    await flush();
    assert.deepEqual(player.snapped, [0.4, 0.55]);
    music.setIntensity(0.5);
    assert.deepEqual(player.snapped, [0.4, 0.55], 'game updates still ease');
  });

  test('should go back to the chosen direction after a preview while the music plays', async () => {
    const { music, player, wake } = setup();
    music.setSoundtrack(ready(0));
    await music.start();
    player.loads[0].d.resolve();
    await flush();
    music.setIntensity(0.3);
    const done = music.preview(2);
    player.loads[1].d.resolve();
    await flush();
    assert.deepEqual(player.switches, [DIRECTIONS[2]]);
    wake();
    await flush();
    player.loads[2]?.d.resolve();
    await done;
    await flush();
    assert.deepEqual(player.switches, [DIRECTIONS[2], DIRECTIONS[0]]);
    assert.equal(player.intensity, 0.3);
    assert.equal(music.playing, true);
  });

  test('should send a round stinger on a new phase and a seat stinger when a seat goes live', async () => {
    const { music, player } = setup();
    music.setSoundtrack(ready());
    await music.start();
    player.loads[0].d.resolve();
    await flush();
    for (const cue of ['phase', 'seat', 'vote', 'final', 'reveal', 'hint']) music.cue(cue);
    assert.deepEqual(player.stingers, ['round', 'seat', 'vote', 'vote', 'reveal', 'hint']);
  });

  test('should only claim the cues the playing engine really sounds, so the table still plays the vote alert on simple music', async () => {
    const { music, player } = setup();
    assert.equal(music.handles('phase'), false, 'silent while off');
    music.setSoundtrack(ready());
    await music.start();
    assert.equal(music.handles('vote'), false, 'the simple music has no vote sound');
    assert.equal(music.handles('seat'), false);
    assert.equal(music.handles('phase'), true);
    assert.equal(music.handles('hint'), true);
    player.loads[0].d.resolve();
    await flush();
    for (const cue of ['phase', 'seat', 'vote', 'hint']) assert.equal(music.handles(cue), true, cue);
    assert.equal(music.handles('call'), false);
  });

  test('should send cues to the simple music while it plays', async () => {
    const { music, score } = setup();
    await music.start();
    music.cue('phase');
    assert.deepEqual(score.cues, ['phase']);
  });

  test('should move to the round of the current phase', async () => {
    const { music, player } = setup();
    music.setSoundtrack(ready());
    music.setRound(1);
    await music.start();
    player.loads[0].d.resolve();
    await flush();
    assert.deepEqual(player.plays, [[DIRECTIONS[0], 1]]);
    music.setRound(1);
    music.setRound(2);
    assert.deepEqual(player.rounds, [2]);
  });

  test('should keep the composed engine off when there is no soundtrack', async () => {
    const { music, score, made } = setup();
    music.setSoundtrack(null);
    await music.start();
    assert.equal(music.source, 'simple');
    assert.equal(score.playing, true);
    music.setSoundtrack({ status: 'writing' });
    music.setSoundtrack({ status: 'failed' });
    assert.equal(made(), 0);
    assert.equal(music.source, 'simple');
  });

  test('should switch to the composed music when it arrives during play', async () => {
    const { music, player } = setup();
    music.setSoundtrack({ status: 'writing' });
    await music.start();
    music.setSoundtrack(ready());
    assert.equal(music.source, 'loading');
    player.loads[0].d.resolve();
    await flush();
    assert.equal(music.source, 'composed');
  });

  test('should warm the player for a ready soundtrack and unlock audio first thing in a click', async () => {
    const { music, player, made } = setup();
    music.warm();
    assert.equal(made(), 0, 'nothing to warm without a soundtrack');
    music.setSoundtrack(ready());
    music.warm();
    assert.equal(player.warms, 1);
    assert.equal(player.loads.length, 0, 'warming loads no samples');
    const started = music.start();
    assert.equal(player.unlocks, 1, 'unlocked before any wait');
    await started;
    music.preview(1);
    assert.equal(player.unlocks, 2);
  });

  test('should not load anything while the music is off', async () => {
    const { music, made } = setup();
    music.setSoundtrack(ready());
    music.setSoundtrack(ready(1));
    assert.equal(made(), 0);
  });

  test('should stop both engines when the music is turned off', async () => {
    const { music, score, player } = setup();
    music.setSoundtrack(ready());
    await music.start();
    player.loads[0].d.resolve();
    await flush();
    music.stop();
    assert.equal(music.playing, false);
    assert.equal(score.playing, false);
    assert.equal(player.playing, false);
  });

  test('should move to the next piece and read the level from the engine that plays', async () => {
    const { music, player } = setup();
    music.setSoundtrack(ready());
    await music.start();
    assert.deepEqual(music.level(), { rms: 0.1, peak: 0.2 });
    player.loads[0].d.resolve();
    await flush();
    music.nextPiece();
    assert.equal(player.pieces, 1);
    assert.deepEqual(music.level(), { rms: 0.3, peak: 0.5 });
  });

  test('should carry the volume to both engines', () => {
    const { music, score } = setup();
    music.volume = 0.4;
    assert.equal(music.volume, 0.4);
    assert.equal(score.volume, 0.4);
  });
});
