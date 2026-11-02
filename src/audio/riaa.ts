/** RIAA playback (de-emphasis) time constants in seconds. */
export const RIAA_ZERO_S = 318e-6;
export const RIAA_POLE_HF_S = 75e-6;
export const RIAA_POLE_LF_S = 3180e-6;

const REFERENCE_HZ = 1000;

export interface RiaaCoefficients {
  /** Gain of the first-difference term that realises the 318 µs zero. */
  zeroGain: number;
  /** One-pole feedback coefficient for the 3180 µs pole. */
  alphaLf: number;
  /** One-pole feedback coefficient for the 75 µs pole. */
  alphaHf: number;
  /** Linear gain that puts the discrete response at 0 dB at 1 kHz. */
  normalize: number;
}

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

function rawDiscreteMagnitude(frequencyHz: number, sampleRate: number): number {
  const k = RIAA_ZERO_S * sampleRate;
  const w = (2 * Math.PI * frequencyHz) / sampleRate;
  const cos = Math.cos(w);
  const sin = Math.sin(w);
  const zero = Math.hypot(1 + k * (1 - cos), k * sin);
  const pole = (tau: number): number => {
    const a = Math.exp(-1 / (tau * sampleRate));
    return (1 - a) / Math.hypot(1 - a * cos, a * sin);
  };
  return zero * pole(RIAA_POLE_LF_S) * pole(RIAA_POLE_HF_S);
}

export function riaaCoefficients(sampleRate: number): RiaaCoefficients {
  assertPositive(sampleRate, 'sampleRate');
  return {
    zeroGain: RIAA_ZERO_S * sampleRate,
    alphaLf: Math.exp(-1 / (RIAA_POLE_LF_S * sampleRate)),
    alphaHf: Math.exp(-1 / (RIAA_POLE_HF_S * sampleRate)),
    normalize: 1 / rawDiscreteMagnitude(REFERENCE_HZ, sampleRate),
  };
}

function idealMagnitude(frequencyHz: number): number {
  const w = 2 * Math.PI * frequencyHz;
  return (
    Math.hypot(1, w * RIAA_ZERO_S) /
    (Math.hypot(1, w * RIAA_POLE_LF_S) * Math.hypot(1, w * RIAA_POLE_HF_S))
  );
}

/** Ideal continuous-time RIAA playback response in dB, 0 dB at 1 kHz. */
export function idealRiaaDb(frequencyHz: number): number {
  assertPositive(frequencyHz, 'frequencyHz');
  return 20 * Math.log10(idealMagnitude(frequencyHz) / idealMagnitude(REFERENCE_HZ));
}

/**
 * Response of the discrete filter in dB, 0 dB at 1 kHz.
 *
 * The poles are impulse-invariant one-poles and the zero is a first
 * difference. Both map the infinite analogue frequency axis onto 0..Nyquist,
 * so the response is compressed as it approaches fs/2: the match to the ideal
 * curve is tight through the midrange and drifts by a few dB at 20 kHz.
 */
export function discreteRiaaDb(frequencyHz: number, sampleRate: number): number {
  assertPositive(frequencyHz, 'frequencyHz');
  assertPositive(sampleRate, 'sampleRate');
  return (
    20 *
    Math.log10(
      rawDiscreteMagnitude(frequencyHz, sampleRate) /
        rawDiscreteMagnitude(REFERENCE_HZ, sampleRate),
    )
  );
}

/** One channel of the discrete RIAA filter, built from the tested coefficients. */
export class RiaaFilter {
  private readonly c: RiaaCoefficients;
  private previousInput = 0;
  private lf = 0;
  private hf = 0;

  constructor(sampleRate: number) {
    this.c = riaaCoefficients(sampleRate);
  }

  process(input: number): number {
    const zero = input + this.c.zeroGain * (input - this.previousInput);
    this.previousInput = input;
    this.lf = (1 - this.c.alphaLf) * zero + this.c.alphaLf * this.lf;
    this.hf = (1 - this.c.alphaHf) * this.lf + this.c.alphaHf * this.hf;
    return this.hf * this.c.normalize;
  }
}

/**
 * Gain applied to everything leaving the phono stage, about 0.101 (-19.9 dB).
 *
 * The playback curve boosts bass by up to +19.9 dB relative to 1 kHz, so a
 * full-scale bass note would otherwise come out almost ten times over full
 * scale. The discrete filter's impulse response is never negative, which makes
 * its DC gain its largest possible gain for any input, and that DC gain stays
 * below the ideal curve's (unit-tested from 22.05 to 192 kHz). Scaling by the
 * reciprocal of the ideal DC gain therefore guarantees that an input within ±1
 * gives an output within ±1.
 */
export const RIAA_HEADROOM = idealMagnitude(REFERENCE_HZ);

/** Level of needle sounds when music bypasses the curve; they were balanced against this. */
export const STYLUS_LEVEL = 0.4;

/**
 * One channel of the phono stage. Music and the sounds made at the stylus
 * arrive separately, because a real record carries its music pre-emphasised
 * and the playback curve only restores it, while a needle thump is shaped by
 * the curve alone.
 */
export class PhonoStage {
  private readonly filter: RiaaFilter;

  constructor(sampleRate: number) {
    this.filter = new RiaaFilter(sampleRate);
  }

  /**
   * `warm` applies the playback curve to everything, at the headroom gain.
   * Otherwise music passes untouched and only the stylus sounds are equalised.
   */
  process(music: number, stylus: number, warm: boolean): number {
    if (warm) return this.filter.process(music + stylus) * RIAA_HEADROOM;
    return music + this.filter.process(stylus) * STYLUS_LEVEL;
  }
}
