// The documentation's pictures, rendered from the production build. Fails on any console error.
// Usage: npm run build && npm run preview, then: node scripts/screenshots.js [out directory]
import { mkdirSync } from 'node:fs';
import { BASE_URL, finish, openPage } from './lib.js';

const OUT = process.argv[2] ?? 'docs/screenshots';
mkdirSync(OUT, { recursive: true });
const errors = [];
const QUALITY = { type: 'jpeg', quality: 86 };

/** Opens the page in a fresh browser, with the demo record on the platter. */
async function open({
  width = 1440,
  height = 900,
  scheme = 'dark',
  dpr = 1,
  touch = false,
  query = '?demo&debug',
}) {
  const session = await openPage({
    width,
    height,
    colorScheme: scheme,
    deviceScaleFactor: dpr,
    hasTouch: touch,
    isMobile: touch,
  });
  await session.page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
  await session.page.goto(`${BASE_URL}${query}`);
  await session.page.waitForFunction(() => window.__deck?.player.queue.ids.length === 3, null, {
    timeout: 30000,
  });
  return session;
}

const play = async (page) => {
  await page.click('#play');
  await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
};

const done = async ({ browser, errors: found }) => {
  errors.push(...found);
  await browser.close();
};

// The page, playing, in both schemes at both sizes.
for (const [name, size] of [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844, dpr: 2, touch: true }],
]) {
  for (const scheme of ['dark', 'light']) {
    const session = await open({ ...size, scheme });
    await play(session.page);
    await session.page.screenshot({ path: `${OUT}/${name}-${scheme}.png` });
    await done(session);
  }
}

// The scene with its panels out of the way: finishes, themes, the 7-inch.
const session = await open({ scheme: 'dark' });
const { page } = session;
await play(page);
await page.screenshot({ path: `${OUT}/playback.jpg`, ...QUALITY });
await page.keyboard.press('f');
await page.waitForTimeout(2400);
for (const finishName of ['anthracite', 'black', 'walnut', 'aluminium', 'gloss', 'clear']) {
  await page.selectOption('#plinth', finishName).catch(async () => {
    await page.evaluate((f) => {
      const select = document.querySelector('#plinth');
      select.value = f;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }, finishName);
  });
  await page.waitForTimeout(700);
  const file = finishName === 'clear' ? 'clear-finishes' : `finishes-${finishName}`;
  await page.screenshot({ path: `${OUT}/${file}.jpg`, ...QUALITY });
}
await page.keyboard.press('Escape');
await done(session);

// html-1's three themes, in the light they were designed for.
for (const [theme, finishName] of [
  ['minimal', 'anthracite'],
  ['wood', 'walnut'],
  ['clear', 'clear'],
]) {
  const s = await open({ scheme: 'light' });
  await s.page.evaluate((f) => {
    const select = document.querySelector('#plinth');
    select.value = f;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, finishName);
  await s.page.waitForTimeout(800);
  await s.page.screenshot({ path: `${OUT}/themes-${theme}.jpg`, ...QUALITY });
  await done(s);
}

// Both colour schemes of the room, side by side in the docs.
{
  const s = await open({ scheme: 'light' });
  await s.page.waitForTimeout(800);
  await s.page.screenshot({ path: `${OUT}/schemes-daylight.jpg`, ...QUALITY });
  await done(s);
  const d = await open({ scheme: 'dark' });
  await d.page.waitForTimeout(800);
  await d.page.screenshot({ path: `${OUT}/schemes-dusk.jpg`, ...QUALITY });
  await done(d);
}

// The 7-inch on its adapter.
{
  const s = await open({ scheme: 'dark' });
  await s.page.evaluate(() => {
    const box = document.querySelector('#size-by-speed');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    const radio = document.querySelector('input[name="speed"][value="single"]');
    radio.click();
  });
  await s.page.waitForTimeout(800);
  await s.page.screenshot({ path: `${OUT}/record-45.jpg`, ...QUALITY });
  await done(s);
}

// Macros, through the scene-only view: the strip, the pitch wheel, the arm, the mat.
{
  const s = await openPage({ width: 1440, height: 900 });
  const shots = {
    strip: { position: [0.13, 0.16, 0.33], target: [0.1, 0.05, 0.17], focal: 70 },
    wheel: { position: [-0.12, 0.14, 0.3], target: [-0.13, 0.052, 0.157], focal: 70 },
    head: { position: [0.2, 0.15, 0.2], target: [0.145, 0.09, 0.1], focal: 80 },
    gimbal: { position: [0.26, 0.2, 0.08], target: [0.136, 0.09, -0.107], focal: 70 },
    hinge: { position: [0.42, 0.18, -0.02], target: [0.2, 0.08, -0.17], focal: 60 },
    rear: { position: [0.1, 0.25, -0.75], target: [0.05, 0.03, -0.17], focal: 50 },
    grooves: { position: [-0.05, 0.22, 0.2], target: [-0.05, 0.07, 0.05], focal: 80 },
  };
  for (const [name, stop] of Object.entries(shots)) {
    await s.page.goto(
      `${BASE_URL}view.html?view=hero&open=78&macro=${encodeURIComponent(JSON.stringify(stop))}`,
    );
    await s.page.waitForFunction(() => window.__world?.ready, null, { timeout: 30000 });
    await s.page.waitForTimeout(300);
    await s.page.screenshot({ path: `${OUT}/macro-${name}.jpg`, ...QUALITY });
  }
  await s.page.goto(`${BASE_URL}view.html?view=top&open=78&norecord`);
  await s.page.waitForFunction(() => window.__world?.ready, null, { timeout: 30000 });
  await s.page.waitForTimeout(300);
  await s.page.screenshot({ path: `${OUT}/macro-mat.jpg`, ...QUALITY });
  await done(s);
}

finish(errors);
