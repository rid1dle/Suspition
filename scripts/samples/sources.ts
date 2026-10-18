// Where each soundtrack instrument comes from in VSCO 2 Community Edition (CC0). Build-only.
// pick: which files are candidates (the softest sustained layer, one round robin).
// note: the note the file name claims, or null when the name has none (then the measured pitch is used).
// range: the MIDI notes worth bundling. seconds: the trimmed length.

export type PitchedSource = { id: string; folder: string; pick: RegExp; note: (file: string) => string | null; range: [number, number]; seconds: number };
export type KitSource = { id: string; folder: string; file: string; seconds: number };

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const named = (file: string) => /_([A-G]#?\d)(?=[_.])/.exec(file)?.[1] ?? null;
const pianoKey = (file: string) => {
  const m = /_(\d{3})\.wav$/.exec(file);
  if (!m) return null;
  const midi = 21 + 2 * Number(m[1]);
  return `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
};

export const PITCHED: PitchedSource[] = [
  { id: 'piano', folder: 'Keys/Upright Piano', pick: /^Player_dyn1_rr1_\d{3}\.wav$/, note: pianoKey, range: [33, 96], seconds: 6 },
  { id: 'harp', folder: 'Strings/Harp', pick: /^KSHarp_.*\.wav$/, note: named, range: [36, 96], seconds: 6 },
  { id: 'violins', folder: 'Strings/Violin Section/susVib', pick: /_v1\.wav$/, note: named, range: [55, 96], seconds: 6 },
  { id: 'cellos', folder: 'Strings/Cello Section/susvib', pick: /_v1_1\.wav$/, note: named, range: [36, 77], seconds: 6 },
  { id: 'pizzicato', folder: 'Strings/Violin Section/Pizz', pick: /_v1_rr1\.wav$/, note: named, range: [55, 96], seconds: 3 },
  { id: 'tremolo', folder: 'Strings/Violin Section/Trem', pick: /_v1\.wav$/, note: named, range: [55, 96], seconds: 6 },
  { id: 'basses', folder: 'Strings/Solo Contrabass/SusNV', pick: /_v1_rr1\.wav$/, note: named, range: [28, 60], seconds: 6 },
  { id: 'bass_pizz', folder: 'Strings/Solo Contrabass/Pizz', pick: /_v1_rr1\.wav$/, note: named, range: [28, 60], seconds: 3 },
  { id: 'flute', folder: 'Woodwinds/Flute/susNV', pick: /_v1_1\.wav$/, note: named, range: [60, 96], seconds: 6 },
  { id: 'clarinet', folder: 'Woodwinds/Clarinet/susLong', pick: /_v1_rr1_sum\.wav$/, note: named, range: [50, 91], seconds: 6 },
  { id: 'oboe', folder: 'Woodwinds/Oboe/Sus', pick: /_v1_Main\.wav$/, note: named, range: [58, 91], seconds: 6 },
  { id: 'horn', folder: 'Brass/F Horn/sus', pick: /_v1_1\.wav$/, note: named, range: [34, 77], seconds: 6 },
  { id: 'glockenspiel', folder: 'Percussion/Glock', pick: /^glock_medium_.*\.wav$/, note: named, range: [67, 108], seconds: 3 },
  { id: 'marimba', folder: 'Percussion/Marimba', pick: /^Marimba_hit_Outrigger_.*\.wav$/, note: named, range: [36, 96], seconds: 3 },
  { id: 'timpani', folder: 'Percussion/Timpani', pick: /_Hit_v1_rr1_Sum\.wav$/, note: () => null, range: [36, 60], seconds: 3 },
];

export const KIT: KitSource[] = [
  { id: 'kick', folder: 'VSCO 1 Percussion/drums/bass', file: 'bdrum_mp_1.wav', seconds: 3 },
  { id: 'snare', folder: 'VSCO 1 Percussion/drums/snare/drum1', file: 'snare1_mp_1.wav', seconds: 3 },
  { id: 'shaker', folder: "VSCO 1 Percussion/varWood/Camo's Shaker", file: 'shake1.wav', seconds: 3 },
  { id: 'woodblock', folder: 'VSCO 1 Percussion/varWood/log_drum', file: 'slitdrum1_mp_1.wav', seconds: 3 },
  { id: 'triangle', folder: 'VSCO 1 Percussion/varMetal/triangle/1', file: 'triangle1_hit_mp.wav', seconds: 3 },
  { id: 'cymbal', folder: 'VSCO 1 Percussion/varMetal/Cymbals/susp', file: 'susp_hit_softmall_roll2_cresc.wav', seconds: 4 },
  { id: 'timpani_roll', folder: 'Percussion/Timpani/Rolls', file: 'Timpani3_Roll_v3_rr1_Sum.wav', seconds: 4 },
];
