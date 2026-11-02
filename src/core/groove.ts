import { DECK_SPEC } from '../spec/deck';
import type { Program, Spot } from './program';

/**
 * What the stylus rides, ported from html-1's Deck.ride/begin/segDone/stylusR: the lead-in,
 * a track, the gap between two tracks, the run-out and the locked groove. Silent segments are
 * timed in seconds of groove that pass under the stylus, so they slow down with the platter
 * and run backward under a hand. A track is timed by the audio engine.
 */

export type SegmentKind = 'leadin' | 'track' | 'gap' | 'runout' | 'locked';

export interface Segment {
  kind: SegmentKind;
  /** The track it leads into (lead-in, gap) or is (track). */
  idx: number;
  /** For a gap: the track it leaves. */
  from: number;
  /** Seconds of groove ridden so far. */
  acc: number;
  /** Seconds of groove the segment lasts (0 for a track or the locked groove). */
  dur: number;
  /** Turns completed in the locked groove. */
  revs: number;
}

/** Where to put the stylus down: a spot on the record and its radius in record radii. */
export interface DropPoint {
  kind: 'leadin' | 'track' | 'gap' | 'runout';
  idx: number;
  t: number;
  r: number;
}

export interface GrooveHost {
  program: Program;
  /** Playlist index of the track the engine holds. */
  currentIdx(): number;
  /** The engine's position in that track, seconds. */
  position(): number;
  /** Load another track (the engine keeps its intent to play). */
  select(idx: number): void;
  seek(seconds: number): void;
  /** Another turn in the locked groove. */
  lockedTurn(revs: number): void;
  /** Seconds of groove in one turn: 1.8 for a record cut at 33⅓ (core/spin.ts). */
  secPerRev(): number;
}

const R = DECK_SPEC.records;
function duration(kind: SegmentKind, secPerRev: number): number {
  if (kind === 'leadin') return R.leadInSeconds;
  if (kind === 'gap') return R.gapSeconds;
  if (kind === 'runout') return R.runOutTurns * secPerRev;
  return 0;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export class Groove {
  seg: Segment | null = null;
  /** The stylus is in the groove. */
  contact = false;

  constructor(private readonly host: GrooveHost) {}

  begin(kind: SegmentKind, idx = this.host.currentIdx(), t = 0, from = idx): void {
    this.seg = { kind, idx, from, acc: 0, revs: 0, dur: duration(kind, this.host.secPerRev()) };
    this.contact = true;
    if (kind === 'track') {
      if (this.host.currentIdx() !== idx) this.host.select(idx);
      this.host.seek(t);
    }
  }

  /** `seconds` of groove just passed under the stylus (negative when a hand turns it back). */
  ride(seconds: number): void {
    const s = this.seg;
    if (!s || !this.contact || s.kind === 'track') return;
    s.acc = Math.max(0, s.acc + seconds);
    if (s.kind === 'locked') {
      // Every turn counts, even when one step covers several (a background tick, a fast hand).
      const revs = Math.floor(s.acc / this.host.secPerRev());
      while (s.revs < revs) this.host.lockedTurn(++s.revs);
    } else if (s.acc >= s.dur) {
      if (s.kind === 'leadin' || s.kind === 'gap') this.begin('track', s.idx, 0);
      else this.begin('locked', s.idx);
    }
  }

  /**
   * The engine finished the current track. `next` is the queue's choice (−1 for none). Returns
   * 'jump' when the next track is not the next band on this side (shuffle, repeat one, a wrap):
   * the caller lifts the arm and relocates.
   */
  trackEnded(next: number): 'gap' | 'runout' | 'jump' | 'ignored' {
    const s = this.seg;
    if (!this.contact || s?.kind !== 'track') return 'ignored';
    const cur = s.idx;
    if (next < 0 || (next === cur + 1 && next > this.host.program.last)) {
      this.begin('runout', cur);
      return 'runout';
    }
    if (next === cur + 1) {
      this.begin('gap', next, 0, cur);
      return 'gap';
    }
    return 'jump';
  }

  /** Where the stylus would come down now: the lead-in before the side's first track starts. */
  dropPoint(): DropPoint {
    const p = this.host.program;
    const idx = this.host.currentIdx();
    const t = this.host.position();
    if (idx === p.first && t < 0.05) return { kind: 'leadin', idx, t: 0, r: p.geometry.drop };
    return { kind: 'track', idx, t, r: p.radius(idx, t) };
  }

  /** A drop point for a radius chosen by hand (an arm let go over the record). */
  pointAt(r: number): DropPoint | null {
    const spot: Spot = this.host.program.locate(r);
    switch (spot.kind) {
      case 'off':
        return null;
      case 'runout':
        return { kind: 'runout', idx: this.host.program.last, t: 0, r };
      default:
        return { kind: spot.kind, idx: spot.idx, t: spot.t, r };
    }
  }

  /** Puts the stylus into the groove at a drop point. */
  land(point: DropPoint): void {
    if (point.kind === 'runout') {
      this.begin('runout', point.idx);
      // Dropped part-way into the run-out: start the ride from where it landed.
      const p = this.host.program;
      const lastIn = p.bands[p.last]?.r1 ?? p.geometry.inner;
      const s = this.seg!;
      s.acc = clamp01((lastIn - point.r) / Math.max(1e-6, lastIn - p.geometry.locked)) * s.dur;
      if (point.r <= p.geometry.locked) this.begin('locked', point.idx);
      return;
    }
    // A gap has no sound of its own: a stylus let down on one goes to the next track's start. Riding
    // it would mean riding from the end of the track before, which the arm is nowhere near.
    if (point.kind === 'gap') this.begin('track', point.idx, 0);
    else this.begin(point.kind, point.idx, point.t);
  }

  /** Radius under the stylus (record radii). */
  stylusR(): number {
    const s = this.seg;
    const p = this.host.program;
    const g = p.geometry;
    if (!s) return this.dropPoint().r;
    const u = s.dur ? clamp01(s.acc / s.dur) : 0;
    const lastIn = p.bands[p.last]?.r1 ?? g.inner;
    switch (s.kind) {
      case 'leadin':
        return g.drop + (g.outer - g.drop) * u;
      case 'gap': {
        const a = p.bands[s.from];
        const b = p.bands[s.idx];
        return a && b ? a.r1 + (b.r0 - a.r1) * u : g.outer;
      }
      case 'runout':
        return lastIn + (g.locked - lastIn) * u;
      case 'locked':
        return g.locked;
      default:
        return p.radius(s.idx, this.host.position());
    }
  }

  /**
   * Takes the stylus out of the groove. From a gap it was heading into the next track, so that
   * track is loaded; from the run-out or the locked groove the side is over, so its first track is.
   */
  unseat(): void {
    const s = this.seg;
    this.contact = false;
    this.seg = null;
    if (s?.kind === 'gap') this.host.select(s.idx);
    else if (s?.kind === 'runout' || s?.kind === 'locked')
      this.host.select(this.host.program.first);
  }
}
