// Setting ideas for a game started with an empty setting box. Each idea names a place and a time or
// an event; keywords are the words a recent world would share with it, so the deck can skip places
// this group just played.
export interface Idea { id: string; text: string; keywords: string[] }

export const DECK: Idea[] = [
  { id: 'night-train', text: 'A night train from Delhi to Mumbai, 1985', keywords: ['train', 'railway', 'rail', 'carriage'] },
  { id: 'andaman-ferry', text: 'A late ferry crossing to the Andaman Islands', keywords: ['ferry', 'boat', 'island', 'andaman'] },
  { id: 'ocean-liner', text: 'A 1920s ocean liner on its last voyage', keywords: ['liner', 'ship', 'ocean', 'voyage'] },
  { id: 'palace-wedding', text: 'A royal wedding in an Udaipur lake palace', keywords: ['wedding', 'palace', 'royal', 'udaipur'] },
  { id: 'diwali-party', text: 'A big Diwali party in a Mumbai bungalow', keywords: ['diwali', 'party', 'bungalow'] },
  { id: 'film-set', text: 'A Bollywood film set on the last shooting night', keywords: ['film', 'studio', 'shoot', 'bollywood'] },
  { id: 'newsroom', text: 'A newspaper office on election night, 1977', keywords: ['newspaper', 'newsroom', 'election', 'press'] },
  { id: 'kitchen', text: 'A busy restaurant kitchen at closing time', keywords: ['restaurant', 'kitchen', 'chef'] },
  { id: 'tea-estate', text: 'A tea estate in Assam during the monsoon', keywords: ['tea', 'estate', 'monsoon', 'plantation'] },
  { id: 'houseboat', text: 'A houseboat on the Kerala backwaters at night', keywords: ['houseboat', 'backwaters', 'kerala'] },
  { id: 'radio-studio', text: 'A 1970s radio studio during a live broadcast', keywords: ['radio', 'broadcast', 'studio'] },
  { id: 'mars-habitat', text: 'A Mars habitat during a dust storm, 2090', keywords: ['mars', 'habitat', 'space', 'planet'] },
  { id: 'circus', text: 'A travelling circus on its final show', keywords: ['circus', 'tent', 'show'] },
  { id: 'museum-gala', text: 'A museum gala the night a jewel arrives', keywords: ['museum', 'gala', 'jewel'] },
  { id: 'cricket-club', text: 'A cricket club dinner after the final, 1962', keywords: ['cricket', 'club', 'dinner'] },
  { id: 'shimla-hotel', text: 'An old Shimla hotel on a foggy night', keywords: ['hotel', 'shimla', 'fog'] },
  { id: 'casino-boat', text: "A Goa casino boat on New Year's Eve", keywords: ['casino', 'goa', 'boat'] },
  { id: 'haveli-will', text: 'A Rajasthan haveli on the night of a will', keywords: ['haveli', 'rajasthan', 'will', 'inheritance'] },
  { id: 'startup-launch', text: "A Bangalore startup's launch party gone wrong", keywords: ['startup', 'office', 'launch', 'bangalore'] },
  { id: 'boarding-school', text: "A boarding school's Founders' Day, 1990", keywords: ['school', 'boarding', 'hostel', 'reunion'] },
  { id: 'hospital-blackout', text: 'A small hospital during a power cut', keywords: ['hospital', 'ward', 'clinic'] },
  { id: 'lighthouse', text: 'A lighthouse on a rocky island in a storm', keywords: ['lighthouse', 'island', 'coast', 'rock'] },
  { id: 'ski-lodge', text: 'A ski lodge in Gulmarg after an avalanche', keywords: ['snow', 'mountain', 'ski', 'lodge', 'gulmarg'] },
  { id: 'antarctic-ship', text: 'A research ship stuck in Antarctic ice', keywords: ['snow', 'ice', 'antarctic', 'ship', 'research'] },
  { id: 'monastery', text: 'A Himalayan monastery during the festival of masks', keywords: ['mountain', 'monastery', 'himalaya', 'ladakh'] },
  { id: 'desert-camp', text: 'A desert camp in Jaisalmer during a sandstorm', keywords: ['desert', 'sand', 'camp', 'jaisalmer'] },
  { id: 'jazz-club', text: 'A Bombay jazz club on opening night, 1958', keywords: ['jazz', 'club', 'bombay', 'music'] },
  { id: 'auction', text: 'An auction house before a famous painting sells', keywords: ['auction', 'painting', 'art'] },
  { id: 'temple-festival', text: 'A temple festival night in a coastal town', keywords: ['temple', 'festival', 'fair', 'coast'] },
  { id: 'airship', text: 'A luxury airship crossing Europe, 1936', keywords: ['airship', 'zeppelin', 'flight'] },
  { id: 'airport', text: 'A stranded airport lounge on Christmas Eve', keywords: ['airport', 'flight', 'lounge', 'christmas'] },
  { id: 'vineyard', text: 'A Nashik vineyard during the grape harvest', keywords: ['vineyard', 'wine', 'harvest', 'grape'] },
  { id: 'theatre', text: "A theatre's opening night of a new play", keywords: ['theatre', 'play', 'stage'] },
  { id: 'coal-town', text: 'A coal mining town during a strike, 1950', keywords: ['mine', 'mining', 'coal', 'strike'] },
  { id: 'underwater-hotel', text: 'An underwater hotel in the Maldives, 2040', keywords: ['underwater', 'maldives', 'reef'] },
  { id: 'chess-tournament', text: 'A Kolkata chess tournament final, 1974', keywords: ['chess', 'tournament', 'kolkata'] },
  { id: 'spice-warehouse', text: 'A Kochi spice warehouse before a big sale', keywords: ['spice', 'warehouse', 'kochi', 'port'] },
  { id: 'safari-lodge', text: 'A Kenyan safari lodge after the long rains', keywords: ['safari', 'kenya', 'wildlife'] },
  { id: 'space-hotel', text: 'A space hotel orbiting Earth, 2075', keywords: ['space', 'orbit', 'hotel'] },
  { id: 'film-premiere', text: 'A silent film premiere in Paris, 1925', keywords: ['premiere', 'cinema', 'paris'] },
];

const mentions = (text: string, keyword: string) => new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(text);

// A random idea that shares no keyword with a recent world and was not shown in this lobby yet.
// When every idea was shown, the deck starts again; when every idea matches a recent world, any unshown one will do.
export function drawIdea(recent: string[], random: () => number = Math.random, avoid: string[] = []) {
  let fresh = DECK.filter((d) => !avoid.includes(d.id));
  if (!fresh.length) fresh = DECK;
  // recent is newest first. An idea is as stale as the newest world it matches; when every idea matches one, take the stalest-free.
  const newestMatch = (d: (typeof DECK)[number]) => {
    const i = recent.findIndex((r) => d.keywords.some((k) => mentions(r, k)));
    return i < 0 ? Infinity : i;
  };
  const scored = fresh.map((d) => [d, newestMatch(d)] as const);
  const best = Math.max(...scored.map(([, s]) => s));
  const pool = scored.filter(([, s]) => s === best).map(([d]) => d);
  const pick = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  return { id: pick.id, text: pick.text };
}
