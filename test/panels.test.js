import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { novelHtml, pictureHtml, timelineHtml, newsHtml, roundHtml, stepHtml, sharedCluesHtml, caseHtml, pointsOf, alibiHtml, nightHtml, whoisLines, peopleHtml, playLine, skillBars, totalLine, questionHtml, profileHtml } from '../public/panels.js';

describe('panels', () => {
  test('should show speech with the speaker name and narration as plain lines', () => {
    const html = novelHtml([{ speaker: '', text: 'She looks away.' }, { speaker: 'Leela', text: 'Money, <b>Miss</b> Nair.' }]);
    assert.match(html, /<p class="act">She looks away.<\/p>/);
    assert.match(html, /<span class="who-says">Leela<\/span>&ldquo;Money, &lt;b&gt;Miss&lt;\/b&gt; Nair.&rdquo;/);
  });

  test('should name a speaker only once for lines in a row', () => {
    const html = novelHtml([{ speaker: 'Gopi', text: 'One.' }, { speaker: 'Gopi', text: 'Two.' }, { speaker: '', text: 'He sighs.' }, { speaker: 'Gopi', text: 'Three.' }]);
    assert.equal((html.match(/who-says/g) ?? []).length, 2);
  });

  test('should embed the picture as an image, never as live SVG', () => {
    const html = pictureHtml('<svg><rect/></svg>');
    assert.match(html, /^<img class="scene" alt="" src="data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    assert.ok(!html.includes('<svg'));
    assert.equal(pictureHtml(null), '');
  });

  test('should list the timeline with a time for each entry', () => {
    assert.match(timelineHtml([{ time: '9:15', event: 'Lights out <now>' }]), /<span class="when">9:15<\/span><span>Lights out &lt;now&gt;<\/span>/);
    assert.match(timelineHtml([]), /Nothing yet/);
  });

  test('should show a public question with who asked it, newest news first', () => {
    const html = newsHtml([{ kind: 'event', text: 'First' }, { kind: 'qa', by: 'Asha', q: 'Cold?', text: 'Yes.' }]);
    assert.ok(html.indexOf('Asha asked: Cold?') < html.indexOf('First'));
  });

  test('should show choices as vote buttons only while voting, with my pick marked', () => {
    const round = { question: 'How?', options: ['Fuse', 'Hand'], done: false, vote: { endsAt: 1, voted: 1, of: 3 } };
    const voting = roundHtml(round, { voting: true, myVote: 1 });
    assert.match(voting, /<button class="option on" data-choice="1">Hand<\/button>/);
    assert.match(voting, /1 of 3 voted/);
    assert.ok(!roundHtml({ ...round, vote: null }).includes('<button'));
  });

  test('should tell the right player it is their turn to introduce themselves', () => {
    const view = { briefing: { step: 0, steps: [{ kind: 'intro', playerId: 'p2', title: 'Meet Ruby', lines: ['Asha, stand up and say: "I am Ruby, a singer."'] }] } };
    assert.match(stepHtml(view, { me: 'p2' }), /Your turn! Stand up and say:[\s\S]*&quot;I am Ruby, a singer.&quot;/);
    assert.ok(!stepHtml(view, { me: 'p1' }).includes('Your turn'));
  });

  test('should say how to share a clue when none are shared', () => {
    assert.match(sharedCluesHtml([]), /Show everyone/);
  });
});

describe('goals in the intro', () => {
  const goalStep = { kind: 'goal', title: 'Your goals and how to win', lines: ['Who poisoned Rao?', 'Each of you also has a secret goal of your own.'] };
  const view = (card) => ({ briefing: { step: 0, steps: [goalStep] }, card });

  test('should show the group goal big on the table and keep secret goals off it', () => {
    const html = stepHtml(view(undefined));
    assert.match(html, /The group&#39;s goal|The group's goal/);
    assert.match(html, /<div class="question">Who poisoned Rao\?<\/div>/);
    assert.ok(!html.includes('Your secret goal'));
  });

  test('should show a player their own secret goal and how they win on their phone', () => {
    const html = stepHtml(view({ goal: 'Get the ledger back.', win: 'You win if most players name the right culprit at the end.' }), { me: 'p1' });
    assert.match(html, /Your secret goal<\/div><div class="question">Get the ledger back.<\/div><div class="small">You win if most players/);
  });

  test('should show the big question inside the opening story', () => {
    const html = stepHtml({ briefing: { step: 0, steps: [{ kind: 'story', title: 'What just happened', lines: ['A scream.', 'The big question: Who did it?'] }] } });
    assert.match(html, /<div class="label">The big question<\/div><div class="question">Who did it\?<\/div>/);
  });

  test('should add up points out of six', () => {
    assert.equal(pointsOf({ culprit_correct: true, method_score: 2, motive_score: 1, goal_achieved: true }), 5);
    assert.equal(pointsOf(undefined), 0);
    assert.equal(caseHtml(''), '');
  });
});

describe('why your goal matters', () => {
  test('should show why the secret goal matters under it in the intro', () => {
    const view = { briefing: { step: 0, steps: [{ kind: 'goal', title: 'Goals', lines: ['Who?'] }] }, card: { goal: 'Get the book.', goal_why: 'It clears your father.', win: 'WIN' } };
    assert.match(stepHtml(view, { me: 'p1' }), /Get the book.<\/div><div class="small">It clears your father.<\/div><div class="small">WIN/);
  });
});

describe('round job and alibis', () => {
  test('should put the round job first and the question to answer after it', () => {
    const html = roundHtml({ objective: 'Find who cut the lights.', tips: ['Ask the butler.'], question: 'How?', options: ['Fuse'], done: false, vote: null });
    assert.ok(html.indexOf('Find who cut the lights.') < html.indexOf('At the end, answer together'));
    assert.match(html, /<ul class="tips"><li>Ask the butler.<\/li><\/ul>/);
    assert.match(roundHtml({ objective: 'Look around.', tips: [], question: null, options: [] }), /Look around./);
  });

  test('should draw a grid of who says they were where, with gaps as question marks', () => {
    const html = alibiHtml({ times: [{ time: '9:40 pm', what: 'Lights out' }], rows: [{ name: 'Asha', kind: 'player', minor: false, cells: [''] }] }, { me: 'Asha' });
    assert.match(html, /<tr class="player me"><th>Asha<\/th><td><span class="muted">\?<\/span><\/td><\/tr>/);
    assert.match(alibiHtml(null), /Nobody has said/);
  });

  test('should point out where a player told people something different from the truth', () => {
    const html = nightHtml({ night: [{ time: '9:40 pm', where: 'Shed', doing: 'You hid the key.' }], alibi: [{ time: '9:40 pm', where: 'Kitchen' }] });
    assert.match(html, /<b>Shed<\/b>. You hid the key.<span class="small told"> You told people: Kitchen.<\/span>/);
    assert.equal(nightHtml({ night: [] }), '');
  });
});

describe('tappable round pointers', () => {
  test('should turn round pointers into buttons on phones and a plain list on the table', () => {
    const round = { objective: 'Find who cut the lights.', tips: ['Ask "the" butler.'], question: null, options: [] };
    assert.match(roundHtml(round, { tappable: true }), /<button class="chip tip" data-idea="Ask &quot;the&quot; butler.">/);
    assert.match(roundHtml(round), /<ul class="tips"><li>/);
  });
});

describe('who is who on the table', () => {
  test('should list who plays whom and the important GM people, never minor ones', () => {
    const lines = whoisLines({ players: [{ player: 'Nikhil', name: 'Nikhil Rao', role: 'Bank Manager', info: 'A former captain.' }], npcs: [{ name: 'Lata', role: 'Cook', info: 'Cooks.', minor: true }, { name: 'Ramesh', role: 'Watchman', info: 'Guards.', minor: false }] });
    assert.deepEqual(lines, ['Nikhil plays Nikhil Rao, Bank Manager. A former captain.', 'Ramesh, Watchman, is played by the GM. Guards.']);
    assert.deepEqual(whoisLines(null), []);
  });
});

describe('people page', () => {
  const people = [
    { id: 'p1', icon: '', name: 'Nikhil Rao', role: 'Bank Manager', player: 'Nikhil', info: 'A former captain.', kind: 'player', minor: false, alibi: [{ time: '9:40 pm', where: 'Library' }], facts: [{ fact: 'Said out loud: "I fell."', round: 2 }] },
    { id: 'n1', icon: '', name: 'Lata', role: 'Cook', player: '', info: 'Cooks.', kind: 'npc', minor: true, alibi: [], facts: [] },
  ];

  test('should show one line per person with a fact count, grouped by what they are', () => {
    const html = peopleHtml(people);
    assert.ok(html.indexOf('Players') < html.indexOf('Minor, just part of the place'));
    assert.match(html, /<b>Nikhil Rao<\/b> <span class="muted small">Bank Manager &middot; Nikhil<\/span>/);
    assert.match(html, /<span class="count new">1 fact<\/span>/);
    assert.ok(!html.includes('Played by the GM'));
  });

  test('should mark only facts not seen yet as new, and open the rows the reader opened', () => {
    const html = peopleHtml(people, { open: new Set(['p1']), seen: { p1: 1 } });
    assert.match(html, /data-person="p1" open>/);
    assert.match(html, /<span class="count">1 fact<\/span>/);
    assert.match(html, /Says they were:<\/span> <span class="when">9:40 pm<\/span> Library/);
    assert.match(peopleHtml(people), /Nothing new about them yet/);
  });
});

describe('play points and skills on screen', () => {
  test('should show a plus sign and the skill name on a scored move', () => {
    assert.equal(playLine({ points: 1, skill: 'questioning', why: 'Checking the cuffs helps your goal.' }), '+1 · Questioning · Checking the cuffs helps your goal.');
    assert.equal(playLine({ points: 0, skill: null, why: 'You can only play your own character.' }), '0 · You can only play your own character.');
    assert.equal(playLine({ points: -1, skill: 'swaying', why: 'Aimed at the GM.' }), '-1 · Swaying the GM · Aimed at the GM.');
    assert.equal(playLine(null), '');
  });

  test('should list penalties last as minus', () => {
    const html = skillBars([{ skill: 'questioning', label: 'Questioning', points: 4, moves: 3 }, { skill: 'swaying', label: 'Swaying the GM', points: -1, moves: 1 }]);
    assert.ok(html.indexOf('Questioning') < html.indexOf('Swaying the GM'));
    assert.match(html, /-1/);
    assert.match(html, /\+4/);
    assert.equal(skillBars([]), '<p class="small muted">No skills yet. They show up after your first game.</p>');
  });

  test('should show case and play points apart in the total line', () => {
    assert.equal(totalLine({ culprit_correct: true, method_score: 2, motive_score: 1, goal_achieved: false, play: 2 }), 'Case 4/6 · Play +2');
    assert.equal(totalLine({ play: -1 }), 'Case 0/6 · Play -1');
  });

  test('should render four choices, own words and skip for a question', () => {
    const html = questionHtml({ id: 'party', question: 'At a party you are usually...', choices: ['A', 'B', 'C', 'D'] });
    assert.equal((html.match(/data-choice=/g) ?? []).length, 4);
    assert.match(html, /id="q-own"/);
    assert.match(html, /data-skip/);
  });

  test('should show the change and coaching in the profile, and answers only when given', () => {
    const html = profileHtml({ name: 'Ben', games: 2, skills: [], coaching: 'Share sooner.', change: 'Questioning up', rating: 0.5 });
    assert.match(html, /Share sooner\./);
    assert.match(html, /Questioning up/);
    assert.ok(!html.includes('Your answers'));
    assert.match(profileHtml({ name: 'Ben', games: 0, skills: [], answers: [{ question: 'Q?', answer: 'Yes' }] }), /Your answers/);
  });
});
