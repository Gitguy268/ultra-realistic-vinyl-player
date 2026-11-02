/**
 * Tracks a media position against an external clock (AudioContext.currentTime)
 * across pauses and rate changes.
 */
export class PositionTracker {
  private offset = 0;
  private rate = 1;
  private startedAt: number | null = null;

  get playing(): boolean {
    return this.startedAt !== null;
  }

  timeAt(now: number): number {
    if (this.startedAt === null) return this.offset;
    return Math.max(0, this.offset + (now - this.startedAt) * this.rate);
  }

  play(now: number): void {
    if (this.startedAt === null) this.startedAt = now;
  }

  pause(now: number): void {
    if (this.startedAt === null) return;
    this.offset = this.timeAt(now);
    this.startedAt = null;
  }

  /** Folds the time elapsed at the old rate into the offset, then switches rate. */
  setRate(rate: number, now: number): void {
    if (!Number.isFinite(rate)) throw new RangeError('rate must be finite');
    if (this.startedAt !== null) {
      this.offset = this.timeAt(now);
      this.startedAt = now;
    }
    this.rate = rate;
  }

  seek(position: number, now: number): void {
    this.offset = Number.isFinite(position) ? Math.max(0, position) : 0;
    if (this.startedAt !== null) this.startedAt = now;
  }
}
