import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runClaude, parseClaudeOutput, GM, GMError } from '../server/gm.js';
import { createGame, addPlayer, applySetup } from '../server/game.js';
import { makeScenario } from './fixtures.js';

const bin = fileURLToPath(new URL('./fake-claude.js', import.meta.url));
let workDir;

before(async () => {
  await chmod(bin, 0o755);
  workDir = await mkdtemp(join(tmpdir(), 'detective-gm-'));
});

const run = (extra = {}, env) => {
  const old = process.env.FAKE_CLAUDE_MODE;
  if (env) process.env.FAKE_CLAUDE_MODE = env;
  return runClaude({ system: 'SYSTEM', prompt: 'PROMPT', schema: { type: 'object' }, workDir, bin, ...extra })
    .finally(() => (env ? (old === undefined ? delete process.env.FAKE_CLAUDE_MODE : (process.env.FAKE_CLAUDE_MODE = old)) : null));
};

describe('runClaude', () => {
  test('should pass the prompt on stdin and the system prompt as a file', async () => {
    const out = await run();
    assert.equal(out.stdin, 'PROMPT');
    assert.equal(out.system, 'SYSTEM');
  });

  test('should isolate the call from plugins, hooks, tools and user settings', async () => {
    const { args } = await run();
    const after = (flag) => args[args.indexOf(flag) + 1];
    assert.ok(args.includes('-p'));
    assert.ok(args.includes('--strict-mcp-config'));
    assert.ok(args.includes('--no-session-persistence'));
    assert.equal(after('--setting-sources'), 'project');
    assert.equal(after('--tools'), '');
    assert.match(after('--settings'), /disableAllHooks/);
    assert.equal(after('--output-format'), 'json');
  });

  test('should use the Claude login, not an ANTHROPIC_API_KEY from the shell', async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'sk-ant-from-the-shell';
    try {
      assert.equal((await run()).apiKeySet, false);
    } finally {
      if (saved === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  test('should keep ANTHROPIC_API_KEY when DETECTIVE_USE_API_KEY=1', async () => {
    const saved = [process.env.ANTHROPIC_API_KEY, process.env.DETECTIVE_USE_API_KEY];
    process.env.ANTHROPIC_API_KEY = 'sk-ant-from-the-shell';
    process.env.DETECTIVE_USE_API_KEY = '1';
    try {
      assert.equal((await run()).apiKeySet, true);
    } finally {
      for (const [k, v] of [['ANTHROPIC_API_KEY', saved[0]], ['DETECTIVE_USE_API_KEY', saved[1]]]) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  test('should pass model and effort only when set', async () => {
    assert.ok(!(await run()).args.includes('--model'));
    const { args } = await run({ model: 'sonnet', effort: 'medium' });
    assert.equal(args[args.indexOf('--model') + 1], 'sonnet');
    assert.equal(args[args.indexOf('--effort') + 1], 'medium');
  });

  test('should remove the system prompt file afterwards', async () => {
    await run();
    const left = (await readdir(workDir)).filter((f) => f.startsWith('.system-'));
    assert.deepEqual(left, []);
  });

  test('should surface a GM error result', async () => {
    await assert.rejects(() => run({}, 'error'), /Usage limit reached/);
  });

  test('should surface unreadable output', async () => {
    await assert.rejects(() => run({}, 'garbage'), /unreadable output/);
  });

  test('should surface a crash with its stderr', async () => {
    await assert.rejects(() => run({}, 'crash'), /exited 3: boom/);
  });

  test('should give up after the timeout', async () => {
    await assert.rejects(() => run({ timeoutMs: 300 }, 'hang'), /longer than/);
  });

  test('should report a missing claude binary', async () => {
    await assert.rejects(() => runClaude({ system: '', prompt: '', schema: {}, workDir, bin: '/nope/claude' }), /Could not start claude/);
  });
});

describe('runClaude with progress', () => {
  test('should stream, report thinking, sections and item counts, then return the result', async () => {
    const events = [];
    const out = await run({ onProgress: (e) => events.push(e.kind === 'item' ? `${e.key}:${e.count}` : e.key ?? e.kind) }, 'stream');
    assert.deepEqual(events, ['thinking', 'draft', 'title', 'players', 'players:1', 'players:2', 'clues', 'clues:1']);
    assert.equal(out.title, 'T');
    const after = (flag) => out.args[out.args.indexOf(flag) + 1];
    assert.equal(after('--output-format'), 'stream-json');
    assert.ok(out.args.includes('--include-partial-messages') && out.args.includes('--verbose'));
  });

  test('should use plain JSON output when nobody asks for progress', async () => {
    const { args } = await run();
    assert.equal(args[args.indexOf('--output-format') + 1], 'json');
    assert.ok(!args.includes('--verbose'));
  });
});

describe('parseClaudeOutput', () => {
  test('should refuse a success with no structured answer', () => {
    assert.throws(() => parseClaudeOutput(JSON.stringify({ is_error: false, subtype: 'error_max_turns' })), GMError);
  });
});

describe('GM.generate', () => {
  const game = () => {
    const g = createGame();
    for (const name of ['A', 'B', 'C']) addPlayer(g, { name });
    applySetup(g, { tone: 'tense', length: 'short', hints: 2 });
    return g;
  };

  test('should retry once with the validation errors, then succeed', async () => {
    const prompts = [];
    const bad = makeScenario(2, { phases: 3, hints: 2 });
    const good = makeScenario(3, { phases: 3, hints: 2 });
    const gm = new GM({ workDir, run: async ({ prompt }) => (prompts.push(prompt), prompts.length === 1 ? bad : good) });
    assert.equal((await gm.generate(game())).players.length, 3);
    assert.match(prompts[1], /previous draft broke these rules[\s\S]*exactly p1, p2, p3/);
  });

  test('should fail loudly after two invalid drafts', async () => {
    const gm = new GM({ workDir, run: async () => makeScenario(2) });
    await assert.rejects(() => gm.generate(game()), /could not write a valid world/);
  });

  test('should run no more calls at once than the limit', async () => {
    let active = 0;
    let peak = 0;
    const gm = new GM({ workDir, maxParallel: 2, run: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active -= 1;
      return {};
    } });
    await Promise.all(Array.from({ length: 6 }, () => gm.call('x', {})));
    assert.equal(peak, 2);
  });
});

describe('GM card check after writing a world', () => {
  const game = () => {
    const g = createGame();
    for (const name of ['A', 'B', 'C']) addPlayer(g, { name });
    applySetup(g, { tone: 'tense', length: 'short', hints: 2 });
    return g;
  };

  test('should check every card after a valid world and add what each player is missing', async () => {
    const steps = [];
    const calls = [];
    const gm = new GM({ workDir, run: async ({ prompt }) => {
      calls.push(prompt);
      return calls.length === 1 ? makeScenario(3, { phases: 3, hints: 2 }) : { players: [{ player_id: 'p3', add: ['You locked the gate.'], known_hidden_fact_ids: [] }] };
    } });
    const s = await gm.generate(game(), (e) => steps.push(e.kind));
    assert.match(calls[1], /a player who does not know their own story/);
    assert.match(s.players[2].starting_knowledge, /You locked the gate\.$/);
    assert.ok(steps.includes('cards'));
  });

  test('should still hand over the world when the card check fails', async () => {
    let n = 0;
    const gm = new GM({ workDir, run: async () => {
      n += 1;
      if (n === 1) return makeScenario(3, { phases: 3, hints: 2 });
      throw new Error('check broke');
    } });
    assert.equal((await gm.generate(game())).players.length, 3);
  });
});
