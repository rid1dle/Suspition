import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { scoreMoves } from '../server/skills.ts';
import { readerSystem } from '../server/reader.ts';
import { rulesLines } from '../src/lib/rules.ts';
import { CardFlip } from '../src/app/play/card';

const text = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const card = { name: 'Reva Anand', role: 'Doctor', side: 'investigator', public_info: 'The doctor.', private_info: 'A secret.', side_explanation: '', goal: 'Find the page.', goal_why: '', win: 'You win if...', wants: '', fears: '', reasons: [], night: [], hidden_known: [], hidden_unknown: 2, starting_knowledge: '' } as never;
const profile = { games: 2, rating: 1.5, about: ['Likes puzzles.'], skills: [], answers: [] } as never;

describe('learning about yourself is fair play', () => {
  test('should never cost a point to ask about your own character', () => {
    const moves = scoreMoves({ points: 0, skill: '', why: '' }, { kind: 'self', out_of_world: true, sways_gm: false, claims: [] } as never);
    assert.ok(moves.every((m) => m.points >= 0), JSON.stringify(moves));
  });

  test('should still cost a point to steer the GM while asking about yourself', () => {
    const moves = scoreMoves({ points: 0, skill: '', why: '' }, { kind: 'self', out_of_world: false, sways_gm: true, claims: [] } as never);
    assert.equal(moves.at(-1).points, -1);
  });

  test('should tell the reader that questions about your own character are in the game', () => {
    const sys = readerSystem({ character: { name: 'Reva Anand' }, cast: [], places: [] } as never);
    assert.match(sys, /about their own character[^.]*never out_of_world/);
  });

  test('should explain the rules in plain words, including that asking about yourself is free of penalty', () => {
    const lines = rulesLines({ rounds: 4, questions: 6, overrides: 2, hints: 3 });
    const all = lines.join(' ');
    assert.match(all, /6 private questions each round/);
    assert.match(all, /Ask about your own character, your past or your goal/);
    assert.match(all, /2 overrides/);
    assert.match(all, /up to 3 play points/);
    assert.match(all, /Anyone can ask to vote early/);
  });

  test('should show how to play and what the game knows about you on your card', () => {
    const out = text(<CardFlip card={card} caseQuestion="Who did it?" overridesLeft={1} overridesTotal={2} rules={rulesLines({ rounds: 4, questions: 6, overrides: 2, hints: 3 })} profile={profile} />);
    assert.match(out, /How to play/);
    assert.match(out, /Ask about your own character/);
    assert.match(out, /What the game knows about you/);
  });
});
