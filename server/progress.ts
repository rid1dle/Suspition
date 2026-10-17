type OnKey = (key: string) => void;
type OnItem = (key: string, count: number) => void;
type OnValue = (key: string, value: unknown) => void;

// Top-level values handed over whole as soon as they close (the GM's own progress plan).
const CAPTURE = new Set(['progress']);

export class TopLevelTracker {
  onKey: OnKey;
  onItem: OnItem;
  onValue: OnValue;
  valueKey!: string | null;
  valueBuf!: string;
  stack!: string[];
  inString!: boolean;
  escaped!: boolean;
  buffer!: string;
  capturing!: boolean;
  pendingKey!: string | null;
  expectingKey!: boolean;
  key!: string | null;
  counts!: Record<string, number>;

  constructor(onKey: OnKey = () => {}, onItem: OnItem = () => {}, onValue: OnValue = () => {}) {
    this.onKey = onKey;
    this.onItem = onItem;
    this.onValue = onValue;
    this.reset();
  }

  reset() {
    this.stack = [];
    this.inString = false;
    this.escaped = false;
    this.buffer = '';
    this.capturing = false;
    this.pendingKey = null;
    this.expectingKey = false;
    this.key = null;
    this.counts = {};
    this.valueKey = null;
    this.valueBuf = '';
  }

  feed(chunk: string) {
    for (const c of chunk) this.step(c);
  }

  step(c: string) {
    if (this.valueKey) this.valueBuf += c;
    this.read(c);
    if (this.valueKey && !this.inString && this.stack.length === 1 && (c === ']' || c === '}') && this.valueBuf.trim()) {
      const key = this.valueKey;
      this.valueKey = null;
      try {
        this.onValue(key, JSON.parse(this.valueBuf));
      } catch {
        // a garbled draft; the next draft resets the tracker
      }
    }
  }

  read(c: string) {
    if (this.inString) {
      if (this.escaped) this.escaped = false;
      else if (c === '\\') this.escaped = true;
      else if (c === '"') {
        this.inString = false;
        if (this.capturing) this.pendingKey = this.buffer;
        return;
      }
      if (this.capturing) this.buffer += c;
      return;
    }
    const atTop = this.stack.length === 1 && this.stack[0] === '{';
    if (c === '"') {
      this.inString = true;
      this.capturing = atTop && this.expectingKey;
      this.buffer = '';
      return;
    }
    if (c === ':' && atTop && this.pendingKey !== null) {
      this.key = this.pendingKey;
      this.pendingKey = null;
      this.expectingKey = false;
      this.onKey(this.key);
      if (CAPTURE.has(this.key)) {
        this.valueKey = this.key;
        this.valueBuf = '';
      }
      return;
    }
    if (c === ',' && atTop) {
      this.expectingKey = true;
      return;
    }
    if (c === '{' || c === '[') {
      if (c === '{' && this.stack.length === 2 && this.stack[0] === '{' && this.stack[1] === '[' && this.key) {
        this.counts[this.key] = (this.counts[this.key] ?? 0) + 1;
        this.onItem(this.key, this.counts[this.key]);
      }
      this.stack.push(c);
      if (this.stack.length === 1 && c === '{') this.expectingKey = true;
      return;
    }
    if (c === '}' || c === ']') this.stack.pop();
  }
}

export const GENERATION_STEPS = [
  { id: 'thinking', label: 'Thinking up the crime', keys: [] },
  { id: 'scene', label: 'Setting the scene', keys: ['title', 'setting_summary', 'opening_scene'] },
  { id: 'truth', label: 'What really happened', keys: ['truth'] },
  { id: 'players', label: 'Your characters', keys: ['players'], countsTo: 'players' },
  { id: 'npcs', label: 'People the GM plays', keys: ['npcs'] },
  { id: 'locations', label: 'Places', keys: ['locations'] },
  { id: 'clues', label: 'Clues', keys: ['clues'] },
  { id: 'deductions', label: 'How the clues connect', keys: ['key_deductions'] },
  { id: 'phases', label: 'What happens each round', keys: ['phases'] },
  { id: 'hints', label: 'Hints and twists', keys: ['hint_ladder', 'twists'] },
  { id: 'checking', label: 'Checking it', keys: [] },
  { id: 'cards', label: 'Making sure everyone knows their own story', keys: [] },
];

export function stepForKey(key: string): string | null {
  return GENERATION_STEPS.find((s) => s.keys.includes(key))?.id ?? null;
}
