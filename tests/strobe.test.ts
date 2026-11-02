import { describe, expect, it } from 'vitest';
import {
  strobeAngularVelocity,
  strobeApparentAngularVelocity,
  strobeDotCount,
  strobeDriftDotsPerSecond,
} from '../src/turntable/strobe';

const LP = 100 / 3 / 60;
const SINGLE = 45 / 60;

describe('strobeDotCount', () => {
  it('gives 108 dots for 33⅓ rpm at 60 Hz', () => {
    expect(strobeDotCount(LP, 60)).toBe(108);
  });

  it('gives 90 dots for 33⅓ rpm at 50 Hz', () => {
    expect(strobeDotCount(LP, 50)).toBe(90);
  });

  it('gives 67 dots for 45 rpm at 50 Hz', () => {
    expect(strobeDotCount(SINGLE, 50)).toBe(67);
  });

  it('rejects non-positive inputs', () => {
    expect(() => strobeDotCount(0, 60)).toThrow(RangeError);
    expect(() => strobeDotCount(LP, Number.NaN)).toThrow(RangeError);
  });
});

describe('strobeDriftDotsPerSecond', () => {
  it('is zero at exact speed for 33⅓ rpm at 60 Hz', () => {
    expect(strobeDriftDotsPerSecond(LP, LP, 60)).toBeCloseTo(0, 10);
  });

  it('is +0.6 dots/s when 1 % fast', () => {
    expect(strobeDriftDotsPerSecond(LP * 1.01, LP, 60)).toBeCloseTo(0.6, 10);
  });

  it('is -0.6 dots/s when 1 % slow', () => {
    expect(strobeDriftDotsPerSecond(LP * 0.99, LP, 60)).toBeCloseTo(-0.6, 10);
  });

  it('freezes 45 rpm at 50 Hz at 50/67 rev/s rather than nominal', () => {
    expect(strobeDriftDotsPerSecond(50 / 67, SINGLE, 50)).toBeCloseTo(0, 10);
    expect(strobeDriftDotsPerSecond(SINGLE, SINGLE, 50)).toBeCloseTo(0.25, 10);
  });

  it.each([
    [LP, 60],
    [LP, 50],
    [SINGLE, 60],
    [SINGLE, 50],
    [78 / 60, 60],
    [78 / 60, 50],
  ])('stays within ±0.5 dots per flash near nominal (%f rev/s, %i Hz)', (reference, mains) => {
    for (let pitch = -0.08; pitch <= 0.08; pitch += 0.005) {
      const perFlash = strobeDriftDotsPerSecond(reference * (1 + pitch), reference, mains) / mains;
      expect(Math.abs(perFlash)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe('strobeAngularVelocity', () => {
  it('is zero at exact speed', () => {
    expect(strobeAngularVelocity(LP, LP, 60)).toBeCloseTo(0, 10);
  });

  it('converts drift to radians per second', () => {
    expect(strobeAngularVelocity(LP * 1.01, LP, 60)).toBeCloseTo((0.6 * 2 * Math.PI) / 108, 10);
  });

  it('has the sign of the speed error', () => {
    expect(strobeAngularVelocity(LP * 1.02, LP, 60)).toBeGreaterThan(0);
    expect(strobeAngularVelocity(LP * 0.98, LP, 60)).toBeLessThan(0);
  });
});

describe('strobeApparentAngularVelocity', () => {
  it('is zero for a stopped platter', () => {
    expect(strobeApparentAngularVelocity(0, LP, 60)).toBe(0);
  });

  it('matches the drift formula near the reference speed', () => {
    for (const factor of [0.97, 0.995, 1, 1.004, 1.03]) {
      expect(strobeApparentAngularVelocity(LP * factor, LP, 60)).toBeCloseTo(
        strobeAngularVelocity(LP * factor, LP, 60),
        10,
      );
    }
  });

  it('never exceeds half a dot per flash', () => {
    const limit = (0.5 * 60 * 2 * Math.PI) / 108;
    for (let rev = 0; rev <= 1.5; rev += 0.013) {
      expect(Math.abs(strobeApparentAngularVelocity(rev, LP, 60))).toBeLessThanOrEqual(
        limit + 1e-9,
      );
    }
  });
});
