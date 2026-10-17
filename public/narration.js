const SKIP = /kept its hint/i;

export function narrationFor(prev, next) {
  if (!prev || !next || prev.gameId !== next.gameId) return [];
  const lines = [];
  if (next.status === 'reading' && prev.status !== 'reading' && next.opening) {
    lines.push(`${next.title}.`, next.opening);
  }
  const before = prev.events?.length ?? 0;
  for (const e of (next.events ?? []).slice(before)) {
    if (e.kind === 'opening' || SKIP.test(e.text)) continue;
    lines.push(e.kind === 'phase' ? e.text.replace(/^Round (\d+) of (\d+): /, 'Round $1 of $2. ') : e.text);
  }
  if (next.status === 'reveal' && prev.status !== 'reveal' && next.reveal) {
    const win = next.reveal.verdict.winner === 'investigators';
    lines.push(win ? 'The detectives win.' : 'The culprits got away with it.', next.reveal.reveal_story);
  }
  return lines.filter(Boolean);
}

export function chunks(text, max = 180) {
  const sentences = String(text).match(/[^.!?]+[.!?]*["')]*\s*/g) ?? [];
  const out = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > max) {
      out.push(cur.trim());
      cur = '';
    }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function pickVoice(voices, saved) {
  const english = voices.filter((v) => /^en[-_]/i.test(v.lang));
  return english.find((v) => v.name === saved)
    ?? english.find((v) => /en[-_]IN/i.test(v.lang) && /google|rishi|veena/i.test(v.name))
    ?? english.find((v) => /daniel|samantha|google uk|google us/i.test(v.name))
    ?? english.find((v) => v.default)
    ?? english[0]
    ?? null;
}

export class Narrator {
  constructor({ onStart = () => {}, onEnd = () => {} } = {}) {
    this.synth = globalThis.speechSynthesis ?? null;
    this.enabled = false;
    this.voiceName = null;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.pending = 0;
  }

  get available() {
    return Boolean(this.synth);
  }

  voices() {
    return this.synth ? this.synth.getVoices().filter((v) => /^en[-_]/i.test(v.lang)) : [];
  }

  say(lines) {
    if (!this.enabled || !this.synth) return;
    const voice = pickVoice(this.synth.getVoices(), this.voiceName);
    for (const line of lines) {
      for (const part of chunks(line)) {
        const u = new SpeechSynthesisUtterance(part);
        if (voice) u.voice = voice;
        u.rate = 0.95;
        u.onstart = () => {
          if (this.pending++ === 0) this.onStart();
        };
        u.onend = u.onerror = () => {
          if (--this.pending <= 0) {
            this.pending = 0;
            this.onEnd();
          }
        };
        this.synth.speak(u);
      }
    }
  }

  stop() {
    this.synth?.cancel();
    this.pending = 0;
    this.onEnd();
  }
}
