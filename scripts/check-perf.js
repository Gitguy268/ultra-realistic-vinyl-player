// Frame time, draw calls and memory of the 3D scene with the platter turning, at the two sizes
// the brief names: 1440 × 900 at DPR 1 and 390 × 844 at DPR 2. Uses Playwright's Chromium with
// a real GPU on this Mac (Metal through ANGLE). Targets: median ≤ 16.7 ms at 1440 × 900,
// ≤ 33.3 ms at 390 × 844 DPR 2; scene draw calls < 150; triangles < 350k; textures < 100 MB.
// `PERF_URL` points at a running dev server or preview (default http://localhost:4185/).
import { chromium } from 'playwright';

const BASE = process.env.PERF_URL ?? 'http://localhost:4185/';
const SECONDS = Number(process.env.PERF_SECONDS ?? 6);
const cases = [
  // Limits allow half a millisecond of vsync jitter: a 60 Hz display reports 16.6–17.0 ms frames.
  {
    name: '1440×900 DPR 1',
    width: 1440,
    height: 900,
    dpr: 1,
    view: 'hero',
    limitMs: 1000 / 60 + 0.5,
  },
  {
    name: '390×844 DPR 2',
    width: 390,
    height: 844,
    dpr: 2,
    view: 'mobile',
    limitMs: 1000 / 30 + 0.5,
  },
];
// With PERF_UNTHROTTLED=1 vsync is off, and the frame times show the real cost and the headroom.

const browser = await chromium.launch({
  args: [
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--enable-gpu',
    ...(process.env.PERF_UNTHROTTLED ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
  ],
});
let failed = 0;
for (const c of cases) {
  const page = await browser.newPage({
    viewport: { width: c.width, height: c.height },
    deviceScaleFactor: c.dpr,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 160)));
  await page.goto(`${BASE}view.html?view=${c.view}&open=78&animate`);
  await page.waitForFunction(() => window.__world?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(1500); // warm-up frames
  await page.evaluate(() => (window.__world.frames.length = 0));
  await page.waitForTimeout(SECONDS * 1000);
  const r = await page.evaluate(() => {
    const f = [...window.__world.frames].sort((a, b) => a - b);
    const at = (q) => f[Math.min(f.length - 1, Math.floor(f.length * q))];
    return { n: f.length, median: at(0.5), p95: at(0.95), stats: window.__world.stats() };
  });
  const ok =
    r.median <= c.limitMs &&
    r.stats.calls.scene < 150 &&
    r.stats.triangles < 350000 &&
    r.stats.textureMB < 100 &&
    !errors.length;
  if (!ok) failed++;
  console.log(
    `${ok ? '✓' : '✗'} ${c.name}: median ${r.median.toFixed(1)} ms, p95 ${r.p95.toFixed(1)} ms over ${r.n} frames; ` +
      `calls scene ${r.stats.calls.scene} + post ${r.stats.calls.post} (shadow ${r.stats.calls.shadow}); ` +
      `${r.stats.triangles} triangles; textures ${r.stats.textureMB} MB, render targets ${r.stats.targetMB} MB` +
      (errors.length ? `; errors: ${errors.slice(0, 3).join(' | ')}` : ''),
  );
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
