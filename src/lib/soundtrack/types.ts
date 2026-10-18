export const INSTRUMENT_IDS = ['piano', 'harp', 'violins', 'cellos', 'pizzicato', 'tremolo', 'basses', 'bass_pizz', 'flute', 'clarinet', 'oboe', 'horn', 'glockenspiel', 'marimba', 'timpani', 'pad'] as const;
export const KIT_PIECES = ['kick', 'snare', 'shaker', 'woodblock', 'triangle', 'cymbal', 'timpani_roll'] as const;
export const ROLES = ['lead', 'harmony', 'bass', 'texture'] as const;
export const VARIATIONS = ['plain', 'slow', 'dark', 'broken', 'high', 'inverted'] as const;
export const PULSES = ['none', 'eighths', 'arp_up', 'arp_updown', 'ostinato'] as const;
export const GROOVES = ['none', 'heartbeat', 'ticking', 'march', 'brush', 'tribal'] as const;
export const STINGER_STYLES = ['swell', 'hit', 'chime', 'rise', 'fall'] as const;
export const STINGER_KINDS = ['round', 'seat', 'vote', 'reveal'] as const;

export type InstrumentId = typeof INSTRUMENT_IDS[number];
export type KitId = typeof KIT_PIECES[number];
export type Role = typeof ROLES[number];
export type Variation = typeof VARIATIONS[number];
export type Pulse = typeof PULSES[number];
export type Groove = typeof GROOVES[number];
export type StingerStyle = typeof STINGER_STYLES[number];
export type StingerKind = typeof STINGER_KINDS[number];

export type ThemeNote = { degree: number; beats: number; rest?: boolean };

export type RoundPlan = { mood: string; chords: number[]; variation: Variation; shift: number; pulse: Pulse; groove: Groove; low: number; high: number };

export type Direction = {
  name: string;
  line: string;
  tempo: number;
  root: string;
  mode: string;
  lead: InstrumentId;
  harmony: InstrumentId;
  bass: InstrumentId;
  texture: InstrumentId;
  kit: KitId[];
  theme: ThemeNote[];
  rounds: RoundPlan[];
  stingers: Record<StingerKind, StingerStyle>;
};

export type Soundtrack = { directions: Direction[]; chosen: number };

export type TableSoundtrack = { status: 'writing' | 'ready' | 'failed'; directions?: Direction[]; chosen?: number };

export type Part = 'drone' | 'pad' | 'bass' | 'chords' | 'pulse' | 'melody' | 'counter' | 'groove' | 'stinger';

export type NoteEvent = { at: number; part: Part; instrument: InstrumentId | KitId; midi: number; beats: number; velocity: number };
