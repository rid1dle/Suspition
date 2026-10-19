// Three hand-written directions for the music lab: one cozy, one tense, one dark. Four rounds each.
import type { Soundtrack } from './types.ts';

export const FIXTURE: Soundtrack = {
  chosen: 0,
  directions: [
    {
      name: 'Warm Lamplight',
      line: 'Soft piano, a harp and gentle strings.',
      tempo: 76,
      root: 'F',
      mode: 'major',
      lead: 'piano',
      harmony: 'violins',
      bass: 'cellos',
      texture: 'harp',
      kit: ['shaker', 'snare', 'triangle'],
      theme: [
        { degree: 0, beats: 1 }, { degree: 2, beats: 1 }, { degree: 4, beats: 2 }, { degree: 5, beats: 1 }, { degree: 4, beats: 1 },
        { degree: 2, beats: 2 }, { degree: 3, beats: 1 }, { degree: 2, beats: 1 }, { degree: 1, beats: 2 }, { degree: 0, beats: 4 },
      ],
      rounds: [
        { mood: 'quiet and curious', chords: [0, 5, 3, 4], variation: 'plain', shift: 0, pulse: 'none', groove: 'none', low: 0.1, high: 0.4 },
        { mood: 'warming up', chords: [0, 3, 5, 4], variation: 'high', shift: 0, pulse: 'arp_up', groove: 'brush', low: 0.25, high: 0.6 },
        { mood: 'something is wrong', chords: [5, 3, 0, 4, 5, 3, 1, 4], variation: 'dark', shift: 2, pulse: 'arp_updown', groove: 'ticking', low: 0.4, high: 0.8 },
        { mood: 'the truth comes out', chords: [0, 4, 5, 3], variation: 'plain', shift: 0, pulse: 'eighths', groove: 'march', low: 0.55, high: 1 },
      ],
      stingers: { round: 'chime', seat: 'swell', vote: 'rise', reveal: 'swell' },
    },
    {
      name: 'Ticking Clock',
      line: 'Tight strings, plucked notes and a ticking clock.',
      tempo: 104,
      root: 'D',
      mode: 'harmonic_minor',
      lead: 'violins',
      harmony: 'tremolo',
      bass: 'bass_pizz',
      texture: 'pizzicato',
      kit: ['shaker', 'kick', 'cymbal'],
      theme: [
        { degree: 0, beats: 1 }, { degree: 1, beats: 0.5 }, { degree: 0, beats: 0.5 }, { degree: 4, beats: 1 }, { degree: 3, beats: 1 },
        { degree: 1, beats: 1 }, { degree: 2, beats: 0.5 }, { degree: 1, beats: 0.5 }, { degree: 0, beats: 2 },
      ],
      rounds: [
        { mood: 'watchful', chords: [0, 5, 0, 4], variation: 'plain', shift: 0, pulse: 'eighths', groove: 'ticking', low: 0.15, high: 0.45 },
        { mood: 'closer', chords: [0, 3, 4, 0], variation: 'broken', shift: 0, pulse: 'arp_up', groove: 'ticking', low: 0.3, high: 0.65 },
        { mood: 'pressure', chords: [0, 1, 0, 4, 0, 1, 5, 4], variation: 'plain', shift: 3, pulse: 'ostinato', groove: 'heartbeat', low: 0.45, high: 0.85 },
        { mood: 'no way out', chords: [0, 5, 1, 4], variation: 'inverted', shift: 0, pulse: 'arp_updown', groove: 'march', low: 0.6, high: 1 },
      ],
      stingers: { round: 'hit', seat: 'rise', vote: 'swell', reveal: 'fall' },
    },
    {
      name: 'Deep Water',
      line: 'Low cellos, a slow horn and distant drums.',
      tempo: 62,
      root: 'C#',
      mode: 'phrygian',
      lead: 'horn',
      harmony: 'cellos',
      bass: 'basses',
      texture: 'glockenspiel',
      kit: ['woodblock', 'timpani_roll', 'kick'],
      theme: [
        { degree: 0, beats: 2 }, { degree: 1, beats: 2 }, { degree: 0, beats: 1 }, { degree: -1, beats: 1 },
        { degree: 0, beats: 4 }, { degree: 3, beats: 2 }, { degree: 1, beats: 2 }, { degree: 0, beats: 2 },
      ],
      rounds: [
        { mood: 'cold and still', chords: [0, 1, 0, 6], variation: 'plain', shift: 0, pulse: 'none', groove: 'none', low: 0.1, high: 0.35 },
        { mood: 'something moves', chords: [0, 5, 6, 0], variation: 'slow', shift: 0, pulse: 'none', groove: 'heartbeat', low: 0.25, high: 0.6 },
        { mood: 'the dark closes in', chords: [0, 1, 3, 1, 0, 6, 5, 6], variation: 'dark', shift: -2, pulse: 'ostinato', groove: 'tribal', low: 0.4, high: 0.85 },
        { mood: 'face it', chords: [0, 1, 6, 0], variation: 'high', shift: 0, pulse: 'arp_up', groove: 'tribal', low: 0.6, high: 1 },
      ],
      stingers: { round: 'swell', seat: 'hit', vote: 'fall', reveal: 'chime' },
    },
  ],
};
