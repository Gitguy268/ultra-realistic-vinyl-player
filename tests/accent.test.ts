import { describe, expect, it } from 'vitest';
import { pickAccent, readableAccent } from '../src/library/accent';
import {
  contrastRatio,
  parseColours,
  parseHex,
  readableInk,
  relativeLuminance,
  toHex,
  type Rgb,
} from '../src/util/color';

/** Builds RGBA pixel data from [colour, count] runs. */
function pixels(...runs: [rgba: [number, number, number, number], count: number][]): number[] {
  return runs.flatMap(([rgba, count]) => Array.from({ length: count }, () => rgba).flat());
}

const GREY: [number, number, number, number] = [128, 128, 128, 255];
const RED: [number, number, number, number] = [220, 30, 30, 255];
const DULL_BLUE: [number, number, number, number] = [90, 100, 130, 255];

describe('colour utilities', () => {
  it('parses and formats hex colours', () => {
    expect(parseHex('#ff8000')).toEqual([255, 128, 0]);
    expect(parseHex('#F80')).toEqual([255, 136, 0]);
    expect(toHex([255, 128, 0])).toBe('#ff8000');
    expect(() => parseHex('red')).toThrow(RangeError);
  });

  it('computes WCAG luminance and contrast', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 10);
    expect(contrastRatio([10, 20, 30], [10, 20, 30])).toBe(1);
    expect(contrastRatio(parseHex('#777777'), parseHex('#ffffff'))).toBeCloseTo(4.48, 1);
  });

  it('is symmetric', () => {
    const a: Rgb = [232, 168, 56];
    const b: Rgb = [26, 18, 8];
    expect(contrastRatio(a, b)).toBe(contrastRatio(b, a));
  });
});

describe('readableInk', () => {
  it('picks dark ink on light colours and white on dark ones', () => {
    expect(readableInk(parseHex('#e8562a'))).toBe('#1a1208');
    expect(readableInk(parseHex('#ffd27a'))).toBe('#1a1208');
    expect(readableInk(parseHex('#20304a'))).toBe('#ffffff');
    expect(readableInk(parseHex('#000000'))).toBe('#ffffff');
  });

  it('always reaches at least 4.5:1', () => {
    for (let value = 0; value <= 255; value += 5) {
      const background: Rgb = [value, 255 - value, (value * 7) % 256];
      const ink = parseHex(readableInk(background));
      expect(contrastRatio(background, ink)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('parseColours', () => {
  it('keeps valid colours and normalises them', () => {
    expect(parseColours({ accent: '#F80', bg: '#101010', text: ' #EEEEEE ' })).toEqual({
      accent: '#ff8800',
      bg: '#101010',
      text: '#eeeeee',
    });
  });

  it.each([null, 7, 'red', [], {}])('returns no colours for %j', (raw) => {
    expect(parseColours(raw)).toEqual({});
  });

  it('drops anything that is not a hex colour, field by field', () => {
    expect(
      parseColours({ accent: 'url(javascript:1)', bg: '#12345', surface: 12, text: '#abcdef' }),
    ).toEqual({ text: '#abcdef' });
  });

  it('ignores unknown keys', () => {
    expect(parseColours({ border: '#ffffff' })).toEqual({});
  });
});

describe('pickAccent', () => {
  it('picks the saturated colour out of a mostly grey image', () => {
    const accent = pickAccent(pixels([GREY, 900], [RED, 124]));
    expect(accent).not.toBeNull();
    expect(accent![0]).toBeCloseTo(220, 0);
    expect(accent![1]).toBeCloseTo(30, 0);
  });

  it('prefers the more saturated of two common colours', () => {
    const accent = pickAccent(pixels([DULL_BLUE, 700], [RED, 324]));
    expect(accent![0]).toBeGreaterThan(200);
  });

  it('ignores a rare stray pixel however saturated', () => {
    const accent = pickAccent(pixels([DULL_BLUE, 1020], [RED, 4]));
    expect(accent![2]).toBeCloseTo(130, 0);
  });

  it('returns null for a grey image', () => {
    expect(pickAccent(pixels([GREY, 1024]))).toBeNull();
    expect(pickAccent(pixels([[0, 0, 0, 255], 1024]))).toBeNull();
  });

  it('ignores transparent pixels', () => {
    expect(pickAccent(pixels([[220, 30, 30, 0], 1024]))).toBeNull();
    expect(pickAccent(pixels([[220, 30, 30, 0], 900], [DULL_BLUE, 124]))![2]).toBeCloseTo(130, 0);
  });

  it('averages the colours inside the winning bucket', () => {
    const accent = pickAccent(
      pixels([[224, 32, 32, 255], 500], [[230, 40, 40, 255], 500], [GREY, 24]),
    );
    expect(accent![0]).toBeCloseTo(227, 0);
  });

  it('handles empty input', () => {
    expect(pickAccent([])).toBeNull();
  });
});

describe('readableAccent', () => {
  const ink = parseHex('#1a1208');

  it('returns the hex colour when the ink is readable on it', () => {
    expect(readableAccent([232, 168, 56], ink)).toBe('#e8a838');
  });

  it('rejects an accent that is too dark for the ink', () => {
    expect(readableAccent([90, 20, 20], ink)).toBeNull();
  });

  it('passes null through', () => {
    expect(readableAccent(null, ink)).toBeNull();
  });
});
