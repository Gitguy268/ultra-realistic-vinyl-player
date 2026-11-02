// The 3D deck's moving parts: each turns about its real axis and follows the deck's state.
// Platter (Y), record (Y, slips under a hand), arm (Y at the pivot, lift), cue lever (X), cover
// (X at the hinges), plates (travel along the strip, with detents), the 78 interlock, the pitch
// wheel, the rim slots per mains frequency and the strobe neon. A closed cover blocks the arm.
// Usage: npm run build && npm run preview, then: node scripts/check-parts.js
import { BASE_URL, check, finish, openPage, wavFile } from './lib.js';
import { DECK_SPEC } from '../src/spec/deck.ts';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck);
const parts = () => page.evaluate(() => window.__deck.parts());
const state = () => page.evaluate(() => window.__deck.state());
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance;
const P = DECK_SPEC.plates;

check('the 3D stage is up', (await parts()) !== null);
await page.setInputFiles('#file', wavFile('Parts Tone.wav', 30, 440));
await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Ready'));

// Speed plate: the 45 twin slides it one detent pitch from 33; the 78 twin presses the unlock.
let p = await parts();
const offAt = p.plateX.speed;
await page.click('#motor');
await page.waitForTimeout(400);
p = await parts();
check(
  'M slides the speed plate from OFF to 33 (one detent along the strip)',
  near(p.plateX.speed - offAt, P.speed.detentPitch, 0.0003),
);
const at33 = p.plateX.speed;
await page.check('input[name="speed"][value="single"]');
await page.waitForTimeout(400);
p = await parts();
check(
  'the 45 twin moves the plate two detents toward 78',
  near(at33 - p.plateX.speed, 2 * P.speed.detentPitch, 0.0003),
);
const refused = await page.evaluate(() => {
  const d = window.__deck.deck;
  d.stepSpeed(-1);
  return d.plates.speed;
});
check('the 3D plate refuses 78 without the unlock pin (interlock)', refused === '45');
await page.check('input[name="speed"][value="shellac"]');
await page.waitForTimeout(400);
check('the 78 twin presses the unlock and reaches 78', (await state()).plates.speed === '78');
await page.check('input[name="speed"][value="lp"]');
await page.waitForTimeout(300);

// Platter turns about Y; the spindle stays put.
const before = await parts();
await page.waitForTimeout(1500);
const after = await parts();
check('the platter turns about Y (clockwise from above)', after.platterY < before.platterY - 0.5);
check(
  'the spindle does not move while the platter turns',
  before.spindleTip.every((v, i) => near(v, after.spindleTip[i], 1e-6)),
);
check('the strobe neon is lit while the motor runs', after.neon > 0);

// Play: the stylus comes down onto the record surface; the cue lever follows the lift.
await page.click('#play');
await page.waitForFunction(() => window.__deck.state().contact, null, { timeout: 8000 });
await page.waitForTimeout(300);
p = await parts();
check(
  `the lowered stylus sits on the record surface (${(p.stylus[1] * 1000).toFixed(1)} mm)`,
  near(p.stylus[1], p.recordSurface, 0.0008),
);
const loweredLever = p.cueLeverX;
await page.click('#lever');
await page.waitForTimeout(700);
p = await parts();
check(
  'the cue lifts the stylus by the cue height',
  near(p.stylus[1] - p.recordSurface, DECK_SPEC.tonearm.cueLift, 0.0015),
);
check('the cue lever turns about X with the lift', p.cueLeverX < loweredLever - 0.1);
check('the cue plate twin slid the cue plate', (await state()).plates.cue === 'raise');
await page.click('#lever');
await page.waitForTimeout(900);

// Cover about X at the hinges; closed, it blocks the arm.
const coverSettles = (target) =>
  page
    .waitForFunction((t) => Math.abs(window.__deck.parts().coverX - t) < 0.005, target, {
      timeout: 8000,
    })
    .catch(() => {});
await page.click('#cover');
await coverSettles(0);
p = await parts();
check(`the cover closes about X (${p.coverX.toFixed(3)} rad)`, near(p.coverX, 0, 0.01));
const blocked = await page.evaluate(() => {
  const [x, y] = window.__deck.project('stylusTip');
  return window.__deck.stage.pick(x, y).kind;
});
check(`a closed cover blocks the arm (pick: ${blocked})`, blocked === 'cover');
await page.click('#cover');
await coverSettles(-(DECK_SPEC.cover.maxOpenDeg * Math.PI) / 180);
p = await parts();
check(
  `the cover opens to its stop (${p.coverX.toFixed(3)} rad)`,
  near(-p.coverX, (DECK_SPEC.cover.maxOpenDeg * Math.PI) / 180, 0.01),
);

// Pitch wheel and the rim slots.
await page.fill('#pitch', '3');
await page.dispatchEvent('#pitch', 'input');
await page.waitForTimeout(200);
check('the pitch wheel turns with the pitch', Math.abs((await parts()).wheelY) > 0.5);
check(`90 rim slots at 50 Hz (${(await parts()).slots})`, (await parts()).slots === 90);
await page.selectOption('#mains', '60');
await page.waitForTimeout(200);
check(`108 rim slots at 60 Hz (${(await parts()).slots})`, (await parts()).slots === 108);

// Record size follows speed: a 7-inch at 45.
await page.click('#deck-settings > summary');
await page.check('#size-by-speed');
await page.check('input[name="speed"][value="single"]');
await page.waitForTimeout(600);
check('a 7-inch record goes on at 45', near((await parts()).recordScale, 175 / 302, 0.001));

finish(errors);
await browser.close();
