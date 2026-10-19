// @ts-nocheck -- plain data in, plain data out
export const sameTime = (a, b) => String(a ?? '').replace(/\s+/g, '').toLowerCase() === String(b ?? '').replace(/\s+/g, '').toLowerCase();

// The night a player remembers. A culprit who does not know it remembers nothing of the times they were doing it,
// until the story wakes them; everyone else remembers their whole true night.
export function rememberedNight(scenario, awakened, card) {
  const night = card?.night ?? [];
  if (!card?.unaware || awakened?.[card.id]) return night;
  const acting = (scenario?.truth?.timeline ?? []).filter((t) => (t?.character_ids ?? []).includes(card.id)).map((t) => t.time);
  return night.filter((n) => !acting.some((t) => sameTime(t, n.time)));
}
