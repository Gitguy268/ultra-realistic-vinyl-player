export const SPEED_PRESETS = {
  lp: 100 / 3,
  single: 45,
  shellac: 78,
} as const;

export type SpeedPreset = keyof typeof SPEED_PRESETS;

export const SPIN_UP_TAU_S = 0.9;
export const SPIN_DOWN_TAU_S = 1.6;
export const MAX_PITCH = 0.08;
/** An unpowered platter turning slower than this has stopped; friction wins. */
export const STOP_RPM = 0.01;

/** Platter motor: exponential approach to the target speed. */
export class Motor {
  preset: SpeedPreset = 'lp';
  powered = false;
  /** Current platter speed in rpm. */
  rpm = 0;
  private pitchValue = 0;

  get pitch(): number {
    return this.pitchValue;
  }

  /** Fractional pitch offset, clamped to ±8 %. */
  set pitch(value: number) {
    if (!Number.isFinite(value)) throw new RangeError('pitch must be finite');
    this.pitchValue = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, value));
  }

  get targetRpm(): number {
    return this.powered ? SPEED_PRESETS[this.preset] * (1 + this.pitchValue) : 0;
  }

  /** Speed relative to the selected preset: 1 at nominal speed with zero pitch. */
  get speedMultiplier(): number {
    return this.rpm / SPEED_PRESETS[this.preset];
  }

  get revolutionsPerSecond(): number {
    return this.rpm / 60;
  }

  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) throw new RangeError('dt must be a non-negative number');
    const tau = this.powered ? SPIN_UP_TAU_S : SPIN_DOWN_TAU_S;
    this.rpm += (this.targetRpm - this.rpm) * (1 - Math.exp(-dt / tau));
    if (!this.powered && this.rpm < STOP_RPM) this.rpm = 0;
  }
}
