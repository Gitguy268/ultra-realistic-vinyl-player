import { crc32, deflateSync } from 'node:zlib';
import { chromium, firefox, webkit } from 'playwright';

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173/';

/** Which browser the checks run in: chromium (default), msedge, firefox or webkit. */
export const BROWSER = process.env.BROWSER ?? 'chromium';

// Each engine needs its own way of allowing audio to start from scripted clicks.
const LAUNCHERS = {
  // On a Mac, ANGLE over Metal gives headless Chromium the real GPU (the 3D deck renders in
  // milliseconds instead of software rendering's hundreds).
  chromium: () =>
    chromium.launch({
      args: [
        // Without it performance.memory is bucketed and rarely refreshed: a leak would look flat.
        '--enable-precise-memory-info',
        '--autoplay-policy=no-user-gesture-required',
        // No audio device: the audio clock runs on a timer. A closed laptop's speakers would
        // otherwise stall it, and every check that waits for playback with it.
        '--disable-audio-output',
        ...(process.platform === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : []),
      ],
    }),
  msedge: () =>
    chromium.launch({
      channel: 'msedge',
      args: ['--autoplay-policy=no-user-gesture-required'],
    }),
  firefox: () =>
    firefox.launch({
      firefoxUserPrefs: { 'media.autoplay.default': 0, 'media.autoplay.blocking_policy': 0 },
    }),
  webkit: () => webkit.launch(),
};

/** Builds a 16-bit mono WAV of a sine tone, so checks need no audio assets. */
export function makeWav(
  seconds,
  hz = 440,
  extraChunks = Buffer.alloc(0),
  sampleRate = 22050,
  amplitude = 0.5,
) {
  const frames = Math.floor(seconds * sampleRate);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + frames * 2 + extraChunks.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(frames * 2, 40);
  const samples = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i++) {
    const sample = Math.sin((2 * Math.PI * hz * i) / sampleRate) * amplitude;
    samples.writeInt16LE(Math.round(sample * 32767), i * 2);
  }
  return Buffer.concat([header, samples, extraChunks]);
}

export function wavFile(name, seconds, hz) {
  return { name, mimeType: 'audio/wav', buffer: makeWav(seconds, hz) };
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const chunk = Buffer.alloc(body.length + 8);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), body.length + 4);
  return chunk;
}

/** A square RGB PNG whose pixels come from `pixel(x, y)`, used as synthetic cover art. */
export function patternPng(size, pixel) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Array.from({ length: size }, (_, y) =>
    Buffer.from([0, ...Array.from({ length: size }, (_, x) => pixel(x, y)).flat()]),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function solidPng(colour, size = 16) {
  return patternPng(size, () => colour);
}

function id3Frame(id, data) {
  const head = Buffer.alloc(10);
  head.write(id, 0);
  head.writeUInt32BE(data.length, 4);
  return Buffer.concat([head, data]);
}

/** A RIFF "id3 " chunk holding an ID3v2.3 tag with title, artist and optional PNG cover. */
export function id3Chunk({ title, artist, coverPng }) {
  const text = (value) => Buffer.concat([Buffer.from([0]), Buffer.from(value, 'latin1')]);
  const frames = [id3Frame('TIT2', text(title)), id3Frame('TPE1', text(artist))];
  if (coverPng) {
    frames.push(
      id3Frame(
        'APIC',
        Buffer.concat([
          Buffer.from([0]),
          Buffer.from('image/png\0'),
          Buffer.from([3, 0]),
          coverPng,
        ]),
      ),
    );
  }
  const body = Buffer.concat(frames);
  const tag = Buffer.alloc(10);
  tag.write('ID3', 0);
  tag.set([3, 0, 0], 3);
  // ID3 sizes are "syncsafe": four bytes of seven bits each.
  for (let i = 0; i < 4; i++) tag[6 + i] = (body.length >> (7 * (3 - i))) & 0x7f;
  const payload = Buffer.concat([tag, body]);
  const chunk = Buffer.alloc(8);
  chunk.write('id3 ', 0);
  chunk.writeUInt32LE(payload.length, 4);
  return Buffer.concat([chunk, payload, Buffer.alloc(payload.length % 2)]);
}

/**
 * Opens a page and records console errors and uncaught exceptions.
 * Returns `{ browser, context, page, errors }`.
 */
export async function openPage({
  width = 1240,
  height = 1000,
  showTutorial = false,
  ...contextOptions
} = {}) {
  const launch = LAUNCHERS[BROWSER];
  if (!launch) throw new Error(`Unknown BROWSER "${BROWSER}"`);
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width, height }, ...contextOptions });
  if (!showTutorial) {
    // The first-run tutorial has its own check; keep it out of the way elsewhere.
    await context.addInitScript(() =>
      localStorage.setItem('realistic-vinyl-player.coachDone', 'true'),
    );
  }
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`Uncaught ${error.message}`));
  return { browser, context, page, errors };
}

const results = [];

export function check(label, condition) {
  results.push({ label, ok: Boolean(condition) });
  process.stdout.write(`${condition ? 'ok  ' : 'FAIL'} ${label}\n`);
}

/** Prints a summary and sets the exit code. Call once at the end of a script. */
export function finish(errors) {
  check(`no console errors${errors.length ? `: ${errors.join(' | ')}` : ''}`, errors.length === 0);
  const failed = results.filter((result) => !result.ok).length;
  process.stdout.write(`${results.length - failed}/${results.length} checks passed\n`);
  process.exitCode = failed === 0 ? 0 : 1;
}
