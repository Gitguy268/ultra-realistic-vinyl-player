// Every finish is a material preset; Clear also makes the record translucent and iridescent.
// Usage: npm run build && npm run preview, then: node scripts/check-finishes.js
import { BASE_URL, check, finish, openPage } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck?.stage);
const material = () =>
  page.evaluate(() => {
    const { plinth, vinyl } = window.__deck.stage.world.materials;
    return {
      colour: plinth.color.getHexString(),
      metal: plinth.metalness,
      map: !!plinth.map,
      transmission: plinth.transmission,
      clearcoat: plinth.clearcoat,
      vinylTransmission: vinyl.transmission,
      iridescence: vinyl.iridescence,
    };
  });
const seen = new Set();
const set = async (name) => {
  await page.selectOption('#plinth', name);
  await page.waitForTimeout(300);
  return material();
};
for (const name of ['anthracite', 'black', 'walnut', 'aluminium', 'gloss', 'clear']) {
  const m = await set(name);
  seen.add(JSON.stringify(m));
  check(
    `${name} applies`,
    await page.evaluate((n) => document.documentElement.dataset.plinth === n, name),
  );
}
check(`each finish is its own material (${seen.size})`, seen.size === 6);
const walnut = await set('walnut');
check('walnut has a veneer texture', walnut.map);
check(
  '…and html-1’s Wood class on the root',
  await page.evaluate(() => document.querySelector('#app').classList.contains('theme-wood')),
);
const clear = await set('clear');
check('clear is glass', clear.transmission > 0.5);
check(
  '…with a translucent, shimmering record',
  clear.vinylTransmission > 0.5 && clear.iridescence > 0.5,
);
check(
  '…and html-1’s Clear class on the root',
  await page.evaluate(() => document.querySelector('#app').classList.contains('theme-clear')),
);
const black = await set('black');
check(
  'leaving clear gives black vinyl back',
  black.vinylTransmission === 0 && black.iridescence === 0,
);

finish(errors);
await browser.close();
