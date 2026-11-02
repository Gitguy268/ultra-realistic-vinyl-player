// Measures the built audio worklet by rendering through it offline: level and
// clipping in both sound modes, frequency response, tone controls, wow and
// flutter depth, and reverse playback. These are signal measurements; they say
// nothing about how it sounds.
// Usage: npm run build && npm run preview, then: node scripts/check-audio.js
import { TONE_BANDS, mixPlan, tonePeakDb, toneResponseDb } from '../src/audio/mix.ts';
import { RIAA_HEADROOM, STYLUS_LEVEL, idealRiaaDb } from '../src/audio/riaa.ts';
import { EQ_BANDS, bandType } from '../src/audio/winamp-eq.ts';
import { BASE_URL, check, finish, openPage } from './lib.js';

// Everything turned up: the worst case the mix plan has to keep under full scale.
const LOUD = {
  equalisation: 'flat',
  noiseLevel: 100,
  bass: 12,
  mid: 12,
  treble: 12,
  graphicEq: { on: true, preamp: 12, bands: EQ_BANDS.map(() => 12), preset: '' },
};
const eqBands = EQ_BANDS.map((frequency, i) => ({ type: bandType(i), frequency }));
const loudPlan = mixPlan(LOUD);

const { browser, page, errors } = await openPage();
await page.goto(BASE_URL);

const measured = await page.evaluate(
  async ({ bands, eqBands, loud, musicGain }) => {
    const SAMPLE_RATE = 48000;
    const sw = await (await fetch('/sw.js')).text();
    const workletUrl = `/${/assets\/vinyl\.worklet-[\w-]+\.js/.exec(sw)[0]}`;
    const noWobble = { wowHz: 0.73, wowDepth: 0, flutterHz: 6.7, flutterDepth: 0 };
    const wobble = { wowHz: 0.73, wowDepth: 0.0012, flutterHz: 6.7, flutterDepth: 0.0005 };
    const MUSIC = 0;
    const STYLUS = 1;

    /**
     * Renders `seconds` through a fresh worklet. `build` connects sources and may
     * call `send` to queue port messages; it may return a function that chains
     * more nodes after the worklet. Rendering is suspended after the first block
     * until the worklet has had time to receive the messages; without that, a
     * short offline render can finish before a message is delivered.
     */
    async function render(seconds, build) {
      const ctx = new OfflineAudioContext(2, SAMPLE_RATE * seconds, SAMPLE_RATE);
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, 'vinyl-processor', {
        numberOfInputs: 2,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      const queued = [];
      const chain = build(ctx, node, (message, transfer = []) => queued.push([message, transfer]));
      (chain ? chain(node) : node).connect(ctx.destination);
      const post = () => {
        for (const [message, transfer] of queued) node.port.postMessage(message, transfer);
      };
      // Firefox has no offline suspend; there, messages posted before the render arrive in time.
      if (typeof ctx.suspend !== 'function') {
        post();
        await new Promise((resolve) => setTimeout(resolve, 50));
        return (await ctx.startRendering()).getChannelData(0);
      }
      const delivered = ctx.suspend(128 / SAMPLE_RATE).then(async () => {
        post();
        await new Promise((resolve) => setTimeout(resolve, 50));
        await ctx.resume();
      });
      const rendered = await ctx.startRendering();
      await delivered;
      return rendered.getChannelData(0);
    }

    function tone(ctx, node, hz, amplitude = 1, input = MUSIC) {
      const oscillator = new OscillatorNode(ctx, { frequency: hz });
      const gain = new GainNode(ctx, { gain: amplitude });
      oscillator.connect(gain).connect(node, 0, input);
      oscillator.start();
    }

    // Statistics over the second half, after the filters and messages have settled.
    function stats(data) {
      let peak = 0;
      let sum = 0;
      const start = Math.floor(data.length / 2);
      for (let i = start; i < data.length; i++) {
        peak = Math.max(peak, Math.abs(data[i]));
        sum += data[i] * data[i];
      }
      return { peak, rms: Math.sqrt(sum / (data.length - start)) };
    }

    const config = (send, equalisation, wowFlutter = noWobble) =>
      send({ type: 'config', equalisation, wowFlutter });

    // 1. Full-scale music in each mode. An ideal square wave is built by hand:
    // Web Audio's 'square' oscillator is band-limited and overshoots ±1.
    const peaks = { flat: {}, warm: {} };
    const square = {};
    for (const mode of ['flat', 'warm']) {
      for (const hz of [20, 30, 50, 100, 1000, 10000]) {
        const data = await render(2, (ctx, node, send) => {
          config(send, mode, wobble);
          tone(ctx, node, hz);
        });
        peaks[mode][hz] = stats(data).peak;
      }
      const data = await render(2, (ctx, node, send) => {
        config(send, mode, wobble);
        const buffer = ctx.createBuffer(1, SAMPLE_RATE * 2, SAMPLE_RATE);
        const samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) {
          samples[i] = Math.floor(i / 1200) % 2 === 0 ? 1 : -1;
        }
        const source = new AudioBufferSourceNode(ctx, { buffer });
        source.connect(node, 0, MUSIC);
        source.start();
      });
      square[mode] = stats(data).peak;
    }

    // 2. Frequency response from quiet tones: music in each mode, and stylus sounds.
    // Gain is a ratio of RMS levels; a sine of amplitude a has an RMS of a/√2.
    const response = { flat: {}, warm: {}, stylus: {} };
    for (const hz of [50, 100, 1000, 5000, 10000]) {
      for (const [key, mode, input] of [
        ['flat', 'flat', MUSIC],
        ['warm', 'warm', MUSIC],
        ['stylus', 'flat', STYLUS],
      ]) {
        const data = await render(2, (ctx, node, send) => {
          config(send, mode);
          tone(ctx, node, hz, 0.05, input);
        });
        response[key][hz] = stats(data).rms / (0.05 * Math.SQRT1_2);
      }
    }

    // 3. Tone controls after the worklet, built from the app's own band settings.
    const toneChain = (gains, trim) => (node) => {
      let last = node.connect(new GainNode(node.context, { gain: trim }));
      for (const key of ['bass', 'mid', 'treble']) {
        const filter = new BiquadFilterNode(node.context, {
          type: bands[key].type,
          frequency: bands[key].frequency,
          Q: bands[key].q,
          gain: gains[key],
        });
        last = last.connect(filter);
      }
      // The Winamp graphic EQ follows, with Web Audio's default Q.
      eqBands.forEach(({ type, frequency }, i) => {
        last = last.connect(
          new BiquadFilterNode(node.context, { type, frequency, gain: gains.graphicEq.bands[i] }),
        );
      });
      return last;
    };
    const toneGain = {};
    let loudPeak = 0;
    for (const hz of [30, 60, 100, 250, 500, 1000, 2000, 4000, 8000, 12000, 16000]) {
      const quiet = await render(2, (ctx, node, send) => {
        config(send, 'flat');
        tone(ctx, node, hz, 0.05);
        return toneChain(loud, 1);
      });
      toneGain[hz] = stats(quiet).rms / (0.05 * Math.SQRT1_2);
      const full = await render(2, (ctx, node) => {
        tone(ctx, node, hz);
        return toneChain(loud, musicGain);
      });
      loudPeak = Math.max(loudPeak, stats(full).peak);
    }

    // 4. Wow and flutter: speed deviation of a 3 kHz tone, from zero crossings.
    async function deviation(wowFlutter) {
      const hz = 3000;
      const data = await render(5, (ctx, node, send) => {
        config(send, 'flat', wowFlutter);
        tone(ctx, node, hz, 0.5);
      });
      const crossings = [];
      for (let i = SAMPLE_RATE; i < data.length - 1; i++) {
        if (data[i] <= 0 && data[i + 1] > 0) {
          crossings.push(i + data[i] / (data[i] - data[i + 1]));
        }
      }
      // Average over 30 cycles (10 ms): long enough to be precise, short next to 6.7 Hz.
      let max = 0;
      for (let k = 0; k + 30 < crossings.length; k++) {
        const frequency = (30 * SAMPLE_RATE) / (crossings[k + 30] - crossings[k]);
        max = Math.max(max, Math.abs(frequency / hz - 1));
      }
      return max;
    }

    // 5. Scratch: the worklet plays a rising ramp itself, at a signed rate.
    async function scratchSlope(rate) {
      const frames = SAMPLE_RATE * 2;
      const data = await render(1, (_ctx, _node, send) => {
        config(send, 'flat');
        const ramp = Float32Array.from({ length: frames }, (_, i) => i / frames);
        send({ type: 'pcm', channels: [ramp] }, [ramp.buffer]);
        send({ type: 'scratch', active: true, position: frames * 0.75, rate });
      });
      // Output change per sample, relative to the ramp's own step, over a steady stretch.
      const from = SAMPLE_RATE * 0.5;
      const to = SAMPLE_RATE * 0.75;
      return ((data[to] - data[from]) / (to - from)) * frames;
    }

    return {
      peaks,
      square,
      response,
      toneGain,
      loudPeak,
      wowOn: await deviation(wobble),
      wowOff: await deviation(noWobble),
      reverse: await scratchSlope(-1),
      halfSpeed: await scratchSlope(0.5),
    };
  },
  { bands: TONE_BANDS, eqBands, loud: LOUD, musicGain: loudPlan.musicGain },
);

const db = (ratio) => 20 * Math.log10(ratio);
const text = (value) => value.toFixed(3);
const spread = (gains, reference = 1) =>
  Math.max(...Object.values(gains).map((gain) => Math.abs(db(gain / reference))));

// Flat: music as recorded, at full level.
check(
  `flat: music passes at unity from 50 Hz to 10 kHz (within ${spread(measured.response.flat).toFixed(3)} dB)`,
  spread(measured.response.flat) < 0.05,
);
const flatPeak = Math.max(...Object.values(measured.peaks.flat));
check(`flat: full-scale sines stay at full scale (peak ${text(flatPeak)})`, flatPeak <= 1.0005);
// The four-point interpolation in the wow and flutter delay overshoots a perfect
// square edge by about 15 %; band-limited music has no such edges.
check(
  `flat: an ideal full-scale square wave overshoots by under 16 % (peak ${text(measured.square.flat)})`,
  measured.square.flat <= 1.16,
);
const stylus = measured.response.stylus;
check(
  `flat: needle sounds come out at the stylus level (${db(stylus[1000]).toFixed(2)} dB)`,
  Math.abs(db(stylus[1000] / STYLUS_LEVEL)) < 0.1,
);
for (const hz of [100, 5000]) {
  const actual = db(stylus[hz] / stylus[1000]);
  check(
    `flat: needle sounds follow the RIAA curve at ${hz} Hz (${actual.toFixed(2)} dB, ideal ${idealRiaaDb(hz).toFixed(2)} dB)`,
    Math.abs(actual - idealRiaaDb(hz)) <= 0.5,
  );
}

// Warm: the playback curve on the music, with headroom.
for (const [hz, peak] of Object.entries(measured.peaks.warm)) {
  check(`warm: full-scale ${hz} Hz sine does not clip (peak ${text(peak)})`, peak <= 1);
}
check(
  `warm: full-scale 20 Hz square wave does not clip (peak ${text(measured.square.warm)})`,
  measured.square.warm <= 1 && measured.square.warm > 0.9,
);
const warm = measured.response.warm;
check(
  `warm: 1 kHz comes out at the headroom gain (${db(warm[1000]).toFixed(2)} dB)`,
  Math.abs(db(warm[1000] / RIAA_HEADROOM)) < 0.1,
);
for (const [hz, tolerance] of [
  [50, 0.5],
  [100, 0.5],
  [5000, 0.5],
  [10000, 1],
]) {
  const actual = db(warm[hz] / warm[1000]);
  check(
    `warm: response at ${hz} Hz follows the RIAA curve (${actual.toFixed(2)} dB, ideal ${idealRiaaDb(hz).toFixed(2)} dB)`,
    Math.abs(actual - idealRiaaDb(hz)) <= tolerance,
  );
}

// Tone controls: the browser's filters against the app's own calculation.
const toneError = Math.max(
  ...Object.entries(measured.toneGain).map(([hz, gain]) =>
    Math.abs(db(gain) - toneResponseDb(Number(hz), LOUD, LOUD.graphicEq)),
  ),
);
check(
  `tone controls and graphic EQ match the calculated response (within ${toneError.toFixed(2)} dB; peak boost ${tonePeakDb(LOUD, LOUD.graphicEq).toFixed(1)} dB)`,
  toneError < 0.2,
);
check(
  `everything turned up still fits under full scale (music ${text(measured.loudPeak)} + noise ${text(loudPlan.noiseGain)})`,
  measured.loudPeak + loudPlan.noiseGain <= 1,
);

const percent = (value) => `${(value * 100).toFixed(3)} %`;
check(
  `wow and flutter stay within the configured 0.17 % (measured ${percent(measured.wowOn)})`,
  measured.wowOn > 0.0008 && measured.wowOn <= 0.0018,
);
check(
  `zero depth gives a steady pitch (measured ${percent(measured.wowOff)})`,
  measured.wowOff < 0.0001,
);
check(
  `scratch at rate -1 plays the audio backward (slope ${text(measured.reverse)})`,
  Math.abs(measured.reverse + 1) < 0.02,
);
check(
  `scratch at rate 0.5 plays forward at half speed (slope ${text(measured.halfSpeed)})`,
  Math.abs(measured.halfSpeed - 0.5) < 0.02,
);

await browser.close();
finish(errors);
