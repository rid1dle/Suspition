export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export type HintNames = 'middle' | 'last' | 'never';

const TABLE: Record<Difficulty, { clues: number; rounds: number; herrings: (n: number) => number; hintNames: HintNames }> = {
  easy: { clues: 2, rounds: 1, herrings: (n) => Math.ceil(n / 2), hintNames: 'middle' },
  normal: { clues: 3, rounds: 2, herrings: (n) => n, hintNames: 'last' },
  hard: { clues: 4, rounds: 3, herrings: (n) => 2 * n, hintNames: 'never' },
};

export const difficultyOf = (level: unknown): Difficulty => (DIFFICULTIES.includes(level as Difficulty) ? (level as Difficulty) : 'normal');

// How hard the world is to solve: clues and rounds needed to name the culprit, built red herrings, and which hints may name a person.
export function difficultyRules(level: unknown, innocents: number, rounds = Infinity) {
  const t = TABLE[difficultyOf(level)];
  return { culpritClues: t.clues, culpritRounds: Math.max(1, Math.min(t.rounds, rounds)), herrings: t.herrings(Math.max(0, innocents)), hintNames: t.hintNames };
}

const HINT_LINES: Record<HintNames, string> = {
  middle: 'Hints may name a person from the middle hint on.',
  last: 'Only the last hint may name a person.',
  never: 'No hint names a person.',
};

export function difficultyPrompt(level: unknown, innocents: number, rounds: number) {
  const r = difficultyRules(level, innocents, rounds);
  return [
    `Difficulty: ${difficultyOf(level)}.`,
    `Naming the culprit takes at least ${r.culpritClues} clues from at least ${r.culpritRounds} round${r.culpritRounds === 1 ? '' : 's'} (by reveal_round), joined together. No smaller set of clues is enough.`,
    `Build ${r.herrings} red herring${r.herrings === 1 ? '' : 's'} in red_herrings.`,
    HINT_LINES[r.hintNames],
  ].join('\n');
}

export const DIFFICULTY_NOTES: Record<Difficulty, string> = {
  easy: 'Easy: the killer takes 2 clues to name.',
  normal: 'Normal: the killer takes 3 clues from 2 rounds to name.',
  hard: 'Hard: the killer takes 4 clues from 3 rounds, and no hint names anyone.',
};
