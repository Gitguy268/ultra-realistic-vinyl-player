// The GPU can take the WebGL context away at any time. The page survives, the music keeps going, and
// the scene comes back complete.
// Usage: npm run build && npm run preview, then: node scripts/check-context-loss.js
import { BASE_URL, check, finish, openPage, wavFile } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck?.stage);
await page.setInputFiles('#file', wavFile('Survivor.wav', 40, 440));
await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Ready'));
await page.click('#play');
await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 15000 });
await page.waitForTimeout(500);

const drawn = () => page.evaluate(() => window.__deck.stage.world.framesDrawn);
const bright = async () => {
  // A screenshot of a lost or black canvas compresses to very little.
  const shot = await page.locator('#scene').screenshot({ type: 'png' });
  return shot.length;
};
const before = await bright();
await page.evaluate(() => {
  window.lose = window.__deck.stage.world.renderer.getContext().getExtension('WEBGL_lose_context');
  window.lose.loseContext();
});
await page.waitForFunction(() => window.__deck.stage.world.contextLost, null, { timeout: 5000 });
check('the loss is noticed', true);
const during = await drawn();
const t0 = await page.evaluate(() => window.__deck.deck.engine.currentTime);
await page.waitForTimeout(800);
check('no frames are drawn while it is gone', (await drawn()) === during);
check(
  'the music keeps playing meanwhile',
  (await page.evaluate(() => window.__deck.deck.engine.currentTime)) > t0,
);
await page.evaluate(() => window.lose.restoreContext());
await page.waitForFunction(() => !window.__deck.stage.world.contextLost, null, { timeout: 5000 });
check('the context comes back', true);
await page.waitForTimeout(1200);
check('frames are drawn again', (await drawn()) > during);
const after = await bright();
check(`the scene is complete again (${before} → ${after} bytes)`, after > before * 0.7);
const [x, y] = await page.evaluate(() => window.__deck.project('stylusTip'));
check(
  'the deck still answers the pointer',
  await page.evaluate(([a, b]) => window.__deck.stage.pick(a, b).kind === 'arm', [x, y]),
);

// three.js reports the loss itself; that line is the event this check caused, nothing else.
finish(errors.filter((e) => !/context lost|CONTEXT_LOST/i.test(e)));
await browser.close();
