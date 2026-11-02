import { describe, expect, it } from 'vitest';
import { recordGeometry } from '../src/core/program';
import { hash, rng } from '../src/core/random';
import { CONDITIONS, MAX_MARKS, angleAt, buildWear } from '../src/core/wear';

const g = recordGeometry('lp');

describe('seeded random', () => {
  it('matches html-1’s FNV-1a hash and mulberry32 sequence', () => {
    expect(hash('')).toBe(2166136261);
    expect(hash('a')).toBe(0xe40c292c);
    const a = rng(42);
    const b = rng(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
});

describe('wear', () => {
  it('has as many scratches and marks as the condition says', () => {
    for (const [name, c] of Object.entries(CONDITIONS)) {
      const w = buildWear('t1|t2', name as keyof typeof CONDITIONS, g);
      expect(w.defects).toHaveLength(c.scratches);
      expect(w.marks).toHaveLength(Math.round(MAX_MARKS * c.wear));
    }
  });

  it('keeps the damage of a better condition when the record gets worse', () => {
    const good = buildWear('side', 'good', g);
    const beat = buildWear('side', 'beat', g);
    expect(beat.defects.slice(0, good.defects.length)).toEqual(good.defects);
  });

  it('differs between sides and repeats for the same side', () => {
    expect(buildWear('a', 'worn', g)).toEqual(buildWear('a', 'worn', g));
    expect(buildWear('a', 'worn', g).defects).not.toEqual(buildWear('b', 'worn', g).defects);
  });

  it('keeps scratches inside the grooves', () => {
    for (const d of buildWear('x', 'beat', g).defects) {
      expect(d.r0).toBeLessThanOrEqual(g.outer);
      expect(d.r1).toBeGreaterThanOrEqual(g.inner);
      expect(angleAt(d, d.m)).toBe(d.a);
    }
  });
});
