// Fingerprints the two read-only originals so a gate can tell whether they changed since
// PARITY.md was written. `node scripts/reference-stamp.js` prints the stamp;
// `--check` compares it with docs/reference-stamp.json and exits 1 on drift.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = join(homedir(), 'vinyl-player-realistic-map');
const ORIGINALS = ['realistic-vinyl-player-claude', 'realistic-vinyl-player-claude-html-1'];
const STAMP_FILE = new URL('../docs/reference-stamp.json', import.meta.url);

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' });
const hash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

function stampOf(name) {
  const cwd = join(ROOT, name);
  const untracked = git(cwd, 'ls-files', '--others', '--exclude-standard')
    .split('\n')
    .filter(Boolean)
    .sort();
  const untrackedHash = hash(
    untracked.map((f) => f + ':' + hash(readFileSync(join(cwd, f)))).join('\n'),
  );
  const readme = readFileSync(join(cwd, 'README.md'), 'utf8');
  const table = readme
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .join('\n');
  return {
    head: git(cwd, 'rev-parse', '--short', 'HEAD').trim(),
    diff: hash(git(cwd, 'diff', 'HEAD')),
    untracked: untracked.length,
    untrackedHash,
    readmeTables: hash(table),
  };
}

const now = Object.fromEntries(ORIGINALS.map((n) => [n, stampOf(n)]));
if (process.argv.includes('--check')) {
  if (!existsSync(STAMP_FILE))
    throw new Error('docs/reference-stamp.json is missing; run with --write');
  const saved = JSON.parse(readFileSync(STAMP_FILE, 'utf8'));
  let drift = false;
  for (const n of ORIGINALS) {
    for (const [k, v] of Object.entries(now[n])) {
      if (saved.originals[n][k] !== v) {
        drift = true;
        console.log(`${n}: ${k} changed (${saved.originals[n][k]} → ${v})`);
      }
    }
  }
  console.log(
    drift ? 'Originals changed since ' + saved.at : 'Originals unchanged since ' + saved.at,
  );
  process.exit(drift ? 1 : 0);
} else if (process.argv.includes('--write')) {
  writeFileSync(
    STAMP_FILE,
    JSON.stringify({ at: new Date().toISOString(), originals: now }, null, 2) + '\n',
  );
  console.log('wrote docs/reference-stamp.json');
} else {
  console.log(JSON.stringify(now, null, 2));
}
