// Copies the single-file build and the shared spec into the html-2 repository. Copy only:
// the html-2 repository never builds anything itself. Run `npm run build:single` first.
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';

const target = new URL('../../ultra-realistic-vinyl-player-claude-html-2/', import.meta.url);
const built = new URL('../dist-single/index.html', import.meta.url);
if (!existsSync(built))
  throw new Error('dist-single/index.html is missing; run npm run build:single first');
mkdirSync(new URL('spec/', target), { recursive: true });

/** Copy, then rename: if the disk fills up, the target keeps its old content instead of vanishing. */
function replace(from, to) {
  const partial = new URL(`${to.href}.partial`);
  try {
    copyFileSync(from, partial);
    renameSync(partial, to);
  } finally {
    rmSync(partial, { force: true });
  }
}

replace(built, new URL('index.html', target));
replace(new URL('../src/spec/deck.json', import.meta.url), new URL('spec/deck.json', target));
replace(new URL('../NOTICE', import.meta.url), new URL('NOTICE', target));
replace(new URL('../LICENSE', import.meta.url), new URL('LICENSE', target));
// The pictures its README and link previews use.
mkdirSync(new URL('screenshots/', target), { recursive: true });
for (const name of [
  'desktop-dark.png',
  'desktop-light.png',
  'mobile-dark.png',
  'mobile-light.png',
]) {
  replace(
    new URL(`../docs/screenshots/${name}`, import.meta.url),
    new URL(`screenshots/${name}`, target),
  );
}
replace(new URL('../docs/demo.webp', import.meta.url), new URL('screenshots/demo.webp', target));
replace(new URL('../public/og.png', import.meta.url), new URL('og.png', target));
replace(new URL('../public/favicon.png', import.meta.url), new URL('favicon.png', target));
console.log(`copied index.html and spec/deck.json to ${target.pathname}`);
