import { describe, expect, it } from 'vitest';
import {
  EFFECTIVE_LENGTH,
  MOUNTING_DISTANCE,
  REST_DIRECTION,
  WAND_ANGLE,
  WAND_LENGTH,
  directionFor,
  radiusFor,
  stylusAt,
  trackingErrorDeg,
} from '../src/core/tonearm3d';
import { DECK_SPEC } from '../src/spec/deck';

const deg = (rad: number): number => (rad * 180) / Math.PI;

describe('TP 30 geometry', () => {
  it('mounts the pivot effective length minus overhang from the spindle', () => {
    expect(MOUNTING_DISTANCE * 1000).toBeCloseTo(222 - 15.5, 0);
    expect(EFFECTIVE_LENGTH).toBe(0.222);
  });

  it('turns the straight wand about 5.6° off the pivot→stylus line', () => {
    expect(deg(WAND_ANGLE)).toBeCloseTo(5.6, 1);
    expect(WAND_LENGTH * 1000).toBeCloseTo(181.4, 0);
  });

  it('maps radius to direction and back', () => {
    for (const r of [0.05, 0.0605, 0.1, 0.146, 0.1495])
      expect(radiusFor(directionFor(r))).toBeCloseTo(r, 9);
  });

  it('swings toward the rest as the stylus moves outward', () => {
    expect(directionFor(0.146)).toBeLessThan(directionFor(0.06));
    expect(REST_DIRECTION).toBeLessThan(directionFor(0.1495));
  });

  it('parks the stylus clear of the platter', () => {
    expect(radiusFor(REST_DIRECTION)).toBeGreaterThan(DECK_SPEC.platter.diameter / 2 + 0.02);
  });

  it('keeps the stylus at the effective length from the pivot', () => {
    const p = stylusAt(directionFor(0.1));
    expect(Math.hypot(p.x - DECK_SPEC.tonearm.pivotX, p.z - DECK_SPEC.tonearm.pivotZ)).toBeCloseTo(
      EFFECTIVE_LENGTH,
      12,
    );
  });

  it('holds tracking error within ±3° across the LP grooves, as offset and overhang intend', () => {
    for (let r = 0.0605; r <= 0.146; r += 0.005)
      expect(Math.abs(trackingErrorDeg(r))).toBeLessThan(3);
  });
});
