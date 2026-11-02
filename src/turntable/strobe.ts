export type MainsHz = 50 | 60;

/** Number of strobe dots that appear frozen at `referenceRevPerSec` under `mainsHz` light. */
export function strobeDotCount(referenceRevPerSec: number, mainsHz: number): number {
  if (!(referenceRevPerSec > 0) || !(mainsHz > 0)) {
    throw new RangeError('reference speed and mains frequency must be positive');
  }
  return Math.round(mainsHz / referenceRevPerSec);
}

/**
 * Apparent drift of the dot pattern in dots per second. Zero when exactly a
 * whole number of dots passes per flash; positive when the platter runs fast.
 */
export function strobeDriftDotsPerSecond(
  actualRevPerSec: number,
  referenceRevPerSec: number,
  mainsHz: number,
): number {
  const dots = strobeDotCount(referenceRevPerSec, mainsHz);
  const dotsPerFlash = (dots * actualRevPerSec) / mainsHz;
  const nominalDotsPerFlash = Math.round((dots * referenceRevPerSec) / mainsHz);
  return (dotsPerFlash - nominalDotsPerFlash) * mainsHz;
}

/** Apparent angular velocity of the dot pattern in radians per second. */
export function strobeAngularVelocity(
  actualRevPerSec: number,
  referenceRevPerSec: number,
  mainsHz: number,
): number {
  const dots = strobeDotCount(referenceRevPerSec, mainsHz);
  return (
    (strobeDriftDotsPerSecond(actualRevPerSec, referenceRevPerSec, mainsHz) * 2 * Math.PI) / dots
  );
}

/**
 * Angular velocity the eye actually sees, in radians per second. Each flash can
 * only show the pattern displaced by a fraction of a dot, so the per-flash
 * advance wraps to ±0.5 dots: a stopped platter looks stopped, and near the
 * reference speed this equals `strobeAngularVelocity`.
 */
export function strobeApparentAngularVelocity(
  actualRevPerSec: number,
  referenceRevPerSec: number,
  mainsHz: number,
): number {
  const dots = strobeDotCount(referenceRevPerSec, mainsHz);
  const dotsPerFlash = (dots * actualRevPerSec) / mainsHz;
  const wrapped = dotsPerFlash - Math.round(dotsPerFlash);
  return (wrapped * mainsHz * 2 * Math.PI) / dots;
}
