// What is printed on the record: the label's text and cover, and grooves shaded by the music.
// Usage: npm run build && npm run preview, then: node scripts/check-label.js
import { BASE_URL, check, finish, openPage, wavFile } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck?.stage);
await page.setInputFiles('#file', wavFile('Printed Artist - Printed Song.wav', 12, 440));
await page.waitForFunction(() => document.querySelector('#status')?.textContent?.length > 0);
await page.waitForTimeout(600);
const label = () =>
  page.evaluate(() => {
    const { label } = window.__deck.stage;
    const c = label.print;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const colours = new Set();
    for (let i = 0; i < d.length; i += 4 * 11)
      colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return { colours: colours.size, last: { ...label.last, cover: !!label.last.cover } };
  });
let l = await label();
check('the label carries the title', l.last.title === 'Printed Song');
check('…the artist round the top', l.last.top.includes('Printed Artist'));
check('…and the speed round the bottom', l.last.bottom.includes('33'));
check(`the print has text on its colour (${l.colours} colours)`, l.colours > 8);
const before = l.colours;
await page.check('input[name="speed"][value="single"]');
await page.waitForTimeout(300);
l = await label();
check('the speed on the label follows the plate', l.last.speedLabel === '45');
check('a repaint keeps the print intact', l.colours > before / 2);

// Grooves shaded by loudness, measured once and kept with the track.
await page.click('#play');
await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 15000 });
const shaded = await page.evaluate(() => {
  const d = window.__deck.deck;
  return [0.1, 0.5, 0.9].map((f) => d.levelAt(0, f));
});
check(
  `the track's loudness is measured (${shaded.map((v) => v?.toFixed(2))})`,
  shaded.every((v) => v !== undefined),
);
await page.waitForTimeout(800);
check(
  'the bass lights the grooves round the label',
  await page.evaluate(() => window.__deck.stage.world.materials.glow.opacity >= 0),
);

finish(errors);
await browser.close();
