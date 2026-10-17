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
  process.stdout.write(JSON.stringify({
    is_error: false,
    subtype: 'success',
    structured_output: { args, stdin, system: readFileSync(systemFile, 'utf8'), cwd: process.cwd(), apiKeySet: 'ANTHROPIC_API_KEY' in process.env },
  }));
});
