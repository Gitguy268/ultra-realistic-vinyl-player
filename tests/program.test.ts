import { describe, expect, it } from 'vitest';
import { Program, packSides, recordGeometry, sizeFor } from '../src/core/program';

function laid(durations: (number | undefined)[], current = 0, sides = false): Program {
  const program = new Program();
  program.build(durations, current, { sides, size: 'lp' });
  return program;
}

describe('record geometry', () => {
  it('orders lead-in, outer, inner, locked and label from the edge inward', () => {
    for (const size of ['lp', 'single', 'shellac'] as const) {
      const g = recordGeometry(size);
      expect(g.leadIn).toBeLessThanOrEqual(1);
      expect(g.drop).toBeLessThan(g.leadIn);
      expect(g.outer).toBeLessThan(g.drop);
      expect(g.inner).toBeLessThan(g.outer);
      expect(g.locked).toBeLessThan(g.inner);
      expect(g.label).toBeLessThan(g.locked);
    }
  });

  it('scales the 7-inch and 10-inch records against the 12-inch', () => {
    expect(recordGeometry('single').scale).toBeCloseTo(175 / 302, 6);
    expect(recordGeometry('shellac').scale).toBeCloseTo(250 / 302, 6);
    expect(recordGeometry('single').hole).toBeGreaterThan(0);
    expect(recordGeometry('lp').hole).toBe(0);
  });

  it('puts the 12-inch on the platter unless the size follows the speed', () => {
    expect(sizeFor('single', false)).toBe('lp');
    expect(sizeFor('single', true)).toBe('single');
  });
});

describe('Program', () => {
  it('sizes bands by duration and fills the groove area', () => {
    const p = laid([60, 120, 60]);
    const g = p.geometry;
    const widths = [0, 1, 2].map((i) => p.bands[i]!.r0 - p.bands[i]!.r1);
    expect(widths[1]! / widths[0]!).toBeCloseTo(2, 9);
    expect(p.bands[0]!.r0).toBe(g.outer);
    expect(p.bands[2]!.r1).toBeCloseTo(g.inner, 9);
  });

  it('round-trips a time through its radius on every track', () => {
    const p = laid([95, 200, 31]);
    for (let i = 0; i < 3; i++) {
      const dur = p.bands[i]!.dur;
      for (const t of [0.5, dur / 2, dur - 0.5]) {
        const spot = p.locate(p.radius(i, t));
        expect(spot.kind).toBe('track');
        if (spot.kind === 'track') {
          expect(spot.idx).toBe(i);
          expect(spot.t).toBeCloseTo(t, 6);
        }
      }
    }
  });

  it('resolves a gap to the next track’s start', () => {
    const p = laid([60, 60]);
    const mid = (p.bands[0]!.r1 + p.bands[1]!.r0) / 2;
    expect(p.locate(mid)).toEqual({ kind: 'gap', idx: 1, t: 0 });
  });

  it('finds the edges: off the record, the lead-in and the run-out', () => {
    const p = laid([60]);
    expect(p.locate(1.01).kind).toBe('off');
    expect(p.locate((p.geometry.outer + 1) / 2)).toEqual({ kind: 'leadin', idx: 0, t: 0 });
    expect(p.locate(p.geometry.inner - 0.01).kind).toBe('runout');
  });

  it('counts unknown durations as three minutes', () => {
    expect(laid([undefined, 0]).bands[0]!.dur).toBe(180);
  });

  it('caps the gaps at 15 % of the groove area', () => {
    const p = laid(Array.from({ length: 40 }, () => 10));
    const g = p.geometry;
    const gaps = p.bands[0]!.r1 - p.bands[1]!.r0;
    expect(gaps * 39).toBeCloseTo((g.outer - g.inner) * 0.15, 9);
  });

  it('packs sides of at most 22 minutes, in order, and lays only the side that is up', () => {
    expect(packSides([600, 600, 600, 600])).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(packSides([2000, 10])).toEqual([
      [0, 0],
      [1, 1],
    ]);
    const p = laid([600, 600, 600], 2, true);
    expect(p.side).toBe(1);
    expect(p.letter()).toBe('B');
    expect(p.bands[0]).toBeUndefined();
    expect(p.bands[2]!.r0).toBe(p.geometry.outer);
  });

  it('is empty without tracks', () => {
    expect(laid([]).locate(0.5).kind).toBe('off');
  });
});
