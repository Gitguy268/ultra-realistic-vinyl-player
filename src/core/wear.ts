import { hash, rng } from './random';
import type { RecordGeometry } from './program';

/** Record condition presets (html-1): visual wear 0..1, hiss, clicks/s, pops/s, scratches, roll-off, distortion. */
export const CONDITIONS = {
  mint: { wear: 0.04, hiss: 0.35, crackle: 0.25, pops: 0.004, scratches: 0, lp: 1, dist: 0 },
  good: { wear: 0.33, hiss: 1, crackle: 2, pops: 0.04, scratches: 2, lp: 0.97, dist: 0.03 },
  worn: { wear: 0.66, hiss: 1.8, crackle: 7, pops: 0.15, scratches: 6, lp: 0.8, dist: 0.1 },
  beat: { wear: 1, hiss: 3, crackle: 16, pops: 0.4, scratches: 12, lp: 0.62, dist: 0.22 },
} as const;
export type Condition = keyof typeof CONDITIONS;
export const MAX_MARKS = 300;

/** A scratch that ticks once per turn where it crosses the stylus. Angles in degrees, record frame. */
export interface Defect {
  a: number;
  /** Radius of the scratch's middle. */
  m: number;
  /** Degrees of slant per record radius. */
  s: number;
  r0: number;
  r1: number;
  amp: number;
  f: number;
  tau: number;
  pan: number;
  low: number;
}

/** Dust speck or paper scuff: seen, not heard. Angle in radians. */
export interface Mark {
  scuff: boolean;
  a: number;
  r: number;
  len: number;
  tilt: number;
  size: number;
  alpha: number;
}

/** Where a scratch crosses radius r, in degrees: scratches are rarely radial. */
export const angleAt = (d: Defect, r: number): number => d.a + d.s * (r - d.m);

/**
 * The defect map of one side, seeded by its track ids. The beat-up set is always generated and
 * a prefix kept, so a record in worse condition keeps the damage it had in better condition.
 */
export function buildWear(
  sideIds: string,
  condition: Condition,
  g: RecordGeometry,
): { defects: Defect[]; marks: Mark[] } {
  const cond = CONDITIONS[condition];
  const seed = hash(sideIds + '#wear');
  let rnd = rng(seed);
  const defects = Array.from({ length: CONDITIONS.beat.scratches }, () => {
    const m = g.inner + 0.03 + (g.outer - g.inner - 0.06) * rnd();
    const span = 0.025 + 0.2 * rnd() * rnd();
    const loud = rnd();
    return {
      a: rnd() * 360,
      m,
      s: (rnd() - 0.5) * 260,
      r0: Math.min(g.outer, m + span / 2),
      r1: Math.max(g.inner, m - span / 2),
      amp: 0.05 + 0.3 * loud * loud,
      f: 1200 + 5000 * rnd(),
      tau: 0.00008 + 0.0005 * rnd(),
      pan: 0.3 + rnd() * 0.97,
      low: loud > 0.7 ? 60 + 40 * rnd() : 0,
    };
  }).slice(0, cond.scratches);
  rnd = rng(seed ^ 0x9e3779b9);
  const marks = Array.from({ length: MAX_MARKS }, (_, i) => ({
    scuff: i % 12 === 0,
    a: rnd() * Math.PI * 2,
    r: g.label + 0.03 + (0.96 - g.label) * rnd(),
    len: 0.02 + 0.16 * rnd(),
    tilt: (rnd() - 0.5) * 2.4,
    size: 0.5 + rnd() * 1.2,
    alpha: 0.12 + 0.4 * rnd(),
  })).slice(0, Math.round(MAX_MARKS * cond.wear));
  return { defects, marks };
}
