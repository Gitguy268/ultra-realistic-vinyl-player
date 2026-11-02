// Everything the page needs is local: after the first load it requests nothing, and it never asks
// another origin for anything, in any mode.
// Usage: npm run build && npm run preview, then: node scripts/check-network.js
import { readFile } from 'node:fs/promises';
import { BASE_URL, check, finish, openPage } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
const requests = [];
page.on('request', (request) => requests.push(request.url()));
await page.goto(`${BASE_URL}?demo&debug`);
await page.waitForFunction(() => window.__deck?.player.queue.ids.length === 3, null, {
  timeout: 15000,
});
await page.waitForTimeout(1500);
const local = (url) => /^(blob:|data:|file:)/.test(url) || url.startsWith(new URL(BASE_URL).origin);
const outside = requests.filter((url) => !local(url));
check(`nothing goes to another origin (${outside.length})`, outside.length === 0);

requests.length = 0;
await page.click('#play');
await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 15000 });
await page.waitForTimeout(2000);
await page.selectOption('#visualizer', 'milkdrop').catch(() => {});
await page.selectOption('#plinth', 'walnut');
await page.selectOption('#condition', 'beat').catch(() => {});
await page.keyboard.press('f');
await page.waitForTimeout(1500);
await page.keyboard.press('Escape');
// The visualizer's code loads when first chosen: the app's own files, which the service worker
// has already stored, so this works offline too. Anything else would be a real request.
const later = requests.filter((url) => !/^(blob:|data:)/.test(url));
const own = later.filter((url) => new URL(url).pathname.startsWith('/assets/'));
const others = later.filter((url) => !own.includes(url));
check(
  `playing and changing settings requests nothing else (${others.join(' ') || 0})`,
  others.length === 0,
);
const precache = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8');
const missing = own.filter((url) => !precache.includes(new URL(url).pathname.slice(1)));
check(
  `what loads later is precached for offline (${own.length} files, ${missing.length} not)`,
  missing.length === 0,
);

finish(errors);
await browser.close();
