// Saves a screenshot and fails on any console error.
// Usage: node scripts/screenshot.js <out.png> [width] [height] [dark|light] [demo]
// With "demo", a generated record with cover art is loaded and playing.
import { BASE_URL, finish, id3Chunk, makeWav, openPage, patternPng } from './lib.js';

const [out, width = '1240', height = '1000', scheme = 'dark', demo] = process.argv.slice(2);
if (!out) throw new Error('Usage: node scripts/screenshot.js <out.png> [width] [height]');

const { browser, page, errors } = await openPage({
  width: Number(width),
  height: Number(height),
  colorScheme: scheme,
});
await page.goto(BASE_URL);
if (demo === 'demo') {
  // Synthetic sleeve art: a sun over a striped sea.
  const coverPng = patternPng(96, (x, y) => {
    if (Math.hypot(x - 48, y - 40) < 22) return [250, 196, 72];
    if (y > 56) return Math.floor((y - 56) / 5) % 2 === 0 ? [30, 96, 140] : [44, 128, 170];
    return [232, 108, 64];
  });
  const tags = id3Chunk({ title: 'Evening Tide', artist: 'The Test Tones', coverPng });
  await page.setInputFiles('#file', {
    name: 'evening-tide.wav',
    mimeType: 'audio/wav',
    buffer: makeWav(30, 220, tags),
  });
  await page.waitForFunction(() =>
    document.querySelector('#status')?.textContent?.includes('Ready'),
  );
  await page.click('#play');
  await page.waitForTimeout(5000);
}
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
await browser.close();
finish(errors);
