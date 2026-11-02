// Frames for the animated demo: the opening camera move, then Start. Usage: npm run build && npm run
// preview, then: node scripts/demo-capture.js <out directory>; img2webp assembles them (see README).
import { mkdirSync } from 'node:fs';
import { BASE_URL, finish, openPage } from './lib.js';

const OUT = process.argv[2];
if (!OUT) throw new Error('Usage: node scripts/demo-capture.js <out directory>');
mkdirSync(OUT, { recursive: true });
const FRAME_MS = 125;
const { browser, page, errors } = await openPage({ width: 960, height: 600, colorScheme: 'dark' });
await page.goto(`${BASE_URL}?demo&debug`);
await page.waitForFunction(() => window.__deck?.stage);
let n = 0;
const frames = async (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const t = Date.now();
    await page.screenshot({
      path: `${OUT}/f${String(n++).padStart(4, '0')}.jpg`,
      type: 'jpeg',
      quality: 72,
    });
    const left = FRAME_MS - (Date.now() - t);
    if (left > 0) await page.waitForTimeout(left);
  }
};
await frames(7000);
await page.waitForFunction(() => window.__deck.player.queue.ids.length === 3);
await page.click('#play');
await frames(7000);
process.stdout.write(`${n} frames\n`);
finish(errors);
await browser.close();
