import { createGame, addPlayer, applySetup, attachScenario } from '../server/game.js';

export function makeScenario(playerCount = 4, { phases = 3, hints = 3 } = {}) {
  const players = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i + 1}`,
    character_name: `Character ${i + 1}`,
    role_title: `Role ${i + 1}`,
    public_info: `PUBLIC-${i + 1}`,
    private_info: `PRIVATE-${i + 1}`,
    goal: `GOAL-${i + 1}`,
    side: i === 0 ? 'culprit' : 'investigator',
    side_explanation: i === 0 ? 'You did it.' : 'You did not do it.',
    hidden_facts: [{ id: `h${i + 1}`, fact: `HIDDEN-${i + 1}` }],
    starting_knowledge: `KNOWS-${i + 1}`,
    start_location: i % 2 ? 'l2' : 'l1',
  }));
  return {
    title: 'The Test Case',
    setting_summary: 'A test setting.',
    opening_scene: 'OPENING',
    truth: { summary: 'TRUTH-SUMMARY', timeline: [{ time: '9pm', event: 'It happened' }], culprit_ids: ['p1'], method: 'METHOD', motive: 'MOTIVE', ambiguities: '' },
    players,
    npcs: [
      { id: 'n1', name: 'The Butler', role_title: 'Butler', public_info: 'Serves drinks', knows: 'NPC-KNOWS', secrets: 'NPC-SECRET', lies: '', reveals_freely: '', reveals_under_pressure: '', start_location: 'l2' },
      { id: 'n2', name: 'The Widow', role_title: 'Widow', public_info: 'Grieving', knows: '', secrets: '', lies: '', reveals_freely: '', reveals_under_pressure: '', start_location: 'nowhere' },
    ],
    locations: [
      { id: 'l1', name: 'Ballroom', public_info: 'Big', x: 20, y: 30, neighbors: ['l2'] },
      { id: 'l2', name: 'Kitchen', public_info: 'Hot', x: 80, y: 70, neighbors: ['l1', 'l9'] },
    ],
    clues: [
      { id: 'c1', name: 'Torn glove', where: 'l1', shows: 'CLUE-1-SHOWS', does_not_prove: '', importance: 'essential', can_be_destroyed: true },
      { id: 'c2', name: 'Ledger', where: 'l2', shows: 'CLUE-2-SHOWS', does_not_prove: '', importance: 'essential', can_be_destroyed: false },
      { id: 'c3', name: 'Note', where: 'n1', shows: 'CLUE-3-SHOWS', does_not_prove: '', importance: 'useful', can_be_destroyed: true },
    ],
    key_deductions: [
      { id: 'k1', statement: 'A', clue_ids: ['c1', 'c2'] },
      { id: 'k2', statement: 'B', clue_ids: ['c2', 'c3'] },
      { id: 'k3', statement: 'C', clue_ids: ['c1', 'c3'] },
    ],
    phases: Array.from({ length: phases }, (_, i) => ({ name: `Phase name ${i + 1}`, planned_beat: `BEAT-${i + 1}` })),
    hint_ladder: Array.from({ length: hints + 1 }, (_, i) => ({ text: `HINT-${i + 1}`, is_false: false })),
    twists: [{ name: 'Twist', description: 'TWIST-DESC' }],
  };
}

export function gameInReading(playerCount = 4, now = 1_000) {
  const game = createGame(now);
  for (let i = 0; i < playerCount; i += 1) addPlayer(game, { name: `Player${i + 1}` });
  applySetup(game, { setting: '', tone: 'tense', length: 'short', hints: 3 });
  attachScenario(game, makeScenario(playerCount), now);
  return game;
}

export const emptyAsk = { answer: 'An answer.', clues_found: [], suspicion_change: 0, public_event: '', hidden_fact_revealed: '', clues_destroyed: [], messages_to_players: [] };
export const emptyPhase = { public_event: 'Something changed.', messages_to_players: [], clues_destroyed: [], suspicion_change: 0 };

export class FakeGM {
  constructor() {
    this.calls = [];
    this.askResult = emptyAsk;
    this.phaseResult = emptyPhase;
    this.fail = {};
    this.gate = null;
  }
  async step(name, value) {
    this.calls.push(name);
    if (this.gate) await this.gate;
    if (this.fail[name]) throw new Error(`fake ${name} failure`);
    return typeof value === 'function' ? value() : structuredClone(value);
  }
  generate(game, onProgress = () => {}) {
    for (const e of this.progressEvents ?? []) onProgress(e);
    return this.step('generate', () => makeScenario(game.players.length, { phases: 3, hints: game.setup.hints }));
  }
  answer() {
    return this.step('answer', this.askResult);
  }
  phase() {
    return this.step('phase', this.phaseResult);
  }
  score(game) {
    return this.step('score', () => ({
      reveal_story: 'STORY',
      players: game.players.map((p) => ({ player_id: p.id, method_score: 2, motive_score: 1, goal_achieved: true, goal_outcome: 'Did it', comment: 'Nice' })),
    }));
  }
}
