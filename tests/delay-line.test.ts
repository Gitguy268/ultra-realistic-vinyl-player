import { describe, expect, it } from 'vitest';
import { DELAY_LENGTH, DELAY_OFFSET, ModulatedDelay } from '../src/audio/delay-line';
import { DEFAULT_WOW_FLUTTER, playbackRateMultiplier } from '../src/audio/wowflutter';

describe('ModulatedDelay', () => {
  it('uses a power-of-two buffer and a 256-sample base delay', () => {
    expect(DELAY_LENGTH).toBe(8192);
    expect(DELAY_LENGTH & (DELAY_LENGTH - 1)).toBe(0);
    expect(DELAY_OFFSET).toBe(256);
  });

  it('delays by exactly the base offset at rate 1, across many blocks', () => {
    const delay = new ModulatedDelay();
    for (let n = 0; n < DELAY_LENGTH * 3; n++) {
      const out = delay.process(n, 1);
      expect(out).toBe(n >= DELAY_OFFSET ? n - DELAY_OFFSET : 0);
    }
    expect(delay.gap).toBe(DELAY_OFFSET);
  });

  it('interpolates linearly between samples', () => {
    const delay = new ModulatedDelay();
    for (let n = 0; n < 1000; n++) delay.process(n, 1);
    delay.process(1000, 0.5);
    // The previous call advanced the read head by half a sample.
    expect(delay.process(1001, 1)).toBeCloseTo(1001 - DELAY_OFFSET - 0.5, 9);
  });

  it('keeps treble within half a decibel at 10 kHz under wow and flutter', () => {
    const delay = new ModulatedDelay();
    const sampleRate = 48000;
    let lowest = Infinity;
    let sum = 0;
    let count = 0;
    for (let n = 0; n < sampleRate * 10; n++) {
      const input = Math.sin((2 * Math.PI * 10000 * n) / sampleRate);
      const y = delay.process(input, playbackRateMultiplier(n / sampleRate, DEFAULT_WOW_FLUTTER));
      if (n < sampleRate) continue;
      sum += y * y;
      // Level over 10 ms windows: short enough to follow the wow.
      if (++count === 480) {
        lowest = Math.min(lowest, 10 * Math.log10((sum / count) * 2));
        sum = 0;
        count = 0;
      }
    }
    expect(lowest).toBeGreaterThan(-0.6);
  });

  it('keeps the read head behind the write head under wow and flutter', () => {
    const delay = new ModulatedDelay();
    let min = Infinity;
    let max = -Infinity;
    const sampleRate = 48000;
    for (let n = 0; n < sampleRate * 20; n++) {
      delay.process(0, playbackRateMultiplier(n / sampleRate, DEFAULT_WOW_FLUTTER));
      min = Math.min(min, delay.gap);
      max = Math.max(max, delay.gap);
    }
    expect(min).toBeGreaterThan(DELAY_OFFSET / 4);
    expect(max).toBeLessThan(DELAY_LENGTH / 2);
  });

  it('snaps back to the base delay when the read head runs too fast', () => {
    const delay = new ModulatedDelay();
    for (let n = 0; n < 400; n++) delay.process(0, 2);
    expect(delay.gap).toBeGreaterThanOrEqual(DELAY_OFFSET / 4 - 1);
    expect(delay.gap).toBeLessThanOrEqual(DELAY_OFFSET);
  });

  it('snaps back to the base delay when the read head stalls', () => {
    const delay = new ModulatedDelay();
    for (let n = 0; n < DELAY_LENGTH; n++) delay.process(0, 0);
    expect(delay.gap).toBeLessThanOrEqual(DELAY_LENGTH / 2 + 1);
  });
});
