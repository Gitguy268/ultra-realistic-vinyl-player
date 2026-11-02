// Drives the Winamp-style graphic EQ, the four 2D label visualizers and the
// library desktop.
// Usage: npm run build && npm run preview, then: node scripts/check-winamp.js
import { BASE_URL, check, finish, openPage, wavFile } from './lib.js';

const { browser, page, errors } = await openPage();
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck);

const stored = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('realistic-vinyl-player.settings') ?? '{}'));

await page.setInputFiles('#file', [
  wavFile('Alpha - One.wav', 6, 440),
  wavFile('Alpha - Two.wav', 6, 880),
  wavFile('Beta - Three.wav', 6, 220),
]);
await page.waitForFunction(() => document.querySelectorAll('#tracks li').length === 3);

// Graphic EQ.
check(
  'the EQ has a preamp and ten band sliders',
  (await page.locator('#eq-sliders input[type=range]').count()) === 11,
);
check('the EQ starts off', !(await page.isChecked('#eq-on')));
check(
  'Winamp’s 17 presets are listed',
  (await page.locator('#eq-preset optgroup[label=Winamp] option').count()) === 17,
);
await page.selectOption('#eq-preset', { label: 'Rock' });
check('choosing a preset switches the EQ on', await page.isChecked('#eq-on'));
check('the Rock preset sets 60 Hz to +4.6 dB', (await page.inputValue('#eq-60')) === '4.6');
const saved = await stored();
check(
  'the EQ is saved with the settings',
  saved.graphicEq?.on === true && saved.graphicEq?.preset === 'Rock',
);

const header = Buffer.from('Winamp EQ library file v1.1\x1a!--', 'latin1');
const name = Buffer.alloc(257);
name.write('Check Smile', 'latin1');
const eqf = Buffer.concat([header, name, Buffer.from([0, 10, 20, 31, 40, 50, 63, 31, 31, 0, 31])]);
await page.setInputFiles('#eq-file', {
  name: 'smile.eqf',
  mimeType: 'application/octet-stream',
  buffer: eqf,
});
await page.waitForFunction(() =>
  document.querySelector('#status')?.textContent?.includes('loaded'),
);
check('an .eqf file loads its preset', (await page.inputValue('#eq-60')) === '12');
check(
  'the imported preset is listed',
  (await page.locator('#eq-preset optgroup[label=Imported] option').count()) === 1,
);
await page.setInputFiles('#eq-file', {
  name: 'notes.eqf',
  mimeType: 'application/octet-stream',
  buffer: Buffer.from('not an equaliser'),
});
await page.waitForFunction(() =>
  document.querySelector('#status')?.textContent?.includes('not a Winamp'),
);
check('a file that is not .eqf is refused with a message', true);

// The label visualizers, while the needle is down.
await page.click('#play');
await page.waitForFunction(
  () => document.getElementById('play')?.getAttribute('aria-pressed') === 'true',
);
/**
 * A fingerprint and colour count of the label's middle: the 3D record's label texture, or the
 * 2D deck's canvas without WebGL (PARITY.md §7).
 */
const label = () =>
  page.evaluate(() => {
    const canvas = window.__deck.stage?.label.canvas ?? document.getElementById('platter');
    const ctx = canvas.getContext('2d');
    // The 3D label texture is the label alone: sample most of it. The 2D canvas is the whole deck.
    const size = Math.round(canvas.width * (window.__deck.stage ? 0.6 : 0.16));
    const data = ctx.getImageData(
      Math.round(canvas.width / 2 - size / 2),
      Math.round(canvas.height / 2 - size / 2),
      size,
      size,
    ).data;
    const colours = new Set();
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      colours.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      sum = (sum + data[i] * (i + 1) + data[i + 1] * 7 + data[i + 2] * 13) % 1e9;
    }
    return { colours: colours.size, sum };
  });
await page.selectOption('#visualizer', 'off');
await page.waitForTimeout(400);
const printed = await label();
for (const style of ['lines', 'scope', 'spectrogram', 'radial']) {
  await page.selectOption('#visualizer', style);
  await page.waitForTimeout(800);
  const shown = await label();
  check(
    `the ${style} visualizer draws on the label (${shown.colours} colours)`,
    shown.sum !== printed.sum && shown.colours > 4,
  );
}
check('the visualizer choice is saved', (await stored()).visualizer === 'radial');
await page.selectOption('#visualizer', 'off');
await page.click('#play');

// The library desktop.
await page.click('#desktop-toggle');
check('the desktop opens', await page.isVisible('#desktop'));
const artists = await page
  .locator('#desktop .desk-icons .desk-folder .desk-name')
  .allTextContents();
check(`artists are folders (${artists.join(', ')})`, artists.join('|') === 'Alpha|Beta');
await page.dblclick('#desktop .desk-icons .desk-folder >> text=Alpha');
await page.dblclick('#desktop .desk-window .desk-folder >> text=Unknown album');
const files = page.locator('#desktop .desk-window .desk-file');
check('an album window lists its tracks as files', (await files.count()) === 2);
const before = await page.textContent('#status');
await files.filter({ hasText: 'Two' }).dragTo(page.locator('#desktop .desk-deck'));
await page.waitForFunction(
  () => document.getElementById('play')?.getAttribute('aria-pressed') === 'true',
);
check(
  'dragging a file onto the turntable plays it',
  (await page.locator('#tracks .track[aria-current=true] .track-title').textContent()) === 'Two',
);
check(
  'the drag is not taken for a file drop',
  (await page.locator('#tracks li').count()) === 3 && !(await page.isVisible('.drop-overlay')),
);
check(
  'the status line changed only for the new record',
  (await page.textContent('#status')) !== before,
);
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
check(
  'the album and artist windows close with Escape',
  (await page.locator('.desk-window').count()) === 0,
);
await page.keyboard.press('Escape');
check('Escape then closes the desktop', !(await page.isVisible('#desktop')));
check(
  'focus returns to the Desktop button',
  await page.evaluate(() => document.activeElement?.id === 'desktop-toggle'),
);
await page.click('#play');

await browser.close();
finish(errors);
