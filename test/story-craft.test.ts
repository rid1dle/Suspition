import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { craftIssues, ARTIFACT_FORMS } from '../server/craft.ts';
import { storyIssues, applyStoryPatches } from '../server/story.ts';
import { makeScenario } from './fixtures.ts';
import * as G from '../server/game.ts';
import { resolveStoryIds } from '../server/game.ts';
import { phasePrompt, playSystem, scorePrompt } from '../server/prompts.ts';
import { gameInReading } from './fixtures.ts';

// A small world that meets every story-craft rule: each test breaks one.
function craftWorld() {
  const s = makeScenario(4, { phases: 3 });
  s.why_tonight = 'Character 1 wants the will burned before it is read at dawn.';
  s.truth.timeline = [
    { id: 't1', time: '8pm', event: 'Character 1 reads the new will.', location_id: 'l1', character_ids: ['p1'], because: 'Character 1 wants the house.', leads_to: ['t2'] },
    { id: 't2', time: '9pm', event: 'Character 1 cuts the glove on the window.', location_id: 'l1', character_ids: ['p1'], because: 't1', leads_to: [] },
    { id: 't3', time: '9:10pm', event: 'The butler logs the cellar keys.', location_id: 'l2', character_ids: ['n1'], because: 'The Butler wants to hide his drinking.', leads_to: [] },
  ];
  s.clues = [
    { id: 'c1', name: 'Torn glove', where: 'l1', shows: 'A glove torn on glass.', does_not_prove: '', importance: 'essential', can_be_destroyed: true, reveal_round: 1, form: 'object', author: '', written_at: '', text: 'A grey glove, torn at the thumb, a bead of glass in the tear.', from_step: 't2' },
    { id: 'c2', name: 'Ledger', where: 'l2', shows: 'The cellar keys were out at nine.', does_not_prove: '', importance: 'essential', can_be_destroyed: false, reveal_round: 2, form: 'ledger', author: 'The Butler', written_at: '9:10pm', text: '9:10. Cellar keys out. Returned? (no tick).', from_step: 't3' },
    { id: 'c3', name: 'Note', where: 'n1', shows: 'Someone asked for the will.', does_not_prove: '', importance: 'useful', can_be_destroyed: true, reveal_round: 1, form: 'note', author: 'Character 1', written_at: '7pm', text: 'Bring me the will before dinner. Tell no one.', from_step: 't1' },
    { id: 'c4', name: 'Quiet dog', where: 'l2', shows: 'The dog did not bark at nine.', does_not_prove: '', importance: 'useful', can_be_destroyed: false, reveal_round: 3, form: 'absence', author: '', written_at: '', text: 'The dog sleeps by the door. Nobody heard it bark all night.', from_step: 't2' },
    { id: 'c5', name: 'Telegram', where: 'l1', shows: 'The lawyer comes at dawn.', does_not_prove: '', importance: 'useful', can_be_destroyed: false, reveal_round: 3, form: 'message', author: 'The lawyer', written_at: 'noon', text: 'ARRIVE DAWN STOP READ WILL STOP', from_step: 't1' },
  ];
  s.key_objects = [{ name: 'The will', about: 'A new will.', where: 'l1', where_is_public: true }];
  s.setups = [
    { id: 's1', detail: 'The will is read at dawn.', shown_in: 'background', shown_round: 0, paid_by: 'k3', how_paid: 'It is why tonight.' },
    { id: 's2', detail: 'The dog sleeps by the door.', shown_in: 'opening_scene', shown_round: 0, paid_by: 'c4', how_paid: 'It did not bark: it knew the culprit.' },
    { id: 's3', detail: 'The butler keeps a key ledger.', shown_in: 'c3', shown_round: 1, paid_by: 'c2', how_paid: 'The ledger shows the keys out.' },
    { id: 's4', detail: 'A glove with a missing bead.', shown_in: 'c1', shown_round: 1, paid_by: 'k1', how_paid: 'The bead is in the window.' },
  ];
  s.reframes = [
    { detail: 'Character 1 asks for the will to read it to the family.', seen_in: 'c3', first_reading: 'A kind act.', true_reading: 'They wanted to burn it.', flipped_by: 'c5' },
    { detail: 'The quiet dog.', seen_in: 'opening_scene', first_reading: 'A calm night.', true_reading: 'The culprit was someone it knew.', flipped_by: 'c4' },
  ];
  s.world_rules = [{ rule: 'The dog barks at anyone it does not know.', cost: 'Strangers cannot pass the door unheard.', shown_by: 'background', used_in: 'k1' }];
  s.npcs[0].importance = 'important';
  s.npcs[0].agenda = { wants: 'Hide his drinking from the lawyer.', plan: [{ round: 1, does: 'Moves the bottles to the cellar.' }, { round: 2, does: 'Burns the old key ledger page.' }], leaves: 'c2' };
  s.npcs[1].importance = 'minor';
  s.clues[2].pairs_with = 'c5';
  s.clues[4].pairs_with = 'c3';
  s.lies_caught = [];
  s.reframes.push({ detail: 'The butler logs every key.', seen_in: 'c3', first_reading: 'A careful man.', true_reading: 'His log shows the keys out.', flipped_by: 'c2' });
  s.false_solution = { believed: 'Character 2 took the will for the money.', points_at: 'p2', built_from: ['c1', 'c3'], broken_by: 'c2' };
  s.players.forEach((p, i) => (p.goal = ['Burn the will before dawn.', 'Find the glove before the lawyer.', 'Hide the telegram from everyone.', 'Read the ledger before the vote.'][i]));
  return s;
}

const kinds = (issues: string[]) => issues.map((i) => i.split(':')[0]);
const about = (issues: string[], word: string) => issues.filter((i) => i.includes(word));

describe('story craft checks', () => {
  test('should find nothing wrong in a world that meets every rule', () => {
    assert.deepEqual(craftIssues(craftWorld()), []);
  });

  test('should skip a world written before story craft existed', () => {
    assert.deepEqual(craftIssues(makeScenario(4)), []);
  });

  test('should flag a truth step with no cause and a step that leads nowhere', () => {
    const s = craftWorld();
    s.truth.timeline[1].because = '';
    s.truth.timeline.push({ id: 't4', time: '10pm', event: 'A cat knocks a vase over.', location_id: 'l2', character_ids: [], because: 'chance', leads_to: [] });
    const out = craftIssues(s);
    assert.equal(about(out, 'truth.timeline[1] (t2) has no because').length, 1);
    assert.equal(about(out, 'truth.timeline[3] (t4) leads nowhere').length, 1);
  });

  test('should allow one chance step and flag the second', () => {
    const s = craftWorld();
    s.truth.timeline[2].because = 'By chance the butler was up late.';
    assert.deepEqual(craftIssues(s), []);
    s.truth.timeline[0].because = 'A coincidence.';
    assert.equal(about(craftIssues(s), 'chance').length, 1);
  });

  test('should flag a clue that is not an artifact, has no words or comes from no step', () => {
    const s = craftWorld();
    s.clues[1].text = '';
    s.clues[2].form = 'vibe';
    s.clues[3].from_step = 't9';
    const out = craftIssues(s);
    assert.equal(about(out, 'clues[1] (c2) has no text').length, 1);
    assert.equal(about(out, 'clues[2] (c3).form').length, 1);
    assert.equal(about(out, 'clues[3] (c4).from_step').length, 1);
  });

  test('should want at least half the clues written down, and one written thing in every round', () => {
    const s = craftWorld();
    for (const c of s.clues) if (c.id !== 'c4') c.form = 'object';
    const out = craftIssues(s);
    assert.ok(about(out, 'written things').length >= 1);
    assert.ok(about(out, 'round 2 has no written clue').length === 1);
  });

  test('should want one clue that is an absence', () => {
    const s = craftWorld();
    s.clues[3].form = 'mark';
    assert.equal(about(craftIssues(s), 'absence').length, 1);
  });

  test('should flag too few setups, a setup paid before it is shown, and a key object nothing pays off', () => {
    const s = craftWorld();
    s.setups[2].paid_by = 'c3';
    s.setups[2].shown_round = 2;
    s.key_objects.push({ name: 'The silver bell', about: 'A bell.', where: 'l2', where_is_public: false });
    s.setups.pop();
    const out = craftIssues(s);
    assert.ok(about(out, 'setups; it needs at least 4').length === 1);
    assert.ok(about(out, 'setups[2] (s3) is paid in round 1 before it is shown').length === 1);
    assert.ok(about(out, 'key_objects[1] (The silver bell)').length === 1);
  });

  test('should flag a setup that pays off in nothing', () => {
    const s = craftWorld();
    s.setups[0].paid_by = '';
    assert.equal(about(craftIssues(s), 'setups[0] (s1) pays off in nothing').length, 1);
  });

  test('should want two reframes, each flipped by a clue found after the detail is seen', () => {
    const s = craftWorld();
    s.reframes[0].flipped_by = 'c1';
    s.reframes.pop();
    s.reframes.pop();
    const out = craftIssues(s);
    assert.ok(about(out, '1 reframe').length === 1);
    assert.ok(about(out, 'reframes[0] is flipped by c1').length === 1);
  });

  test('should want an agenda of two steps for every important GM character, inside the rounds', () => {
    const s = craftWorld();
    s.npcs[0].agenda.plan = [{ round: 7, does: 'Leaves.' }];
    const out = craftIssues(s);
    assert.ok(about(out, 'npcs[0] (n1).agenda has 1 step').length === 1);
    assert.ok(about(out, 'round 7').length === 1);
    assert.deepEqual(about(out, 'npcs[1]'), [], 'a minor character needs no plan');
  });

  test('should want a world rule that a deduction uses, shown before it is needed', () => {
    const s = craftWorld();
    s.world_rules = [];
    assert.equal(about(craftIssues(s), 'world_rules').length, 1);
    const t = craftWorld();
    t.world_rules[0].used_in = 'k9';
    assert.equal(about(craftIssues(t), 'world_rules[0].used_in').length, 1);
    const u = craftWorld();
    u.world_rules[0].shown_by = 'c4';
    assert.equal(about(craftIssues(u), 'world_rules[0] is shown in round 3').length, 1);
  });

  test('should want to know why tonight', () => {
    const s = craftWorld();
    s.why_tonight = '';
    assert.equal(about(craftIssues(s), 'why_tonight').length, 1);
  });

  test('should flag a round beat that hands out an essential clue to the whole room', () => {
    const s = craftWorld();
    s.phases[0].planned_beat = 'Someone finds the cellar keys were out at nine, in the ledger.';
    s.clues[1].shows = 'The ledger shows the cellar keys were out at nine.';
    assert.equal(about(craftIssues(s), 'phases[0].planned_beat hands out clue c2').length, 1);
  });

  test('should send story-craft problems to the story check with the rest', () => {
    const s = craftWorld();
    s.why_tonight = '';
    assert.ok(kinds(storyIssues(s)).includes('cause'));
  });

  test('should list the forms an artifact can take, including an absence', () => {
    for (const f of ['letter', 'diary', 'ledger', 'receipt', 'absence', 'object']) assert.ok(ARTIFACT_FORMS.includes(f), f);
  });
});

describe('the story check can fix story craft', () => {
  test('should patch artifact words, a plan, the setups and why tonight', () => {
    const s = craftWorld();
    s.why_tonight = '';
    const out = applyStoryPatches(s, [
      { path: 'clues.0.text', value: 'A grey glove, the thumb torn open.' },
      { path: 'npcs.0.agenda', value: JSON.stringify({ wants: 'W', plan: [{ round: 1, does: 'A' }, { round: 2, does: 'B' }], leaves: '' }) },
      { path: 'setups', value: JSON.stringify([...s.setups, { id: 's5', detail: 'D', shown_in: 'background', shown_round: 0, paid_by: 'k2', how_paid: 'H' }]) },
      { path: 'why_tonight', value: 'The will is read at dawn.' },
    ], { playerCount: 4, phases: 3, hints: 3 });
    assert.equal(out.applied, 4, JSON.stringify(out.skipped));
    assert.equal(s.clues[0].text, 'A grey glove, the thumb torn open.');
    assert.equal(s.npcs[0].agenda.plan.length, 2);
    assert.equal(s.setups.length, 5);
    assert.equal(s.why_tonight, 'The will is read at dawn.');
  });

  test('should refuse an agenda that is not an object', () => {
    const s = craftWorld();
    const out = applyStoryPatches(s, [{ path: 'npcs.0.agenda', value: '[1,2]' }], { playerCount: 4, phases: 3, hints: 3 });
    assert.equal(out.applied, 0);
    assert.match(out.skipped.join(' '), /needs an object/);
  });
});

describe('clue names in story craft fields', () => {
  test('should turn clue names into ids and leave ids, deductions and rounds alone', () => {
    const s = craftWorld();
    s.setups[0].paid_by = 'k3';
    s.setups[1].paid_by = 'the Quiet dog';
    s.setups[2].shown_in = 'background';
    s.reframes[0].flipped_by = 'Telegram';
    s.world_rules[0].shown_by = 'Ledger';
    s.npcs[0].agenda.leaves = 'ledger';
    s.setups[3].paid_by = 'round 3';
    resolveStoryIds(s);
    assert.deepEqual([s.setups[0].paid_by, s.setups[1].paid_by, s.setups[2].shown_in, s.reframes[0].flipped_by, s.world_rules[0].shown_by, s.npcs[0].agenda.leaves, s.setups[3].paid_by], ['k3', 'c4', 'background', 'c5', 'c2', 'c2', 'round 3']);
  });
});

describe('story craft in play', () => {
  function playingCraft() {
    const game = gameInReading(4);
    const w = craftWorld();
    Object.assign(game.scenario, { setups: w.setups, reframes: w.reframes, world_rules: w.world_rules, why_tonight: w.why_tonight, clues: w.clues });
    game.scenario.npcs[0].agenda = w.npcs[0].agenda;
    game.scenario.npcs[0].importance = 'important';
    G.startPlay(game, 1_000);
    return game;
  }

  test('should hand the round change what each GM character plans to do next round', () => {
    const game = playingCraft();
    const next = G.nextPhaseInfo(game);
    assert.deepEqual(next.plans, ['The Butler: Burns the old key ledger page.']);
    assert.match(phasePrompt({ snapshot: {}, nextPhase: next, lastRound: null }), /GM characters' plans for this round[^]*The Butler: Burns the old key ledger page\./);
  });

  test('should name the setups whose payoff opens next round', () => {
    const game = playingCraft();
    assert.deepEqual(G.nextPhaseInfo(game).pay_now, ['The butler keeps a key ledger.', 'A glove with a missing bead.']);
  });

  test('should leave the round change as it was for a world with no plans or setups', () => {
    const game = gameInReading(4);
    G.startPlay(game, 1_000);
    const next = G.nextPhaseInfo(game);
    assert.equal('plans' in next, false);
    assert.equal('pay_now' in next, false);
    assert.doesNotMatch(phasePrompt({ snapshot: {}, nextPhase: next, lastRound: null }), /plans for this round/);
  });

  test('should tell the GM to show a found thing in its own words and to keep GM characters on their plans', () => {
    const sys = playSystem(makeScenario(4));
    assert.match(sys, /quote its text/);
    assert.match(sys, /agenda/);
  });

  test('should ask the reveal to bring back what players saw early', () => {
    assert.match(scorePrompt({ snapshot: {}, submissions: [], verdict: {} }), /setups and reframes/);
  });
});

describe('lies that can be caught, and a document in two halves', () => {
  test('should want every GM character lie caught by a real clue', () => {
    const s = craftWorld();
    s.npcs[0].lies = 'He says he never left the pantry.';
    assert.equal(about(craftIssues(s), 'npcs[0] (n1) tells lies that nothing catches').length, 1);
    s.lies_caught = [{ npc_id: 'n1', lie: 'Never left the pantry.', caught_by: 'c9' }];
    assert.equal(about(craftIssues(s), 'names c9, which is not a clue id').length, 1);
    s.lies_caught = [{ npc_id: 'n1', lie: 'Never left the pantry.', caught_by: 'c2' }];
    assert.deepEqual(about(craftIssues(s), 'lie:'), []);
  });

  test('should want one document split in two halves, found apart', () => {
    const s = craftWorld();
    delete s.clues[2].pairs_with;
    assert.equal(about(craftIssues(s), 'no document is split in two').length, 1);
    const t = craftWorld();
    t.clues[4].where = 'n1';
    t.clues[4].reveal_round = 1;
    assert.equal(about(craftIssues(t), 'c3 and c5 are halves found in the same place and round').length, 1);
  });
});

describe('a story that keeps turning', () => {
  test('should want the turns spread over rounds, one of them late', () => {
    const s = craftWorld();
    for (const r of s.reframes) r.flipped_by = 'c2';
    assert.equal(about(craftIssues(s), 'every reframe turns in round 2').length, 1);
    const t = craftWorld();
    t.reframes = t.reframes.map((r) => ({ ...r, flipped_by: 'c3', seen_in: 'opening_scene' }));
    assert.equal(about(craftIssues(t), 'no reframe turns in the last two rounds').length, 1);
  });

  test('should want a false solution about an innocent, believed by the middle and broken later', () => {
    const s = craftWorld();
    delete s.false_solution;
    assert.ok(about(craftIssues(s), 'false_solution').length >= 1);
    const t = craftWorld();
    t.false_solution.points_at = 'p1';
    assert.equal(about(craftIssues(t), "must be an innocent person's id").length, 1);
    const u = craftWorld();
    u.false_solution.built_from = ['c1', 'c4'];
    assert.equal(about(craftIssues(u), 'open after round 2').length, 1);
    const v = craftWorld();
    v.false_solution.broken_by = 'c3';
    assert.equal(about(craftIssues(v), 'broken in round 1, before or with the clues').length, 1);
  });

  test('should flag a case against the culprit that is complete before the false solution breaks', () => {
    const s = craftWorld();
    s.false_solution.broken_by = 'c5';
    assert.equal(about(craftIssues(s), 'complete before the false solution breaks (round 3)').length, 1);
  });

  test('should want most secret goals to touch a clue', () => {
    const s = craftWorld();
    s.players.forEach((p) => (p.goal = 'Make sure nobody names you in the final vote.'));
    assert.equal(about(craftIssues(s), 'secret goals touch a clue').length, 1);
  });

  test('should line up the turns and the false solution at each round change', () => {
    const game = gameInReading(4);
    const w = craftWorld();
    Object.assign(game.scenario, { setups: w.setups, reframes: w.reframes, false_solution: w.false_solution, clues: w.clues });
    G.startPlay(game, 1_000);
    const next = G.nextPhaseInfo(game);
    assert.match(next.flip_now.join(' '), /The butler logs every key/);
    assert.match(next.false_solution, /this is the round it breaks\. Put Ledger within reach/);
    assert.match(phasePrompt({ snapshot: {}, nextPhase: next, lastRound: null }), /Turns due this round[^]*The false solution: this is the round it breaks/);
  });
});
