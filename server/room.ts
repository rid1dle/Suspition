import { z } from 'zod';

// The look of each world. The GM picks from fixed lists only; colours are built here from one seed
// and checked for contrast, so a world can never be hard to read.

export const ROOM_OPTIONS = {
  font_pair: ['noir-serif', 'royal-deco', 'cozy-rounded', 'old-typewriter', 'neon-grotesk', 'gothic-ink', 'storybook', 'modern-clean', 'tropical-script', 'vintage-press'],
  texture: ['paper', 'velvet', 'rain-glass', 'film-grain', 'stone', 'none'],
  ambient: ['rain', 'fog', 'embers', 'fireflies', 'dust', 'snow', 'lantern', 'none'],
  intensity: ['low', 'medium'],
  sound_set: ['soft', 'tense', 'playful'],
} as const;

type Options = typeof ROOM_OPTIONS;
export interface Room {
  seed_color: string;
  font_pair: Options['font_pair'][number];
  texture: Options['texture'][number];
  ambient: Options['ambient'][number];
  intensity: Options['intensity'][number];
  sound_set: Options['sound_set'][number];
}

const RoomZ = z.strictObject({
  seed_color: z.string(),
  font_pair: z.enum(ROOM_OPTIONS.font_pair),
  texture: z.enum(ROOM_OPTIONS.texture),
  ambient: z.enum(ROOM_OPTIONS.ambient),
  intensity: z.enum(ROOM_OPTIONS.intensity),
  sound_set: z.enum(ROOM_OPTIONS.sound_set),
});
const { $schema: _drop, ...roomJson } = z.toJSONSchema(RoomZ) as Record<string, any>;
export const ROOM_SCHEMA = roomJson;

export interface Colors { bg: string; surface: string; surfaceAlt: string; text: string; muted: string; accent: string; accentText: string; danger: string }

export const DEFAULT_COLORS: Colors = {
  bg: '#141217', surface: '#1d1a21', surfaceAlt: '#26222b', text: '#f1ebe3', muted: '#a49c92', accent: '#e0a85a', accentText: '#1b1408', danger: '#e0715a',
};

// --- colour maths (sRGB, OKLab/OKLCH, WCAG contrast) ---
type RGB = [number, number, number];
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function parseHex(hex: unknown): RGB | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
const toHex = (rgb: RGB) => `#${rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('')}`;

function toOklch([r, g, b]: RGB): [number, number, number] {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(a, bb), (Math.atan2(bb, a) * 180) / Math.PI];
}

function fromOklchRaw(L: number, C: number, H: number): RGB {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

// Reduce chroma until the colour fits in sRGB, so the hue stays true.
function oklch(L: number, C: number, H: number): string {
  let c = C;
  for (let i = 0; i < 30; i += 1) {
    const rgb = fromOklchRaw(L, c, H);
    if (rgb.every((x) => x >= -0.0005 && x <= 1.0005)) return toHex(rgb);
    c *= 0.85;
  }
  return toHex(fromOklchRaw(L, 0, H));
}

const luminance = (hex: string) => {
  const [r, g, b] = (parseHex(hex) ?? [0, 0, 0]).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const READABLE: [keyof Colors, keyof Colors][] = [['text', 'bg'], ['text', 'surface'], ['text', 'surfaceAlt'], ['muted', 'bg'], ['muted', 'surface'], ['accentText', 'accent'], ['accent', 'bg']];
const readable = (c: Colors) => READABLE.every(([fg, bg]) => contrast(c[fg], c[bg]) >= 4.5);

export function paletteFrom(seed: unknown): Colors {
  const rgb = parseHex(seed);
  if (!rgb) return DEFAULT_COLORS;
  const [, c0, hue] = toOklch(rgb);
  const grey = c0 < 0.02;
  const h = grey ? 0 : hue;
  const tint = grey ? 0 : Math.min(c0, 0.04);
  const vivid = Math.min(Math.max(c0, 0.09), 0.17);
  for (const lift of [0, 0.04, 0.08]) {
    const colors: Colors = {
      bg: oklch(0.17, tint * 0.7, h),
      surface: oklch(0.215, tint * 0.8, h),
      surfaceAlt: oklch(0.26, tint, h),
      text: oklch(0.95, 0.012, h),
      muted: oklch(0.76 + lift / 2, 0.02, h),
      accent: grey ? DEFAULT_COLORS.accent : oklch(0.78 + lift, vivid, h),
      accentText: grey ? DEFAULT_COLORS.accentText : oklch(0.2, 0.03, h),
      danger: oklch(0.72 + lift, 0.15, 30),
    };
    if (readable(colors)) return colors;
  }
  return DEFAULT_COLORS;
}

const pick = <T extends readonly string[]>(list: T, value: unknown): T[number] => (list.includes(String(value)) ? (value as T[number]) : list[0]);

export function roomTheme(room: Partial<Room> | null | undefined) {
  return {
    fontPair: pick(ROOM_OPTIONS.font_pair, room?.font_pair),
    texture: room ? pick(ROOM_OPTIONS.texture, room.texture) : 'none',
    ambient: room ? pick(ROOM_OPTIONS.ambient, room.ambient) : 'none',
    intensity: pick(ROOM_OPTIONS.intensity, room?.intensity),
    soundSet: pick(ROOM_OPTIONS.sound_set, room?.sound_set),
    colors: paletteFrom(room?.seed_color),
  };
}

const GUESSES: [RegExp, Partial<Room>][] = [
  [/\b(monsoon|rain\w*|storm\w*|flood\w*|harbou?rs?|boats?|ships?|seas?|beach\w*|island\w*)\b/i, { ambient: 'rain', texture: 'rain-glass', seed_color: '#2a6f97', font_pair: 'tropical-script' }],
  [/\b(fires?|forge\w*|embers?|volcan\w*|kitchens?|bakery|bakeries|smith\w*)\b/i, { ambient: 'embers', texture: 'stone', seed_color: '#c2562b', font_pair: 'vintage-press' }],
  [/\b(snow\w*|winter\w*|ice|icy|ski\w*|frost\w*|himalaya\w*|mountain lodge)\b/i, { ambient: 'snow', texture: 'paper', seed_color: '#7fa7c9', font_pair: 'storybook' }],
  [/\b(palaces?|gala|royal\w*|ball|opera|mansions?|weddings?|havelis?)\b/i, { ambient: 'lantern', texture: 'velvet', seed_color: '#b5893b', font_pair: 'royal-deco' }],
  [/\b(colleges?|schools?|reunions?|hostels?|campus|librar\w*)\b/i, { ambient: 'dust', texture: 'paper', seed_color: '#8a6d4b', font_pair: 'cozy-rounded' }],
  [/\b(forests?|jungles?|gardens?|villages?|farms?|camps?)\b/i, { ambient: 'fireflies', texture: 'paper', seed_color: '#4f7a3a', font_pair: 'storybook' }],
  [/\b(city|cities|clubs?|neon|casinos?|trains?|metro|bars?)\b/i, { ambient: 'fog', texture: 'film-grain', seed_color: '#8e44ad', font_pair: 'neon-grotesk' }],
  [/\b(castles?|church\w*|crypts?|haunted|ghosts?|cemeter\w*|manors?)\b/i, { ambient: 'fog', texture: 'stone', seed_color: '#5b4a6e', font_pair: 'gothic-ink' }],
];
const SOUND_BY_TONE: Record<string, Room['sound_set']> = { tense: 'tense', dark: 'tense', funny: 'playful', cozy: 'soft' };

// For worlds written before rooms existed: a look guessed from the setting words.
export function guessRoom(setting: unknown, tone: unknown): Room {
  const hit = GUESSES.find(([re]) => re.test(String(setting ?? '')))?.[1] ?? {};
  return {
    seed_color: '#e0a85a', font_pair: 'noir-serif', texture: 'film-grain', ambient: 'fog',
    ...hit,
    intensity: 'low',
    sound_set: SOUND_BY_TONE[String(tone)] ?? 'tense',
  } as Room;
}
