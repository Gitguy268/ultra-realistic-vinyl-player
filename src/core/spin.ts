import { DECK_SPEC } from '../spec/deck';

/**
 * Platter and record motion, ported from html-1's Deck.step. Speeds are in units of 33⅓ rpm
 * (1 = 200°/s, one turn per 1.8 s of groove); angles in degrees. Every update is closed-form in
 * dt, so the result does not depend on how often it is called (frames or a background timer).
 */

/** Degrees per second at 33⅓ rpm. */
export const DEG_PER_SEC = 200;
/** Seconds of groove per degree of record: the record is cut at 33⅓ (html-1's convention). */
export const SEC_PER_DEG = 1.8 / 360;
export const SEC_PER_REV = 1.8;
/** Speeds in units of 33⅓ rpm. */
export const RPM_UNITS = { lp: 1, single: 1.35, shellac: 2.34 } as const;

const M = DECK_SPEC.motor;
const K = DECK_SPEC.mechanism;

export type MotorState = 'off' | 'spinning up' | 'at speed' | 'spinning down';

export class Spin {
  /** Platter speed. */
  wp = 0;
  /** Record speed: differs from the platter while a hand holds it or it slips. */
  wr = 0;
  angP = 0;
  angR = 0;
  /** A hand is on the record; `hand` is the angle it holds the record at. */
  held = false;
  hand = 0;
  /** Apparent strobe speed (deg/s) and angle, aliased under the lamp. */
  strobeV = 0;
  strobe = 0;

  /**
   * Advances by `dt` seconds toward `target` (units of 33⅓; 0 = motor off). `nominal` is the
   * selected speed without pitch, for the strobe. Returns the degrees of record that turned.
   */
  step(dt: number, target: number, nominal: number): number {
    if (dt <= 0) return 0;
    this.wp += (target - this.wp) * (1 - Math.exp(-dt / (target > 0 ? M.spinUpTau : M.coastTau)));
    if (!target && this.wp < 2e-4) this.wp = 0;
    const before = this.angR;
    if (this.held) {
      // The record follows the hand through a little friction.
      this.angR += (this.hand - this.angR) * (1 - Math.exp(-dt / K.handTau));
      this.wr = (this.angR - before) / dt / DEG_PER_SEC;
    } else {
      // Let go: it slips on the mat and catches up with the platter.
      this.wr += (this.wp - this.wr) * (1 - Math.exp(-dt / K.slipTau));
      if (!target && Math.abs(this.wr) < 2e-4) this.wr = 0;
      this.angR += this.wr * DEG_PER_SEC * dt;
    }
    this.angP += this.wp * DEG_PER_SEC * dt;
    const w = this.wp * DEG_PER_SEC;
    const period = nominal * DEG_PER_SEC;
    this.strobeV = target > 0 && period > 0 ? w - period * Math.round(w / period) : w;
    this.strobe = (this.strobe + this.strobeV * dt) % 360;
    return this.angR - before;
  }

  /**
   * Pulls the drawn record toward the angle the audio thread reports, so a scratch mark passes
   * under the stylus exactly when its tick sounds (html-1's SYNC_TAU).
   */
  syncTo(heard: number, dt: number): void {
    let d = (heard - this.angR) % 360;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    this.angR += d * (1 - Math.exp(-dt / K.syncTau));
  }

  /** For display and tests. */
  motorState(target: number, powered: boolean): MotorState {
    if (!powered) return this.wp > 0.005 ? 'spinning down' : 'off';
    return Math.abs(this.wp - target) > 0.01 * target ? 'spinning up' : 'at speed';
  }
}
