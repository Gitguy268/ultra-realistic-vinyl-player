// Drives the deck through play, natural end, lever, motor and a tonearm drag.
// The drags aim at the real 3D arm and record through `__deck` (`?debug`): PARITY.md §7.
// Usage: npm run build && npm run preview, then: node scripts/check-deck.js
import { BASE_URL, check, finish, makeWav, openPage, wavFile } from './lib.js';

const { browser, page, errors } = await openPage();
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck);

/** Waits up to 15 s for a toggle button to reach `value`, then records the result. */
async function expectPressed(label, id, value) {
  const reached = await page
    .waitForFunction(
      ([elementId, expected]) =>
        document.getElementById(elementId)?.getAttribute('aria-pressed') === expected,
      [id, value],
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(() => false);
  check(label, reached);
}

await page.setInputFiles('#file', wavFile('Test Tone.wav', 3));
await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Ready'));
check('status reports the loaded file', true);
check('total time shows 0:03', (await page.textContent('#time-total')) === '0:03');

await page.click('#play');
await expectPressed('play drops the needle', 'play', 'true');
await expectPressed('dropping the needle starts the motor', 'motor', 'true');
await expectPressed('natural end lifts the needle', 'play', 'false');
await expectPressed('motor powers off after the arm returns', 'motor', 'false');

await page.click('#play');
await expectPressed('play works again after the side ended', 'play', 'true');
await page.click('#lever');
await expectPressed('cue lever lifts the needle', 'play', 'false');
await expectPressed('cue lever shows as raised', 'lever', 'true');
await page.click('#lever');
await expectPressed('lowering the lever over the grooves drops the needle', 'play', 'true');

// A real deck's motor switch leaves the stylus in the groove: the music winds down (C15).
await page.click('#motor');
await expectPressed('motor button shows off', 'motor', 'false');
check(
  'motor off leaves the needle down',
  (await page.getAttribute('#play', 'aria-pressed')) === 'true',
);
await page.waitForFunction(() => window.__deck.state().wr < 0.05, null, { timeout: 8000 });
check(
  'the platter and the music wind down together',
  (await page.evaluate(() => window.__deck.state().wr)) < 0.05,
);
await page.click('#motor');
await page.click('#lever');
await expectPressed('the cue lever lifts the needle again', 'play', 'false');
await page.click('#lever');
await page.waitForTimeout(300);

const pressed = (id) => page.getAttribute(`#${id}`, 'aria-pressed');
const arm = (rn) => page.evaluate((r) => window.__deck.projectArm(r), rn);
const stylus = () => page.evaluate(() => window.__deck.project('stylusTip'));
const band = await page.evaluate(() => {
  const g = window.__deck.deck.program.geometry;
  return { outer: g.outer, inner: g.inner };
});
// Pause: the stylus lifts and hovers; then take the arm by its headshell.
await page.click('#play');
await page.waitForFunction(
  () => window.__deck.state().arm === 'hover' || window.__deck.state().arm === 'rest',
);
await page.waitForTimeout(400);
await page.mouse.move(...(await stylus()));
await page.mouse.down();
await page.mouse.move(...(await arm(band.outer - 0.3 * (band.outer - band.inner))), { steps: 8 });
await page.mouse.up();
await expectPressed('releasing a drag over the grooves drops the needle', 'play', 'true');

await page.waitForTimeout(1500);
await page.mouse.move(...(await stylus()));
await page.mouse.down();
await page.mouse.move(...(await arm(1.6)), { steps: 8 });
await page.mouse.up();
await expectPressed('releasing a drag off the record lifts the needle', 'play', 'false');

await page.focus('#pitch');
await page.keyboard.press('ArrowRight');
check(
  'pitch slider has readable value text',
  (await page.getAttribute('#pitch', 'aria-valuetext')) === '+0.1 percent',
);

// Scratch: turn the record backward by hand and watch the position go back.
const seconds = async () => {
  const [minutes, rest] = (await page.textContent('#time-current')).split(':').map(Number);
  return minutes * 60 + rest;
};
await page.setInputFiles('#file', wavFile('Long Tone.wav', 30));
await page.waitForFunction(() =>
  document.querySelector('#status')?.textContent?.includes('Ready: Long Tone'),
);
await page.click('#play');
await page.waitForFunction(() => document.querySelector('#time-current')?.textContent === '0:05');
// The hand turns the record anticlockwise (seen from above): backward.
const onRecord = (angle) => page.evaluate((a) => window.__deck.projectRecord(0.6, a), angle);
await page.mouse.move(...(await onRecord(180)));
await page.mouse.down();
for (let step = 1; step <= 60; step++) {
  await page.mouse.move(...(await onRecord(180 - step * 11)));
  await page.waitForTimeout(16);
}
const whileHeld = await seconds();
check(`turning the record backward rewinds the audio (0:05 → ${whileHeld} s)`, whileHeld <= 3);
check('the needle stays down while scratching', (await pressed('play')) === 'true');
await page.mouse.up();
await page.waitForTimeout(2500);
const afterRelease = await seconds();
check(
  `playback runs forward again after release (${whileHeld} s → ${afterRelease} s)`,
  afterRelease >= whileHeld + 1,
);

await page.selectOption('#sound', 'warm');
await page.uncheck('#wow-flutter');
await page.waitForTimeout(300);
await page.selectOption('#sound', 'flat');
await page.fill('#bass', '6');
await page.fill('#treble', '-4');
await page.check('#wow-flutter');
await page.waitForTimeout(300);
check(
  'sound mode, tone and wow/flutter controls change during playback without stopping it',
  (await pressed('play')) === 'true',
);

await page.fill('#seek', '500');
await page.waitForTimeout(300);
const middle = await seconds();
check(`the position slider seeks (now at ${middle} s of 30 s)`, middle >= 14 && middle <= 17);
check(
  'the position slider has readable value text',
  /^0:1\d of 0:30$/.test(await page.getAttribute('#seek', 'aria-valuetext')),
);

await page.fill('#noise', '60');
check(
  'tone sliders have readable value text',
  (await page.getAttribute('#bass', 'aria-valuetext')) === '+6 decibels' &&
    (await page.getAttribute('#treble', 'aria-valuetext')) === 'minus 4 decibels',
);
check(
  'surface noise slider has readable value text',
  (await page.getAttribute('#noise', 'aria-valuetext')) === '60 percent',
);
await page.focus('#wear');
await page.keyboard.press('ArrowRight');
check(
  'wear slider has readable value text',
  (await page.getAttribute('#wear', 'aria-valuetext')) === '25 percent worn',
);

// Mix levels reach the audio graph: a full-scale tone lights the peak lamps, and a
// tone boost must turn the music down far enough to put them out again.
await page.click('#play');
await page.setInputFiles('#file', {
  name: 'Full Scale.wav',
  mimeType: 'audio/wav',
  buffer: makeWav(30, 1000, undefined, 48000, 1),
});
await page.waitForFunction(() =>
  document.querySelector('#status')?.textContent?.includes('Ready: Full Scale'),
);
await page.fill('#volume', '100');
await page.fill('#noise', '0');
await page.fill('#bass', '0');
await page.fill('#treble', '0');
await page.click('#play');
const lampOn = await page
  .waitForSelector('.meter-led.is-on', { state: 'attached', timeout: 5000 })
  .then(
    () => true,
    () => false,
  );
check('a full-scale tone at full volume lights the peak lamps', lampOn);
await page.fill('#bass', '12');
const lampOff = await page
  .waitForFunction(() => !document.querySelector('.meter-led.is-on'), null, { timeout: 5000 })
  .then(
    () => true,
    () => false,
  );
check('a 12 dB tone boost turns the music down enough to put them out', lampOff);

await browser.close();
finish(errors);
