import { describe, expect, it } from 'vitest';
import {
  NeedleBallistics,
  PEAK_HOLD_S,
  PeakLatch,
  VU_SETTLE_S,
  levelToDeflection,
  measure,
} from '../src/ui/vu';

describe('NeedleBallistics', () => {
  it.each([1 / 240, 1 / 60, 1 / 20])('reaches 99 percent of a step within 300 ms (dt %f)', (dt) => {
    const needle = new NeedleBallistics();
    let steps = 0;
    while (needle.step(1, dt) < 0.99 && steps < 1000) steps++;
    const reachedAt = (steps + 1) * dt;
    // The crossing is only observed on a step boundary, so allow one step of slack.
    expect(reachedAt).toBeLessThanOrEqual(VU_SETTLE_S + dt * 1.001);
    expect(reachedAt).toBeGreaterThan(VU_SETTLE_S * 0.8);
  });

  it('never overshoots (critically damped)', () => {
    const needle = new NeedleBallistics();
    let previous = 0;
    for (let i = 0; i < 600; i++) {
      const value = needle.step(1, 1 / 120);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
  });

  it('gives the same result however the time is sliced', () => {
    const coarse = new NeedleBallistics();
    const fine = new NeedleBallistics();
    coarse.step(1, 0.1);
    for (let i = 0; i < 100; i++) fine.step(1, 0.001);
    expect(fine.value).toBeCloseTo(coarse.value, 9);
  });

  it('falls back when the target drops', () => {
    const needle = new NeedleBallistics();
    for (let i = 0; i < 120; i++) needle.step(1, 1 / 60);
    for (let i = 0; i < 120; i++) needle.step(0, 1 / 60);
    expect(needle.value).toBeLessThan(0.001);
    expect(needle.value).toBeGreaterThanOrEqual(0);
  });

  it('ignores a zero or negative dt', () => {
    const needle = new NeedleBallistics();
    expect(needle.step(1, 0)).toBe(0);
    expect(needle.step(1, -1)).toBe(0);
  });
});

describe('levelToDeflection', () => {
  it('is 0 for silence and clamps at 1', () => {
    expect(levelToDeflection(0)).toBe(0);
    expect(levelToDeflection(-1)).toBe(0);
    expect(levelToDeflection(10)).toBe(1);
  });

  it('puts 0 VU at 20/23 of the scale', () => {
    expect(levelToDeflection(0.25)).toBeCloseTo(20 / 23, 10);
  });

  it('rises monotonically with level', () => {
    let previous = -1;
    for (let rms = 0.03; rms < 0.34; rms += 0.01) {
      const deflection = levelToDeflection(rms);
      expect(deflection).toBeGreaterThan(previous);
      previous = deflection;
    }
  });
});

describe('PeakLatch', () => {
  it('lights on a peak and stays lit for 1.5 s', () => {
    const latch = new PeakLatch();
    expect(latch.update(0.5, 0.1)).toBe(false);
    expect(latch.update(1, 0.1)).toBe(true);
    expect(latch.update(0, PEAK_HOLD_S - 0.01)).toBe(true);
    expect(latch.update(0, 0.02)).toBe(false);
  });

  it('restarts the hold on every new peak', () => {
    const latch = new PeakLatch();
    latch.update(1, 0.1);
    latch.update(0, 1.4);
    latch.update(0.99, 0.1);
    expect(latch.update(0, 1.4)).toBe(true);
  });
});

describe('measure', () => {
  it('computes RMS and peak', () => {
    const { rms, peak } = measure([1, -1, 1, -1]);
    expect(rms).toBe(1);
    expect(peak).toBe(1);
    expect(measure([0.5, 0, -0.25, 0]).peak).toBe(0.5);
  });

  it('gives a sine an RMS of 1/√2', () => {
    const sine = Float32Array.from({ length: 4800 }, (_, i) => Math.sin((2 * Math.PI * i) / 48));
    expect(measure(sine).rms).toBeCloseTo(Math.SQRT1_2, 4);
  });

  it('handles an empty block', () => {
    expect(measure([])).toEqual({ rms: 0, peak: 0 });
  });
});
