import { DECK_SPEC } from '../spec/deck';

/**
 * The TP 30 arm on its real pivot, in plan (x right, z toward the front, metres). Angles are plan
 * directions, atan2(z, x), in radians. The stylus traces the arc a pivoted arm traces; the law of
 * cosines maps its distance from the spindle to the arm's direction.
 */

const arm = DECK_SPEC.tonearm;
const platter = DECK_SPEC.platter;

export interface PlanPoint {
  x: number;
  z: number;
}

export const SPINDLE: PlanPoint = { x: platter.centreX, z: platter.centreZ };
export const PIVOT: PlanPoint = { x: arm.pivotX, z: arm.pivotZ };
/** Pivot to stylus. */
export const EFFECTIVE_LENGTH = arm.effectiveLength;
/** Pivot to spindle: effective length minus overhang. */
export const MOUNTING_DISTANCE = Math.hypot(SPINDLE.x - PIVOT.x, SPINDLE.z - PIVOT.z);
/** Direction from the pivot to the spindle. */
export const TO_SPINDLE = Math.atan2(SPINDLE.z - PIVOT.z, SPINDLE.x - PIVOT.x);
export const REST_DIRECTION = (arm.restDirectionDeg * Math.PI) / 180;

const OFFSET = (arm.offsetDeg * Math.PI) / 180;
/** Pivot to the wand's joint with the headshell. */
export const WAND_LENGTH = Math.sqrt(
  arm.headshellLength ** 2 +
    EFFECTIVE_LENGTH ** 2 -
    2 * arm.headshellLength * EFFECTIVE_LENGTH * Math.cos(OFFSET),
);
/** The straight wand points this far outward of the pivot→stylus line. */
export const WAND_ANGLE = Math.asin((arm.headshellLength * Math.sin(OFFSET)) / WAND_LENGTH);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Arm direction that puts the stylus `radius` metres from the spindle. */
export function directionFor(radius: number): number {
  const D = MOUNTING_DISTANCE;
  const L = EFFECTIVE_LENGTH;
  const c = clamp((D * D + L * L - radius * radius) / (2 * D * L), -1, 1);
  return TO_SPINDLE - Math.acos(c);
}

/** Stylus distance from the spindle, metres, for an arm direction. */
export function radiusFor(direction: number): number {
  const D = MOUNTING_DISTANCE;
  const L = EFFECTIVE_LENGTH;
  const b = TO_SPINDLE - direction;
  return Math.sqrt(Math.max(0, D * D + L * L - 2 * D * L * Math.cos(b)));
}

export function stylusAt(direction: number): PlanPoint {
  return {
    x: PIVOT.x + EFFECTIVE_LENGTH * Math.cos(direction),
    z: PIVOT.z + EFFECTIVE_LENGTH * Math.sin(direction),
  };
}

/** Where the stylus sits around the spindle, radians atan2(z, x): scratches tick when they pass it. */
export function stylusPhi(direction: number): number {
  const p = stylusAt(direction);
  return Math.atan2(p.z - SPINDLE.z, p.x - SPINDLE.x);
}

/**
 * Tracking error in degrees: how far the cartridge axis is turned from the groove's tangent.
 * At the stylus, the arm line makes angle γ with the radius; the tangent is 90° from the radius,
 * so a cartridge offset by `offsetDeg` from the arm line is off by offset − (90° − γ).
 */
export function trackingErrorDeg(radius: number): number {
  const D = MOUNTING_DISTANCE;
  const L = EFFECTIVE_LENGTH;
  const gamma = Math.acos(clamp((L * L + radius * radius - D * D) / (2 * L * radius), -1, 1));
  return arm.offsetDeg - (90 - (gamma * 180) / Math.PI);
}
