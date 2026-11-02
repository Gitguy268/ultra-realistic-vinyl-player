// Imports real audio files in several formats, checks their tags, and plays each.
// A format the browser cannot decode must fail cleanly with a message.
// Usage: npm run build && npm run preview, then: node scripts/check-formats.js
// Set BROWSER=msedge, firefox or webkit to try another engine.
import { readFileSync } from 'node:fs';
import { BASE_URL, BROWSER, check, finish, id3Chunk, makeWav, openPage, solidPng } from './lib.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

/**
 * A real MPEG-1 Layer III file: an ID3v2 tag followed by silent frames. A frame
 * whose side information is all zero is valid and decodes to silence, so no
 * encoder is needed.
 */
function silentMp3(seconds, tags) {
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  const frames = Math.ceil((seconds * 44100) / 1152);
  // id3Chunk wraps the tag in an 8-byte RIFF chunk header; an MP3 wants the bare tag.
  return Buffer.concat([
    id3Chunk(tags).subarray(8),
    ...Array.from({ length: frames }, () => frame),
  ]);
}

// Formats every current browser engine decodes, and those only some do.
const FILES = [
  { name: 'Wave Band - Wave Song.wav', title: 'Wave Song', artist: 'Wave Band', everywhere: true },
  { name: 'tone.flac', title: 'tone', artist: '', everywhere: true },
  { name: 'tagged.mp3', title: 'Tagged Mp3', artist: 'Id3 Artist', everywhere: true },
  { name: 'tone.m4a', title: 'tone', artist: '', everywhere: false },
  { name: 'tone.aiff', title: 'tone', artist: '', everywhere: false },
];
const BUFFERS = {
  'Wave Band - Wave Song.wav': makeWav(1.5, 330),
  'tone.flac': fixture('tone.flac'),
  'tagged.mp3': silentMp3(2, {
    title: 'Tagged Mp3',
    artist: 'Id3 Artist',
    coverPng: solidPng([64, 200, 240]),
  }),
  'tone.m4a': fixture('tone.m4a'),
  'tone.aiff': fixture('tone.aiff'),
};

const { browser, page, errors } = await openPage();
await page.goto(`${BASE_URL}?debug`);
await page.setInputFiles(
  '#file',
  FILES.map(({ name }) => ({ name, mimeType: '', buffer: BUFFERS[name] })),
);
await page.waitForFunction(
  (count) => document.querySelectorAll('#tracks li').length === count,
  FILES.length,
);
check(`all ${FILES.length} files import by extension alone (${BROWSER})`, true);

const rows = page.locator('#tracks li');
const played = [];
for (const [index, file] of FILES.entries()) {
  const row = rows.nth(index);
  const title = await row.locator('.track-title').textContent();
  const meta = await row.locator('.track-meta').textContent();
  check(
    `${file.name}: title "${title}"${file.artist ? ` and artist "${file.artist}"` : ''}`,
    title === file.title && meta.startsWith(file.artist),
  );
  await row.locator('.track').click();
  const outcome = await page
    .waitForFunction(
      () => /^(Ready: |Can't play )/.test(document.querySelector('#status')?.textContent ?? ''),
      null,
      { timeout: 15000 },
    )
    .then(() => page.textContent('#status'));
  if (outcome.startsWith("Can't play")) {
    check(`${file.name}: not decodable here, reported cleanly`, !file.everywhere);
    continue;
  }
  // With the lever down a click on the row has already started it (C26).
  const started = await page
    .waitForFunction(
      () => document.querySelector('#play')?.getAttribute('aria-pressed') === 'true',
      null,
      {
        timeout: 1000,
      },
    )
    .then(
      () => true,
      () => false,
    );
  if (!started) await page.click('#play');
  const advanced = await page
    .waitForFunction(() => document.querySelector('#time-current')?.textContent !== '0:00', null, {
      timeout: 8000,
    })
    .then(
      () => true,
      () => false,
    );
  check(`${file.name}: decodes and plays`, advanced);
  played.push(file.name);
  if ((await page.getAttribute('#play', 'aria-pressed')) === 'true') await page.click('#play');
  await page.waitForFunction(
    () => document.querySelector('#play')?.getAttribute('aria-pressed') === 'false',
  );
}
const accent = await page.evaluate(async () => {
  document.querySelectorAll('#tracks .track')[2].click();
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return document.documentElement.style.getPropertyValue('--cover-accent');
});
check(
  `cover art embedded in the MP3's ID3 tag is read (accent ${accent || 'unset'})`,
  accent === '#40c8f0',
);

process.stdout.write(`${BROWSER} played: ${played.join(', ')}\n`);
await browser.close();
// Chromium without proprietary codecs logs a decode error for AAC; that is the clean failure.
finish(errors.filter((message) => !/decod|EncodingError|Unable to decode/i.test(message)));
