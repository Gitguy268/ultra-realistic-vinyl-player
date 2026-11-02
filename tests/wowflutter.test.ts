import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WOW_FLUTTER,
  MAX_DEPTH,
  NO_WOW_FLUTTER,
  playbackRateMultiplier,
  validateWowFlutter,
} from '../src/audio/wowflutter';

describe('wow and flutter defaults', () => {
  it('uses 0.73 Hz wow and 6.7 Hz flutter', () => {
    expect(DEFAULT_WOW_FLUTTER).toEqual({
      wowHz: 0.73,
      wowDepth: 0.0012,
      flutterHz: 6.7,
      flutterDepth: 0.0005,
    });
  });
});

describe('playbackRateMultiplier', () => {
  it('is exactly 1 with zero depth', () => {
    for (let t = 0; t < 10; t += 0.137) {
      expect(playbackRateMultiplier(t, NO_WOW_FLUTTER)).toBe(1);
    }
  });

  it('is 1 at time zero', () => {
    expect(playbackRateMultiplier(0, DEFAULT_WOW_FLUTTER)).toBe(1);
  });

  it('stays within the summed depths', () => {
    const bound = DEFAULT_WOW_FLUTTER.wowDepth + DEFAULT_WOW_FLUTTER.flutterDepth;
    let maxDeviation = 0;
    for (let t = 0; t < 120; t += 0.001) {
      maxDeviation = Math.max(
        maxDeviation,
        Math.abs(playbackRateMultiplier(t, DEFAULT_WOW_FLUTTER) - 1),
      );
    }
    expect(maxDeviation).toBeLessThanOrEqual(bound + 1e-12);
    expect(maxDeviation).toBeGreaterThan(bound * 0.5);
  });

  it('is continuous between adjacent samples', () => {
    const dt = 1 / 48000;
    // Slope bound: sum of depth * 2π f * (0.7 + 0.3·√2) per second.
    const slope =
      2 *
      Math.PI *
      (0.7 + 0.3 * Math.SQRT2) *
      (DEFAULT_WOW_FLUTTER.wowDepth * DEFAULT_WOW_FLUTTER.wowHz +
        DEFAULT_WOW_FLUTTER.flutterDepth * DEFAULT_WOW_FLUTTER.flutterHz);
    for (let n = 0; n < 48000; n++) {
      const a = playbackRateMultiplier(n * dt, DEFAULT_WOW_FLUTTER);
      const b = playbackRateMultiplier((n + 1) * dt, DEFAULT_WOW_FLUTTER);
      expect(Math.abs(b - a)).toBeLessThanOrEqual(slope * dt + 1e-12);
    }
  });

  it('does not repeat after one wow period', () => {
    const period = 1 / DEFAULT_WOW_FLUTTER.wowHz;
    const params = { ...DEFAULT_WOW_FLUTTER, flutterDepth: 0 };
    const a = playbackRateMultiplier(0.2, params);
    const b = playbackRateMultiplier(0.2 + period, params);
    expect(Math.abs(a - b)).toBeGreaterThan(1e-6);
  });
});

describe('validateWowFlutter', () => {
  it('returns valid parameters unchanged', () => {
    expect(validateWowFlutter(DEFAULT_WOW_FLUTTER)).toBe(DEFAULT_WOW_FLUTTER);
  });

  it.each([
    ['negative depth', { wowDepth: -0.001 }],
    ['excessive depth', { flutterDepth: MAX_DEPTH + 0.001 }],
    ['zero frequency', { wowHz: 0 }],
    ['NaN frequency', { flutterHz: Number.NaN }],
    ['infinite depth', { wowDepth: Number.POSITIVE_INFINITY }],
  ])('rejects %s', (_label, patch) => {
    expect(() => validateWowFlutter({ ...DEFAULT_WOW_FLUTTER, ...patch })).toThrow(RangeError);
  });
});
