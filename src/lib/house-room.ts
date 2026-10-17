// The house look, used before a world exists (joining, the lobby) and as the fallback palette.
export const DEFAULT_COLORS = {
  bg: '#141217', surface: '#1d1a21', surfaceAlt: '#26222b', text: '#f1ebe3', muted: '#a49c92', accent: '#e0a85a', accentText: '#1b1408', danger: '#e0715a',
};

export const HOUSE_ROOM = { fontPair: 'noir-serif', texture: 'film-grain', ambient: 'none', intensity: 'low' as const, soundSet: 'tense' as const, colors: DEFAULT_COLORS };
