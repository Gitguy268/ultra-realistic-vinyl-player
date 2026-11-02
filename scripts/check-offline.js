// Checks the service worker: offline reload, and the update prompt.
// Usage: npm run build && npm run preview, then: node scripts/check-offline.js
// The update test appends a comment to dist/sw.js to stand in for a new deploy;
// rebuild afterwards.
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BASE_URL, BROWSER, check, finish, openPage } from './lib.js';

const { browser, context, page, errors } = await openPage();
await page.goto(BASE_URL);
await page.evaluate(() => navigator.serviceWorker.ready);
check(
  'service worker is active after the first load',
  await page.evaluate(async () => (await navigator.serviceWorker.ready).active !== null),
);
const cached = await page.evaluate(async () => {
  const urls = [];
  for (const name of await caches.keys()) {
    for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
  }
  return urls;
});
check(`app shell is precached (${cached.length} entries)`, cached.length > 20);
check(
  'the worklet chunk is precached',
  cached.some((url) => /vinyl\.worklet-.*\.js/.test(url)),
);
check(
  'no audio is cached',
  !cached.some((url) => /\.(mp3|flac|wav|ogg|m4a|opus|aac)(\?|$)/i.test(url)),
);
check('no update toast on a fresh install', !(await page.isVisible('#update-toast')));

// Playwright's WebKit cannot reload a page while offline, service worker or not.
if (BROWSER === 'webkit') {
  process.stdout.write('skip offline reload: not possible under WebKit automation\n');
  // Reload online instead, so the page is controlled by the worker for the update test.
  await page.reload();
  await page.waitForSelector('#scene');
} else {
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#scene');
  await page.waitForTimeout(800);
  check(
    'offline reload renders the page',
    (await page.textContent('h1')) === 'Ultra-Realistic Vinyl Player',
  );
  // WebGL pixels cannot be read back after the frame, so judge a screenshot: a drawn deck has
  // far too much detail to compress like a flat colour.
  const shot = await page.screenshot({ clip: { x: 200, y: 200, width: 400, height: 400 } });
  check(`offline reload draws the deck (${shot.length} bytes)`, shot.length > 20000);
  check(
    'offline reload has styles and the font',
    await page.evaluate(
      async () =>
        getComputedStyle(document.body).fontFamily.includes('Inter') &&
        (await document.fonts.ready).check('16px "Inter Variable"'),
    ),
  );
  await page.click('#motor');
  // The button state is synced once per animation frame, so wait for it.
  const motorOn = await page
    .waitForFunction(
      () => document.querySelector('#motor')?.getAttribute('aria-pressed') === 'true',
      null,
      { timeout: 5000 },
    )
    .then(() => true)
    .catch(() => false);
  check('controls work offline', motorOn);
  await context.setOffline(false);
}

// A byte-different sw.js is what a new deploy looks like to the browser.
appendFileSync(
  fileURLToPath(new URL('../dist/sw.js', import.meta.url)),
  `\n// update check ${Date.now()}\n`,
);
await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
const shown = await page
  .waitForSelector('#update-toast:not([hidden])', { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
check('a waiting update shows the toast', shown);
check(
  'toast reads "A new version is available — Reload"',
  (await page.textContent('#update-toast'))
    .replace(/\s+/g, ' ')
    .includes('A new version is available — Reload'),
);
check(
  'the new worker waits until the user accepts',
  await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting !== null),
);
await Promise.all([page.waitForEvent('load'), page.click('#update-reload')]);
await page.waitForTimeout(800);
check(
  'Reload activates the update and the toast is gone',
  !(await page.isVisible('#update-toast')),
);
check(
  'nothing is left waiting after the reload',
  await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting === null),
);

await browser.close();
finish(errors);
