export const DEFAULT_NOISE_LEVEL = 25;
export const DEFAULT_WEAR = 0.2;

export const MIN_CLICKS_PER_SECOND = 0.5;
export const MAX_CLICKS_PER_SECOND = 12;

const HISS_AMPLITUDE = 0.05;
const CLICK_DECAY_S = 0.0015;
const CLICK_LENGTH_S = 0.008;

export type Random = () => number;

/** Clamps the "Surface noise" control to 0..100. */
export function clampNoiseLevel(level: number): number {
  return Number.isFinite(level) ? Math.max(0, Math.min(100, level)) : 0;
}

/** Clamps the "Wear" control to 0..1. */
export function clampWear(wear: number): number {
  return Number.isFinite(wear) ? Math.max(0, Math.min(1, wear)) : 0;
}

/** A worn record clicks more often: 0.5 clicks per second when mint, 12 when worn out. */
export function clickRatePerSecond(wear: number): number {
  return MIN_CLICKS_PER_SECOND + clampWear(wear) * (MAX_CLICKS_PER_SECOND - MIN_CLICKS_PER_SECOND);
}

/** Seconds until the next click of a Poisson process with the given rate. */
export function sampleInterArrival(ratePerSecond: number, random: Random): number {
  if (!(ratePerSecond > 0)) throw new RangeError('rate must be positive');
  return -Math.log(1 - random()) / ratePerSecond;
}

/** Click start times in seconds within `durationSec`. */
export function clickTimes(durationSec: number, wear: number, random: Random): number[] {
  const rate = clickRatePerSecond(wear);
  const times: number[] = [];
  for (let t = sampleInterArrival(rate, random); t < durationSec;) {
    times.push(t);
    t += sampleInterArrival(rate, random);
  }
  return times;
}

/** One loopable buffer of hiss plus clicks, peak-limited to ±1. */
export function renderSurfaceNoise(
  frames: number,
  sampleRate: number,
  wear: number,
  random: Random,
): Float32Array {
  const data = new Float32Array(frames);
  for (let i = 0; i < frames; i++) data[i] = (random() * 2 - 1) * HISS_AMPLITUDE;
  const clickFrames = Math.ceil(CLICK_LENGTH_S * sampleRate);
  for (const time of clickTimes(frames / sampleRate, wear, random)) {
    const start = Math.floor(time * sampleRate);
    const amplitude = (0.15 + 0.75 * random()) * (random() < 0.5 ? -1 : 1);
    for (let n = 0; n < clickFrames && start + n < frames; n++) {
      const sample = data[start + n]! + amplitude * Math.exp(-n / (CLICK_DECAY_S * sampleRate));
      data[start + n] = Math.max(-1, Math.min(1, sample));
    }
  }
  return data;
}
