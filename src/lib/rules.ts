export const PLAY_MAX = 3;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// The rules in plain words, for the card on every phone. The same numbers the game plays by.
export function rulesLines({ rounds, overrides, hints, players = 3 }: { rounds: number; overrides: number; hints: number; players?: number }): string[] {
  const end = players === 1 ? 'At the end, you name who did it, how and why.'
    : players === 2 ? 'At the end, you both name who did it, how and why. A culprit who knows does not count: the other player decides.'
    : 'At the end, everyone names who did it, how and why. Culprits vote too.';
  return [
    players === 1 ? `There are ${plural(rounds, 'round')}. Each round has one question. Answer it when you think you know. There is no clock.`
      : players === 2 ? `There are ${plural(rounds, 'round')}. Each round has one question. Answer it together when you both think you know. There is no clock.`
      : `There are ${plural(rounds, 'round')}. Each round has one question the group answers together.`,
    'Ask out loud: free. Everyone hears the answer.',
    'Talk and act as much as you like: ask anyone, search, take, hide, follow. Going somewhere on the map is free too. Only you see the answer.',
    ...(players >= 2 ? ['Anyone can call one meeting a game: everyone stops and talks it out for 3 minutes.'] : []),
    'Ask about your own character, your past or your goal any time. That is part of the game.',
    'Play only your own character. Saying what others think or do costs a play point. Asking the GM for help or about the world is always free.',
    `You have ${plural(overrides, 'override')}: use one to stay quiet or to say a moment your own way.`,
    `The group has ${plural(hints, 'hint')}: anyone can ask for one, the group votes.`,
    'Anyone can ask to vote early on the round question. Everyone has to agree. Ask twice with no takers and you wait for the next round.',
    end,
    `Points: 1 for the right culprit, up to 2 for how, up to 2 for why, 1 for your own goal, 1 for stopping the threat you watch. Plus up to ${PLAY_MAX} play points each round for good moves.`,
  ];
}

// Measured on the real GM (2026-10-19): about 11 minutes for 4 players and 16 for 10, almost all of it the GM thinking.
export const worldMinutes = (players: number) => Math.round(11 + (Math.max(players, 3) - 4) * (5 / 6));
