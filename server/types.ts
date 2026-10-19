// Shared shapes. The big legacy modules are still unchecked; new code types against these.

export type Side = 'investigator' | 'culprit' | 'wildcard' | string;
export type Learning = 'real' | 'test' | 'outlier' | 'playtest';

export interface Read {
  kind: 'question' | 'self' | 'action' | 'say';
  target: string;
  place: string;
  attempt: string;
  said_aloud: string;
  out_of_world: boolean;
  sways_gm: boolean;
  fair_part?: string;
  claims: string[];
  finds?: string[];
  acts?: boolean;
  goes_to?: string;
}

export interface FinalRead {
  how: string;
  why: string;
  goal: string;
  claims: string[];
  sways_gm: boolean;
}

export interface Play {
  points?: number;
  skill?: string | null;
  why?: string;
}

export interface Move {
  points: number;
  skill: string | null;
  why: string;
  rubric: number;
  from: string;
  round?: number;
  gameId?: string;
}

export interface Answer {
  id: string;
  question: string;
  answer: string;
  at: number;
}

export interface GameEntry {
  gameId: string;
  day?: string;
  title?: string;
  character?: string;
  side?: Side;
  intent?: string;
  persona?: string;
  points?: number;
  play?: number;
  rubric?: number | null;
  skills?: Record<string, number>;
  coaching?: string;
}

export interface Rating {
  rubric: number;
  overall: number;
  bySkill: Record<string, { points: number; moves: number; perMove: number }>;
}

export interface Profile {
  username: string;
  name: string;
  createdAt: number;
  answers: Answer[];
  games: GameEntry[];
  moves: Move[];
  skills: Record<string, { points: number; moves: number }>;
  rating: Rating;
}

export interface Card {
  id: string;
  character_name: string;
  role_title: string;
  public_info: string;
  private_info: string;
  goal: string;
  side: Side;
  hidden_facts: { id: string; fact: string }[];
  reminders?: string[];
  night?: { time: string; where: string; doing: string }[];
  [key: string]: unknown;
}

export interface Npc {
  id: string;
  name: string;
  role_title: string;
  public_info: string;
  [key: string]: unknown;
}

export interface Scenario {
  title: string;
  players: Card[];
  npcs: Npc[];
  locations: { id: string; name: string; [key: string]: unknown }[];
  clues: { id: string; name: string; [key: string]: unknown }[];
  phases: { name: string; [key: string]: unknown }[];
  truth: { culprit_ids: string[]; [key: string]: unknown };
  [key: string]: unknown;
}

export interface Player {
  id: string;
  token?: string;
  name: string;
  wish?: string;
  username?: string;
  questions?: string[];
  skipped?: string[];
  about?: { question: string; answer: string }[];
  played_before?: { side?: Side; persona?: string; points?: number; play?: number }[];
}

export interface Game {
  id: string;
  createdAt?: number;
  status: string;
  hostToken?: string;
  players: Player[];
  setup: Record<string, unknown> | null;
  scenario: Scenario | null;
  state: Record<string, any> | null;
  learning?: Learning;
  note?: string;
  [key: string]: unknown;
}
