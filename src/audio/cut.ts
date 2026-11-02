/**
 * What a cut record does to the signal after the EQ (html-1): bass folded to mono below 120 Hz,
 * channel crosstalk, a high-frequency roll-off that falls toward the inner grooves and at 78, and
 * a little soft saturation that grows toward the label and with wear.
 */

export const BASS_MONO_HZ = 120;
export const CROSSTALK_DB = -25;
const ROLLOFF_HZ = 16000;
const ROLLOFF_78_HZ = 7500;
/** Roll-off at the innermost groove, as a share of the outer one (16 kHz → 11 kHz). */
const INNER_ROLLOFF = 11 / 16;
const INNER_DRIVE = 0.35;
export const SATURATION = 0.9;

/** Gain of the side signal: crosstalk narrows the stereo image. */
export function sideGain(crosstalkDb = CROSSTALK_DB): number {
  const xt = 10 ** (crosstalkDb / 20);
  return (1 - xt) / (1 + xt);
}

/** Unity for small signals, rounding the peaks: x in ±2, the range the curve spans. */
export function saturate(x: number): number {
  return Math.tanh(SATURATION * x) / SATURATION;
}

export interface CutTone {
  rolloffHz: number;
  drive: number;
}

/**
 * `inner` is 0 at the outer groove and 1 at the inner one; `lp` and `dist` come from the record's
 * condition.
 */
export function cutTone(inner: number, shellac: boolean, lp: number, dist: number): CutTone {
  const u = Math.max(0, Math.min(1, inner));
  return {
    rolloffHz: (shellac ? ROLLOFF_78_HZ : ROLLOFF_HZ) * lp * (1 - (1 - INNER_ROLLOFF) * u),
    drive: 1 + INNER_DRIVE * u + dist,
  };
}
