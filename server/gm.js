import { spawn } from 'node:child_process';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { LENGTHS, pickTwists, SCENARIO_SCHEMA, ASK_SCHEMA, PHASE_SCHEMA, SCORE_SCHEMA, GENERATION_SYSTEM, generationPrompt, playSystem, askPrompt, phasePrompt, scorePrompt } from './prompts.js';
import { validateScenario, snapshotForGM, nextPhaseInfo } from './game.js';
import { TopLevelTracker } from './progress.js';

const ISOLATION = [
  '--strict-mcp-config',
  '--mcp-config', '{"mcpServers":{}}',
  '--settings', '{"disableAllHooks":true}',
  '--setting-sources', 'project',
  '--no-session-persistence',
  '--tools', '',
];

export class GMError extends Error {}

export function parseClaudeOutput(stdout) {
  let out;
  try {
    out = JSON.parse(stdout);
  } catch {
    throw new GMError(`GM returned unreadable output: ${stdout.slice(0, 200)}`);
  }
  return parseResult(out);
}

export function parseStream(stdout) {
  const lines = stdout.split('\n').filter((l) => l.startsWith('{'));
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const event = JSON.parse(lines[i]);
    if (event.type === 'result') return parseResult(event);
  }
  throw new GMError(`GM stream ended without a result: ${stdout.slice(-200)}`);
}

export function streamEvents(onProgress) {
  const tracker = new TopLevelTracker(
    (key) => onProgress({ kind: 'key', key }),
    (key, count) => onProgress({ kind: 'item', key, count }),
  );
  let thinking = false;
  return (line) => {
    if (!line.startsWith('{')) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    const e = event.type === 'stream_event' ? event.event : null;
    if (!thinking && ((event.type === 'system' && event.subtype === 'thinking_tokens') || e?.content_block?.type === 'thinking')) {
      thinking = true;
      onProgress({ kind: 'thinking' });
    }
    if (e?.type === 'content_block_start' && e.content_block?.type === 'tool_use') {
      tracker.reset();
      onProgress({ kind: 'draft' });
    }
    if (e?.type === 'content_block_delta' && e.delta?.type === 'input_json_delta') tracker.feed(e.delta.partial_json);
  };
}

function parseResult(out) {
  if (out.is_error) throw new GMError(`GM call failed: ${String(out.result ?? out.subtype).slice(0, 300)}`);
  if (!out.structured_output || typeof out.structured_output !== 'object') {
    throw new GMError(`GM gave no structured answer (${out.subtype ?? 'unknown'}).`);
  }
  return out.structured_output;
}

export async function runClaude({ system, prompt, schema, model, effort, workDir, onProgress, timeoutMs = 180_000, bin = 'claude' }) {
  await mkdir(workDir, { recursive: true });
  const systemFile = resolve(workDir, `.system-${randomBytes(4).toString('hex')}.txt`);
  await writeFile(systemFile, system);
  const output = onProgress ? ['--output-format', 'stream-json', '--include-partial-messages', '--verbose'] : ['--output-format', 'json'];
  const args = ['-p', '--system-prompt-file', systemFile, '--json-schema', JSON.stringify(schema), ...ISOLATION, ...output];
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);
  return spawnClaude(bin, args, workDir, prompt, timeoutMs, onProgress && streamEvents(onProgress)).finally(() => unlink(systemFile).catch(() => {}));
}

export function claudeEnv(env = process.env) {
  if (env.DETECTIVE_USE_API_KEY === '1') return env;
  const { ANTHROPIC_API_KEY, ...rest } = env;
  return rest;
}

function spawnClaude(bin, args, workDir, prompt, timeoutMs, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: workDir, env: claudeEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new GMError(`GM took longer than ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
    let partial = '';
    child.stdout.on('data', (d) => {
      stdout += d;
      if (!onLine) return;
      partial += d;
      const lines = partial.split('\n');
      partial = lines.pop();
      lines.forEach(onLine);
    });
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new GMError(`Could not start claude: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout) return reject(new GMError(`claude exited ${code}: ${stderr.slice(0, 300)}`));
      try {
        resolve(onLine ? parseStream(stdout) : parseClaudeOutput(stdout));
      } catch (err) {
        reject(err);
      }
    });
    child.stdin.end(prompt);
  });
}

class Limiter {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
  }
  async run(fn) {
    if (this.active >= this.max) await new Promise((r) => this.queue.push(r));
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }
}

export class GM {
  constructor({ workDir, run = runClaude, setupModel, playModel, setupEffort, maxParallel = 4, log = () => {} }) {
    this.workDir = workDir;
    this.run = run;
    this.setupModel = setupModel;
    this.playModel = playModel;
    this.setupEffort = setupEffort;
    this.limiter = new Limiter(maxParallel);
    this.log = log;
  }

  call(label, opts) {
    const started = Date.now();
    return this.limiter.run(async () => {
      const result = await this.run({ workDir: this.workDir, ...opts });
      this.log(`gm ${label} ${Date.now() - started}ms`);
      return result;
    });
  }

  async generate(game, onProgress = () => {}) {
    const rules = { playerCount: game.players.length, phases: LENGTHS[game.setup.length].phases, hints: game.setup.hints };
    const twists = pickTwists(game.players.length);
    this.log(`gm twists: ${twists.map((t) => t.id).join(', ')}`);
    let prompt = generationPrompt(game, twists);
    let errors = [];
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      onProgress({ kind: 'attempt', attempt });
      const scenario = await this.call(`generate#${attempt}`, {
        onProgress,
        system: GENERATION_SYSTEM,
        prompt,
        schema: SCENARIO_SCHEMA,
        model: this.setupModel,
        effort: this.setupEffort,
        timeoutMs: 900_000,
      });
      onProgress({ kind: 'checking' });
      errors = validateScenario(scenario, rules);
      if (!errors.length) return scenario;
      this.log(`gm generate#${attempt} invalid: ${errors.join(' | ')}`);
      prompt = `${generationPrompt(game, twists)}\n\nA previous draft broke these rules, avoid them:\n- ${errors.join('\n- ')}`;
    }
    throw new GMError(`The GM could not write a valid world: ${errors.join(' ')}`);
  }

  answer(game, playerId, ask) {
    const player = game.scenario.players.find((p) => p.id === playerId);
    return this.call(`ask ${playerId}`, {
      system: playSystem(game.scenario),
      prompt: askPrompt({ snapshot: snapshotForGM(game), player, ...ask }),
      schema: ASK_SCHEMA,
      model: this.playModel,
    });
  }

  phase(game) {
    return this.call('phase', {
      system: playSystem(game.scenario),
      prompt: phasePrompt({ snapshot: snapshotForGM(game), nextPhase: nextPhaseInfo(game) }),
      schema: PHASE_SCHEMA,
      model: this.playModel,
    });
  }

  score(game, verdict) {
    return this.call('score', {
      system: playSystem(game.scenario),
      prompt: scorePrompt({ snapshot: snapshotForGM(game), submissions: game.state.submissions, verdict }),
      schema: SCORE_SCHEMA,
      model: this.setupModel,
      timeoutMs: 300_000,
    });
  }
}
