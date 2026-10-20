// A clue that is a thing in the world: what it is, who made it and when, in one plain line above its own words.
export type Artifact = { form: string; by: string; when: string; text: string };

const WRITTEN: Record<string, [string, string]> = {
  letter: ['A letter', 'written'],
  diary: ['A diary page', 'written'],
  note: ['A note', 'written'],
  ledger: ['A ledger line', 'written'],
  receipt: ['A receipt', 'made out'],
  label: ['A label', 'written'],
  message: ['A message', 'sent'],
  record: ['A record', 'kept'],
  photo: ['A photo', 'taken'],
};

// Marks, objects, absences and testimony describe themselves, so they get no caption.
export function artifactCaption(a: Artifact): string {
  const kind = WRITTEN[a.form];
  if (!kind) return '';
  const by = a.by ? `, ${kind[1]} by ${a.by}` : '';
  const when = a.when ? (/^\d/.test(a.when) ? ` at ${a.when}` : `, ${a.when}`) : '';
  return `${kind[0]}${by}${when}`;
}
