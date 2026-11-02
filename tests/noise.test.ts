import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOISE_LEVEL,
  MAX_CLICKS_PER_SECOND,
  MIN_CLICKS_PER_SECOND,
  clampNoiseLevel,
  clampWear,
  clickRatePerSecond,
  clickTimes,
  renderSurfaceNoise,
  sampleInterArrival,
} from '../src/audio/noise';
import { seededRandom } from './helpers';

describe('clamping', () => {
  it('defaults the noise level to 25', () => {
    expect(DEFAULT_NOISE_LEVEL).toBe(25);
  });

  it('clamps the noise level to 0..100', () => {
    expect(clampNoiseLevel(-5)).toBe(0);
    expect(clampNoiseLevel(40)).toBe(40);
    expect(clampNoiseLevel(250)).toBe(100);
    expect(clampNoiseLevel(Number.NaN)).toBe(0);
  });

  it('clamps wear to 0..1', () => {
    expect(clampWear(-1)).toBe(0);
    expect(clampWear(0.3)).toBe(0.3);
    expect(clampWear(7)).toBe(1);
    expect(clampWear(Number.NaN)).toBe(0);
  });
});

describe('clickRatePerSecond', () => {
  it('runs from the minimum at no wear to the maximum at full wear', () => {
    expect(clickRatePerSecond(0)).toBe(MIN_CLICKS_PER_SECOND);
    expect(clickRatePerSecond(1)).toBe(MAX_CLICKS_PER_SECOND);
  });

  it('rises monotonically with wear', () => {
    let previous = 0;
    for (let wear = 0; wear <= 1; wear += 0.1) {
      expect(clickRatePerSecond(wear)).toBeGreaterThan(previous);
      previous = clickRatePerSecond(wear);
    }
  });

  it('clamps out-of-range wear', () => {
    expect(clickRatePerSecond(-3)).toBe(MIN_CLICKS_PER_SECOND);
    expect(clickRatePerSecond(3)).toBe(MAX_CLICKS_PER_SECOND);
  });
});

describe('sampleInterArrival', () => {
  it.each([0.5, 4, 12])('averages 1/rate for %f clicks per second', (rate) => {
    const random = seededRandom(42);
    let sum = 0;
    const n = 50000;
    for (let i = 0; i < n; i++) sum += sampleInterArrival(rate, random);
    expect((sum / n) * rate).toBeCloseTo(1, 1);
  });

  it('is always positive and finite', () => {
    const random = seededRandom(7);
    for (let i = 0; i < 10000; i++) {
      const gap = sampleInterArrival(3, random);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(gap)).toBe(true);
    }
  });

  it('rejects a non-positive rate', () => {
    expect(() => sampleInterArrival(0, Math.random)).toThrow(RangeError);
  });
});

describe('clickTimes', () => {
  it('produces about rate × duration clicks, in order, inside the duration', () => {
    const times = clickTimes(600, 0.5, seededRandom(3));
    const expected = clickRatePerSecond(0.5) * 600;
    expect(Math.abs(times.length - expected) / expected).toBeLessThan(0.05);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]!);
    expect(times.at(-1)).toBeLessThan(600);
  });
});

describe('renderSurfaceNoise', () => {
  it('fills the buffer with bounded samples', () => {
    const data = renderSurfaceNoise(48000, 48000, 1, seededRandom(1));
    expect(data).toHaveLength(48000);
    let peak = 0;
    for (const sample of data) peak = Math.max(peak, Math.abs(sample));
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.1);
  });

  it('has more loud samples on a worn record', () => {
    const loud = (wear: number): number =>
      renderSurfaceNoise(96000, 48000, wear, seededRandom(9)).filter((s) => Math.abs(s) > 0.1)
        .length;
    expect(loud(1)).toBeGreaterThan(loud(0) * 3);
  });
});
