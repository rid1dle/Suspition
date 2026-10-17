// Quick questions in the lobby. Each game asks a few the person has not answered yet, so the game
// learns a little more about them every time. Answers shape their character, never their side.

export const QUESTION_KINDS = ['group', 'pressure', 'story', 'taste'];

export const QUESTIONS = [
  { id: 'party', kind: 'group', question: 'At a party you are usually...', choices: ['The one telling stories', 'The quiet watcher', 'The one who planned it', 'First to leave'] },
  { id: 'friends-call', kind: 'group', question: 'Your friends would call you...', choices: ['The funny one', 'The smart one', 'The calm one', 'The wild one'] },
  { id: 'trip-role', kind: 'group', question: 'On a group trip you are the one who...', choices: ['Makes the plan', 'Finds the food', 'Takes the photos', 'Gets lost'] },
  { id: 'argument', kind: 'group', question: 'When friends argue, you...', choices: ['Pick a side fast', 'Make peace', 'Make it worse, for fun', 'Grab snacks and watch'] },
  { id: 'group-chat', kind: 'group', question: 'In the group chat you are...', choices: ['Always typing', 'Only memes', 'Seen, no reply', 'The one who asks "so what is the plan?"'] },
  { id: 'new-people', kind: 'group', question: 'Meeting new people, you...', choices: ['Talk first', 'Wait for them', 'Crack a joke', 'Ask a lot of questions'] },
  { id: 'bluff', kind: 'pressure', question: 'When you bluff, you...', choices: ['Laugh', 'Over-explain', 'Go very quiet', 'Never bluff'] },
  { id: 'caught', kind: 'pressure', question: 'Caught doing something silly, you...', choices: ['Own it', 'Blame someone', 'Change the topic', 'Deny everything'] },
  { id: 'deadline', kind: 'pressure', question: 'With a big deadline tomorrow, you...', choices: ['Finished last week', 'Start tonight', 'Panic, then do it', 'Ask for more time'] },
  { id: 'secret', kind: 'pressure', question: 'Someone tells you a secret. You...', choices: ['Keep it forever', 'Tell one person', 'Forget it by morning', 'Use it later'] },
  { id: 'lost', kind: 'pressure', question: 'Lost in a new city, you...', choices: ['Ask a stranger', 'Trust the map', 'Walk until it feels right', 'Call a friend'] },
  { id: 'blame', kind: 'pressure', question: 'The group gets blamed for something. You...', choices: ['Find who did it', 'Take the hit', 'Talk your way out', 'Stay out of it'] },
  { id: 'mystery-fun', kind: 'story', question: 'In a mystery you most enjoy...', choices: ['Catching a liar', 'The big twist', 'Being the liar', 'Solving the clues'] },
  { id: 'hero', kind: 'story', question: 'In a film you would be...', choices: ['The detective', 'The villain', 'The sidekick', 'The one nobody suspects'] },
  { id: 'twist', kind: 'story', question: 'The best kind of twist is...', choices: ['The friend did it', 'Nobody is who they say', 'It was all planned', 'The clue was there all along'] },
  { id: 'genre', kind: 'story', question: 'Your kind of story...', choices: ['Spooky', 'Funny', 'Tense', 'Cozy'] },
  { id: 'power', kind: 'story', question: 'Pick one power for a night...', choices: ['Read minds', 'Be invisible', 'Rewind ten minutes', 'Make anyone tell the truth'] },
  { id: 'clue', kind: 'story', question: 'You find a strange note. You...', choices: ['Read it out loud', 'Keep it secret', 'Show one friend', 'Check who wrote it'] },
  { id: 'food', kind: 'taste', question: 'Comfort food?', choices: ['Something spicy', 'Something sweet', 'Home food', 'Whatever is open late'] },
  { id: 'place', kind: 'taste', question: 'Best place to spend a night...', choices: ['A rooftop', 'A beach', 'A cozy room', 'A busy street'] },
  { id: 'music', kind: 'taste', question: 'On a long drive you play...', choices: ['Old songs', 'Loud songs', 'Podcasts', 'Nothing, just talk'] },
  { id: 'job', kind: 'taste', question: 'A job you would secretly love...', choices: ['Chef', 'Spy', 'Film star', 'Owning a small cafe'] },
  { id: 'morning', kind: 'taste', question: 'Mornings are...', choices: ['The best time', 'Fine with coffee', 'Please no', 'What is a morning'] },
  { id: 'weekend', kind: 'taste', question: 'Perfect weekend...', choices: ['Out with friends', 'Home and quiet', 'A short trip', 'Sports or games'] },
];

export function pickQuestions(answeredIds = [], n = 3, random = Math.random) {
  const done = new Set(answeredIds);
  const open = QUESTIONS.filter((q) => !done.has(q.id))
    .map((q) => ({ q, r: random() }))
    .sort((a, b) => a.r - b.r)
    .map(({ q }) => q);
  const picked = [];
  for (const kind of QUESTION_KINDS) {
    const q = open.find((x) => x.kind === kind && !picked.includes(x));
    if (q && picked.length < n) picked.push(q);
  }
  for (const q of open) if (picked.length < n && !picked.includes(q)) picked.push(q);
  return picked;
}
