import { DECK_SPEC } from '../spec/deck';
import { REST_DIRECTION } from './tonearm3d';

/**
 * The tonearm's motion, ported from html-1's Arm: timed moves made of keyframes (lift, swing,
 * lower), a damped cue that touches down at 80 % of its travel and bounces once, a groove-
 * following glide, and a dragged arm that lags the hand. Driven by a clock, not by frames:
 * `update(now)` may run from the frame loop or from a background timer.
 *
 * Direction is the arm's plan direction in radians (core/tonearm3d.ts); lift is 0 in the
 * groove, 1 held up by the cue, and REST_LIFT on its rest.
 */

const K = DECK_SPEC.mechanism;
export const REST_LIFT = 0.25;
const DEG = Math.PI / 180;

export type ArmMode = 'rest' | 'hover' | 'groove' | 'drag' | 'move';

interface Step {
  d: number;
  direction?: number;
  lift?: number;
  land?: boolean;
}
interface Key {
  t0: number;
  t1: number;
  d0: number;
  d1: number;
  h0: number;
  h1: number;
  land: boolean;
}

const smooth = (u: number): number => u * u * (3 - 2 * u);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export class Arm {
  direction = REST_DIRECTION;
  lift = REST_LIFT;
  mode: ArmMode = 'rest';
  /** Where a drag is pulling the arm. */
  dragDirection = REST_DIRECTION;
  /** Locked-groove bob, decays by itself. */
  bob = 0;
  private keys: Key[] | null = null;
  private done: (() => void) | null = null;
  private end = 0;

  get moving(): boolean {
    return this.keys !== null;
  }

  /** Plays a sequence of moves from `now`, then calls `done`. */
  private run(now: number, steps: Step[], done?: () => void): void {
    this.stop(now);
    let t = now;
    let d = this.direction;
    let h = this.lift;
    this.keys = steps.map((s) => {
      const k = {
        t0: t,
        t1: t + s.d,
        d0: d,
        d1: s.direction ?? d,
        h0: h,
        h1: s.lift ?? h,
        land: !!s.land,
      };
      t = k.t1;
      d = k.d1;
      h = k.h1;
      return k;
    });
    this.end = t;
    this.done = done ?? null;
  }

  /** Freezes a running move where it is. */
  stop(now: number): void {
    if (this.keys) this.sample(now);
    this.keys = null;
    this.done = null;
  }

  private sample(now: number): void {
    const keys = this.keys;
    if (!keys) return;
    const k = keys.find((key) => now < key.t1) ?? keys[keys.length - 1]!;
    const u = clamp01((now - k.t0) / Math.max(1e-6, k.t1 - k.t0));
    const e = smooth(u);
    this.direction = k.d0 + (k.d1 - k.d0) * e;
    if (k.land) {
      // Damped cue: eases down, touches at 80 %, then one small bounce.
      const v = Math.min(1, u / 0.8);
      const b = Math.max(0, (u - 0.8) / 0.2);
      this.lift = k.h1 + (k.h0 - k.h1) * (1 - smooth(v)) + 0.07 * Math.sin(Math.PI * b) * (1 - b);
    } else this.lift = k.h0 + (k.h1 - k.h0) * e;
  }

  /** Swing time between directions: quick for short hops, never above ARM_SWING_S. */
  swingTime(to: number): number {
    return Math.min(K.armSwingMaxS, 0.1 + (Math.abs(to - this.direction) / DEG) * 0.02);
  }

  /** Lift if needed, swing to `to`, lower with the damped cue, then `done`. */
  cueTo(now: number, to: number, slow: boolean, done: () => void): void {
    this.stop(now);
    const steps: Step[] = [];
    if (this.lift < 0.95) steps.push({ d: K.cueLiftS, lift: 1 });
    if (Math.abs(to - this.direction) > 0.05 * DEG)
      steps.push({ d: this.swingTime(to), direction: to });
    steps.push({ d: slow ? K.cueLowerS : K.cueLowerFastS, lift: 0, land: true });
    this.mode = 'move';
    this.run(now, steps, () => {
      this.mode = 'groove';
      done();
    });
  }

  /** Lift and hover, optionally swinging to `to`. */
  liftTo(now: number, to?: number): void {
    this.stop(now);
    const steps: Step[] = [{ d: K.cueLiftS, lift: 1 }];
    if (to !== undefined) steps.push({ d: this.swingTime(to), direction: to });
    this.mode = 'move';
    this.run(now, steps, () => {
      this.mode = 'hover';
    });
  }

  /** Lift, swing back over the rest and settle on it. `durationS` stretches the swing (end stop return). */
  park(now: number, swingS = 0.45, done?: () => void): void {
    this.stop(now);
    if (this.mode === 'rest') return;
    this.mode = 'move';
    this.run(
      now,
      [
        { d: K.cueLiftS, lift: 1 },
        { d: swingS, direction: REST_DIRECTION },
        { d: 0.3, lift: REST_LIFT },
      ],
      () => {
        this.mode = 'rest';
        done?.();
      },
    );
  }

  /** A hand takes the arm. */
  grab(now: number): void {
    this.stop(now);
    this.mode = 'drag';
    this.dragDirection = this.direction;
  }

  /**
   * Advances to `now`. `grooveDirection` is where the stylus's groove is (for 'groove' and
   * 'hover'), `dt` the time since the last update. Fires a finished move's callback.
   */
  update(now: number, dt: number, grooveDirection: number): void {
    const k = (tau: number): number => 1 - Math.exp(-Math.max(0, dt) / tau);
    if (this.keys) {
      this.sample(now);
      if (now >= this.end) {
        this.keys = null;
        const done = this.done;
        this.done = null;
        done?.();
      }
    } else if (this.mode === 'groove' || this.mode === 'hover') {
      // Follows the groove; short seeks glide instead of jumping.
      this.direction += (grooveDirection - this.direction) * k(K.armGlideTau);
      this.lift += ((this.mode === 'hover' ? 1 : 0) - this.lift) * k(0.05);
    } else if (this.mode === 'drag') {
      this.direction += (this.dragDirection - this.direction) * k(0.05);
      this.lift += (1 - this.lift) * k(0.05);
    } else if (this.mode === 'rest') {
      this.direction = REST_DIRECTION;
      this.lift = REST_LIFT;
    }
    this.bob *= Math.exp(-Math.max(0, dt) / 0.14);
  }

  /** Reduced motion: a running move jumps to its end. */
  finishNow(): void {
    if (this.keys) this.update(this.end, 0, this.direction);
  }
}
