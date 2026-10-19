// @ts-nocheck -- script, like playtest.ts
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
import { GM } from '../server/gm.ts';
import { MemoryPeople } from '../server/store.ts';
import { BOT_SCHEMA, FINAL_BOT_SCHEMA, botSystem, botPrompt, askLine } from './playtest/bots.ts';
import { JUDGE_SCHEMA } from './playtest/judge.ts';
import { runPlaytest } from './playtest.ts';

// The big story playtest: twenty made-up people, most of them driving the story their own way,
// some pushing moves that would contradict it. Two games of ten (the most a game takes), played at once.
export const PERSONAS = [
  { name: 'Meera', role: 'driver', trait: 'stubborn, never lets a theory go', motive: 'Make the room believe the quietest person did it.' },
  { name: 'Kabir', role: 'driver', trait: 'chatty, talks to everyone out loud', motive: 'Turn the story into a family feud and be its hero.' },
  { name: 'Tara', role: 'contradictor', trait: 'a confident liar', motive: 'Rewrite where she was tonight, whatever her card says.' },
  { name: 'Arjun', role: 'driver', trait: 'a peacemaker who hates accusations', motive: 'Prove two suspects are covering for each other out of love.' },
  { name: 'Ishaan', role: 'contradictor', trait: 'impatient, wants answers now', motive: 'Find the decisive evidence in the first round, even if it cannot exist yet.' },
  { name: 'Zoya', role: 'driver', trait: 'dramatic, loves big reveals', motive: 'Make a hidden past of her own character the centre of the case.' },
  { name: 'Rohan', role: 'fair', trait: 'methodical, writes notes', motive: 'Solve it properly from the evidence.' },
  { name: 'Anaya', role: 'driver', trait: 'suspicious of the GM characters', motive: 'Convince the room a GM character is lying about the time.' },
  { name: 'Vihaan', role: 'breaker', trait: 'bored, tests limits', motive: 'See what happens if he claims to be someone else.' },
  { name: 'Saanvi', role: 'driver', trait: 'warm, protective of her friends', motive: 'Clear the player she trusts most, at any cost.' },
  { name: 'Dev', role: 'contradictor', trait: 'a know-it-all', motive: 'Insist on a time of death that suits his theory.' },
  { name: 'Nisha', role: 'driver', trait: 'quiet, then sudden', motive: 'Expose a secret alliance she suspects between two players.' },
  { name: 'Aarav', role: 'fair', trait: 'competitive', motive: 'Win on points with sharp questions.' },
  { name: 'Kiara', role: 'contradictor', trait: 'playful, likes to twist things', motive: 'Make an object turn up in a place it was never in.' },
  { name: 'Reyansh', role: 'driver', trait: 'a natural leader', motive: 'Run the investigation: call a meeting and assign everyone a job.' },
  { name: 'Myra', role: 'driver', trait: 'emotional, takes things personally', motive: 'Prove the victim deserved it, and get the room to feel it.' },
  { name: 'Advik', role: 'swayer', trait: 'charming', motive: 'Get the GM on his side so he looks innocent.' },
  { name: 'Diya', role: 'fair', trait: 'careful, shares clues', motive: 'Help the room by sharing every clue she finds.' },
  { name: 'Shaurya', role: 'contradictor', trait: 'a schemer', motive: 'Plant a false story about another player and make it stick.' },
  { name: 'Pari', role: 'driver', trait: 'curious, wanders everywhere', motive: 'Search every place on the map and follow whoever moves.' },
];

async function main() {
  const out = resolve(process.argv[2] ?? join(tmpdir(), 'story-playtest'));
  await mkdir(out, { recursive: true });
  // Each game has its own GM, as a real game would; the bots think on a GM of their own so they never hold up answers.
  const makeGm = (tag, maxParallel = 4) => new GM({
    workDir: join(tmpdir(), `detective-gm-story-${tag}`),
    setupEffort: process.env.DETECTIVE_SETUP_EFFORT || 'medium',
    readerModel: process.env.DETECTIVE_READER_MODEL || 'sonnet',
    maxParallel,
    log: (line) => console.log(`  [${tag}] ${line}`),
  });
  const botGm = makeGm('bots', 8);
  const botCall = ({ bot, view, mode }) => botGm.call(`bot ${bot.username}`, {
    system: botSystem(bot),
    prompt: `${botPrompt(view)}${askLine(view, mode)}`,
    schema: mode === 'final' ? FINAL_BOT_SCHEMA : BOT_SCHEMA,
    effort: 'low',
  });
  const judgeCall = ({ system, prompt }) => botGm.call('judge', { system, prompt, schema: JUDGE_SCHEMA, timeoutMs: 900_000 });
  const games = [
    { setting: 'a monsoon wedding in an old haveli', culprits: 2, bots: PERSONAS.slice(0, 10) },
    { setting: 'a night train stuck in the snow', culprits: 'gm', bots: PERSONAS.slice(10, 20) },
  ];
  // --only 2 runs just the second game (to rerun one that failed).
  const only = Number(process.argv[process.argv.indexOf('--only') + 1]) || 0;
  const chosen = games.map((g, i) => ({ ...g, i })).filter((g) => !only || g.i + 1 === only);
  const results = await Promise.allSettled(chosen.map((g) => runPlaytest({
    gm: makeGm(`game${g.i + 1}`), botCall, judgeCall, outDir: out, setting: g.setting, culprits: g.culprits, length: 'standard', actionsPerRound: 2, people: new MemoryPeople(),
    bots: g.bots.map((p) => ({ ...p, username: p.name.toLowerCase(), samples: [], about: [] })),
    log: (l) => console.log(`[game ${g.i + 1}] ${l}`),
  })));
  const summary = results.map((r, k) => (r.status === 'fulfilled' ? { game: chosen[k].i + 1, dir: r.value.dir, judge: r.value.report.judge, metrics: r.value.report.metrics } : { game: chosen[k].i + 1, error: String(r.reason?.message ?? r.reason) }));
  await writeFile(join(out, only ? `summary-${only}.json` : 'summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
  console.log(`Done. Summary: ${join(out, 'summary.json')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`Story playtest stopped: ${err.message}`);
    process.exit(1);
  });
}
