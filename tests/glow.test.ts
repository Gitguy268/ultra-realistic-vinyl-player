import { describe, expect, it } from 'vitest';
import { GlowEnvelope, bassLevel } from '../src/ui/glow';

describe('bassLevel', () => {
  it('averages the lowest bins on a 0..1 scale', () => {
    expect(bassLevel([255, 255, 255, 255, 255, 255, 0, 0])).toBe(1);
    expect(bassLevel([0, 0, 0, 0, 0, 0, 255, 255])).toBe(0);
    expect(bassLevel([255, 0, 255, 0, 255, 0])).toBeCloseTo(0.5, 12);
  });

  it('handles short and empty spectra', () => {
    expect(bassLevel([])).toBe(0);
    expect(bassLevel([255, 255])).toBe(1);
  });
});

describe('GlowEnvelope', () => {
  it('rises within a few frames and falls more slowly', () => {
    const glow = new GlowEnvelope();
    for (let i = 0; i < 6; i++) glow.step(1, 1 / 60);
    expect(glow.value).toBeGreaterThan(0.9);
    glow.step(0, 1 / 60);
    expect(glow.value).toBeGreaterThan(0.8);
    for (let i = 0; i < 30; i++) glow.step(0, 1 / 60);
    expect(glow.value).toBeLessThan(0.15);
  });

  it('comes to rest at exactly zero', () => {
    const glow = new GlowEnvelope();
    glow.step(1, 0.1);
    for (let i = 0; i < 200; i++) glow.step(0, 1 / 60);
    expect(glow.value).toBe(0);
  });

  it('stays within 0..1 for any input', () => {
    const glow = new GlowEnvelope();
    for (const target of [5, -3, Number.NaN, Number.POSITIVE_INFINITY, 0.5]) {
      const value = glow.step(target, 0.05);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('ignores a zero or negative dt', () => {
    const glow = new GlowEnvelope();
    expect(glow.step(1, 0)).toBe(0);
    expect(glow.step(1, -1)).toBe(0);
  });
});
