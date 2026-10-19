// @ts-nocheck -- legacy JS, typed file by file later
import * as G from './game.ts';
import { GENERATION_STEPS, stepForKey } from './progress.ts';
import { MemoryPeople } from './store.ts';
import { QUESTIONS, pickQuestions } from './questions.ts';
import { musicPool } from '../src/lib/soundtrack/pool.ts';
import { FIXTURE } from '../src/lib/soundtrack/fixture.ts';
import { usernameFor, newProfile, addAnswer, aboutForGM, recordGame, profileView } from './profiles.ts';
import { resolveStyle, DEFAULT_STYLE } from '../src/lib/art-styles.ts';
import { roundPicturePrompt } from './prompts.ts';
import { applyContinuity, continuityState, CHECK_AFTER_ANSWERS } from './continuity.ts';
import { pendingTheory, applyTheory } from './theory.ts';

const { GameError } = G;
export const RETRY_MS = 60_000;
// How long a move waits for the player to say Go before it counts as Not now.
export const CONFIRM_MS = 90_000;

// A player who chose not to go asks from where they stand.
// Staying is talk: nothing is searched or moved, and the GM is told plainly.
const stayed = (read) => (read ? { ...read, goes_to: '', place: '', acts: false, kind: read.kind === 'action' ? 'question' : read.kind, attempt: `They thought about going somewhere else, but chose not to go anywhere and stay where they are. (They had written: ${read.attempt ?? ''})` } : read);

export class App {
  constructor({ gm, store, clock = () => Date.now(), log = () => {}, archive = null, people = new MemoryPeople(), library = null }) {
    this.gm = gm;
    this.library = library;
    this.people = people;
    this.profiles = new Map();
    this.store = store;
    this.archive = archive;
    this.clock = clock;
    this.log = log;
    this.game = null;
    this.listeners = new Set();
    this.tasks = new Set();
    this.asks = new Map();
    this.confirms = new Map();
    this.confirmOwners = new Map();
  }

  async init() {
    const saved = await this.store.load();
    this.game = saved ?? G.createGame(this.clock());
    if (this.game.status === 'lobby' && (!saved || !this.game.lobby)) G.shuffleSurprise(this.game, this.recentWorlds());
    if (this.game.scenario) G.cleanScenario(this.game);
    if (this.game.status === 'generating') {
      this.game.status = 'failed';
      this.game.error = 'The server restarted while the world was being written. Try again.';
      this.game.progress = null;
    }
    if (this.game.state) {
      const st = this.game.state;
      st.positions ??= G.startPositions(this.game.scenario);
      st.at ??= Object.fromEntries(this.game.players.map((p) => [p.id, st.positions[p.id]]));
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
      st.play ??= {};
      continuityState(this.game);
      G.backfillFacts(this.game);
      if (this.game.setup) this.game.setup.replays ??= G.MAX_REPLAYS;
      st.overridesLeft ??= Object.fromEntries(this.game.players.map((p) => [p.id, this.game.setup?.overrides ?? 3]));
      for (const pid of Object.keys(this.game.state.pending ?? {})) {
        G.failAsk(this.game, pid);
        this.game.state.threads[pid]?.push({ from: 'system', text: 'The game restarted before the GM answered. Ask again.', at: this.clock() });
      }
      this.game.state.pending = {};
      this.game.state.moveConfirm = {};
      this.game.state.transitioning = false;
      this.game.state.theorizing = false;
      this.game.state.scoring = false;
    }
    for (const p of this.game.players) if (p.username) this.profiles.set(p.username, (await this.people.load(p.username)) ?? newProfile(p.username, p.name, this.clock()));
    await this.changed();
    this.drawRound(this.game);
    if (this.game.status === 'playing' && pendingTheory(this.game)) this.advance();
    const music = this.game.state?.soundtrack?.status;
    if (['reading', 'playing'].includes(this.game.status) && (!music || music === 'writing')) this.composeMusic(this.game);
    if (['reading', 'playing'].includes(this.game.status)) this.drawMap(this.game);
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
    G.shuffleSurprise(this.game, this.recentWorlds());
    await this.changed();
    return this.game.hostToken;
  }

  async join(input = {}) {
    const name = String(input.name ?? '').trim();
    const taken = this.people.allUsernames ? await this.people.allUsernames() : (await this.people.list()).map((p) => p.username);
    const username = input.username ? usernameFor(input.username) : usernameFor(name, taken);
    const player = G.addPlayer(this.game, { ...input, username });
    const profile = (await this.people.load(username)) ?? newProfile(username, player.name, this.clock());
    profile.name = player.name;
    player.questions = pickQuestions(profile.answers.map((a) => a.id)).map((q) => q.id);
    player.skipped = [];
    this.profiles.set(username, profile);
    await this.people.save(profile);
    await this.changed();
    return player.token;
  }

  knownPeople() {
    return this.people.list();
  }

  async checkName(name) {
    const slug = usernameFor(name);
    const match = (await this.people.list()).find((p) => p.username === slug) ?? null;
    return { match };
  }

  async answerQuestion(tok, { id, choice, text } = {}) {
    const game = this.game;
    const p = G.playerByToken(game, tok);
    if (!['lobby', 'generating', 'reading'].includes(game.status)) throw new G.GameError('Questions are only before the game starts.', 409);
    const q = QUESTIONS.find((x) => x.id === id);
    if (!q || !p.questions?.includes(id)) throw new G.GameError('That question is not yours.', 409);
    const profile = this.profiles.get(p.username);
    const own = String(text ?? '').trim();
    let answer = null;
    if (own) {
      const read = await this.readOrRefuse(game, p.id, own.slice(0, 300), 'answer');
      answer = read.said_aloud || read.attempt;
    } else if (Number.isInteger(choice) && q.choices[choice]) answer = q.choices[choice];
    if (answer && profile) {
      addAnswer(profile, { id, answer }, this.clock());
      await this.people.save(profile);
    } else p.skipped.push(id);
    await this.changed();
  }

  async forget(tok) {
    const p = G.playerByToken(this.game, tok);
    const profile = this.profiles.get(p.username);
    if (!profile) return;
    profile.answers = [];
    await this.people.save(profile);
    await this.changed();
  }

  requireLibrary() {
    if (!this.library) throw new G.GameError('Saved games are not available here.', 404);
    return this.library;
  }

  logRippleDrop(game, before) {
    const list = game.state.rippleDrops ?? [];
    if (list.length > before || (list.length === 50 && list.at(-1)?.at === this.clock())) this.log(`ripple dropped (${list.at(-1).why} gap)`);
  }

  // The worlds this group played lately, so a drawn setting and the world writer can steer away from them.
  recentWorlds() {
    try {
      return this.library?.recentWorlds?.(10) ?? [];
    } catch (err) {
      this.log(`recent worlds failed: ${err.message}`);
      return [];
    }
  }

  async shuffleSurprise(hostToken) {
    this.requireHost(hostToken);
    if (!['lobby', 'failed'].includes(this.game.status)) throw new GameError('The world is already written.', 409);
    const idea = G.shuffleSurprise(this.game, this.recentWorlds());
    await this.changed();
    return idea;
  }

  async listGames(hostToken) {
    this.requireHost(hostToken);
    return this.requireLibrary().list();
  }

  async gameDetail(hostToken, id) {
    this.requireHost(hostToken);
    const d = this.requireLibrary().detail(id);
    if (!d) throw new G.GameError('That game is not here.', 404);
    return d;
  }

  // Changing what the game learns from never touches the live game; it only refreshes the profiles in it.
  async setLearning(hostToken, id, learning, note) {
    this.requireHost(hostToken);
    try {
      this.requireLibrary().setLearning(id, learning, note);
    } catch (err) {
      throw new G.GameError(err.message, 400);
    }
    for (const p of this.game.players) {
      if (p.username) this.profiles.set(p.username, (await this.people.load(p.username)) ?? this.profiles.get(p.username));
    }
    await this.changed();
  }

  async importGame(hostToken, game, answers = {}) {
    this.requireHost(hostToken);
    try {
      return this.requireLibrary().importGame(game, answers, this.clock());
    } catch (err) {
      throw new G.GameError(err.message, 400);
    }
  }

  // Each player's profile learns from a finished game. Only the reveal calls this.
  async learn(game) {
    for (const p of game.players) {
      if (!p.username) continue;
      const profile = this.profiles.get(p.username) ?? (await this.people.load(p.username)) ?? newProfile(p.username, p.name, this.clock());
      recordGame(profile, game, p.id);
      this.profiles.set(p.username, profile);
      await this.people.save(profile);
    }
  }

  async setup(hostToken, input) {
    this.requireHost(hostToken);
    G.applySetup(this.game, input);
    if (!this.game.setup.setting) this.game.setup.recent = this.recentWorlds();
    for (const p of this.game.players) Object.assign(p, aboutForGM(this.profiles.get(p.username)));
    if (input.testGame === true) this.game.learning = 'test';
    await this.changed();
    if (input.testGame === true) this.library?.setLearning(this.game.id, 'test');
    const game = this.game;
    game.progress = { attempt: 1, draft: 0, step: 'thinking', seen: ['thinking'], counts: {}, startedAt: this.clock() };
    this.background('generate', async () => {
      try {
        const scenario = await this.gm.generate(game, (e) => this.onGenerateProgress(game, e));
        if (this.game !== game) return;
        G.attachScenario(game, scenario, this.clock());
        game.progress = null;
        this.drawPicture(game);
        this.drawMap(game);
        this.composeMusic(game);
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
      p.key = null;
      p.keys = [];
    };
    // A second try keeps only why and how long the first took: never the broken rules, they can name a culprit.
    const retry = (reason, broke = 0) => {
      const now = this.clock();
      p.retry = { reason, broke, tookMs: now - (p.triedAt ?? p.startedAt), at: now };
      p.triedAt = now;
    };
    if (e.kind === 'attempt') {
      p.attempt = e.attempt;
      p.draft = 0;
      if (e.attempt > 1) retry('rules', Number(e.broke) || 0);
      restart();
    } else if (e.kind === 'draft') {
      p.draft += 1;
      if (p.draft > 1) {
        retry('garbled');
        restart();
        this.log(`gm generate: draft ${p.draft} (the previous one was not valid JSON, the GM is rewriting it)`);
      }
    } else if (e.kind === 'plan') {
      p.plan = G.cleanPlan(e.steps);
      this.notify();
      return;
    } else if (e.kind === 'key') {
      p.step = stepForKey(e.key) ?? p.step;
      p.key = e.key;
      p.keys = [...new Set([...(p.keys ?? []), e.key])];
    }
    else if (e.kind === 'item') p.counts[e.key] = e.count;
    else if (e.kind === 'checking') p.step = 'checking';
    else if (e.kind === 'story') p.step = 'story';
    else if (e.kind === 'cards') p.step = 'cards';
    else if (e.kind !== 'thinking') return;
    if (!p.seen.includes(p.step)) p.seen.push(p.step);
    if (p.step !== before) this.log(`gm generate: ${GENERATION_STEPS.find((s) => s.id === p.step)?.label ?? p.step}`);
    this.notify();
  }

  // The round's hot seats already run on plain questions; the GM's version replaces them if it lands in time.
  writeSeats(game) {
    const round = game.state?.seats?.round;
    if (!round || typeof this.gm.seats !== 'function') return null;
    return this.background('seats', async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const result = await this.gm.seats(game);
          if (this.game !== game) return;
          if (G.applySeatWriting(game, round, result)) await this.changed();
          return;
        } catch (err) {
          if (attempt === 1) throw err;
        }
      }
    });
  }

  drawPicture(game) {
    this.background('illustrate', async () => {
      const { svg } = await this.gm.illustrate(game, { style: resolveStyle(game.setup?.artStyle ?? DEFAULT_STYLE, game.id, 0) });
      if (this.game !== game || !game.state) return;
      const clean = G.cleanSvg(svg);
      if (!clean) throw new Error('the picture was not a safe SVG');
      game.state.illustration = clean;
      await this.changed();
    });
  }

  // The world's map picture, drawn while everyone reads; the plain map shows until it lands or if this fails.
  drawMap(game) {
    if (typeof this.gm.drawMap !== 'function' || !game.scenario || game.state?.mapArt) return null;
    return this.background('map', async () => {
      const { spots, input } = G.mapArtInput(game.scenario);
      const { svg } = await this.gm.drawMap(game, { style: resolveStyle(game.setup?.artStyle ?? DEFAULT_STYLE, game.id, 0), input });
      if (this.game !== game || !game.state) return;
      if (!G.mapArt(game, svg, spots)) throw new Error('the map was not a safe SVG');
      await this.changed();
    });
  }

  // Three soundtrack directions, written while everyone reads; simple music plays until they land or if this fails.
  composeMusic(game) {
    if (typeof this.gm.compose !== 'function' || !game.state) return null;
    G.startSoundtrack(game);
    this.notify();
    return this.background('compose', async () => {
      try {
        const raw = await this.gm.compose(game, this.musicPool());
        if (this.game !== game) return;
        G.applySoundtrack(game, raw);
        if (game.state.soundtrack.status === 'failed') this.log('compose: no direction in the music plan could play');
      } catch (err) {
        if (this.game === game) G.failSoundtrack(game);
        throw err;
      } finally {
        if (this.game === game) await this.changed();
      }
    });
  }

  // Music the room liked before, and what played lately, so new music is in its spirit and never a repeat.
  musicPool() {
    try {
      return musicPool(this.library?.musicPool?.(12) ?? [], FIXTURE.directions);
    } catch (err) {
      this.log(`music pool failed: ${err.message}`);
      return musicPool([], FIXTURE.directions);
    }
  }

  async pickMusic(hostToken, index) {
    this.requireHost(hostToken);
    G.pickSoundtrack(this.game, index);
    await this.changed();
  }

  async brief(hostToken, delta) {
    this.requireHost(hostToken);
    G.moveBrief(this.game, delta);
    await this.changed();
  }

  // The GM decides what the room's wrong answer does to the story, then the round moves on.
  theorize(game) {
    game.state.theorizing = true;
    this.notify();
    return this.background('theory', async () => {
      let verdict = null;
      try {
        verdict = typeof this.gm.theory === 'function' ? await this.gm.theory(game) : null;
      } catch (err) {
        this.log(`theory failed: ${err.message}`);
      }
      if (this.game !== game) return;
      applyTheory(game, verdict, this.clock());
      await this.changed();
      await this.advance();
    });
  }

  async voteRound(tok, choice) {
    const p = G.playerByToken(this.game, tok);
    const result = G.voteRound(this.game, p.id, choice, this.clock());
    await this.changed();
    if (result) this.advance();
  }

  async readOrRefuse(game, playerId, text, mode) {
    try {
      return await this.gm.read(game, playerId, text, mode);
    } catch (err) {
      this.log(`read ${playerId} failed: ${err.message}`);
      throw new GameError('The GM could not read that. Try again.', 503);
    }
  }

  async moment(tok, id, action, text) {
    const game = this.game;
    const p = G.playerByToken(game, tok);
    const own = action === 'own' && String(text ?? '').trim().slice(0, 200);
    const read = own ? await this.readOrRefuse(game, p.id, own, 'said') : null;
    if (this.game !== game) return;
    if (action === 'ready') G.readyMoment(game, p.id, id, this.clock());
    else G.answerMoment(game, p.id, id, action, this.clock(), { text, read });
    await this.changed();
  }

  async offer(tok, id, action, text) {
    const game = this.game;
    const p = G.playerByToken(game, tok);
    const own = action === 'own' && String(text ?? '').trim().slice(0, 200);
    const read = own ? await this.readOrRefuse(game, p.id, own, 'move') : null;
    if (this.game !== game) return;
    G.answerOffer(game, p.id, id, { take: action === 'take', text: own || '', read }, this.clock());
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
        const words = await this.gm.read(game, p.id, q, 'public');
        if (this.game !== game) return;
        let heard = words;
        if (await this.goFirst(game, p.id, words, 'out loud') === 'stay') heard = stayed(words);
        if (this.game !== game) return;
        const { lines, answer, asker_read: read, ripple, refused } = await this.gm.publicAnswer(game, q, heard, p.id);
        if (this.game !== game) return;
        const drops = game.state.rippleDrops?.length ?? 0;
        G.completePublicAsk(game, p.id, lines?.length ? lines : answer, this.clock(), read, heard, ripple, refused);
        this.logRippleDrop(game, drops);
        this.countAnswer(game);
      } catch (err) {
        if (this.game !== game) return;
        G.failPublicAsk(game, p.id, 'The GM could not read that. Try saying that again.');
        this.log(`public ${p.id} failed: ${err.message}`);
      } finally {
        if (this.game === game) await this.changed();
      }
    });
    await this.changed();
  }

  async callMeeting(tok, reason) {
    const p = G.playerByToken(this.game, tok);
    G.callMeeting(this.game, p.id, reason, this.clock());
    await this.changed();
  }

  async endMeeting({ token, host } = {}) {
    if (host) this.requireHost(host);
    const pid = host ? null : G.playerByToken(this.game, token).id;
    G.endMeeting(this.game, pid, this.clock());
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
    this.writeSeats(this.game);
    await this.changed();
    this.drawRound(this.game);
  }

  // One picture per round, in the game's art style; the scene picture stands in until it lands or if it fails.
  drawRound(game) {
    if (game.status !== 'playing' || typeof this.gm.illustrate !== 'function') return null;
    const round = G.roundNumber(game);
    if (game.state.roundArt?.[round]) return null;
    const style = resolveStyle(game.setup?.artStyle ?? DEFAULT_STYLE, game.id, round);
    return this.background(`round picture ${round}`, async () => {
      const { svg } = await this.gm.illustrate(game, { style, prompt: roundPicturePrompt(game, style) });
      if (this.game !== game || G.roundNumber(game) !== round) return;
      if (!G.setRoundPicture(game, round, svg)) throw new Error('the round picture was not a safe SVG');
      await this.changed();
    });
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
      let read;
      try {
        read = await this.gm.read(game, p.id, ask.text, 'move');
      } catch (err) {
        if (this.game !== game) return;
        G.failAsk(game, p.id);
        this.log(`read ${p.id} failed: ${err.message}`);
        game.state.threads[p.id].push({ from: 'system', text: 'The GM could not read that. Try saying that again.', at: this.clock() });
        await this.changed();
        return;
      }
      if (this.game !== game || !game.state.pending[p.id]) return;
      game.state.pending[p.id].read = read;
      game.state.pending[p.id].from = G.currentPlace(game, p.id);
      if (await this.goFirst(game, p.id, read, 'private') === 'stay') {
        if (this.game !== game || !game.state.pending[p.id]) return;
        read = stayed(read);
        game.state.pending[p.id].read = read;
        game.state.pending[p.id].stayed = true;
        game.state.threads[p.id].push({ from: 'system', text: 'You stayed where you are. The GM answers you here.', at: this.clock() });
      }
      if (this.game !== game || !game.state.pending[p.id]) return;
      const settled = G.settleAct(game, p.id, read);
      try {
        const result = await this.gm.answer(game, p.id, { ...ask, read, talk: !settled.spent, held: settled.held ?? null });
        if (this.game !== game) return;
        const drops = game.state.rippleDrops?.length ?? 0;
        G.completeAsk(game, p.id, result, this.clock());
        this.logRippleDrop(game, drops);
        this.countAnswer(game);
      } catch (err) {
        if (this.game !== game) return;
        G.failAsk(game, p.id);
        this.log(`ask ${p.id} failed: ${err.message}`);
        game.state.threads[p.id].push({ from: 'system', text: 'The GM could not answer. Try again.', at: this.clock() });
      } finally {
        if (this.game === game) await this.changed();
      }
    });
    this.asks.set(p.id, task);
    task.finally(() => this.asks.get(p.id) === task && this.asks.delete(p.id));
    await this.changed();
  }

  // A move that would take the character somewhere else is confirmed first; going is announced to everyone.
  async goFirst(game, pid, read, from) {
    // Only a move during a round, one at a time per player; "where it happens" is not "where I go".
    if (game.status !== 'playing' || game.state.transitioning || this.confirms.has(pid)) return 'none';
    const dest = G.placeIdFromText(game, typeof read?.goes_to === 'string' ? read.goes_to : read?.place);
    if (!dest || dest === G.currentPlace(game, pid)) return 'none';
    (game.state.moveConfirm ??= {})[pid] = { place: dest, from };
    await this.changed();
    const yes = await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), CONFIRM_MS);
      timer.unref?.();
      const mine = (v) => {
        clearTimeout(timer);
        resolve(v);
      };
      this.confirms.set(pid, mine);
      this.confirmOwners.set(pid, { mine, game });
    });
    if (this.confirmOwners.get(pid)?.game === game) {
      this.confirms.delete(pid);
      this.confirmOwners.delete(pid);
    }
    delete game.state.moveConfirm?.[pid];
    if (this.game !== game || !yes || game.status !== 'playing' || game.state.transitioning) return 'stay';
    G.goTo(game, pid, dest, this.clock(), 'to check something');
    await this.changed();
    return 'go';
  }

  async confirmMove(tok, yes) {
    const p = G.playerByToken(this.game, tok);
    const answer = this.confirms.get(p.id);
    if (!answer) throw new GameError('Nothing is waiting for you to confirm.', 409);
    answer(yes === true);
  }

  // A player whose phone lost its seat gets back in with their own link, which only the table can show.
  rejoin(hostToken, playerId, base) {
    this.requireHost(hostToken);
    const p = this.game.players.find((x) => x.id === playerId);
    if (!p) throw new GameError('No such player.', 404);
    const fresh = G.newPlayerToken(this.game, p.id);
    this.keep(this.game).catch(() => {});
    return { name: p.name, url: `${base}#t=${fresh}` };
  }

  async go(tok, place) {
    const p = G.playerByToken(this.game, tok);
    G.goTo(this.game, p.id, place, this.clock());
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

  async askVote(tok) {
    const p = G.playerByToken(this.game, tok);
    G.askVote(this.game, p.id, this.clock());
    await this.changed();
  }

  async answerVoteAsk(tok, yes) {
    const p = G.playerByToken(this.game, tok);
    G.answerVoteAsk(this.game, p.id, yes, this.clock());
    await this.changed();
  }

  async point(tok, to) {
    const p = G.playerByToken(this.game, tok);
    G.point(this.game, p.id, to, this.clock());
    await this.changed();
  }

  async seatNow(hostToken) {
    this.requireHost(hostToken);
    G.seatNow(this.game, this.clock());
    await this.changed();
  }

  async nextPhase(hostToken) {
    this.requireHost(hostToken);
    this.advance();
  }

  advance() {
    const game = this.game;
    const st = game.state;
    if (st.theorizing) return null;
    if (st.roundVote) {
      G.resolveRoundVote(game, this.clock(), true);
    } else if (G.needsRoundVote(game)) {
      G.beginRoundVote(game, this.clock());
      this.notify();
      return null;
    }
    if (pendingTheory(game)) return this.theorize(game);
    // A move nobody confirmed is Not now: the round change never waits on it.
    for (const answer of [...this.confirms.values()]) answer(false);
    G.paceStory(game, this.clock());
    G.beginPhaseChange(game);
    this.notify();
    return this.background('phase', async () => {
      try {
        await Promise.allSettled([...this.asks.values()]);
        const final = G.goesToFinal(game);
        const result = final ? {} : await this.gm.phase(game);
        if (this.game !== game) return;
        G.completePhase(game, result, this.clock());
        // The check reads the new round as it opened, its loud event included; it never holds the round up.
        this.checkContinuity(game, final ? 'final' : 'round');
        this.writeSeats(game);
        this.drawRound(game);
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

  countAnswer(game) {
    const c = continuityState(game);
    c.answers += 1;
    if (c.answers >= CHECK_AFTER_ANSWERS) this.checkContinuity(game, 'answers');
  }

  // The GM reads what was said since the last check and keeps the story whole: canon, in-story corrections, future patches.
  // One runs at a time; a failed or slow one changes nothing and the next one catches up.
  checkContinuity(game, reason) {
    if (typeof this.gm.continuity !== 'function' || !game.state || !['playing', 'final'].includes(game.status)) return null;
    // A check asked for while one runs waits its turn: the round check must read the new round.
    if (this.continuityTask) {
      this.continuityNext = reason;
      return this.continuityTask;
    }
    const c = continuityState(game);
    const startedAt = this.clock();
    const roundsVersion = game.state.roundsVersion ?? 0;
    c.answers = 0;
    const task = this.background(`continuity ${reason}`, async () => {
      try {
        const result = await this.gm.continuity(game, reason);
        if (this.game !== game) return;
        const out = applyContinuity(game, result, this.clock(), { roundsVersion });
        c.lastAt = startedAt;
        const problems = Array.isArray(result?.problems) ? result.problems : [];
        const kinds = {};
        for (const p of problems) kinds[p?.kind] = (kinds[p?.kind] ?? 0) + 1;
        c.log = [...c.log, { at: this.clock(), reason, problems: problems.length, kinds, ...out, skipped: out.skipped.length, solvable: result?.solvable !== false }].slice(-40);
        const kindText = Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ');
        this.log(`gm continuity (${reason}): ${problems.length} problems${kindText ? ` (${kindText})` : ''}, ${out.canon} canon, ${out.corrections} corrections, ${out.applied} patches, ${out.skipped.length} skipped${out.offers ? `, ${out.offers} offers` : ''}${out.rounds ? ', 1 round added' : ''}${result?.solvable === false ? `, not solvable (${(result.missing ?? []).length} missing)` : ''}`);
        await this.changed();
      } catch (err) {
        this.log(`gm continuity (${reason}) skipped: ${err.message}`);
      } finally {
        this.continuityTask = null;
        const next = this.continuityNext;
        this.continuityNext = null;
        if (next && this.game === game) this.checkContinuity(game, next);
      }
    });
    this.continuityTask = task;
    return task;
  }

  async submit(tok, input) {
    const game = this.game;
    const p = G.playerByToken(game, tok);
    G.submitFinal(game, p.id, input);
    await this.changed();
    if (G.allSubmitted(this.game)) this.reveal();
  }

  async finish(hostToken) {
    this.requireHost(hostToken);
    if (this.game.status !== 'final') throw new GameError('The game is not at the final reconstruction.', 409);
    if (!Object.keys(this.game.state.submissions).length) throw new GameError('Nobody has submitted yet.', 409);
    this.reveal();
  }

  // Final answers reach the scorer only as the reader's cleaned text; if the reader fails they go quoted as data.
  async readFinals(game) {
    await Promise.all(Object.entries(game.state.submissions).filter(([, s]) => !s.read).map(async ([pid, s]) => {
      try {
        s.read = await this.gm.read(game, pid, `How: ${s.how}\nWhy: ${s.why}\nOwn goal: ${s.goal}`, 'final');
      } catch (err) {
        this.log(`read final ${pid} failed: ${err.message}`);
      }
    }));
  }

  reveal() {
    const game = this.game;
    if (game.state.scoring) return null;
    game.state.scoring = true;
    this.notify();
    return this.background('score', async () => {
      try {
        const verdict = G.computeVerdict(game);
        await this.readFinals(game);
        const score = await this.gm.score(game, verdict);
        if (this.game !== game) return;
        G.applyScore(game, verdict, score);
        game.error = null;
        await this.keep(game);
        await this.learn(game).catch((err) => this.log(`profile save failed: ${err.message}`));
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
    if (st.voteAsk && st.voteAsk.endsAt <= now) {
      G.resolveVoteAsk(game, now);
      dirty = true;
    }
    if (G.tickMoments(game, now)) dirty = true;
    if (G.tickSeats(game, now)) dirty = true;
    if (G.tickPoints(game, now)) dirty = true;
    if (G.tickMeeting(game, now)) dirty = true;
    if (dirty) await this.changed();
    if (st.roundVote && st.roundVote.endsAt <= now) return this.advance();
    if (!st.transitioning && !st.roundVote && st.phaseEndsAt && st.phaseEndsAt <= now) this.advance();
  }

  tableView() {
    return G.tableView(this.game, this.clock());
  }

  playerView(tok, { full = false } = {}) {
    const game = this.game;
    const p = G.playerByToken(game, tok);
    const view = G.playerView(game, p.id, this.clock());
    const profile = this.profiles.get(p.username);
    if (!profile) return view;
    view.profile = profileView(profile, { full });
    if (['lobby', 'generating', 'reading'].includes(game.status)) {
      const done = new Set([...profile.answers.map((a) => a.id), ...(p.skipped ?? [])]);
      const q = QUESTIONS.find((x) => (p.questions ?? []).includes(x.id) && !done.has(x.id));
      view.question = q ? { id: q.id, question: q.question, choices: q.choices } : null;
    }
    return view;
  }
}
