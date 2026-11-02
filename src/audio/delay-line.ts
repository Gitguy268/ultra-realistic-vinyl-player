/** Delay buffer length in samples; a power of two so indices wrap with a mask. */
export const DELAY_LENGTH = 8192;
/** Nominal distance between the write and read heads (~5 ms at 48 kHz). */
export const DELAY_OFFSET = 256;

const MASK = DELAY_LENGTH - 1;
const MIN_GAP = DELAY_OFFSET / 4;
const MAX_GAP = DELAY_LENGTH / 2;

/**
 * Delay line whose read head moves at a variable rate, which shifts pitch the
 * way a speed error does. Both heads are absolute sample counters that persist
 * across calls; per-block counters would make the delay drift.
 */
export class ModulatedDelay {
  private readonly buffer = new Float32Array(DELAY_LENGTH);
  private writeCount = 0;
  private readPosition = -DELAY_OFFSET;

  /** Current write-to-read distance in samples. */
  get gap(): number {
    return this.writeCount - this.readPosition;
  }

  /** Writes one sample and returns one read `rate` samples after the previous read. */
  process(input: number, rate: number): number {
    this.buffer[this.writeCount & MASK] = input;
    // Safety snap: the read head must never overtake the write head or lag a full buffer.
    if (this.gap < MIN_GAP || this.gap > MAX_GAP) {
      this.readPosition = this.writeCount - DELAY_OFFSET;
    }
    const index = Math.floor(this.readPosition);
    const t = this.readPosition - index;
    // Four-point Catmull-Rom interpolation. Two-point (linear) interpolation dulled
    // the treble by up to 2 dB at 10 kHz, rising and falling with the wow.
    const before = this.buffer[(index - 1) & MASK]!;
    const a = this.buffer[index & MASK]!;
    const b = this.buffer[(index + 1) & MASK]!;
    const after = this.buffer[(index + 2) & MASK]!;
    const c1 = 0.5 * (b - before);
    const c2 = before - 2.5 * a + 2 * b - 0.5 * after;
    const c3 = 0.5 * (after - before) + 1.5 * (a - b);
    this.writeCount += 1;
    this.readPosition += rate;
    return ((c3 * t + c2) * t + c1) * t + a;
  }
}
