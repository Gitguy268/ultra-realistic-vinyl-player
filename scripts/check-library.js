// Imports a folder, then checks persistence, reordering, queue controls, auto-advance,
// cover accent and clearing. Usage: npm run build && npm run preview, then:
// node scripts/check-library.js
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BASE_URL, check, finish, id3Chunk, makeWav, openPage, solidPng } from './lib.js';

const fixture = fileURLToPath(new URL('../.scratch/import-fixture/', import.meta.url));
rmSync(fixture, { recursive: true, force: true });
mkdirSync(`${fixture}nested/deeper`, { recursive: true });
const cover = solidPng([64, 200, 240]);
writeFileSync(
  `${fixture}tagged.wav`,
  makeWav(2, 330, id3Chunk({ title: 'Tagged Title', artist: 'Tag Artist', coverPng: cover })),
);
writeFileSync(`${fixture}nested/02 - Folder Band - Second Song.wav`, makeWav(2, 440));
writeFileSync(`${fixture}nested/deeper/Plain Name.wav`, makeWav(2, 550));
writeFileSync(`${fixture}nested/broken.mp3`, Buffer.from('this is not audio'));
writeFileSync(`${fixture}nested/notes.txt`, 'not audio');
writeFileSync(`${fixture}cover.jpg`, 'not audio');
writeFileSync(`${fixture}._tagged.wav`, 'resource fork');

const { browser, page, errors } = await openPage();
page.on('dialog', (dialog) => dialog.accept());
await page.goto(`${BASE_URL}?debug`);

const titles = () => page.locator('#tracks .track-title').allTextContents();
const currentTitle = () =>
  page.locator('#tracks .track[aria-current="true"] .track-title').textContent();
const waitForStatus = (text) =>
  page.waitForFunction(
    (expected) => document.querySelector('#status')?.textContent?.includes(expected),
    text,
    { timeout: 15000 },
  );
const sorted = (list) => [...list].sort();

check('library starts empty', (await titles()).length === 0);
await page.setInputFiles('#folder', fixture);
await page.waitForFunction(() => document.querySelectorAll('#tracks li').length === 4);
const imported = await titles();
check(
  `folder import collects audio recursively and skips other files (${imported.join(', ')})`,
  JSON.stringify(sorted(imported)) ===
    JSON.stringify(sorted(['Tagged Title', 'Second Song', 'Plain Name', 'broken'])),
);
check(
  'embedded tags win over the file name',
  (
    await page
      .locator('#tracks li', { hasText: 'Tagged Title' })
      .locator('.track-meta')
      .textContent()
  ).startsWith('Tag Artist'),
);
check(
  'file name supplies artist and title when there are no tags',
  (
    await page
      .locator('#tracks li', { hasText: 'Second Song' })
      .locator('.track-meta')
      .textContent()
  ).startsWith('Folder Band'),
);
check('a file with unreadable tags still imports', imported.includes('broken'));
await waitForStatus('Ready:');
check('the first imported track is put on the platter', (await currentTitle()) === imported[0]);

// Cover accent: select the tagged track and read the accent custom property.
await page.locator('#tracks .track', { hasText: 'Tagged Title' }).click();
await waitForStatus('Ready: Tagged Title');
await page
  .waitForFunction(
    () => document.documentElement.style.getPropertyValue('--cover-accent') !== '',
    null,
    {
      timeout: 5000,
    },
  )
  .catch(() => undefined);
const accent = await page.evaluate(() =>
  document.documentElement.style.getPropertyValue('--cover-accent'),
);
check(`accent colour comes from the cover art (${accent || 'unset'})`, accent === '#40c8f0');
await page.locator('#tracks .track', { hasText: 'Plain Name' }).click();
await waitForStatus('Ready: Plain Name');
await page.waitForFunction(
  () => document.documentElement.style.getPropertyValue('--cover-accent') === '',
);
check('accent returns to the default for a track without cover art', true);

// Record info: edit the details of the track on the platter.
await page.locator('#record-info summary').click();
check(
  'Record info shows the current track',
  (await page.inputValue('#info-title')) === 'Plain Name',
);
await page.fill('#info-artist', '  The Plain Band ');
await page.fill('#info-year', '1981');
await page.fill('#info-notes', 'Pressed on test vinyl.');
await page.locator('#info-notes').blur();
await page.waitForFunction(() =>
  [...document.querySelectorAll('#tracks .track-meta')].some((meta) =>
    meta.textContent.startsWith('The Plain Band'),
  ),
);
check('an edited artist shows in the queue, trimmed', true);
await page.fill('#info-year', 'nineteen');
await page.locator('#info-year').blur();
await page.waitForFunction(() => document.querySelector('#info-year').value === '');
check('a year that is not a year is dropped', true);
await page.fill('#info-year', '1981');
await page.locator('#info-year').blur();
await page.waitForTimeout(300);

// Keyboard reorder.
const before = await titles();
await page.locator('#tracks .track').first().focus();
await page.keyboard.press('Alt+ArrowDown');
const afterKey = await titles();
check(
  'Alt+ArrowDown moves the focused track down',
  afterKey[1] === before[0] && afterKey[0] === before[1],
);
check(
  'focus stays on the moved track',
  (await page.evaluate(
    () => document.activeElement?.querySelector('.track-title')?.textContent,
  )) === before[0],
);

// Pointer reorder: drag the last handle above the first row.
// The mouse works in viewport coordinates, so the whole list has to be on screen.
await page.locator('#tracks').evaluate((list) => list.scrollIntoView({ block: 'center' }));
const lastHandle = await page.locator('#tracks .handle').last().boundingBox();
const firstRow = await page.locator('#tracks li').first().boundingBox();
await page.mouse.move(lastHandle.x + lastHandle.width / 2, lastHandle.y + lastHandle.height / 2);
await page.mouse.down();
await page.mouse.move(firstRow.x + 20, firstRow.y + 4, { steps: 8 });
await page.mouse.up();
const afterDrag = await titles();
check('dragging a handle moves the track to the top', afterDrag[0] === afterKey[3]);

// Persistence across a reload. Count audio contexts to prove nothing is decoded early.
await page.addInitScript(() => {
  const Original = window.AudioContext;
  window.audioContextsCreated = 0;
  window.AudioContext = class extends Original {
    constructor(...args) {
      super(...args);
      window.audioContextsCreated++;
    }
  };
});
await page.reload();
await page.waitForFunction(() => document.querySelectorAll('#tracks li').length === 4);
check(
  'library and queue order persist across a reload',
  JSON.stringify(await titles()) === JSON.stringify(afterDrag),
);
check('the current track persists across a reload', (await currentTitle()) === 'Plain Name');
await waitForStatus('On the platter: Plain Name');
await page.waitForTimeout(700);
check(
  'the saved track is not decoded until it is played',
  (await page.evaluate(() => window.audioContextsCreated)) === 0,
);
check('its tagged length is shown meanwhile', (await page.textContent('#time-total')) === '0:02');
check(
  'edited details and liner notes persist across a reload',
  (await page.inputValue('#info-artist')) === 'The Plain Band' &&
    (await page.inputValue('#info-year')) === '1981' &&
    (await page.inputValue('#info-notes')) === 'Pressed on test vinyl.',
);
await page.screenshot({ path: fileURLToPath(new URL('../.scratch/label.png', import.meta.url)) });
await page.click('#play');
await waitForStatus('Ready: Plain Name');
await page
  .waitForFunction(() => document.querySelector('#time-current')?.textContent === '0:01', null, {
    timeout: 5000,
  })
  .then(
    () => check('the first Play after a reload decodes and starts the track', true),
    () => check('the first Play after a reload decodes and starts the track', false),
  );
check(
  'the audio context is created on that first Play',
  (await page.evaluate(() => window.audioContextsCreated)) === 1,
);
// The record carries the queue (C19): the stylus would ride on into the next track, so stop it.
await page.click('#play');
await page.waitForFunction(
  () => document.querySelector('#motor')?.getAttribute('aria-pressed') === 'false',
  null,
  { timeout: 15000 },
);

// Queue controls.
const order = await titles();
const start = order.indexOf('Plain Name');
// Browsers list a folder in different orders, so the current track may be last.
const atEnd = start === order.length - 1;
await page.click('#next');
await page.waitForTimeout(200);
check(
  atEnd ? 'Next stays put at the end of the queue' : 'Next selects the following track',
  (await currentTitle()) === (atEnd ? 'Plain Name' : order[start + 1]),
);
await page.click('#prev');
await page.waitForTimeout(200);
check('Previous goes back', (await currentTitle()) === (atEnd ? order[start - 1] : 'Plain Name'));
await page.click('#shuffle');
check('Shuffle toggles on', (await page.getAttribute('#shuffle', 'aria-pressed')) === 'true');
await page.click('#shuffle');
await page.click('#repeat');
check('Repeat cycles to all', (await page.textContent('#repeat')) === 'Repeat: all');
await page.click('#repeat');
await page.click('#repeat');
check('Repeat cycles back to off', (await page.textContent('#repeat')) === 'Repeat: off');

// Auto-advance: off by default; when on, the next track is cued after the arm returns.
check('auto-advance is off by default', !(await page.isChecked('#auto-advance')));
await page.check('#auto-advance');
// Browsers list a folder in different orders, so find two playable neighbours.
const pair = order.findIndex(
  (title, index) => title !== 'broken' && order[index + 1] && order[index + 1] !== 'broken',
);
// The cue lever decides what a click on a track does (C26). Raised: it is only cued up.
if ((await page.getAttribute('#play', 'aria-pressed')) === 'true') await page.click('#play');
// With the arm hovering a first press lowers it; the press after that raises the lever.
for (let i = 0; i < 3 && (await page.getAttribute('#lever', 'aria-pressed')) !== 'true'; i++) {
  await page.click('#lever');
  await page.waitForTimeout(500);
}
await page.locator('#tracks .track').nth(pair).click();
await waitForStatus(`Ready: ${order[pair]}`);
await page.waitForTimeout(500);
check(
  'with the lever raised, clicking a track only cues it',
  (await page.getAttribute('#play', 'aria-pressed')) === 'false',
);
await page.click('#play');
await page.waitForTimeout(150);
check(
  'Play lowers the lever again',
  (await page.getAttribute('#lever', 'aria-pressed')) === 'false',
);
await page.waitForFunction(
  (second) =>
    document.querySelector('#tracks .track[aria-current="true"] .track-title')?.textContent ===
      second && document.querySelector('#play')?.getAttribute('aria-pressed') === 'true',
  order[pair + 1],
  { timeout: 20000 },
);
check('with auto-advance on, the next track starts after the side ends', true);
await page.click('#play');

// Remove a single track from the keyboard.
const beforeRemove = await titles();
await page.locator('#tracks .remove').nth(1).focus();
check(
  'each row has a named remove button',
  (await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) ===
    `Remove ${beforeRemove[1]}`,
);
await page.keyboard.press('Enter');
await page.waitForFunction(() => document.querySelectorAll('#tracks li').length === 3);
const afterRemove = await titles();
check(
  'removing a track keeps the others in order',
  JSON.stringify(afterRemove) === JSON.stringify(beforeRemove.filter((_, index) => index !== 1)),
);
check(
  'focus moves to the next track',
  (await page.evaluate(
    () => document.activeElement?.querySelector('.track-title')?.textContent,
  )) === beforeRemove[2],
);
await page.locator('#tracks .remove').last().click();
await page.waitForFunction(() => document.querySelectorAll('#tracks li').length === 2);
check(
  'removing the last row moves focus to the previous track',
  (await page.evaluate(
    () => document.activeElement?.querySelector('.track-title')?.textContent,
  )) === afterRemove[1],
);
await page.reload();
await page.waitForFunction(() => document.querySelectorAll('#tracks li').length === 2);
check(
  'removals persist across a reload',
  JSON.stringify(await titles()) === JSON.stringify(afterRemove.slice(0, 2)),
);

// Clear.
await page.click('#clear-library');
await page.waitForFunction(() => document.querySelectorAll('#tracks li').length === 0);
check('Clear library empties the list after confirmation', true);
await page.reload();
await page.waitForTimeout(800);
check('the library stays empty after a reload', (await titles()).length === 0);

await browser.close();
finish(errors);
