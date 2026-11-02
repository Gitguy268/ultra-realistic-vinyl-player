// Every row of docs/PARITY.md names its evidence. This fails unless each piece exists: u:name is
// tests/name.test.ts, b:check-name is scripts/check-name.js, h:words is a label in html-2's ported
// tests, s:name is a screenshot in docs/screenshots. `--tick` rewrites ☐ to ☑ on the rows that hold.
// It proves the evidence is there and named; whether it passes is what npm test and check:browser say.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const parity = new URL('docs/PARITY.md', root);
const html2 = new URL('../ultra-realistic-vinyl-player-claude-html-2/test/', root);
const labels = existsSync(html2)
  ? readdirSync(html2)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(new URL(f, html2), 'utf8'))
      .join('\n')
      .toLowerCase()
  : '';
const shots = existsSync(new URL('docs/screenshots/', root))
  ? readdirSync(new URL('docs/screenshots/', root)).map((f) => f.toLowerCase())
  : [];

function holds(token) {
  const [kind, ...rest] = token.split(':');
  const name = rest.join(':');
  if (kind === 'u') return existsSync(new URL(`tests/${name}.test.ts`, root));
  if (kind === 'b') return existsSync(new URL(`scripts/${name}.js`, root));
  if (kind === 's') return shots.some((f) => f.includes(name.toLowerCase()));
  if (kind === 'h') return name === '*' || labels.includes(name.toLowerCase());
  return false;
}

const text = readFileSync(parity, 'utf8');
const missing = [];
let rows = 0;
const out = text.split('\n').map((line) => {
  const row = /^\| ((?:[AHX]|C)\d+)\s*\|/.exec(line);
  if (!row) return line;
  const tokens = [...line.matchAll(/`([ubhs]:[^`]+)`/g)].map((m) => m[1]);
  rows++;
  const bad = tokens.filter((t) => !holds(t));
  if (tokens.length === 0) missing.push(`${row[1]}: names no evidence`);
  for (const t of bad) missing.push(`${row[1]}: ${t}`);
  const fine = tokens.length > 0 && bad.length === 0;
  return fine ? line.replace('☐', '☑') : line;
});
if (process.argv.includes('--tick')) writeFileSync(parity, out.join('\n'));
console.log(`${rows} rows, ${missing.length} open`);
for (const m of missing) console.log(`  ${m}`);
process.exitCode = missing.length ? 1 : 0;
