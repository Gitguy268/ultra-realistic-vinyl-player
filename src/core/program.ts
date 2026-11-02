import { DECK_SPEC } from '../spec/deck';

/**
 * The record carries the whole playlist: each track is a groove band sized by its duration,
 * with gaps between bands, a lead-in at the edge and a run-out into the locked groove.
 * Ported from html-1's Program. Radii are in record radii (1 = the record's edge), as html-1's
 * tests read them; `RecordGeometry.radius` converts to metres.
 */

export type RecordSize = 'lp' | 'single' | 'shellac';

export interface RecordGeometry {
  size: RecordSize;
  /** Record radius in metres. */
  radius: number;
  leadIn: number;
  /** Where the needle lands: 1 mm inside the lead-in. */
  drop: number;
  outer: number;
  inner: number;
  locked: number;
  /** Label diameter / record diameter. */
  label: number;
  /** Hole diameter / record diameter (the 45 adapter's hole on a 7-inch). */
  hole: number;
  gap: number;
  /** Record diameter / 12-inch diameter. */
  scale: number;
}

export function recordGeometry(size: RecordSize): RecordGeometry {
  const r = DECK_SPEC.records;
  const z = r[size];
  const R = z.diameter / 2;
  return {
    size,
    radius: R,
    leadIn: z.leadIn / R,
    drop: (z.leadIn - r.dropInset) / R,
    outer: z.outer / R,
    inner: z.inner / R,
    locked: z.locked / R,
    label: z.label / z.diameter,
    hole: size === 'single' ? z.hole / z.diameter : 0,
    gap: r.gap / R,
    scale: z.diameter / r.lp.diameter,
  };
}

/** Which record goes on the platter: the 12-inch, unless "Record size follows speed" is on. */
export function sizeFor(speed: RecordSize, sizeBySpeed: boolean): RecordSize {
  return sizeBySpeed ? speed : 'lp';
}

export interface Band {
  /** Outer radius (start of the track). */
  r0: number;
  /** Inner radius (end of the track). */
  r1: number;
  dur: number;
}

/** Sides as [first, last] index pairs: tracks in order, a new side when the next would not fit. */
export function packSides(
  durations: readonly number[],
  maxSeconds = DECK_SPEC.records.sideSeconds,
): [number, number][] {
  const sides: [number, number][] = [];
  let from = 0;
  let sum = 0;
  durations.forEach((d, i) => {
    if (i > from && sum + d > maxSeconds) {
      sides.push([from, i - 1]);
      from = i;
      sum = 0;
    }
    sum += d;
  });
  sides.push([from, durations.length - 1]);
  return sides;
}

export type Spot =
  | { kind: 'off' }
  | { kind: 'leadin'; idx: number; t: 0 }
  | { kind: 'gap'; idx: number; t: 0 }
  | { kind: 'track'; idx: number; t: number }
  | { kind: 'runout' };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export class Program {
  /** By playlist index; only tracks on the side that is up have a band. */
  bands: (Band | undefined)[] = [];
  sides: [number, number][] = [[0, -1]];
  side = 0;
  first = 0;
  last = -1;
  geometry: RecordGeometry = recordGeometry('lp');

  /** Seconds assumed for a track whose length is not known yet. */
  static duration(seconds: number | undefined): number {
    return seconds !== undefined && seconds > 0
      ? seconds
      : DECK_SPEC.records.unknownDurationSeconds;
  }

  sideOf(idx: number): number {
    return Math.max(
      0,
      this.sides.findIndex(([a, b]) => idx >= a && idx <= b),
    );
  }

  letter(side = this.side): string {
    return String.fromCharCode(65 + (side % 26));
  }

  /** Lays the side holding `current` onto the record. */
  build(
    durations: readonly (number | undefined)[],
    current: number,
    options: { sides: boolean; size: RecordSize },
  ): void {
    this.geometry = recordGeometry(options.size);
    const durs = durations.map(Program.duration);
    this.sides = options.sides ? packSides(durs) : [[0, durs.length - 1]];
    this.side = this.sideOf(current);
    const [first, last] = this.sides[this.side] ?? [0, -1];
    this.first = first;
    this.last = last;
    const n = last - first + 1;
    const g = this.geometry;
    const span = g.outer - g.inner;
    const gap = n > 1 ? Math.min(g.gap, (span * DECK_SPEC.records.maxGapShare) / (n - 1)) : 0;
    const total = durs.slice(first, last + 1).reduce((a, b) => a + b, 0) || 1;
    const usable = span - gap * Math.max(0, n - 1);
    let r = g.outer;
    this.bands = [];
    for (let i = first; i <= last; i++) {
      const dur = durs[i] ?? 0;
      const band = { r0: r, r1: r - (usable * dur) / total, dur };
      this.bands[i] = band;
      r = band.r1 - gap;
    }
  }

  /** Radius of time t in track idx. */
  radius(idx: number, t: number): number {
    const b = this.bands[idx];
    if (!b) return this.geometry.outer;
    return b.r0 + (b.r1 - b.r0) * clamp(t / b.dur, 0, 1);
  }

  /** What lies under radius rn: off the record, lead-in, a track (with time), a gap, or the run-out. */
  locate(rn: number): Spot {
    const g = this.geometry;
    if (rn > 1 || this.last < this.first) return { kind: 'off' };
    if (rn > g.outer) return { kind: 'leadin', idx: this.first, t: 0 };
    for (let i = this.first; i <= this.last; i++) {
      const b = this.bands[i];
      if (!b) continue;
      if (rn > b.r0) return { kind: 'gap', idx: i, t: 0 };
      if (rn >= b.r1) return { kind: 'track', idx: i, t: ((b.r0 - rn) / (b.r0 - b.r1)) * b.dur };
    }
    return { kind: 'runout' };
  }
}
