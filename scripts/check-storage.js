// Each build keeps its own storage: writes with the original's shape, reloads, reads back. The html
// profile takes what html-1 saved, and html-1 can read what it writes.
// Usage: serve a build, then: node scripts/check-storage.js  (PROFILE=html for the single file)
import { BASE_URL, check, finish, openPage, wavFile } from './lib.js';

const html = process.env.PROFILE === 'html';
const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
await page.goto(BASE_URL);
await page.evaluate(() => localStorage.clear());

if (html) {
  await page.evaluate(() => {
    localStorage.setItem(
      'vinyl-prefs',
      JSON.stringify({
        volume: '0.5',
        bass: '4',
        noise: '0.4',
        sfx: false,
        scratch: false,
        rpm: 45,
        shuffle: true,
        repeat: 2,
        theme: 'theme-wood',
      }),
    );
    localStorage.setItem(
      'vinyl-deck',
      JSON.stringify({ condition: 'worn', imperfection: 0.7, sides: true }),
    );
    localStorage.setItem(
      'vinyl-eq',
      JSON.stringify({ on: true, preamp: 3, bands: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], preset: '' }),
    );
  });
  await page.reload();
  await page.waitForSelector('#volume');
  check("html-1's volume comes through", (await page.inputValue('#volume')) === '50');
  check("html-1's bass comes through", (await page.inputValue('#bass')) === '4');
  check("html-1's condition comes through", (await page.inputValue('#condition')) === 'worn');
  check('its speed comes through', await page.isChecked('input[name="speed"][value="single"]'));
  check('its Effects flag comes through', !(await page.isChecked('#effects')));
  check('its graphic EQ comes through', await page.isChecked('#eq-on'));
  check('its theme becomes a finish', (await page.inputValue('#plinth')) === 'walnut');
}

await page.setInputFiles('#file', wavFile('Kept.wav', 5, 440));
await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Ready'));
await page.fill('#volume', '30');
await page.dispatchEvent('#volume', 'input');
await page.dispatchEvent('#volume', 'change');
await page.waitForTimeout(300);

const rows = (name) =>
  page.evaluate(
    (name) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open(name);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const all = db.transaction('tracks').objectStore('tracks').getAll();
          all.onsuccess = () => {
            resolve({
              version: db.version,
              stores: [...db.objectStoreNames],
              rows: all.result.map((r) => ({
                ...r,
                buffer: r.buffer?.byteLength,
                blob: r.blob?.size,
              })),
            });
            db.close();
          };
        };
      }),
    name,
  );

if (html) {
  const db = await rows('vinyl-db');
  check(`html-1's database, version 2 (${db.version})`, db.version === 2);
  check('with its two stores', db.stores.includes('tracks') && db.stores.includes('meta'));
  const row = db.rows[0];
  check(
    "the row has html-1's fields",
    row.name === 'Kept' && row.buffer > 0 && row.mime === 'audio/wav' && row.tagv === 2,
  );
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('vinyl-prefs')));
  check('the volume is saved as html-1 saved it', prefs.volume === '0.3');
  check('fields it does not own stay', prefs.theme === 'theme-wood');
  const order = await page.evaluate(() => JSON.parse(localStorage.getItem('vinyl-tracks')));
  check('the order is a bare id list', Array.isArray(order) && order[0] === row.id);
  const appKeys = await page.evaluate(() =>
    // openPage seeds the coach's flag under the App's key before the page runs.
    Object.keys(localStorage).filter(
      (k) => k.startsWith('realistic-vinyl-player.') && !k.endsWith('.coachDone'),
    ),
  );
  check(`the App's keys are not touched (${appKeys})`, appKeys.length === 0);
} else {
  const db = await rows('vinyl-library');
  check(`the App's database (${db.rows.length} row)`, db.rows.length === 1 && db.rows[0].blob > 0);
  check(
    "html-1's keys are not touched",
    await page.evaluate(
      () => !localStorage.getItem('vinyl-prefs') && !localStorage.getItem('vinyl-deck'),
    ),
  );
}

await page.click('#play');
await page.waitForFunction(
  () => document.querySelector('#status')?.textContent?.includes('Ready') !== null,
);
await page.reload();
await page.waitForSelector('#volume');
await page.waitForTimeout(400);
check('the volume survives a reload', (await page.inputValue('#volume')) === '30');
check(
  'the track survives a reload',
  (await page.textContent('#status').catch(() => '')).includes('Kept'),
);

finish(errors);
await browser.close();
