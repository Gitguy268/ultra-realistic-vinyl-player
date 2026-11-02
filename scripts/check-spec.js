// The app's spec, the spec inlined in the single file and html-2's vendored copy must be equal,
// so the two builds cannot drift. Run after `npm run build:single` (and `npm run sync`).
import { existsSync, readFileSync } from 'node:fs';

const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8');
const app = JSON.parse(read('../src/spec/deck.json'));
const html = read('../dist-single/index.html');
const inlined = /<script type="application\/json" id="deck-spec">([\s\S]*?)<\/script>/.exec(html);
let failed = false;
const same = (label, value) => {
  const ok = JSON.stringify(value) === JSON.stringify(app);
  console.log(`${ok ? '✓' : '✗'} ${label} matches src/spec/deck.json`);
  failed ||= !ok;
};
if (!inlined) {
  console.log('✗ dist-single/index.html carries no #deck-spec');
  failed = true;
} else same('the single file’s #deck-spec', JSON.parse(inlined[1]));
const vendored = new URL(
  '../../ultra-realistic-vinyl-player-claude-html-2/spec/deck.json',
  import.meta.url,
);
if (existsSync(vendored))
  same('html-2’s spec/deck.json', JSON.parse(readFileSync(vendored, 'utf8')));
else console.log('· html-2 has no spec/deck.json yet (run npm run sync)');
process.exit(failed ? 1 : 0);
