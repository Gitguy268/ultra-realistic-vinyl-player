import { describe, expect, it } from 'vitest';
import {
  RIAA_POLE_HF_S,
  RIAA_POLE_LF_S,
  PhonoStage,
  RIAA_HEADROOM,
  STYLUS_LEVEL,
  RIAA_ZERO_S,
  RiaaFilter,
  discreteRiaaDb,
  idealRiaaDb,
  riaaCoefficients,
} from '../src/audio/riaa';

describe('RIAA constants', () => {
  it('uses the playback time constants 318, 75 and 3180 µs', () => {
    expect(RIAA_ZERO_S).toBeCloseTo(318e-6, 12);
    expect(RIAA_POLE_HF_S).toBeCloseTo(75e-6, 12);
    expect(RIAA_POLE_LF_S).toBeCloseTo(3180e-6, 12);
  });
});

describe('idealRiaaDb', () => {
  it('is 0 dB at 1 kHz', () => {
    expect(idealRiaaDb(1000)).toBeCloseTo(0, 12);
  });

  it('boosts bass by about +19.3 dB at 20 Hz', () => {
    expect(idealRiaaDb(20)).toBeCloseTo(19.27, 1);
  });

  it('cuts treble by about -19.6 dB at 20 kHz', () => {
    expect(idealRiaaDb(20000)).toBeCloseTo(-19.62, 1);
  });

  it('is about a x4 gain at 100 Hz', () => {
    expect(10 ** (idealRiaaDb(100) / 20)).toBeCloseTo(4.51, 1);
  });

  it('falls monotonically with frequency', () => {
    const points = [20, 50, 100, 500, 1000, 2000, 5000, 10000, 20000].map(idealRiaaDb);
    for (let i = 1; i < points.length; i++) expect(points[i]).toBeLessThan(points[i - 1]!);
  });

  it('rejects non-positive frequencies', () => {
    expect(() => idealRiaaDb(0)).toThrow(RangeError);
    expect(() => idealRiaaDb(Number.NaN)).toThrow(RangeError);
  });
});

describe('riaaCoefficients', () => {
  it('derives the zero gain and pole alphas from the sample rate', () => {
    const c = riaaCoefficients(48000);
    expect(c.zeroGain).toBeCloseTo(318e-6 * 48000, 10);
    expect(c.alphaLf).toBeCloseTo(Math.exp(-1 / (3180e-6 * 48000)), 12);
    expect(c.alphaHf).toBeCloseTo(Math.exp(-1 / (75e-6 * 48000)), 12);
    expect(c.normalize).toBeGreaterThan(0);
  });

  it('rejects an invalid sample rate', () => {
    expect(() => riaaCoefficients(0)).toThrow(RangeError);
    expect(() => riaaCoefficients(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('discreteRiaaDb', () => {
  // Tolerances derived numerically at 48 kHz (worst case 0.23 dB below 2 kHz,
  // 0.20 dB at 5 kHz, 0.67 dB at 10 kHz, 2.68 dB at 20 kHz).
  it.each([
    [20, 0.3],
    [50, 0.3],
    [100, 0.3],
    [500, 0.3],
    [1000, 0.3],
    [2000, 0.3],
    [5000, 0.4],
    [10000, 1],
    [20000, 3],
  ])('matches the ideal curve at %i Hz within %f dB (48 kHz)', (hz, tolerance) => {
    expect(Math.abs(discreteRiaaDb(hz, 48000) - idealRiaaDb(hz))).toBeLessThanOrEqual(tolerance);
  });

  it('stays within 3.5 dB at 20 kHz when running at 44.1 kHz', () => {
    expect(Math.abs(discreteRiaaDb(20000, 44100) - idealRiaaDb(20000))).toBeLessThanOrEqual(3.5);
  });

  it('errs toward less treble cut near Nyquist', () => {
    expect(discreteRiaaDb(20000, 48000)).toBeGreaterThan(idealRiaaDb(20000));
  });
});

describe('RiaaFilter', () => {
  function measuredDb(hz: number, sampleRate: number): number {
    const filter = new RiaaFilter(sampleRate);
    let peak = 0;
    for (let n = 0; n < sampleRate; n++) {
      const y = filter.process(Math.sin((2 * Math.PI * hz * n) / sampleRate));
      if (n > sampleRate / 2) peak = Math.max(peak, Math.abs(y));
    }
    return 20 * Math.log10(peak);
  }

  it.each([100, 1000, 5000])('realises the computed response at %i Hz', (hz) => {
    expect(measuredDb(hz, 48000)).toBeCloseTo(discreteRiaaDb(hz, 48000), 1);
  });

  it('passes silence as silence', () => {
    const filter = new RiaaFilter(48000);
    expect(filter.process(0)).toBe(0);
  });
});

describe('RIAA_HEADROOM', () => {
  const RATES = [22050, 44100, 48000, 88200, 96000, 192000];

  it('is the reciprocal of the ideal DC gain, about -19.9 dB', () => {
    expect(20 * Math.log10(RIAA_HEADROOM)).toBeCloseTo(-19.91, 1);
    expect(RIAA_HEADROOM).toBeCloseTo(10 ** (-idealRiaaDb(0.001) / 20), 6);
  });

  it.each(RATES)('covers the discrete DC gain at %i Hz', (sampleRate) => {
    expect(riaaCoefficients(sampleRate).normalize * RIAA_HEADROOM).toBeLessThanOrEqual(1);
  });

  // A non-negative impulse response means no input within ±1 can beat the DC gain.
  it.each(RATES)('has a non-negative impulse response at %i Hz', (sampleRate) => {
    const filter = new RiaaFilter(sampleRate);
    let sum = 0;
    for (let n = 0; n < sampleRate * 3; n++) {
      const y = filter.process(n === 0 ? 1 : 0);
      expect(y).toBeGreaterThanOrEqual(0);
      sum += y;
    }
    expect(sum).toBeCloseTo(riaaCoefficients(sampleRate).normalize, 3);
  });
});

describe('PhonoStage', () => {
  type Mode = 'warm' | 'flat';

  /** Steady-state peak for a signal sent in as music, as a stylus sound, or both. */
  function peak(
    mode: Mode,
    music: (n: number) => number,
    stylus: (n: number) => number = () => 0,
    sampleRate = 48000,
  ): number {
    const stage = new PhonoStage(sampleRate);
    let max = 0;
    for (let n = 0; n < sampleRate * 2; n++) {
      const y = Math.abs(stage.process(music(n), stylus(n), mode === 'warm'));
      if (n > sampleRate) max = Math.max(max, y);
    }
    return max;
  }
  const silence = (): number => 0;
  const sine =
    (hz: number, sampleRate = 48000) =>
    (n: number): number =>
      Math.sin((2 * Math.PI * hz * n) / sampleRate);

  describe('flat', () => {
    it('passes music through untouched, sample for sample', () => {
      const stage = new PhonoStage(48000);
      for (let n = 0; n < 2000; n++) {
        const x = Math.sin(n * 0.37) * 0.9;
        expect(stage.process(x, 0, false)).toBe(x);
      }
    });

    it('shapes stylus sounds with the RIAA curve at the stylus level', () => {
      const reference = peak('flat', silence, sine(1000));
      expect(reference).toBeCloseTo(STYLUS_LEVEL, 3);
      const bass = peak('flat', silence, sine(100));
      expect(20 * Math.log10(bass / reference)).toBeCloseTo(discreteRiaaDb(100, 48000), 1);
    });
  });

  describe('warm', () => {
    it.each([10, 20, 30, 50, 100, 1000, 10000, 20000])(
      'never exceeds full scale for a full-scale %i Hz sine',
      (hz) => {
        for (const sampleRate of [44100, 48000, 96000]) {
          expect(peak('warm', sine(hz, sampleRate), silence, sampleRate)).toBeLessThanOrEqual(1);
        }
      },
    );

    it('never exceeds full scale for a full-scale 20 Hz square wave', () => {
      const out = peak('warm', (n) => (sine(20)(n) >= 0 ? 1 : -1));
      expect(out).toBeLessThanOrEqual(1);
      expect(out).toBeGreaterThan(0.9);
    });

    it('never exceeds full scale for worst-case noise', () => {
      let state = 1;
      const noise = (): number => {
        state = (state * 16807) % 2147483647;
        return state % 2 === 0 ? 1 : -1;
      };
      expect(peak('warm', noise)).toBeLessThanOrEqual(1);
    });

    it('puts 1 kHz at the headroom gain and follows the curve', () => {
      const reference = peak('warm', sine(1000));
      expect(reference).toBeCloseTo(RIAA_HEADROOM, 3);
      const bass = peak('warm', sine(100));
      expect(20 * Math.log10(bass / reference)).toBeCloseTo(discreteRiaaDb(100, 48000), 1);
    });

    it('treats music and stylus sounds alike', () => {
      expect(peak('warm', silence, sine(100))).toBeCloseTo(peak('warm', sine(100)), 9);
    });
  });
});
