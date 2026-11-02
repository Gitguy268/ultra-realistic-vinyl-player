/**
 * A spectrum of glowing bars, after Musializer (https://github.com/tsoding/musializer):
 * log-spaced bands, each eased towards its level, with a slower "smear" trailing behind.
 * This is the analysis, after its fft_analyze; the drawing is in visualizer.ts.
 * Musializer is MIT licensed, Copyright 2023 Alexey Kutepov and Musializer Contributors.
 */

/** Each band starts this much higher than the last, so low notes get as much room as high ones. */
const BAND_STEP = 1.3;
/** Quieter than this is drawn as nothing. */
const FLOOR_DB = -70;
/** The loudest band fills the height, but only once it is this far above the floor: silence stays flat. */
const MIN_RANGE_DB = 50;
/** How fast a bar follows its level, and its smear follows the bar, per second. */
const SMOOTHNESS = 8;
const SMEARNESS = 3;

export interface BarsState {
  /** First FFT bin of each band; one more entry closes the last band. */
  readonly edges: readonly number[];
  readonly level: Float32Array;
  /** 0 to 1 per band: the bar, and the smear that trails it. */
  readonly smooth: Float32Array;
  readonly smear: Float32Array;
}

export function createBarsState(binCount: number, step = BAND_STEP): BarsState {
  const edges: number[] = [];
  for (let bin = 1; bin < binCount; bin = Math.ceil(bin * step)) edges.push(bin);
  edges.push(binCount);
  const count = edges.length - 1;
  return {
    edges,
    level: new Float32Array(count),
    smooth: new Float32Array(count),
    smear: new Float32Array(count),
  };
}

/** Moves the bars towards a new spectrum (decibels per FFT bin, -Infinity for silence). */
export function stepBars(state: BarsState, spectrum: Float32Array, dt: number): void {
  const { edges, level, smooth, smear } = state;
  let loudest = MIN_RANGE_DB;
  for (let i = 0; i < level.length; i++) {
    let peak = -Infinity;
    for (let bin = edges[i]; bin < edges[i + 1]; bin++) peak = Math.max(peak, spectrum[bin]);
    level[i] = Math.max(0, peak - FLOOR_DB);
    loudest = Math.max(loudest, level[i]);
  }
  // Past one whole step the easing would overshoot.
  const follow = Math.min(1, SMOOTHNESS * dt);
  const trail = Math.min(1, SMEARNESS * dt);
  for (let i = 0; i < level.length; i++) {
    smooth[i] += (level[i] / loudest - smooth[i]) * follow;
    smear[i] += (smooth[i] - smear[i]) * trail;
  }
}
