// Ten minutes of playback: memory stays flat and the renderer holds no more than it started with.
// Not part of check-all: it takes as long as it says. SOAK_SECONDS shortens it.
// Usage: npm run build && npm run preview, then: node scripts/check-soak.js
import { BASE_URL, check, finish, openPage } from './lib.js';

const SECONDS = Number(process.env.SOAK_SECONDS ?? 600);
const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
await page.goto(`${BASE_URL}?demo&debug`);
await page.waitForFunction(() => window.__deck?.player.queue.ids.length === 3, null, {
  timeout: 15000,
});
const sample = () =>
  page.evaluate(() => {
    const { memory } = window.__deck.stage.world.renderer.info;
    return {
      heap: performance.memory?.usedJSHeapSize ?? 0,
      geometries: memory.geometries,
      textures: memory.textures,
    };
  });
await page.click('#play');
await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 15000 });
// Let the first decode and the shaders settle before taking the baseline.
await page.waitForTimeout(Math.min(20, SECONDS / 4) * 1000);
const first = await sample();
const heaps = [];
const end = Date.now() + SECONDS * 1000;
while (Date.now() < end) {
  await page.waitForTimeout(10000);
  // Keep the record playing: the demo tracks are short, so start again at the end of a side.
  await page.evaluate(() => {
    const { deck } = window.__deck;
    if (!deck.groove.contact && !deck.dropping) deck.play();
  });
  heaps.push((await sample()).heap);
}
const last = await sample();
// Heap sawtooths with garbage collection: compare the lows of the first and second half.
const half = Math.floor(heaps.length / 2);
const low = (list) => Math.min(...list);
const growthMB = (low(heaps.slice(half)) - low(heaps.slice(0, Math.max(1, half)))) / 1e6;
check(`the heap stays flat (${growthMB.toFixed(1)} MB between halves)`, growthMB < 8);
check(
  `no geometry piles up (${first.geometries} → ${last.geometries})`,
  last.geometries <= first.geometries + 4,
);
check(
  `no texture piles up (${first.textures} → ${last.textures})`,
  last.textures <= first.textures + 4,
);

finish(errors);
await browser.close();
