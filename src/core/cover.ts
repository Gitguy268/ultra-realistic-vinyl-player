import { DECK_SPEC } from '../spec/deck';

/**
 * The dust cover on its spring-balanced hinges (W1: it "remains open at intermediate settings").
 * Above the hold angle, spring and friction hold it wherever it is let go. Below it, the cover's
 * weight wins and it settles closed, damped by the hinge.
 */

const spec = DECK_SPEC.cover;
const HOLD = spec.holdAboveDeg;
const MAX = spec.maxOpenDeg;
/** Degrees per second the hinge lets the cover move when it is sent somewhere. */
const TRAVEL_DPS = 140;
/** Time constant of the damped fall below the hold angle. */
const FALL_TAU = 0.12;

export type CoverEvent = 'closed' | 'opened' | 'none';

export class CoverHinge {
  /** Degrees, 0 = closed. */
  angle = 0;
  private target: number | null = null;
  private held = false;

  get closed(): boolean {
    return this.angle < 0.5;
  }

  get open(): boolean {
    return this.angle >= MAX - 0.5;
  }

  /** A hand moves the cover to `angle` and holds it there. */
  grab(angle: number): void {
    this.held = true;
    this.target = null;
    this.angle = Math.max(0, Math.min(MAX, angle));
  }

  /** The hand lets go: the springs hold it above the hold angle; below, it falls closed. */
  release(): void {
    this.held = false;
    if (this.angle < HOLD) this.target = 0;
  }

  /** The DOM twin and the C key: open fully, or close. */
  toggle(): void {
    this.held = false;
    this.target = this.angle > HOLD ? 0 : MAX;
  }

  /** Reduced motion: no animation. */
  snap(): CoverEvent {
    if (this.target === null) return 'none';
    this.angle = this.target;
    this.target = null;
    return this.angle === 0 ? 'closed' : 'opened';
  }

  step(dt: number): CoverEvent {
    if (this.held || this.target === null) return 'none';
    const target = this.target;
    const before = this.angle;
    if (target === 0 && before < HOLD) {
      // Weight against damping: an exponential fall that lands softly.
      this.angle = before * Math.exp(-dt / FALL_TAU) - 2 * dt;
    } else {
      const step = TRAVEL_DPS * dt;
      this.angle =
        Math.abs(target - before) <= step ? target : before + Math.sign(target - before) * step;
    }
    this.angle = Math.max(0, Math.min(MAX, this.angle));
    if (this.angle === target || (target === 0 && this.angle <= 0)) {
      this.angle = target;
      this.target = null;
      return target === 0 ? 'closed' : 'opened';
    }
    return 'none';
  }
}
