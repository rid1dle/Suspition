// Small rules the phone screen follows, kept apart from React so they are easy to test.

export function joinBody({ name, wish, linked, typed, newPerson = false }: { name: string; wish: string; linked: { username: string; name: string } | null; typed: string; newPerson?: boolean }) {
  if (linked) return { name: linked.name, wish, username: linked.username };
  if (typed.trim()) return { name, wish, username: typed.trim() };
  return newPerson ? { name, wish, newPerson: true } : { name, wish };
}

export function emptyAnswers({ how, why }: { how: string; why: string }): string | null {
  const empty = [['How', how], ['Why', why]].filter(([, t]) => !String(t).trim()).map(([n]) => n);
  if (!empty.length) return null;
  return `${empty.join(' and ')} ${empty.length > 1 ? 'are' : 'is'} empty, that is ${empty.length * 2} points. Send anyway?`;
}

export interface ReminderState { round: number | null; at: number; next: number }
const FIRST_MS = 15_000;
const EVERY_MS = 3 * 60_000;
const RETRY_MS = 20_000;

// One reminder line 15 s into each round, then one every 3 minutes, never over a vote, a moment or a wait.
export function reminderDue(state: ReminderState, view: { status: string; phase?: { number?: number } | null; card?: { reminders?: string[] }; round?: { vote?: unknown } | null; moments?: unknown[]; pending?: unknown }, now: number) {
  const list = view.card?.reminders ?? [];
  if (view.status !== 'playing' || !list.length) return { state, show: null as string | null };
  const round = view.phase?.number ?? null;
  if (state.round !== round) return { state: { ...state, round, at: now + FIRST_MS }, show: null };
  if (now < state.at) return { state, show: null };
  if (view.round?.vote || view.moments?.length || view.pending) return { state: { ...state, at: now + RETRY_MS }, show: null };
  const show = list[state.next % list.length];
  return { state: { ...state, next: state.next + 1, at: now + EVERY_MS }, show };
}

export function countdown(endsAt: number, now = Date.now()) {
  const left = Math.max(0, Math.round((endsAt - now) / 1000));
  return { text: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, low: left <= 60 };
}

export function suspicionLabel(n: number) {
  if (n >= 75) return 'Very high';
  if (n >= 50) return 'High';
  if (n >= 25) return 'Rising';
  return 'Low';
}
