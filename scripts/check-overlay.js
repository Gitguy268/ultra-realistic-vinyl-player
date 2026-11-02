// Plan-layout gate: renders the deck through the camera solved for the overhead photo
// (scripts/overhead-camera.js) and compares named features with where the photo shows them.
// Errors are reported in mm and as a share of the plinth width; each must stay within 2 %.
// Writes docs/reference/overlay.png (photo and render blended) for review.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = new URL('..', import.meta.url).pathname;
const PHOTO = join(homedir(), 'thorens-to-115-mk-ii', 'Thorens TD 115 MKII Turntable Overhead.png');
const { camera, size } = JSON.parse(
  readFileSync(join(root, 'docs/reference/overhead-camera.json'), 'utf8'),
);
const LIMIT = 0.02;
const WIDTH_MM = 445;

const server = await createServer({
  root,
  server: { port: 4184, strictPort: true },
  logLevel: 'error',
});
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: size, height: size } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(
  `http://localhost:4184/view.html?view=photo&open=82&norecord&plates=photo&camera=${encodeURIComponent(JSON.stringify(camera))}&size=${size}`,
);
await page.waitForFunction(() => window.__world?.ready);
const render = join(root, '.scratch', 'overlay-render.png');
await page.screenshot({ path: render });

// Measured in the photo (pixels of the 1254 px original); see docs/REFERENCE.md, Plan measurements.
// Every rendered point is read from a marker or a mesh of the built deck, not from the spec.
const PHOTO_POINTS = {
  plinthRearLeft: [162, 377],
  plinthRearRight: [1090, 377],
  plinthFrontLeft: [94, 1052],
  plinthFrontRight: [1167, 1052],
  spindleBase: [524.5, 640],
  spindleTip: [524.5, 616],
  pivotCap: [927.5, 441.5],
  stylusTip: [972, 893],
  stripRearCentre: [627, 957],
  speedPlateLeftEdge: [178, 1000],
  speedPlateRightEdge: [310, 1000],
  startPlateLeftEdge: [719, 1000],
  startPlateRightEdge: [852, 1000],
  cuePlateLeftEdge: [933, 1000],
  cuePlateRightEdge: [1066, 1000],
  pitchWheelCentre: [378, 1011],
};
// Plate edges and the wheel are measured across the strip only: their row is approximate.
const ACROSS_ONLY = /Plate|pitchWheel/;
const measured = await page.evaluate((points) => {
  const b = window.__world;
  const out = Object.entries(points).map(([name, photo]) => ({
    name,
    at: b.projectMarker(name),
    photo,
    pxPerMm: b.pxPerMm(name),
  }));
  const [left, right] = b.rimExtremes();
  const scale = b.pxPerMm('spindleBase');
  out.push({ name: 'platterRimLeft', at: left, photo: [193, 660], pxPerMm: scale, xOnly: true });
  out.push({ name: 'platterRimRight', at: right, photo: [847, 660], pxPerMm: scale, xOnly: true });
  return out;
}, PHOTO_POINTS);

let failed = 0;
for (const f of measured) {
  const dx = f.at[0] - f.photo[0];
  const dy = f.xOnly ? 0 : f.at[1] - f.photo[1];
  const px = ACROSS_ONLY.test(f.name) ? Math.abs(dx) : Math.hypot(dx, dy);
  const mm = px / f.pxPerMm;
  const share = mm / WIDTH_MM;
  const ok = share <= LIMIT;
  if (!ok) failed++;
  console.log(
    `${ok ? '✓' : '✗'} ${f.name.padEnd(20)} ${mm.toFixed(1).padStart(5)} mm  ${(share * 100).toFixed(2)} %` +
      `   render ${f.at.map((v) => v.toFixed(0))}  photo ${f.photo}`,
  );
}
// The render's edges in red over the photo, at 1000 px.
const edges = join(root, '.scratch', 'overlay-edges.png');
execFileSync('magick', [
  render,
  '-colorspace',
  'Gray',
  '-canny',
  '0x1+5%+15%',
  '-morphology',
  'Dilate',
  'Disk:1',
  '-alpha',
  'copy',
  '-fill',
  'red',
  '-colorize',
  '100',
  edges,
]);
execFileSync('magick', [
  PHOTO,
  edges,
  '-composite',
  '-resize',
  '1000x',
  join(root, 'docs/reference/overlay.png'),
]);
console.log('wrote docs/reference/overlay.png');
if (errors.length) console.log('page errors:', errors);
await browser.close();
await server.close();
process.exit(failed || errors.length ? 1 : 0);
