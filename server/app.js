import * as G from './game.js';
import { GENERATION_STEPS, stepForKey } from './progress.js';

const { GameError } = G;
export const RETRY_MS = 60_000;

export class App {
  constructor({ gm, store, clock = () => Date.now(), log = () => {}, archive = null }) {
    this.gm = gm;
    this.store = store;
    this.archive = archive;
    this.clock = clock;
    this.log = log;
    this.game = null;
    this.listeners = new Set();
    this.tasks = new Set();
    this.asks = new Map();
  }

  async init() {
    this.game = (await this.store.load()) ?? G.createGame(this.clock());
    if (this.game.status === 'generating') {
      this.game.status = 'failed';
      this.game.error = 'The server restarted while the world was being written. Try again.';
      this.game.progress = null;
    }
    if (this.game.state) {
      const st = this.game.state;
      st.positions ??= G.startPositions(this.game.scenario);
      st.brief ??= { step: 0 };
      st.roundResults ??= [];
      st.timelineExtra ??= [];
      st.shared ??= [];
      st.publicPending = {};
      st.knowledge ??= [];
      st.moments ??= [];
      st.roundNumber ??= st.phaseIndex + 1;
      st.replays ??= 0;
      st.persona ??= {};
      st.facts ??= [];
      G.backfillFacts(this.game);
      if (this.game.setup) this.game.setup.replays ??= G.MAX_REPLAYS;
      st.overridesLeft ??= Object.fromEntries(this.game.players.map((p) => [p.id, this.game.setup?.overrides ?? 3]));
      for (const pid of Object.keys(this.game.state.pending ?? {})) {
        G.failAsk(this.game, pid);
        this.game.state.threads[pid]?.push({ from: 'system', text: 'The game restarted before the GM answered. You did not lose a question. Ask again.', at: this.clock() });
      }
      this.game.state.pending = {};
      this.game.state.transitioning = false;
      this.game.state.scoring = false;
    }
    await this.changed();
    return this;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async changed() {
    await this.store.save(this.game);
    for (const fn of this.listeners) fn(this.game);
  }

  notify() {
    this.changed().catch((err) => this.log(`save failed: ${err.message}`));
  }

  failed(game, label, publicMessage, err) {
    this.log(`${label} failed: ${err.message}`);
    game.error = `${publicMessage} The terminal says why.`;
  }

  background(label, fn) {
    const task = (async () => {
      try {
        await fn();
      } catch (err) {
        this.log(`${label} failed: ${err.message}`);
      }
    })();
    this.tasks.add(task);
    task.finally(() => this.tasks.delete(task));
    return task;
  }

  async idle() {
    while (this.tasks.size) await Promise.allSettled([...this.tasks]);
  }

  requireHost(hostToken) {
    if (!hostToken || hostToken !== this.game.hostToken) throw new GameError('Only the table screen can do that.', 403);
  }

  async keep(game) {
    try {
      await this.archive?.save(game);
    } catch (err) {
      this.log(`dataset save failed: ${err.message}`);
    }
  }

  async newGame(hostToken) {
    this.requireHost(hostToken);
    this.asks.clear();
    await this.keep(this.game);
    this.game = G.createGame(this.clock());
    await this.changed();
    return this.game.hostToken;
  }

  async join(input) {
    const player = G.addPlayer(this.game, input);
    await this.changed();
    return player.token;
  }

  async setup(hostToken, input) {
    this.requireHost(hostToken);
    G.applySetup(this.game, input);
    await this.changed();
    const game = this.game;
    game.progress = { attempt: 1, draft: 0, step: 'thinking', seen: ['thinking'], counts: {}, startedAt: this.clock() };
    this.background('generate', async () => {
      try {
        const scenario = await this.gm.generate(game, (e) => this.onGenerateProgress(game, e));
        if (this.game !== game) return;
        G.attachScenario(game, scenario, this.clock());
        game.progress = null;
        this.drawPicture(game);
      } catch (err) {
        if (this.game !== game) return;
        game.status = 'failed';
        game.progress = null;
        this.failed(game, 'generate', 'The GM could not make the mystery.', err);
      } finally {
        if (this.game === game) await this.changed();
      }
    });
  }

  onGenerateProgress(game, e) {
    const p = game.progress;
    if (this.game !== game || !p) return;
    const before = p.step;
    const restart = () => {
      p.step = 'thinking';
      p.seen = ['thinking'];
      p.counts = {};
    };
    if (e.kind === 'attempt') {
      p.attempt = e.attempt;
      p.draft = 0;
      restart();
    } else if (e.kind === 'draft') {
      p.draft += 1;
      if (p.draft > 1) {
        restart();
        this.log(`gm generate: draft ${p.draft} (the previous one was not valid JSON, the GM is rewriting it)`);
      }
    } else if (e.kind === 'key') p.step = stepForKey(e.key) ?? p.step;
    else if (e.kind === 'item') p.counts[e.key] = e.count;
    else if (e.kind === 'checking') p.step = 'checking';
    else if (e.kind === 'cards') p.step = 'cards';
    else if (e.kind !== 'thinking') return;
    if (!p.seen.includes(p.step)) p.seen.push(p.step);
    if (p.step !== before) this.log(`gm generate: ${GENERATION_STEPS.find((s) => s.id === p.step)?.label ?? p.step}`);
    this.notify();
  }

  drawPicture(game) {
    this.background('illustrate', async () => {
      const { svg } = await this.gm.illustrate(game);
      if (this.game !== game || !game.state) return;
      const clean = G.cleanSvg(svg);
      if (!clean) throw new Error('the picture was not a safe SVG');
      game.state.illustration = clean;
      await this.changed();
    });
  }

  async brief(hostToken, delta) {
    this.requireHost(hostToken);
    G.moveBrief(this.game, delta);
    await this.changed();
  }

  async voteRound(tok, choice) {
    const p = G.playerByToken(this.game, tok);
    const result = G.voteRound(this.game, p.id, choice, this.clock());
    await this.changed();
    if (result) this.advance();
  }

  async moment(tok, id, action, text) {
    const p = G.playerByToken(this.game, tok);
    if (action === 'ready') G.readyMoment(this.game, p.id, id, this.clock());
    else G.answerMoment(this.game, p.id, id, action, this.clock(), { text });
    await this.changed();
  }

  async note(hostToken, text) {
    this.requireHost(hostToken);
    G.addNote(this.game, text, this.clock());
    await this.changed();
  }

  async shareClue(tok, clueId) {
    const p = G.playerByToken(this.game, tok);
    G.shareClue(this.game, p.id, clueId, this.clock());
    await this.changed();
  }

  async askPublic(tok, text) {
    const game = this.game;
    const p = G.playerByToken(game, tok);
    const q = G.beginPublicAsk(game, p.id, text);
    this.background(`public ${p.id}`, async () => {
      try {
        const { answer, asker_read: read } = await this.gm.publicAnswer(game, q);
        if (this.game !== game) return;
        G.completePublicAsk(game, p.id, answer, this.clock(), read);
      } catch (err) {
        if (this.game !== game) return;
        G.failPublicAsk(game, p.id);
        this.log(`public ${p.id} failed: ${err.message}`);
      } finally {
        if (this.game === game) await this.changed();
      }
    });
    await this.changed();
  }

  async ready(tok) {
    const p = G.playerByToken(this.game, tok);
    G.markReady(this.game, p.id);
    await this.changed();
  }

  async start(hostToken) {
    this.requireHost(hostToken);
    G.startPlay(this.game, this.clock());
    await this.changed();
  }

  async extend(hostToken) {
    this.requireHost(hostToken);
    G.extendPhase(this.game, this.clock());
    await this.changed();
  }

  async ask(tok, input) {
    const game = this.game;
    const p = G.playerByToken(game, tok);
    const ask = G.beginAsk(game, p.id, input ?? {});
    const task = this.background(`ask ${p.id}`, async () => {
      try {
        const result = await this.gm.answer(game, p.id, ask);
        if (this.game !== game) return;
        G.completeAsk(game, p.id, result, this.clock());
      } catch (err) {
        if (this.game !== game) return;
        G.failAsk(game, p.id);
        this.log(`ask ${p.id} failed: ${err.message}`);
        game.state.threads[p.id].push({ from: 'system', text: 'The GM could not answer. You did not lose a question. Try again.', at: this.clock() });
      } finally {
        if (this.game === game) await this.changed();
      }
    });
    this.asks.set(p.id, task);
    task.finally(() => this.asks.get(p.id) === task && this.asks.delete(p.id));
    await this.changed();
  }

  async editPlace(hostToken, input) {
    this.requireHost(hostToken);
    G.editPlace(this.game, input);
    await this.changed();
  }

  async proposeHint(tok) {
    const p = G.playerByToken(this.game, tok);
    G.proposeHint(this.game, p.id, this.clock());
    await this.changed();
  }

  async voteHint(tok, yes) {
    const p = G.playerByToken(this.game, tok);
    G.voteHint(this.game, p.id, yes, this.clock());
    await this.changed();
  }

  async nextPhase(hostToken) {
    this.requireHost(hostToken);
    this.advance();
  }

  advance() {
    const game = this.game;
    const st = game.state;
    if (st.roundVote) {
      G.resolveRoundVote(game, this.clock(), true);
    } else if (G.needsRoundVote(game)) {
      G.beginRoundVote(game, this.clock());
      this.notify();
      return null;
    }
    G.beginPhaseChange(game);
    this.notify();
    return this.background('phase', async () => {
      try {
        await Promise.allSettled([...this.asks.values()]);
        const result = G.goesToFinal(game) ? {} : await this.gm.phase(game);
        if (this.game !== game) return;
        G.completePhase(game, result, this.clock());
        game.error = null;
      } catch (err) {
        if (this.game !== game) return;
        G.cancelPhaseChange(game);
        if (game.state.phaseEndsAt <= this.clock()) game.state.phaseEndsAt = this.clock() + RETRY_MS;
        this.failed(game, 'phase', 'The GM got stuck moving on. It will try again in a minute, or press Next round.', err);
      } finally {
        if (this.game === game) await this.changed();
      }
    });
  }

  async submit(tok, input) {
    const p = G.playerByToken(this.game, tok);
    G.submitFinal(this.game, p.id, input);
    await this.changed();
    if (G.allSubmitted(this.game)) this.reveal();
  }

  async finish(hostToken) {
    this.requireHost(hostToken);
    if (this.game.status !== 'final') throw new GameError('The game is not at the final reconstruction.', 409);
    if (!Object.keys(this.game.state.submissions).length) throw new GameError('Nobody has submitted yet.', 409);
    this.reveal();
  }

  reveal() {
    const game = this.game;
    if (game.state.scoring) return null;
    game.state.scoring = true;
    this.notify();
    return this.background('score', async () => {
      try {
        const verdict = G.computeVerdict(game);
        const score = await this.gm.score(game, verdict);
        if (this.game !== game) return;
        G.applyScore(game, verdict, score);
        game.error = null;
        await this.keep(game);
      } catch (err) {
        if (this.game !== game) return;
        this.failed(game, 'score', 'The GM could not check the answers. Press Show the answer to try again.', err);
      } finally {
        game.state.scoring = false;
        if (this.game === game) await this.changed();
      }
    });
  }

  async tick() {
    const game = this.game;
    const st = game.state;
    if (!st || game.status !== 'playing') return;
    const now = this.clock();
    let dirty = false;
    if (st.hintVote && st.hintVote.endsAt <= now) {
      G.resolveHintVote(game, now);
      dirty = true;
    }
    if (G.tickMoments(game, now)) dirty = true;
    if (dirty) await this.changed();
    if (st.roundVote && st.roundVote.endsAt <= now) return this.advance();
    if (!st.transitioning && !st.roundVote && st.phaseEndsAt && st.phaseEndsAt <= now) this.advance();
  }

  tableView() {
    return G.tableView(this.game, this.clock());
  }

  playerView(tok) {
    const p = G.playerByToken(this.game, tok);
    return G.playerView(this.game, p.id, this.clock());
  }
}
