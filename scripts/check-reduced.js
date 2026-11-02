// prefers-reduced-motion: no opening move, no wobble or tremble, and moves finish at once. The record
// still turns, and playback works.
// Usage: npm run build && npm run preview, then: node scripts/check-reduced.js
import { BASE_URL, check, finish, openPage, wavFile } from './lib.js';

const { browser, page, errors } = await openPage({
  width: 1440,
  height: 900,
  reducedMotion: 'reduce',
});
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck?.stage);
check('no opening move', !(await page.evaluate(() => window.__deck.stage.rig.introPlaying)));
const camera = () => page.evaluate(() => window.__deck.state().camera);
const c0 = await camera();
await page.waitForTimeout(600);
const c1 = await camera();
check(
  'the camera does not drift',
  c0.every((v, i) => Math.abs(v - c1[i]) < 1e-6),
);

await page.setInputFiles('#file', wavFile('Calm.wav', 30, 440));
await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Ready'));
await page.click('#play');
await page.waitForFunction(() => window.__deck.deck.groove.contact, null, { timeout: 1500 });
check('the stylus goes down at once', true);
await page.waitForFunction(() => window.__deck.deck.engine.playing, null, { timeout: 15000 });
const samples = await page.evaluate(async () => {
  const { stage, deck } = window.__deck;
  const parts = stage.world.deck;
  const out = { x: new Set(), tilt: new Set(), yaw: [], angle: deck.spin.angR };
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    out.x.add(parts.record.position.x);
    out.tilt.add(parts.record.rotation.x);
    out.yaw.push(parts.armYaw.rotation.y);
  }
  const jitter = Math.max(...out.yaw.slice(1).map((v, i) => Math.abs(v - out.yaw[i])));
  return { x: [...out.x], tilt: [...out.tilt], jitter, turned: deck.spin.angR - out.angle };
});
check('the record does not wobble', samples.x.length === 1 && samples.x[0] === 0);
check('the record does not tilt', samples.tilt.length === 1 && samples.tilt[0] === 0);
check(`the arm does not tremble (${samples.jitter.toExponential(1)} rad)`, samples.jitter < 1e-3);
check(`the record still turns (${samples.turned.toFixed(0)}°)`, samples.turned > 10);

finish(errors);
await browser.close();
