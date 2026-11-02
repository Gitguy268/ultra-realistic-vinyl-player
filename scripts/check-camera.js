// The camera: the opening move plays once per session and a gesture skips it; reduced motion
// has none; drags and the wheel stay inside the room and within the polar limits; a double-click
// reframes; Focus mode goes to the control view and back; the Tour steps through four stops and
// Esc leaves it; the wheel over the drawer scrolls the drawer, never the page or the camera.
// Usage: npm run build && npm run preview, then: node scripts/check-camera.js
import { BASE_URL, check, finish, openPage } from './lib.js';
import { DECK_SPEC } from '../src/spec/deck.ts';

const L = DECK_SPEC.camera.limits;
const DEG = Math.PI / 180;
const { browser, context, page, errors } = await openPage({ width: 1440, height: 900 });
const state = () => page.evaluate(() => window.__deck.state());
const intro = () => page.evaluate(() => window.__deck.stage.rig.introPlaying);
const near = (a, b, tolerance) => a.every((v, i) => Math.abs(v - b[i]) <= tolerance);

await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck);
check('the opening move plays on the first visit', await intro());
await page.mouse.move(300, 300);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(200);
check('a gesture skips the opening move', !(await intro()));
await page.reload();
await page.waitForFunction(() => window.__deck);
check('the opening move plays only once per session', !(await intro()));

// Random drags and wheel turns: always inside the room, polar angle inside the limits.
let outside = 0;
let polarBad = 0;
for (let i = 0; i < 30; i++) {
  const x = 100 + Math.random() * 800;
  const y = 150 + Math.random() * 500;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + (Math.random() - 0.5) * 1600, y + (Math.random() - 0.5) * 1200, {
    steps: 4,
  });
  await page.mouse.up();
  await page.mouse.wheel(0, (Math.random() - 0.3) * 2400);
  await page.waitForTimeout(60);
  const s = await state();
  if (!s.inRoom) outside++;
  const pose = await page.evaluate(() => {
    const c = window.__deck.stage.world.camera;
    const d = c.getWorldDirection(c.position.clone().set(0, 0, 0));
    return Math.acos(Math.min(1, Math.max(-1, -d.y)));
  });
  // The view direction's angle from straight down mirrors the polar angle from straight up.
  if (pose < L.minPolarDeg * DEG - 0.05 || pose > L.maxPolarDeg * DEG + 0.05) polarBad++;
}
check(`30 random orbits and dollies never leave the room (${outside} outside)`, outside === 0);
check(`the view stays between the polar limits (${polarBad} outside)`, polarBad === 0);

// Double-click on empty space reframes to the home view.
// The orbits above leave the camera anywhere, so ask the stage for a pixel nothing is under.
const empty = await page.evaluate(() => {
  const { stage } = window.__deck;
  for (let y = 120; y < 760; y += 40) {
    for (let x = 40; x < 900; x += 40) {
      if (document.elementFromPoint(x, y) === stage.canvas && stage.pick(x, y).kind === 'none')
        return [x, y];
    }
  }
  return null;
});
await page.mouse.dblclick(...empty);
await page.waitForTimeout(2200);
check(
  'a double-click reframes to the home view',
  near((await state()).camera, DECK_SPEC.camera.hero.position, 0.02),
);

// Focus mode: the control view; leaving it goes home.
await page.keyboard.press('f');
await page.waitForTimeout(2200);
const focused = (await state()).camera;
check(
  `Focus mode moves the camera to the control view (${focused.map((v) => v.toFixed(2))})`,
  near(focused, DECK_SPEC.camera.control.position, 0.02),
);
await page.keyboard.press('Escape');
await page.waitForTimeout(2200);
check(
  'leaving Focus mode returns home',
  near((await state()).camera, DECK_SPEC.camera.hero.position, 0.02),
);

// The Tour: four stops with T, Esc leaves.
for (let i = 0; i < DECK_SPEC.camera.tour.length; i++) {
  await page.keyboard.press('t');
  await page.waitForTimeout(2400);
  const stop = DECK_SPEC.camera.tour[i];
  const caption = await page.textContent('#tour-caption');
  const at = (await state()).camera;
  check(
    `tour stop ${i + 1}: ${stop.name} (${at.map((v) => v.toFixed(2))})`,
    near(at, stop.position, 0.03) && caption.includes(stop.name),
  );
}
await page.keyboard.press('Escape');
await page.waitForTimeout(2400);
check(
  'Esc leaves the tour and goes home',
  (await page.isHidden('#tour-caption')) &&
    near((await state()).camera, DECK_SPEC.camera.hero.position, 0.02),
);

// The wheel over the drawer scrolls the drawer, not the page or the camera.
const camera = (await state()).camera;
const drawer = await page.locator('.controls').boundingBox();
await page.mouse.move(drawer.x + drawer.width / 2, drawer.y + drawer.height / 2);
await page.mouse.wheel(0, 600);
await page.waitForTimeout(500);
const scrolled = await page.evaluate(() => ({
  drawer: document.querySelector('.controls').scrollTop,
  page: window.scrollY,
}));
check('the wheel over the drawer scrolls the drawer', scrolled.drawer > 0);
check('the page itself never scrolls', scrolled.page === 0);
check(
  'the camera does not move when the drawer scrolls',
  near((await state()).camera, camera, 1e-4),
);
await context.close();

// Reduced motion: no opening move.
const calm = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'reduce',
});
const calmPage = await calm.newPage();
calmPage.on('pageerror', (e) => errors.push(e.message));
await calmPage.goto(`${BASE_URL}?debug`);
await calmPage.waitForFunction(() => window.__deck);
check(
  'reduced motion: no opening move',
  !(await calmPage.evaluate(() => window.__deck.stage.rig.introPlaying)),
);
await calm.close();

finish(errors);
await browser.close();
