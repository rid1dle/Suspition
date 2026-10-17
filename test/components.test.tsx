import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Novel } from '../src/components/game/novel';
import { ScenePicture, Timeline, News, SharedClues, CaseBox, Night, Alibis, Recap } from '../src/components/game/panels';
import { RoundCard } from '../src/components/game/round';
import { BriefStep } from '../src/components/game/briefing';
import { PeopleList } from '../src/components/game/people';
import { SkillBars, PlayLine, TotalLine } from '../src/components/game/score';
import { QuestionCard, ProfilePanel } from '../src/components/game/lobby';
import { PlanSteps } from '../src/components/game/plan';
import { ReminderCard } from '../src/components/game/reminder';
import { pointsOf, whoisLines, playLine, totalLine } from '../src/lib/score.ts';

const html = (el) => renderToStaticMarkup(el);
const text = (el) => html(el).replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

describe('panels', () => {
  test('should show speech with the speaker name and narration as plain lines', () => {
    const out = html(<Novel lines={[{ speaker: '', text: 'She looks away.' }, { speaker: 'Leela', text: 'Money, <b>Miss</b> Nair.' }]} />);
    assert.match(out, /data-line="act"[^>]*>She looks away.</);
    assert.match(out, /data-speaker[^>]*>Leela</);
    assert.ok(out.includes('Money, &lt;b&gt;Miss&lt;/b&gt; Nair.'));
  });

  test('should name a speaker only once for lines in a row', () => {
    const out = html(<Novel lines={[{ speaker: 'Gopi', text: 'One.' }, { speaker: 'Gopi', text: 'Two.' }, { speaker: '', text: 'He sighs.' }, { speaker: 'Gopi', text: 'Three.' }]} />);
    assert.equal((out.match(/data-speaker/g) ?? []).length, 2);
  });

  test('should embed the picture as an image, never as live SVG', () => {
    const out = html(<ScenePicture svg="<svg><rect/></svg>" />);
    assert.match(out, /^<img[^>]*src="data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    assert.ok(!out.includes('<svg'));
    assert.equal(html(<ScenePicture svg={null} />), '');
  });

  test('should list the timeline with a time for each entry', () => {
    assert.match(text(<Timeline timeline={[{ time: '9:15', event: 'Lights out <now>' }]} />), /9:15 Lights out <now>/);
    assert.match(text(<Timeline timeline={[]} />), /Nothing yet/);
  });

  test('should show a public question with who asked it, newest news first', () => {
    const out = text(<News events={[{ kind: 'event', text: 'First', at: 1, phase: 0 }, { kind: 'qa', by: 'Asha', q: 'Cold?', text: 'Yes.', at: 2, phase: 0 }]} />);
    assert.ok(out.indexOf('Asha asked: Cold?') < out.indexOf('First'));
  });

  test('should show choices as vote buttons only while voting, with my pick marked', () => {
    const round = { objective: '', tips: [], question: 'How?', options: ['Fuse', 'Hand'], done: false, vote: { endsAt: 1, voted: 1, of: 3 } };
    const voting = html(<RoundCard round={round} voting myVote={1} />);
    assert.match(voting, /<button[^>]*aria-pressed="true"[^>]*>Hand<\/button>/);
    assert.match(text(<RoundCard round={round} voting myVote={1} />), /1 of 3 voted/);
    assert.ok(!html(<RoundCard round={{ ...round, vote: null }} />).includes('<button'));
  });

  test('should tell the right player it is their turn to introduce themselves', () => {
    const view = { briefing: { step: 0, steps: [{ kind: 'intro', playerId: 'p2', title: 'Meet Ruby', lines: ['Asha, stand up and say: "I am Ruby, a singer."'] }] } };
    assert.match(text(<BriefStep view={view} me="p2" />), /Your turn! Stand up and say: "I am Ruby, a singer."/);
    assert.ok(!text(<BriefStep view={view} me="p1" />).includes('Your turn'));
  });

  test('should say how to share a clue when none are shared', () => {
    assert.match(text(<SharedClues clues={[]} />), /Show everyone/);
  });
});

describe('goals in the intro', () => {
  const goalStep = { kind: 'goal', title: 'Your goals and how to win', lines: ['Who poisoned Rao?', 'Each of you also has a secret goal of your own.'] };
  const view = (card) => ({ briefing: { step: 0, steps: [goalStep] }, card });

  test('should show the group goal big on the table and keep secret goals off it', () => {
    const out = text(<BriefStep view={view(undefined)} />);
    assert.match(out, /The group's goal Who poisoned Rao\?/);
    assert.ok(!out.includes('Your secret goal'));
  });

  test('should show a player their own secret goal and how they win on their phone', () => {
    const out = text(<BriefStep view={view({ goal: 'Get the ledger back.', win: 'You win if most players name the right culprit at the end.' })} me="p1" />);
    assert.match(out, /Your secret goal Get the ledger back. You win if most players/);
  });

  test('should show the big question inside the opening story', () => {
    const out = text(<BriefStep view={{ briefing: { step: 0, steps: [{ kind: 'story', title: 'What just happened', lines: ['A scream.', 'The big question: Who did it?'] }] } }} />);
    assert.match(out, /The big question Who did it\?/);
  });

  test('should add up points out of six', () => {
    assert.equal(pointsOf({ culprit_correct: true, method_score: 2, motive_score: 1, goal_achieved: true }), 5);
    assert.equal(pointsOf(undefined), 0);
    assert.equal(html(<CaseBox question="" />), '');
  });
});

describe('why your goal matters', () => {
  test('should show why the secret goal matters under it in the intro', () => {
    const v = { briefing: { step: 0, steps: [{ kind: 'goal', title: 'Goals', lines: ['Who?'] }] }, card: { goal: 'Get the book.', goal_why: 'It clears your father.', win: 'WIN' } };
    assert.match(text(<BriefStep view={v} me="p1" />), /Get the book. It clears your father. WIN/);
  });
});

describe('round job and alibis', () => {
  test('should put the round job first and the question to answer after it', () => {
    const out = text(<RoundCard round={{ objective: 'Find who cut the lights.', tips: ['Ask the butler.'], question: 'How?', options: ['Fuse'], done: false, vote: null }} />);
    assert.ok(out.indexOf('Find who cut the lights.') < out.indexOf('At the end, answer together'));
    assert.match(out, /Ask the butler./);
    assert.match(text(<RoundCard round={{ objective: 'Look around.', tips: [], question: null, options: [], done: false, vote: null }} />), /Look around./);
  });

  test('should draw a grid of who says they were where, with gaps as question marks', () => {
    const out = html(<Alibis alibis={{ times: [{ time: '9:40 pm', what: 'Lights out' }], rows: [{ name: 'Asha', kind: 'player', minor: false, cells: [''] }] }} me="Asha" />);
    assert.match(out, /<tr[^>]*data-me="true"[^>]*><th[^>]*>Asha<\/th><td[^>]*><span[^>]*>\?<\/span><\/td><\/tr>/);
    assert.match(text(<Alibis alibis={null} />), /Nobody has said/);
  });

  test('should point out where a player told people something different from the truth', () => {
    const out = text(<Night card={{ night: [{ time: '9:40 pm', where: 'Shed', doing: 'You hid the key.' }], alibi: [{ time: '9:40 pm', where: 'Kitchen' }] }} />);
    assert.match(out, /Shed . You hid the key. You told people: Kitchen./);
    assert.equal(html(<Night card={{ night: [] }} />), '');
  });
});

describe('tappable round pointers', () => {
  test('should turn round pointers into buttons on phones and a plain list on the table', () => {
    const round = { objective: 'Find who cut the lights.', tips: ['Ask "the" butler.'], question: null, options: [], done: false, vote: null };
    assert.match(html(<RoundCard round={round} tappable />), /<button[^>]*data-idea="Ask &quot;the&quot; butler."/);
    assert.match(html(<RoundCard round={round} />), /<ul[^>]*><li[^>]*>Ask/);
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
    const out = text(<PeopleList people={people} />);
    assert.ok(out.indexOf('Players') < out.indexOf('Minor, just part of the place'));
    assert.match(out, /Nikhil Rao Bank Manager · Nikhil/);
    assert.match(html(<PeopleList people={people} />), /data-new="true"[^>]*>1 fact</);
    assert.ok(!out.includes('Played by the GM'));
  });

  test('should mark only facts not seen yet as new, and open the rows the reader opened', () => {
    const out = html(<PeopleList people={people} open={new Set(['p1'])} seen={{ p1: 1 }} />);
    assert.match(out, /<details[^>]*data-person="p1"[^>]*open=""/);
    assert.ok(!/data-new="true"[^>]*>1 fact/.test(out));
    assert.match(text(<PeopleList people={people} open={new Set(['p1'])} seen={{ p1: 1 }} />), /Says they were: 9:40 pm Library/);
    assert.match(text(<PeopleList people={people} />), /Nothing new about them yet/);
  });
});

describe('play points and skills on screen', () => {
  test('should show a plus sign and the skill name on a scored move', () => {
    assert.equal(playLine({ points: 1, skill: 'questioning', why: 'Checking the cuffs helps your goal.' }), '+1 · Questioning · Checking the cuffs helps your goal.');
    assert.equal(playLine({ points: 0, skill: null, why: 'You can only play your own character.' }), '0 · You can only play your own character.');
    assert.equal(playLine({ points: -1, skill: 'swaying', why: 'Aimed at the GM.' }), '-1 · Swaying the GM · Aimed at the GM.');
    assert.equal(playLine(null), '');
    assert.match(text(<PlayLine play={{ points: 1, skill: 'questioning', why: 'Nice.' }} />), /\+1 · Questioning · Nice./);
  });

  test('should list penalties last as minus', () => {
    const out = text(<SkillBars skills={[{ skill: 'swaying', label: 'Swaying the GM', points: -1, moves: 1 }, { skill: 'questioning', label: 'Questioning', points: 4, moves: 3 }]} />);
    assert.ok(out.indexOf('Questioning') < out.indexOf('Swaying the GM'));
    assert.match(out, /-1/);
    assert.match(out, /\+4/);
    assert.match(text(<SkillBars skills={[]} />), /No skills yet. They show up after your first game./);
  });

  test('should show case and play points apart in the total line', () => {
    assert.equal(totalLine({ culprit_correct: true, method_score: 2, motive_score: 1, goal_achieved: false, play: 2 }), 'Case 4/6 · Play +2');
    assert.equal(totalLine({ play: -1 }), 'Case 0/6 · Play -1');
    assert.match(text(<TotalLine result={{ play: 2, culprit_correct: true }} />), /Case 1\/6 · Play \+2/);
  });

  test('should render four choices, own words and skip for a question', () => {
    const out = html(<QuestionCard q={{ id: 'party', question: 'At a party you are usually...', choices: ['A', 'B', 'C', 'D'] }} />);
    assert.equal((out.match(/data-choice=/g) ?? []).length, 4);
    assert.match(out, /placeholder="Or say it your way"/);
    assert.match(out, /Skip/);
  });

  test('should show the change and coaching in the profile, and answers only when given', () => {
    const out = text(<ProfilePanel profile={{ username: 'ben', name: 'Ben', games: 2, skills: [], coaching: 'Share sooner.', change: 'Questioning up', rating: 0.5 }} />);
    assert.match(out, /Share sooner\./);
    assert.match(out, /Questioning up/);
    assert.ok(!out.includes('Your answers'));
    assert.match(text(<ProfilePanel profile={{ username: 'ben', name: 'Ben', games: 0, skills: [], coaching: '', change: '', rating: 0, answers: [{ question: 'Q?', answer: 'Yes' }] }} />), /Your answers/);
  });
});

describe('the GM steps', () => {
  const progress = (over = {}) => ({ attempt: 1, draft: 1, startedAt: 0, plan: null, thinking: true, redraft: false, ...over });

  test('should show thinking until the plan arrives', () => {
    assert.match(text(<PlanSteps progress={progress()} now={65_000} />), /Thinking/);
    assert.match(text(<PlanSteps progress={progress()} now={65_000} />), /1:05/);
  });

  test('should show each step with its state and the count under the active one', () => {
    const plan = [{ title: 'Setting the stage', state: 'done' }, { title: 'Giving each of you a secret', state: 'active', count: '2 characters so far' }, { title: 'Hiding the clues', state: 'todo' }];
    const out = html(<PlanSteps progress={progress({ plan, thinking: false })} now={1} />);
    assert.match(out, /data-state="active"[^>]*>[\s\S]*Giving each of you a secret/);
    assert.match(text(<PlanSteps progress={progress({ plan, thinking: false })} now={1} />), /2 characters so far/);
  });

  test('should say when the GM is fixing something', () => {
    const plan = [{ title: 'A', state: 'done' }, { title: 'B', state: 'active' }, { title: 'C', state: 'todo' }];
    assert.match(text(<PlanSteps progress={progress({ plan, thinking: false, redraft: true })} now={1} />), /Fixing something, about a minute more/);
  });

  test('should collapse finished steps into one line when compact', () => {
    const plan = [{ title: 'A', state: 'done' }, { title: 'B', state: 'done' }, { title: 'C', state: 'active' }];
    const out = text(<PlanSteps progress={progress({ plan, thinking: false })} now={1} compact />);
    assert.match(out, /2 steps done/);
    assert.ok(!out.includes(' A '));
  });
});

describe('reminders', () => {
  test("should show a reminder in the third person with the character's initial", () => {
    const out = text(<ReminderCard name="Nikhil Rao" line="Nikhil Rao runs the bank on MG Road." />);
    assert.match(out, /^N Remember · Nikhil Rao Nikhil Rao runs the bank on MG Road./);
  });
});
