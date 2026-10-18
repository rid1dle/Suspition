import { MANIFEST } from './manifest.ts';
import { noteMidi } from './notes.ts';
import { KIT_PIECES } from './types.ts';
import type { Direction, InstrumentId, KitId, Role } from './types.ts';

const WIDEN = 5;

function rangeOf(id: string): [number, number] {
  const midi = Object.keys(MANIFEST[id].notes).map(noteMidi);
  return [Math.min(...midi) - WIDEN, Math.max(...midi) + WIDEN];
}

const sampled = (label: string, roles: Role[], id: string) => ({ label, roles, range: rangeOf(id) });

export const INSTRUMENTS: Record<InstrumentId, { label: string; roles: Role[]; range: [number, number] }> = {
  piano: sampled('Piano', ['lead', 'harmony', 'bass'], 'piano'),
  harp: sampled('Harp', ['lead', 'harmony', 'texture'], 'harp'),
  violins: sampled('Violins', ['lead', 'harmony'], 'violins'),
  cellos: sampled('Cellos', ['lead', 'harmony', 'bass'], 'cellos'),
  pizzicato: sampled('Plucked violins', ['lead', 'texture'], 'pizzicato'),
  tremolo: sampled('Trembling violins', ['harmony', 'texture'], 'tremolo'),
  basses: sampled('Double bass', ['bass'], 'basses'),
  bass_pizz: sampled('Plucked double bass', ['bass'], 'bass_pizz'),
  flute: sampled('Flute', ['lead', 'texture'], 'flute'),
  clarinet: sampled('Clarinet', ['lead', 'harmony'], 'clarinet'),
  oboe: sampled('Oboe', ['lead'], 'oboe'),
  horn: sampled('French horn', ['lead', 'harmony'], 'horn'),
  glockenspiel: sampled('Glockenspiel', ['lead', 'texture'], 'glockenspiel'),
  marimba: sampled('Marimba', ['lead', 'texture'], 'marimba'),
  timpani: sampled('Timpani', ['bass'], 'timpani'),
  pad: { label: 'Soft synth pad', roles: ['harmony', 'texture'], range: [36, 84] },
};

export const KIT_IDS: KitId[] = [...KIT_PIECES];

const DEFAULTS: Record<Role, InstrumentId> = { lead: 'piano', harmony: 'violins', bass: 'cellos', texture: 'harp' };

export function defaultFor(role: Role): InstrumentId {
  return DEFAULTS[role];
}

export function instrumentsOf(d: Direction): (InstrumentId | KitId)[] {
  return [...new Set<InstrumentId | KitId>([d.lead, d.harmony, d.bass, d.texture, ...d.kit])];
}
