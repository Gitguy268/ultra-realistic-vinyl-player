// `?demo`, `?selftest` and the debug tap, in whichever build is served.
// Usage: npm run build && npm run preview, then: node scripts/check-modes.js
import { BASE_URL, check, finish, openPage } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
const logs = [];
page.on('console', (message) => logs.push(message.text()));

const databases = () =>
  page.evaluate(() => indexedDB.databases().then((d) => d.map((x) => x.name)));
await page.goto(`${BASE_URL}?demo&debug`);
await page.waitForFunction(() => window.__deck?.player.queue.ids.length === 3, null, {
  timeout: 15000,
});
const demo = await page.evaluate(() => ({
  titles: [...window.__deck.player.tracks.values()].map((t) => t.tags.title),
  artist: [...window.__deck.player.tracks.values()][0].tags.artist,
}));
check(`?demo has three tracks (${demo.titles})`, demo.titles.length === 3);
check('the demo tracks say what they are', demo.artist === 'Synth Demo');
check(`?demo opens no database (${await databases()})`, (await databases()).length === 0);
check(
  '?demo leaves the saved order alone',
  await page.evaluate(
    () =>
      !localStorage.getItem('vinyl-tracks') &&
      !localStorage.getItem('realistic-vinyl-player.queue'),
  ),
);

await page.click('#play');
await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 15000 });
await page.waitForTimeout(800);
const captured = await page.evaluate(async () => {
  const { samples, sr } = await window.__deck.Debug.capture(0.5);
  let sum = 0;
  for (const v of samples) sum += v * v;
  return { n: samples.length, sr, rms: Math.sqrt(sum / samples.length) };
});
check(`the debug tap hears the music (rms ${captured.rms.toFixed(3)})`, captured.rms > 0.01);
check('…half a second of it', Math.abs(captured.n - captured.sr / 2) < 2);

// Last: an ordinary start opens the library, and the demo must be the first thing here.
await page.goto(`${BASE_URL}?selftest`);
await page.waitForTimeout(800);
check('?selftest logs its verdict', logs.includes('selftest ok'));

finish(errors);
await browser.close();
