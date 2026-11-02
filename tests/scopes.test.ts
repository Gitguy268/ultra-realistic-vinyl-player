import { describe, expect, it } from 'vitest';
import {
  LevelHistory,
  bandLevels,
  heatColour,
  logEdges,
  musicBins,
  risingZeroCrossing,
} from '../src/ui/scopes';

describe('logEdges', () => {
  it('covers bin 1 to the end with a bin in every band', () => {
    for (const count of [28, 48, 64, 128]) {
      const edges = logEdges(1024, count);
      expect(edges).toHaveLength(count + 1);
      expect(edges[0]).toBe(1);
      expect(edges.at(-1)).toBe(1024);
      for (let i = 1; i < edges.length; i++) expect(edges[i]!).toBeGreaterThan(edges[i - 1]!);
    }
  });
});

describe('bandLevels', () => {
  it('maps silence to 0 and loud bins to 1', () => {
    const edges = logEdges(1024, 16);
    const out = new Float32Array(16);
    bandLevels(new Float32Array(1024).fill(-Infinity), edges, out);
    expect([...out].every((v) => v === 0)).toBe(true);
    bandLevels(new Float32Array(1024).fill(0), edges, out);
    expect([...out].every((v) => v === 1)).toBe(true);
  });
});

describe('LevelHistory', () => {
  it('keeps the newest frame last and forgets the oldest', () => {
    const history = new LevelHistory(3, 1);
    for (const v of [1, 2, 3, 4]) history.push(Float32Array.of(v));
    expect([0, 1, 2].map((row) => history.row(row)[0])).toEqual([2, 3, 4]);
  });
});

describe('risingZeroCrossing', () => {
  it('finds where the wave rises through zero', () => {
    const wave = Float32Array.from({ length: 64 }, (_, i) => Math.sin((i - 5) * 0.4));
    const at = risingZeroCrossing(wave);
    expect(wave[at - 1]!).toBeLessThan(0);
    expect(wave[at]!).toBeGreaterThanOrEqual(0);
    expect(risingZeroCrossing(new Float32Array(64).fill(0.5))).toBe(0);
  });
});

describe('heatColour', () => {
  it('runs from the label black to near white', () => {
    expect(heatColour(0)).toEqual([21, 21, 21]);
    expect(heatColour(1)).toEqual([255, 255, 235]);
    expect(heatColour(-3)).toEqual(heatColour(0));
  });
});

describe('musicBins', () => {
  it('spans about 45 Hz to 16 kHz', () => {
    const [first, last] = musicBins(1024, 48000);
    expect(first * (24000 / 1024)).toBeCloseTo(45, -1);
    expect(last * (24000 / 1024)).toBeCloseTo(16000, -2);
    const edges = logEdges(last, 48, first);
    expect(edges[0]).toBe(first);
    expect(edges.at(-1)).toBe(last);
  });
});
