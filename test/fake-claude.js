#!/usr/bin/env node
import { readFileSync } from 'node:fs';

let stdin = '';
process.stdin.on('data', (d) => (stdin += d));
process.stdin.on('end', () => {
  const args = process.argv.slice(2);
  const systemFile = args[args.indexOf('--system-prompt-file') + 1];
  const mode = process.env.FAKE_CLAUDE_MODE;
  if (mode === 'error') return process.stdout.write(JSON.stringify({ is_error: true, result: 'Usage limit reached', subtype: 'error' }));
  if (mode === 'garbage') return process.stdout.write('not json');
  if (mode === 'crash') {
    process.stderr.write('boom');
    process.exit(3);
  }
  if (mode === 'hang') return setTimeout(() => {}, 60_000);
  if (mode === 'stream') {
    const doc = JSON.stringify({ title: 'T', players: [{ id: 'p1' }, { id: 'p2' }], clues: [{ id: 'c1' }] });
    const ev = (event) => JSON.stringify({ type: 'stream_event', event });
    const lines = [
      JSON.stringify({ type: 'system', subtype: 'init' }),
      JSON.stringify({ type: 'system', subtype: 'thinking_tokens' }),
      ev({ type: 'content_block_start', content_block: { type: 'tool_use', name: 'StructuredOutput' } }),
      ...doc.match(/.{1,7}/g).map((chunk) => ev({ type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: chunk } })),
      JSON.stringify({ type: 'result', is_error: false, subtype: 'success', structured_output: { ...JSON.parse(doc), args } }),
    ];
    let i = 0;
    const next = () => (i < lines.length ? (process.stdout.write(`${lines[i++]}\n`), setTimeout(next, 2)) : null);
    return next();
  }
  process.stdout.write(JSON.stringify({
    is_error: false,
    subtype: 'success',
    structured_output: { args, stdin, system: readFileSync(systemFile, 'utf8'), cwd: process.cwd(), apiKeySet: 'ANTHROPIC_API_KEY' in process.env },
  }));
});
