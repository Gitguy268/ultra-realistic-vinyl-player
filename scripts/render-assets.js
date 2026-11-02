// Rasterises the app icons and the Open Graph image from HTML templates.
// The results are committed; rerun only when the artwork changes:
//   node scripts/render-assets.js
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const url = (path) => new URL(path, import.meta.url);
const out = (path) => fileURLToPath(url(`../public/${path}`));

const jobs = [
  { template: 'icon-template.html#0.92', file: 'icons/icon-192.png', width: 192, height: 192 },
  { template: 'icon-template.html#0.92', file: 'icons/icon-512.png', width: 512, height: 512 },
  // Maskable icons may be cropped to a circle: keep the record inside the safe zone.
  { template: 'icon-template.html#0.62', file: 'icons/maskable-512.png', width: 512, height: 512 },
  { template: 'og-template.html', file: 'og.png', width: 1200, height: 630 },
];

const browser = await chromium.launch();
for (const { template, file, width, height } of jobs) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(url(template).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out(file) });
  await page.close();
  process.stdout.write(`wrote public/${file} (${width}×${height})\n`);
}
await browser.close();
