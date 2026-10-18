export const PLAY_MAX = 3;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The rules in plain words, for the card on every phone. The same numbers the game plays by.
export function rulesLines({ rounds, questions, overrides, hints }: { rounds: number; questions: number; overrides: number; hints: number }): string[] {
  return [
    `There are ${plural(rounds, 'round')}. Each round has one question the group answers together.`,
    'Ask out loud: free. Everyone hears the answer.',
    `Ask in private: ${plural(questions, 'private question')} each round. Only you see the answer.`,
    'Ask about your own character, your past or your goal any time. That is part of the game.',
    'Play only your own character. Saying what others think or do, or talking to the GM about the game instead of playing, costs a play point.',
    `You have ${plural(overrides, 'override')}: use one to stay quiet or to say a moment your own way.`,
    `The group has ${plural(hints, 'hint')}: anyone can ask for one, the group votes.`,
    'At the end, everyone names who did it, how and why. Culprits vote too.',
    `Points: 1 for the right culprit, up to 2 for how, up to 2 for why, 1 for your own goal. Plus up to ${PLAY_MAX} play points for good moves.`,
  ];
}
