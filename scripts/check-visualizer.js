// The label visualizer: the ♫ twin steps through the styles, each draws on the label while a record
// plays, nothing is drawn with the needle up, and the choice is saved.
// Usage: npm run build && npm run preview, then: node scripts/check-visualizer.js
import { BASE_URL, check, finish, openPage } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
await page.goto(`${BASE_URL}?demo&debug`);
await page.waitForFunction(() => window.__deck?.player.queue.ids.length === 3, null, {
  timeout: 15000,
});
const value = () => page.inputValue('#visualizer');
const live = () => page.evaluate(() => window.__deck.Viz.live());
const modes = await page.evaluate(() => window.__deck.Viz.modes());
check(
  `every style is on offer (${modes})`,
  modes.join() === 'off,milkdrop,bars,lines,scope,spectrogram,radial',
);
await page.click('#viz-step');
check('the ♫ button steps to the next style', (await value()) === modes[1]);
check('with the needle up the label stays printed', (await live()) === null);
await page.click('#play');
await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 15000 });
for (const mode of modes.slice(1)) {
  if ((await value()) !== mode) await page.click('#viz-step');
  await page
    .waitForFunction((m) => window.__deck.Viz.live() === m, mode, { timeout: 8000 })
    .catch(() => {});
  check(`${mode} draws on the label`, (await live()) === mode);
  if (mode !== 'milkdrop') {
    await page.waitForTimeout(600);
    const colours = await page.evaluate(() => window.__deck.Viz.colours());
    check(`…and paints something (${colours} colours)`, colours > 1);
  }
}
await page.click('#viz-step');
check('the button comes round to off', (await value()) === 'off');
await page.waitForTimeout(200);
check('off gives the printed label back', (await live()) === null);
await page.selectOption('#visualizer', 'radial');
await page.dispatchEvent('#visualizer', 'change');
await page.waitForTimeout(100);
await page.reload();
await page.waitForFunction(() => window.__deck, null, { timeout: 10000 });
check('the choice is saved', (await value()) === 'radial');

finish(errors);
await browser.close();
