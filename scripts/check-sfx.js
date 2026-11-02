// What the deck adds to the music: mechanism sounds and their Effects gate, Scratch off, the cut-
// record chain, the background route, measured groove levels, and scratches that tick as the
// drawn mark passes the stylus.
// Usage: npm run build && npm run preview, then: node scripts/check-sfx.js
import { BASE_URL, check, finish, openPage, wavFile } from './lib.js';

const { browser, page, errors } = await openPage({ width: 1440, height: 900 });
await page.addInitScript(() => sessionStorage.setItem('ultra-vinyl.intro-seen', '1'));
await page.goto(`${BASE_URL}?debug`);
await page.waitForFunction(() => window.__deck);
await page.setInputFiles('#file', wavFile('Silence.wav', 120, 0));
await page.waitForFunction(() => document.querySelector('#status')?.textContent?.includes('Ready'));
await page.click('#motor');
await page.waitForFunction(() => window.__deck.deck.engine.graph);
await page.evaluate(() => {
  const { deck } = window.__deck;
  window.heard = [];
  deck.events.on('mechanism', (sound) => window.heard.push(sound));
  const { ctx, mechanism } = deck.engine.graph;
  window.mech = ctx.createAnalyser();
  window.mech.fftSize = 2048;
  mechanism.connect(window.mech);
});
/** Loudest sample on the mechanism bus while `act` runs. */
const peakDuring = (act) =>
  page.evaluate(async (source) => {
    const data = new Float32Array(2048);
    let peak = 0;
    const timer = setInterval(() => {
      window.mech.getFloatTimeDomainData(data);
      for (const v of data) peak = Math.max(peak, Math.abs(v));
    }, 10);
    new Function(source)();
    await new Promise((r) => setTimeout(r, 350));
    clearInterval(timer);
    return peak;
  }, act);

// Mechanism sounds.
const SOUNDS = ['detent', 'interlock', 'lift', 'lower', 'thump', 'motor-on', 'motor-off'];
for (const s of [...SOUNDS, 'hinge-open', 'hinge-close', 'place', 'whoosh-on', 'whoosh-off']) {
  const peak = await peakDuring(`window.__deck.deck.events.emit('mechanism', '${s}')`);
  check(`${s} sounds (peak ${peak.toFixed(3)})`, peak > 0.002);
}
const seen = async (act) => {
  await page.evaluate(() => (window.heard.length = 0));
  await act();
  await page.waitForTimeout(250);
  return page.evaluate(() => [...window.heard]);
};
check(
  'the motor plate makes the motor sound',
  (await seen(() => page.click('#motor'))).includes('motor-off'),
);
check('…and starts it again', (await seen(() => page.click('#motor'))).includes('motor-on'));

// Effects gates them all; the volume scales them.
await page.click('#deck-settings > summary');
await page.uncheck('#effects');
const gated = await peakDuring(`window.__deck.deck.events.emit('mechanism', 'thump')`);
check(`Effects off: silence (peak ${gated.toFixed(4)})`, gated === 0);
await page.check('#effects');
const scaled = await page.evaluate(() => {
  const { deck } = window.__deck;
  deck.engine.setVolume(0.2);
  const level = deck.engine.graph.mechanism.gain.value;
  deck.engine.setVolume(0.8);
  return level;
});
check('mechanism sounds follow the volume', Math.abs(scaled - 0.2) < 1e-6);

// The cut chain: bass is folded to mono, Record character bypasses it.
const stereoOf = (hz) =>
  page.evaluate(async (hz) => {
    const { ctx, trim, gain } = window.__deck.deck.engine.graph;
    const osc = ctx.createOscillator();
    osc.frequency.value = hz;
    const level = ctx.createGain();
    level.gain.value = 0.25;
    const left = ctx.createChannelMerger(2);
    osc.connect(level).connect(left, 0, 0);
    left.connect(trim);
    const split = ctx.createChannelSplitter(2);
    gain.connect(split);
    const sides = [0, 1].map((c) => {
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      split.connect(a, c);
      return a;
    });
    osc.start();
    await new Promise((r) => setTimeout(r, 400));
    const out = sides.map((a) => {
      const data = new Float32Array(2048);
      a.getFloatTimeDomainData(data);
      return Math.max(...data.map(Math.abs));
    });
    osc.stop();
    left.disconnect();
    gain.disconnect(split);
    return out;
  }, hz);
const low = await stereoOf(50);
check(
  `50 Hz in one channel comes out in both (${low.map((v) => v.toFixed(3))})`,
  low[1] > low[0] * 0.7,
);
const high = await stereoOf(3000);
check(
  `3 kHz stays mostly in its channel (${high.map((v) => v.toFixed(3))})`,
  high[1] < high[0] * 0.2,
);
await page.uncheck('#record-character');
await page.waitForTimeout(200);
const flat = await stereoOf(50);
check(
  `Record character off: untouched (${flat.map((v) => v.toFixed(3))})`,
  flat[1] < flat[0] * 0.02,
);
await page.check('#record-character');

// The background route.
const route = () => page.evaluate(() => window.__deck.deck.engine.currentRoute);
check('sound goes to the speakers by default', (await route()) === 'speakers');
await page.check('#background');
await page.waitForTimeout(200);
check('screen-locked playback routes through the sink', (await route()) === 'sink');
await page.uncheck('#background');
check('…and back', (await route()) === 'speakers');

// Measured levels are kept with the track.
check(
  'the decoded track has measured loudness slices',
  await page.evaluate(() => window.__deck.deck.levelAt(0, 0.5) !== undefined),
);

// Scratches tick when the drawn mark passes the stylus. The track is silent, so whatever leaves
// the worklet is the surface; pops are turned off so only scratches sound.
await page.selectOption('#condition', 'beat');
await page.evaluate(() => {
  const { deck } = window.__deck;
  deck.engine.setSurface({ pops: 0 });
});
await page.click('#play');
await page.waitForFunction(() => window.__deck.deck.groove.contact, null, { timeout: 8000 });
const tested = await page.evaluate(async () => {
  const { deck } = window.__deck;
  const defects = deck.wearMap.defects;
  // Ride to the middle of the widest scratch.
  const d = [...defects].sort((a, b) => b.r0 - b.r1 - (a.r0 - a.r1))[0];
  let lo = 0;
  let hi = deck.duration;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    deck.seek(t);
    await new Promise((r) => setTimeout(r, 40));
    if (deck.groove.stylusR() > d.m) lo = t;
    else hi = t;
  }
  const { ctx, worklet } = deck.engine.graph;
  const tap = ctx.createAnalyser();
  tap.fftSize = 512;
  worklet.connect(tap);
  const data = new Float32Array(512);
  const hits = [];
  const end = performance.now() + 8000;
  let quietSince = 0;
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      tap.getFloatTimeDomainData(data);
      const peak = Math.max(...data.map(Math.abs));
      const now = performance.now();
      if (peak > 1e-4 && now - quietSince > 200) {
        const r = deck.groove.stylusR();
        const phi = deck.tickPhi();
        // Clockwise distance from the stylus to the nearest scratch at this radius, on the drawn record.
        const off = defects
          .filter((x) => r <= x.r0 && r >= x.r1)
          .map((x) => {
            const a = ((((deck.spin.angR + x.a + x.s * (r - x.m) - phi) % 360) + 540) % 360) - 180;
            return Math.abs(a);
          });
        hits.push(off.length ? Math.min(...off) : 999);
      }
      if (peak > 1e-4) quietSince = now;
      if (now > end) {
        clearInterval(timer);
        resolve();
      }
    }, 5);
  });
  worklet.disconnect(tap);
  return {
    hits,
    drift: Math.abs(((((deck.engine.heardAngle() - deck.spin.angR) % 360) + 540) % 360) - 180),
  };
});
check(
  `the drawn record is locked to the heard angle (${tested.drift.toFixed(2)}°)`,
  tested.drift < 4,
);
check(`scratches tick as the record turns (${tested.hits.length} ticks)`, tested.hits.length >= 2);
const worst = Math.max(...tested.hits);
check(`each tick falls under a drawn mark at the stylus (worst ${worst.toFixed(1)}°)`, worst < 25);

// Scratch off: the hand mutes the music.
await page.evaluate(() => {
  const { deck } = window.__deck;
  deck.options.scratch = false;
  deck.beginScratch(0);
});
await page.waitForTimeout(100);
check(
  'Scratch off: a hand on the record mutes the music',
  (await page.evaluate(() => window.__deck.deck.engine.graph.scrub.gain.value)) < 0.05,
);
await page.evaluate(() => window.__deck.deck.endScratch());
await page.waitForTimeout(100);
check(
  '…and letting go brings it back',
  (await page.evaluate(() => window.__deck.deck.engine.graph.scrub.gain.value)) > 0.9,
);

// Condition: worse keeps the damage it had; mint is quiet.
const prefix = await page.evaluate(() => {
  const { deck } = window.__deck;
  deck.setCondition('good');
  const good = deck.wearMap.defects.map((d) => d.a);
  deck.setCondition('worn');
  const worn = deck.wearMap.defects.map((d) => d.a);
  return { good, worn };
});
check(
  `a more worn record keeps the same scratches (${prefix.good.length} → ${prefix.worn.length})`,
  prefix.worn.length > prefix.good.length && prefix.good.every((a, i) => a === prefix.worn[i]),
);
await page.selectOption('#condition', 'mint');
// Mint's wear is 0.04; the App's slider moves in steps of 0.05.
check('Condition sets the wear slider', (await page.inputValue('#wear')) === '0.05');

finish(errors);
await browser.close();
