// What the server sends to the table and to each phone (server/game.ts publicCore, tableView, playerView).
// Fields the screens do not read yet stay loose on purpose.

export interface RoomColors { bg: string; surface: string; surfaceAlt: string; text: string; muted: string; accent: string; accentText: string; danger: string }
export interface Room { fontPair: string; texture: string; ambient: string; intensity: 'low' | 'medium'; soundSet: 'soft' | 'tense' | 'playful'; colors: RoomColors }

export interface PlanStep { title: string; state: 'done' | 'active' | 'todo'; count?: string }
export interface Retry { reason: 'rules' | 'garbled'; broke: number; tookMs: number; at: number }
export interface Progress {
  attempt: number;
  draft: number;
  startedAt: number;
  plan: PlanStep[] | null;
  thinking: boolean;
  redraft: boolean;
  retry?: Retry | null;
  [key: string]: unknown;
}

export interface CastPlayer { id: string; player: string; name: string; role: string; info: string; icon?: string }
export interface CastNpc { id: string; name: string; role: string; info: string; icon?: string; minor?: boolean }
export interface Cast { players: CastPlayer[]; npcs: CastNpc[]; locations: { id: string; name: string; [key: string]: unknown }[] }

export interface Round { objective: string; tips: string[]; question: string | null; options: string[]; done: boolean; vote: { endsAt: number; voted: number; of: number } | null }
export interface Phase { index: number; number: number; count: number; name: string; endsAt: number | null }
export interface GameEvent { at: number; phase: number | null; kind: string; text: string; by?: string; q?: string }

export interface PublicView {
  gameId: string;
  status: 'lobby' | 'generating' | 'failed' | 'reading' | 'playing' | 'final' | 'reveal' | string;
  room: Room | null;
  error: string | null;
  players: { id: string; name: string }[];
  setup: Record<string, unknown> | null;
  title: string;
  caseQuestion: string;
  cast: Cast | null;
  round: Round | null;
  phase: Phase | null;
  events: GameEvent[];
  progress: Progress | null;
  suspicion: number;
  ready: string[];
  submitted: string[];
  transitioning: boolean;
  scoring: boolean;
  reveal: Record<string, any> | null;
  [key: string]: any;
}

export interface Play { points: number; skill: string | null; why: string }
export interface ThreadEntry { from: 'you' | 'gm' | 'whisper' | 'system'; text: string; kind?: string; lines?: { speaker: string; text: string }[]; ideas?: string[]; play?: Play; penalty?: Play; at: number }

export interface CardView {
  name: string;
  role: string;
  public_info: string;
  private_info: string;
  goal: string;
  win: string;
  side: string;
  side_explanation: string;
  starting_knowledge: string;
  wants: string;
  fears: string;
  goal_why: string;
  reasons: string[];
  reminders: string[];
  night: { time: string; where: string; doing: string }[];
  alibi: { time: string; where: string }[];
  hidden_known: string[];
  hidden_unknown: number;
  [key: string]: unknown;
}

export interface ProfileView {
  username: string;
  name: string;
  games: number;
  skills: { skill: string; label: string; points: number; moves: number }[];
  coaching: string;
  change: string;
  rating: number;
  answers?: { question: string; answer: string }[];
}

export interface PlayerView extends PublicView {
  me: { id: string; name: string };
  card?: CardView;
  thread?: ThreadEntry[];
  questionsLeft?: number;
  pending?: { kind: string; text: string } | null;
  clues?: { id: string; name: string; shows: string; destroyed: boolean }[];
  myRoundVote?: number | null;
  publicPending?: string | null;
  publicError?: string | null;
  persona?: { intent: string; persona: string } | null;
  playTotal?: number;
  moments?: { id: string; line: string; why: string; status: string; readyAt?: number }[];
  overridesLeft?: number;
  submission?: Record<string, unknown> | null;
  question?: { id: string; question: string; choices: string[] } | null;
  profile?: ProfileView;
}

export type TableView = PublicView;
