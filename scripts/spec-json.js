// Writes src/spec/deck.json from src/spec/deck.ts. `--check` exits 1 if the JSON is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { DECK_SPEC } from '../src/spec/deck.ts';

const file = new URL('../src/spec/deck.json', import.meta.url);
const json = JSON.stringify(DECK_SPEC, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const current = readFileSync(file, 'utf8');
  if (current !== json) {
    console.log('src/spec/deck.json is stale; run node scripts/spec-json.js');
    process.exit(1);
  }
  console.log('src/spec/deck.json matches src/spec/deck.ts');
} else {
  writeFileSync(file, json);
  console.log('wrote src/spec/deck.json');
}
