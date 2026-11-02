// Files dragged onto the page: the overlay, audio imported, an image as the page's cover. A track
// without its own art takes that cover on its label, and keeps the default accent (C25).
// Usage: npm run build && npm run preview, then: node scripts/check-drop-cover.js
import { BASE_URL, check, finish, openPage, makeWav, solidPng } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck?.stage);

const drag = (files, types) =>
  page.evaluate(
    ([files, types]) => {
      const dt = new DataTransfer();
      for (const f of files) {
        dt.items.add(new File([Uint8Array.from(f.bytes)], f.name, { type: f.type }));
      }
      for (const type of types) {
        document.body.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }),
        );
      }
    },
    [files, types],
  );
const file = (name, type, buffer) => ({ name, type, bytes: [...buffer] });
const overlay = () =>
  page.evaluate(() => document.querySelector('#drop-overlay').classList.contains('active'));

const wav = file('Dropped Song.wav', 'audio/wav', makeWav(4, 440));
await drag([wav], ['dragover']);
check('dragging files shows the overlay', await overlay());
await drag([wav], ['drop']);
check('dropping hides it', !(await overlay()));
await page.waitForFunction(() => document.querySelectorAll('#tracks li').length === 1, null, {
  timeout: 8000,
});
check('a dropped audio file is imported', true);

const png = file('cover.png', 'image/png', solidPng([200, 40, 180], 32));
await drag([png], ['dragover', 'drop']);
await page.waitForFunction(
  () =>
    window.__deck.stage.label.last.cover !== null ||
    window.__deck.player.coverOf(window.__deck.player.current) !== undefined,
  null,
  { timeout: 5000 },
);
const cover = () =>
  page.evaluate(() => window.__deck.player.coverOf(window.__deck.player.current)?.size ?? 0);
check('a dropped image becomes the cover', (await cover()) > 0);
check(
  'it adds no track',
  await page.evaluate(() => document.querySelectorAll('#tracks li').length === 1),
);
await page.waitForTimeout(500);
check(
  'the label shows it',
  await page.evaluate(() => window.__deck.stage.label.last.coverVersion > 0),
);
check(
  'a track without its own art keeps the default accent',
  await page.evaluate(
    () => document.documentElement.style.getPropertyValue('--cover-accent') === '',
  ),
);
await page.reload();
await page.waitForFunction(() => window.__deck?.player.current, null, { timeout: 10000 });
check('the cover survives a reload', (await cover()) > 0);

finish(errors);
await browser.close();
