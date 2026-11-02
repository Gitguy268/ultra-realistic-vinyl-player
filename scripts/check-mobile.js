// A phone: nothing wider than the screen, the deck in view, the cue and transport reachable by touch.
// Usage: npm run build && npm run preview, then: node scripts/check-mobile.js
import { BASE_URL, check, finish, openPage } from './lib.js';

const { browser, page, errors } = await openPage({
  width: 390,
  height: 844,
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
await page.goto(`${BASE_URL}?demo&debug`);
await page.waitForFunction(() => window.__deck?.player.queue.ids.length === 3, null, {
  timeout: 20000,
});
const wide = await page.evaluate(() =>
  [...document.querySelectorAll('body *')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width && !el.closest('dialog') && (r.right > 390.5 || r.left < -0.5);
    })
    .map((el) => el.id || el.className),
);
check(`nothing is wider than the screen (${wide.slice(0, 4)})`, wide.length === 0);
check(
  'the page does not scroll sideways',
  await page.evaluate(() => document.documentElement.scrollWidth <= 390),
);
const [sx, sy] = await page.evaluate(() => window.__deck.project('spindleBase'));
check(
  `the record is in view (${Math.round(sx)}, ${Math.round(sy)})`,
  sx > 0 && sx < 390 && sy > 0 && sy < 844,
);
check('the Lift button is there to press', await page.isVisible('#lever'));
await page.tap('#play');
await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 20000 });
check('tapping Start plays', true);
await page.tap('#lever');
await page.waitForFunction(() => !window.__deck.deck.groove.contact);
check('tapping Lift lifts the needle', true);
check(
  'a touch device routes through the media element',
  await page.evaluate(() => window.__deck.deck.engine.currentRoute === 'sink'),
);

finish(errors);
await browser.close();
