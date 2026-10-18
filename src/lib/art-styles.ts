// How the GM draws each world's pictures. The host picks one on setup from real samples
// (public/art-styles/<id>.svg), or Random (one style for the game) or Mix (a new style per picture).
export interface ArtStyle { id: string; name: string; rules: string }

export const DEFAULT_STYLE = 'moody-flat';

export const ART_STYLES: ArtStyle[] = [
  { id: 'moody-flat', name: 'Moody flat', rules: 'Simple and moody. Flat shapes and gradients, 4 to 7 colours, a clear silhouette of the place.' },
  { id: 'paper-cut', name: 'Paper cut', rules: 'Layered paper shapes stacked front to back, each with a soft drop shadow, 4 to 6 muted colours.' },
  { id: 'ink-noir', name: 'Ink noir', rules: 'Black ink lines and cross-hatching on off-white paper, one red accent.' },
  { id: 'retro-poster', name: 'Retro poster', rules: 'A 1950s travel poster: big bold shapes, 3 or 4 flat colours, a sunburst or wide sky, strong diagonals.' },
  { id: 'stained-glass', name: 'Stained glass', rules: 'Jewel-coloured glass panes, each shape outlined in thick dark lead lines, light glowing through.' },
  { id: 'woodblock', name: 'Woodblock', rules: 'A Japanese woodblock print: flat colour areas, bold outlines, curling wave and cloud patterns, soft paper tones.' },
  { id: 'folk-art', name: 'Folk art', rules: 'Madhubani-style folk painting: bold outlines, every shape filled with small repeated patterns, a patterned border, bright natural colours.' },
  { id: 'storybook', name: 'Storybook', rules: 'A gentle picture book: soft rounded shapes, warm pastel colours, a cosy glow.' },
  { id: 'blueprint', name: 'Blueprint', rules: 'An architect\'s blueprint: thin white lines and dashed guides on deep blue, a grid behind, no fills.' },
  { id: 'neon', name: 'Neon', rules: 'Glowing neon tube outlines on near-black, 2 or 3 bright colours with a soft glow (blurred copies of the lines).' },
  { id: 'pixel', name: 'Pixel', rules: 'Chunky pixel art built only from squares on a 40 by 20 grid, 6 to 8 colours.' },
];

export const ART_CHOICES = [...ART_STYLES.map((s) => s.id), 'random', 'mix'];

const IDS = ART_STYLES.map((s) => s.id);

// The game's own order of styles: a seeded shuffle, so it is the same every time for one game.
function orderFor(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const next = () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 2 ** 32;
  };
  const out = [...IDS];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function resolveStyle(choice: string, gameSeed: string, pictureIndex: number) {
  if (choice === 'random') return orderFor(gameSeed)[0];
  if (choice === 'mix') return orderFor(gameSeed)[pictureIndex % IDS.length];
  return IDS.includes(choice) ? choice : DEFAULT_STYLE;
}

export const styleRules = (id: string) => (ART_STYLES.find((s) => s.id === id) ?? ART_STYLES[0]).rules;
