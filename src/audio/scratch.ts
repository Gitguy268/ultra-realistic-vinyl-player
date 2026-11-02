/** Time constant of the return to motor speed; about 95 % of the way back after 0.3 s. */
export const RELEASE_TAU_S = 0.1;
const RELEASE_DONE = 0.01;

/**
 * Playback rate for a record turned by hand. Positive is clockwise (forward);
 * negative plays the audio backward.
 */
export function rateFromAngularVelocity(radPerSec: number, nominalRevPerSec: number): number {
  if (!(nominalRevPerSec > 0)) throw new RangeError('nominal speed must be positive');
  if (!Number.isFinite(radPerSec)) return 0;
  return radPerSec / (2 * Math.PI * nominalRevPerSec);
}

/** Smallest signed difference between two angles, in (-π, π]. */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (2 * Math.PI);
  if (delta > Math.PI) delta -= 2 * Math.PI;
  if (delta <= -Math.PI) delta += 2 * Math.PI;
  return delta;
}

/** The hand on the record: overrides the motor while held, then fades back to it. */
export class HandOverride {
  held = false;
  active = false;
  private handRate = 0;
  private weight = 0;

  grab(initialRate: number): void {
    this.held = true;
    this.active = true;
    this.weight = 1;
    this.handRate = initialRate;
  }

  setHandRate(rate: number): void {
    if (this.held) this.handRate = rate;
  }

  release(): void {
    this.held = false;
  }

  /** Advances the release decay and returns the effective rate. */
  tick(dt: number, motorRate: number): number {
    if (!this.active) return motorRate;
    if (!this.held) {
      this.weight *= Math.exp(-Math.max(0, dt) / RELEASE_TAU_S);
      if (this.weight < RELEASE_DONE) {
        this.active = false;
        return motorRate;
      }
    }
    return motorRate + (this.handRate - motorRate) * this.weight;
  }
}

/** Wraps a frame position into [0, length). */
export function wrapPosition(position: number, length: number): number {
  const wrapped = position % length;
  const positive = wrapped < 0 ? wrapped + length : wrapped;
  return positive >= length ? 0 : positive;
}

/** Fractional read position over a PCM buffer that can move in either direction. */
export class ReadHead {
  position = 0;
  private readonly length: number;

  constructor(length: number) {
    if (!Number.isInteger(length) || length <= 0) {
      throw new RangeError('length must be a positive integer');
    }
    this.length = length;
  }

  seek(position: number): void {
    this.position = wrapPosition(Number.isFinite(position) ? position : 0, this.length);
  }

  /** Moves by `rate` frames; negative rates move backward. Wraps at both ends. */
  advance(rate: number): void {
    this.position = wrapPosition(this.position + rate, this.length);
  }

  /** Linearly interpolated sample at the current position. */
  read(data: Float32Array): number {
    const index = Math.floor(this.position);
    const fraction = this.position - index;
    const a = data[index] ?? 0;
    const b = data[(index + 1) % this.length] ?? 0;
    return a + (b - a) * fraction;
  }
}
