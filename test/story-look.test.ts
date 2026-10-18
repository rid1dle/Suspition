import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tensionLevel, beatBetween } from '../src/lib/story-look.ts';
import { intensityFor } from '../src/lib/music-theory.ts';

const playing = (index: number, suspicion: number, endsAt = 10_000_000) => ({ gameId: 'g', status: 'playing', suspicion, phase: { index, count: 4, endsAt }, events: [] as { kind: string }[] });

describe('tension for the look', () => {
  test('should rise with the round and with suspicion, in steps of 0.05', () => {
    const now = 1_000;
    assert.ok(tensionLevel(playing(2, 20), now) > tensionLevel(playing(0, 20), now), 'later rounds are tenser');
    assert.ok(tensionLevel(playing(1, 90), now) > tensionLevel(playing(1, 10), now), 'suspicion adds tension');
    for (const v of [playing(0, 0), playing(3, 100), playing(2, 47)]) {
      const t = tensionLevel(v, now);
      assert.ok(Math.abs(t * 20 - Math.round(t * 20)) < 1e-9, `${t} is a step of 0.05`);
      assert.ok(Math.abs(t - intensityFor(v, now)) <= 0.025 + 1e-9, 'it follows the music signal');
    }
  });

  test('should not change the tension value for clock ticks smaller than a step', () => {
    const v = playing(1, 40);
    assert.equal(tensionLevel(v, 1_000), tensionLevel(v, 2_000));
  });
});

describe('story beats', () => {
  const v = (events: { kind: string }[], extra = {}) => ({ gameId: 'g', status: 'playing', events, ...extra });
  test('should mark a beat for a ripple, a round event, a new phase and the reveal, and not for a question answered out loud', () => {
    for (const kind of ['ripple', 'event', 'phase', 'round']) assert.ok(beatBetween(v([]), v([{ kind }])), `${kind} is a beat`);
    assert.ok(!beatBetween(v([]), v([{ kind: 'qa' }])), 'a public answer is not a beat');
    assert.ok(beatBetween(v([], { status: 'final' }), v([], { status: 'reveal' })), 'the reveal is a beat');
    assert.ok(!beatBetween(null, v([{ kind: 'ripple' }])), 'no beat on the first view');
    assert.ok(!beatBetween(v([]), { ...v([{ kind: 'ripple' }]), gameId: 'other' }), 'no beat across games');
  });

  test('should keep the beat glow to one run and pause it for reduced motion', () => {
    const css = readFileSync('src/app/world.css', 'utf8');
    assert.match(css, /\[data-beat='on'\] \.story-edge::after \{[^}]*animation: beat [^}]*animation-iteration-count: 1/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\[data-beat='on'\] \.story-edge::after \{[^}]*animation: none/);
  });
});
