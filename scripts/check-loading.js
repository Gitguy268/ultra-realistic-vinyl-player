// Loading edge cases: switching tracks faster than they decode, dropping the
// needle during a load, and streaming mode for a file over 150 MiB.
// Usage: npm run build && npm run preview, then: node scripts/check-loading.js
// Writes about 280 MB of generated WAV files to .scratch/ and removes them again.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BASE_URL, check, finish, openPage } from './lib.js';

const RATE = 192000;
const BYTES_PER_SECOND = RATE * 4;
const MIB = 1024 * 1024;

/** A 16-bit stereo WAV at 192 kHz of at least `bytes` bytes: big, but short to play through. */
function largeWav(bytes) {
  const second = Buffer.alloc(BYTES_PER_SECOND);
  for (let i = 0; i < RATE; i++) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / RATE) * 0.5 * 32767);
    second.writeInt16LE(sample, i * 4);
    second.writeInt16LE(sample, i * 4 + 2);
  }
  const seconds = Math.ceil(bytes / BYTES_PER_SECOND);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + seconds * BYTES_PER_SECOND, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(BYTES_PER_SECOND, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(seconds * BYTES_PER_SECOND, 40);
  return Buffer.concat([header, ...Array.from({ length: seconds }, () => second)]);
}

const fixture = fileURLToPath(new URL('../.scratch/loading-fixture/', import.meta.url));
rmSync(fixture, { recursive: true, force: true });
mkdirSync(fixture, { recursive: true });
const raceFiles = ['Race A.wav', 'Race B.wav', 'Race C.wav'].map((name) => `${fixture}${name}`);
for (const path of raceFiles) writeFileSync(path, largeWav(40 * MIB));
const streamFile = `${fixture}Huge Side.wav`;
writeFileSync(streamFile, largeWav(151 * MIB));

const { browser, page, errors } = await openPage();
await page.goto(`${BASE_URL}?debug`);

const pressed = (id) => page.getAttribute(`#${id}`, 'aria-pressed');
const seconds = async (id = 'time-current') => {
  const [minutes, rest] = (await page.textContent(`#${id}`)).split(':').map(Number);
  return minutes * 60 + rest;
};
const waitForStatus = (text, timeout = 60000) =>
  page.waitForFunction(
    (expected) => document.querySelector('#status')?.textContent?.includes(expected),
    text,
    { timeout },
  );
const waitPressed = (id, value, timeout = 20000) =>
  page
    .waitForFunction(
      ([elementId, expected]) =>
        document.getElementById(elementId)?.getAttribute('aria-pressed') === expected,
      [id, value],
      { timeout },
    )
    .then(() => true)
    .catch(() => false);
const currentTitle = () =>
  page.locator('#tracks .track[aria-current="true"] .track-title').textContent();

// --- Switching tracks faster than they decode --------------------------------
await page.setInputFiles('#file', raceFiles);
await page.waitForFunction(() => document.querySelectorAll('#tracks li').length === 3, null, {
  timeout: 60000,
});
await waitForStatus('Ready: Race A');
await page.click('#play');
await page.waitForFunction(() => document.querySelector('#time-current')?.textContent === '0:02');
await page.evaluate(() => {
  const next = document.getElementById('next');
  next.click();
  next.click();
});
await waitForStatus('Ready: Race C');
await page.waitForTimeout(2500);
check('two quick presses of Next land on the third track', (await currentTitle()) === 'Race C');
check('the needle is down again after the switch', (await pressed('play')) === 'true');
const afterSwitch = await seconds();
check(`the third track is actually playing (at ${afterSwitch} s)`, afterSwitch >= 1);
check(
  'the status names the track that is on the platter',
  (await page.textContent('#status')).includes('Race C'),
);

// --- Dropping the needle while a track is still loading -----------------------
await page.click('#play');
await waitPressed('play', 'false');
await page.evaluate(() => {
  document.querySelector('#tracks .track').click();
  document.getElementById('play').click();
});
await waitForStatus('Ready: Race A');
// The first track of a side starts after the cue and the 2 s lead-in groove (H21).
await page.waitForTimeout(5000);
const afterEarlyDrop = await seconds();
check(
  `a needle dropped during loading starts playing once the track is ready (at ${afterEarlyDrop} s)`,
  (await pressed('play')) === 'true' && afterEarlyDrop >= 1,
);
await page.click('#play');
await waitPressed('play', 'false');

// --- A saved track is decoded on the first needle drop, wherever that is ---------
await page.reload();
await waitForStatus('On the platter: Race A');
// Aim at the real 3D arm (PARITY.md §7): from its rest to the middle of the first track's band.
await page.waitForFunction(() => window.__deck);
const target = await page.evaluate(() => {
  const b = window.__deck.deck.program.bands[0];
  return window.__deck.projectArm((b.r0 + b.r1) / 2);
});
await page.mouse.move(...(await page.evaluate(() => window.__deck.project('stylusTip'))));
await page.mouse.down();
await page.mouse.move(...target, { steps: 8 });
await page.mouse.up();
check('the needle drops on a record that is not decoded yet', await waitPressed('play', 'true'));
await waitForStatus('Ready: Race A');
await page.waitForTimeout(1500);
const total40 = await seconds('time-total');
const droppedAt = await seconds();
check(
  `playback starts where the needle was dropped, not at the start (${droppedAt} s of ${total40} s)`,
  droppedAt > total40 * 0.4 && droppedAt < total40 * 0.65,
);
await page.click('#play');
await waitPressed('play', 'false');

// --- Streaming mode ------------------------------------------------------------
await page.setInputFiles('#file', streamFile);
await waitForStatus('streaming mode', 120000);
check('a file over 150 MiB switches to streaming mode with a notice', true);
await page.locator('#tracks .track', { hasText: 'Huge Side' }).waitFor();
const total = await seconds('time-total');
check(`the stream reports its duration (${total} s)`, total > 190 && total < 220);
await page.click('#play');
check('play starts the stream', await waitPressed('play', 'true'));
// The arm was left hovering mid-record, so the stream starts from there, not from zero.
await page.waitForTimeout(1500);
const started = await seconds();
await page.waitForTimeout(2000);
const beforeSeek = await seconds();
check(`stream time advances (${started} s → ${beforeSeek} s)`, beforeSeek > started);
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(400);
const afterSeek = await seconds();
check(
  `seeking works in streaming mode (${beforeSeek} s → ${afterSeek} s)`,
  afterSeek >= beforeSeek + 5 && afterSeek <= beforeSeek + 7,
);

const onRecord = (angle) => page.evaluate((a) => window.__deck.projectRecord(0.6, a), angle);
await page.mouse.move(...(await onRecord(180)));
await page.mouse.down();
await page.mouse.move(...(await onRecord(146)), { steps: 6 });
await page.mouse.up();
check(
  'dragging the record shows the scratching notice instead of scratching',
  (await page.textContent('#status')).includes('Scratching is disabled'),
);
check('the stream keeps playing after the drag', (await pressed('play')) === 'true');
await page.waitForTimeout(1200);
check('and still runs forward', (await seconds()) > afterSeek);

// Drag the tonearm into the locked groove: the end stop lifts it and the motor stops (C5).
const locked = await page.evaluate(() =>
  window.__deck.projectArm(window.__deck.deck.program.geometry.locked),
);
await page.mouse.move(...(await page.evaluate(() => window.__deck.project('stylusTip'))));
await page.mouse.down();
await page.mouse.move(...locked, { steps: 10 });
await page.mouse.up();
check(
  'dropping the needle at the end of a stream ends the side',
  await waitPressed('play', 'false', 10000),
);
check('the motor switches off after the arm returns', await waitPressed('motor', 'false', 10000));
check(
  'the stream did not restart from the beginning',
  (await seconds()) > total - 5 || (await seconds()) === 0,
);

await browser.close();
rmSync(fixture, { recursive: true, force: true });
finish(errors);
