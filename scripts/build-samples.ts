// @ts-nocheck -- script
// Builds the soundtrack's sample set from VSCO 2 Community Edition (CC0): downloads the chosen files
// once into a cache, measures every note's real pitch, trims, normalises and encodes small MP3s into
// public/samples, and writes src/lib/soundtrack/manifest.ts. Run once: npm run samples
// VSCO_CACHE=<dir> picks the download cache (default: the OS temp dir).
import { mkdir, writeFile, rm, stat, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';
import { PITCHED, KIT } from './samples/sources.ts';
import { measurePitch, noteName, noteMidi, hzToMidi } from './samples/pitch.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'samples');
const MANIFEST_FILE = join(ROOT, 'src', 'lib', 'soundtrack', 'manifest.ts');
const CACHE = process.env.VSCO_CACHE || join(tmpdir(), 'vsco2-ce-cache');
const REPO = 'sgossner/VSCO-2-CE';
const RAW = `https://raw.githubusercontent.com/${REPO}/master/`;
const SR = 44100;
const FADE = 0.4;
const MAX_GAP = 4;

const exists = (p) => access(p).then(() => true, () => false);

function run(args) {
  return new Promise((ok, fail) => {
    const p = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', ...args]);
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 ? ok(Buffer.concat(out)) : fail(new Error(`ffmpeg ${code}: ${err.trim()}`))));
  });
}

async function pcm(file, { channels = 1, filter = null } = {}) {
  const buf = await run(['-i', file, ...(filter ? ['-af', filter] : []), '-ac', String(channels), '-ar', String(SR), '-f', 'f32le', '-']);
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return new Float32Array(copy.buffer);
}

const chain = (seconds) => `silenceremove=start_periods=1:start_threshold=-60dB,atrim=0:${seconds},afade=t=out:st=${seconds - FADE}:d=${FADE}`;

async function peakOf(file, seconds, channels) {
  const data = await pcm(file, { channels, filter: chain(seconds) });
  let peak = 0;
  for (const s of data) peak = Math.max(peak, Math.abs(s));
  return peak;
}

async function download(path) {
  const local = join(CACHE, path);
  if (await exists(local)) return local;
  await mkdir(dirname(local), { recursive: true });
  const url = RAW + path.split('/').map(encodeURIComponent).join('/');
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const res = await fetch(url);
    if (res.ok) {
      await writeFile(local, Buffer.from(await res.arrayBuffer()));
      return local;
    }
    if (attempt === 3) throw new Error(`download ${path}: HTTP ${res.status}`);
  }
}

async function pool(items, size, fn) {
  const queue = [...items];
  const out = [];
  await Promise.all(Array.from({ length: size }, async () => {
    while (queue.length) {
      const item = queue.shift();
      out.push(await fn(item));
    }
  }));
  return out;
}

export function spaced(midis, gap = MAX_GAP) {
  const sorted = [...new Set(midis)].sort((a, b) => a - b);
  const keep = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const last = keep[keep.length - 1];
    const next = sorted[i + 1];
    if (last == null || next == null || next - last > gap) keep.push(sorted[i]);
  }
  return keep;
}

async function encode(src, dest, { seconds, channels, gainDb }) {
  await mkdir(dirname(dest), { recursive: true });
  await run(['-y', '-i', src, '-af', `${chain(seconds)},volume=${gainDb.toFixed(2)}dB`, '-ac', String(channels), '-ar', String(SR), '-c:a', 'libmp3lame', '-q:a', '4', dest]);
  return (await stat(dest)).size;
}

const gainFor = (peak) => -3 - 20 * Math.log10(Math.max(peak, 1e-6));

async function main() {
  await mkdir(CACHE, { recursive: true });
  const treeRes = await fetch(`https://api.github.com/repos/${REPO}/git/trees/master?recursive=1`, { headers: { 'user-agent': 'suspition-build-samples' } });
  if (!treeRes.ok) throw new Error(`GitHub tree: HTTP ${treeRes.status}`);
  const tree = (await treeRes.json()).tree.filter((e) => e.type === 'blob').map((e) => e.path);
  const inFolder = (folder) => tree.filter((p) => p.slice(0, p.lastIndexOf('/')) === folder).map((p) => p.slice(p.lastIndexOf('/') + 1));

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const manifest = {};
  const dropped = [];

  for (const src of PITCHED) {
    const files = inFolder(src.folder).filter((f) => src.pick.test(f));
    if (!files.length) throw new Error(`${src.id}: no files match in ${src.folder}`);
    const measured = await pool(files, 6, async (file) => {
      const local = await download(`${src.folder}/${file}`);
      const hz = measurePitch(await pcm(local), SR);
      return { file, local, hz };
    });
    const ok = [];
    for (const { file, local, hz } of measured) {
      const claimed = src.note(file);
      if (hz == null) { dropped.push(`${src.id}/${file}: no pitch found`); continue; }
      const m = hzToMidi(hz);
      const midi = Math.round(m);
      if (Math.abs(m - midi) > 0.5) { dropped.push(`${src.id}/${file}: ${hz.toFixed(1)} Hz is between notes`); continue; }
      let octave = null;
      if (claimed) {
        const base = noteMidi(claimed);
        octave = [-12, 0, 12].find((k) => Math.abs(m - (base + k)) <= 0.5) ?? null;
        if (octave == null) { dropped.push(`${src.id}/${file}: named ${claimed} but measures ${noteName(midi)} (${hz.toFixed(1)} Hz)`); continue; }
      }
      ok.push({ file, local, midi, octave, cents: Math.round((m - midi) * 100) });
    }
    const votes = new Map();
    for (const s of ok) if (s.octave != null) votes.set(s.octave, (votes.get(s.octave) ?? 0) + 1);
    const usual = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    for (let i = ok.length - 1; i >= 0; i -= 1) {
      const s = ok[i];
      if (usual != null && s.octave !== usual) { dropped.push(`${src.id}/${s.file}: measures ${noteName(s.midi)}, an octave off from the rest of the folder`); ok.splice(i, 1); }
      else if (s.midi < src.range[0] || s.midi > src.range[1]) { dropped.push(`${src.id}/${s.file}: ${noteName(s.midi)} is outside the range we bundle`); ok.splice(i, 1); }
    }
    if (usual) console.log(`${src.id}: the file names are ${usual > 0 ? 'an octave low' : 'an octave high'}`);
    const byMidi = new Map();
    for (const s of ok) if (!byMidi.has(s.midi) || Math.abs(s.cents) < Math.abs(byMidi.get(s.midi).cents)) byMidi.set(s.midi, s);
    const chosen = spaced([...byMidi.keys()]).map((m) => byMidi.get(m));
    if (!chosen.length) throw new Error(`${src.id}: no samples left after measuring`);
    const peaks = await pool(chosen, 6, (s) => peakOf(s.local, src.seconds, 2));
    const gainDb = gainFor(Math.max(...peaks));
    const notes = {};
    let bytes = 0;
    for (const s of chosen) {
      const name = noteName(s.midi);
      const rel = `${src.id}/${name.replace('#', 's')}.mp3`;
      bytes += await encode(s.local, join(OUT, rel), { seconds: src.seconds, channels: 2, gainDb });
      notes[name] = rel;
    }
    manifest[src.id] = { notes, bytes };
    console.log(`${src.id}: ${chosen.length} of ${files.length} files, ${Object.keys(notes).join(' ')}, ${(bytes / 1024).toFixed(0)} KB`);
  }

  for (const piece of KIT) {
    if (!inFolder(piece.folder).includes(piece.file)) throw new Error(`${piece.id}: ${piece.file} not found in ${piece.folder}`);
    const local = await download(`${piece.folder}/${piece.file}`);
    const gainDb = gainFor(await peakOf(local, piece.seconds, 1));
    const rel = `kit/${piece.id}.mp3`;
    const bytes = await encode(local, join(OUT, rel), { seconds: piece.seconds, channels: 1, gainDb });
    manifest[piece.id] = { notes: { hit: rel }, bytes };
    console.log(`${piece.id}: ${piece.file}, ${(bytes / 1024).toFixed(0)} KB`);
  }

  const licence = await (await fetch(`${RAW}LICENSE`)).text();
  await writeFile(join(OUT, 'LICENSE-VSCO.txt'), `${licence.trim()}\n\nSamples from VSCO 2 Community Edition by Versilian Studios (https://github.com/${REPO}), CC0 1.0.\nUpright piano sampled by Simon Dalzell of Ivy Audio. Trimmed and encoded for Suspition by scripts/build-samples.ts.\n`);
  await mkdir(dirname(MANIFEST_FILE), { recursive: true });
  await writeFile(MANIFEST_FILE, `// Generated by scripts/build-samples.ts (npm run samples). Do not edit by hand.\n// Per instrument: measured note name (scientific pitch, sharps) to a file under /samples/, plus total bytes.\nexport const MANIFEST: Record<string, { notes: Record<string, string>; bytes: number }> = ${JSON.stringify(manifest, null, 2)};\n`);

  const total = Object.values(manifest).reduce((n, i) => n + i.bytes, 0);
  console.log(`\nDropped ${dropped.length} files:`);
  for (const d of dropped) console.log(`  ${d}`);
  console.log(`\nTotal: ${(total / 1024 / 1024).toFixed(2)} MB in ${Object.values(manifest).reduce((n, i) => n + Object.keys(i.notes).length, 0)} files`);
  if (total > 30 * 1024 * 1024) throw new Error('The sample set is over 30 MB.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
