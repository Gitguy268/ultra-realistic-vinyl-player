// Without WebGL the page shows the 2D deck, with every control working.
// Usage: npm run build && npm run preview, then: node scripts/check-fallback.js
import { BASE_URL, check, finish, openPage, wavFile } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    return /webgl/.test(type) ? null : original.call(this, type, ...rest);
  };
});
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck);
check('no 3D stage is built', await page.evaluate(() => window.__deck.stage === null));
check(
  'the page knows it has no stage',
  await page.evaluate(() => !document.body.classList.contains('has-stage')),
);
check('the scene canvas is hidden', await page.isHidden('#scene'));
check('the 2D deck shows', await page.isVisible('#platter'));

const painted = () =>
  page.evaluate(() => {
    const c = document.querySelector('#platter');
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 3; i < data.length; i += 4 * 97) if (data[i] > 0) lit++;
    return lit;
  });
check(`the 2D deck is drawn (${await painted()} samples)`, (await painted()) > 100);

await page.setInputFiles('#file', wavFile('Flat Tone.wav', 8, 440));
await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Ready'));
await page.click('#play');
await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 15000 });
check('Play plays', true);
const t0 = await page.evaluate(() => window.__deck.deck.engine.currentTime);
await page.waitForTimeout(800);
check('time advances', (await page.evaluate(() => window.__deck.deck.engine.currentTime)) > t0);
await page.click('#lever');
await page.waitForFunction(() => !window.__deck.deck.groove.contact);
check('the cue lever lifts the needle', true);
await page.click('#motor');
check('the motor switches off', !(await page.evaluate(() => window.__deck.deck.plates.motorOn)));
await page.check('input[name="speed"][value="single"]');
check('the speed follows', await page.evaluate(() => window.__deck.deck.motor.preset === 'single'));
await page.fill('#pitch', '3');
await page.dispatchEvent('#pitch', 'input');
check('the pitch follows', await page.evaluate(() => window.__deck.deck.motor.pitch > 0.02));

finish(errors);
await browser.close();
