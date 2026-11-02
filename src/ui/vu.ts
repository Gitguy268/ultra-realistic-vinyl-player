/** Time for the needle to reach 99 % of a step, like a classic VU meter. */
export const VU_SETTLE_S = 0.3;
/** For a critically damped system, (1 + ωt)·e^(−ωt) = 0.01 at ωt ≈ 6.638. */
const SETTLE_PRODUCT = 6.638;
const OMEGA = SETTLE_PRODUCT / VU_SETTLE_S;

export const PEAK_HOLD_S = 1.5;
export const PEAK_THRESHOLD = 0.98;

/** RMS level shown as 0 VU (−12 dBFS). */
const REFERENCE_RMS = 0.25;
const MIN_DB = -20;
const MAX_DB = 3;

/** Critically damped needle: fast, with no overshoot. Uses the exact solution, so any dt is stable. */
export class NeedleBallistics {
  value = 0;
  private velocity = 0;

  step(target: number, dt: number): number {
    if (!(dt > 0)) return this.value;
    const offset = this.value - target;
    const slope = this.velocity + OMEGA * offset;
    const decay = Math.exp(-OMEGA * dt);
    this.value = target + (offset + slope * dt) * decay;
    this.velocity = (this.velocity - OMEGA * slope * dt) * decay;
    return this.value;
  }
}

/** Needle deflection 0..1 for an RMS level, on a −20..+3 dB scale around 0 VU. */
export function levelToDeflection(rms: number): number {
  if (!(rms > 0)) return 0;
  const db = 20 * Math.log10(rms / REFERENCE_RMS);
  return Math.max(0, Math.min(1, (db - MIN_DB) / (MAX_DB - MIN_DB)));
}

/** Peak LED: lights on a peak and stays lit for 1.5 s after the last one. */
export class PeakLatch {
  private remaining = 0;

  update(peak: number, dt: number): boolean {
    this.remaining = peak >= PEAK_THRESHOLD ? PEAK_HOLD_S : Math.max(0, this.remaining - dt);
    return this.remaining > 0;
  }
}

/** Root mean square and absolute peak of a block of samples. */
export function measure(samples: ArrayLike<number>): { rms: number; peak: number } {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i] ?? 0;
    sum += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  return { rms: samples.length > 0 ? Math.sqrt(sum / samples.length) : 0, peak };
}
