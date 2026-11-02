/**
 * The analysis behind the ridgeline, scope, spectrogram and radial label
 * visualizers; the drawing is in visualizer.ts. The styles are ideas found
 * through awesome-audio-visualization (https://github.com/willianjusten/awesome-audio-visualization,
 * CC0): "Lines" (the Unknown Pleasures look), the oscilloscope, the scrolling
 * spectrogram and circular spectra such as "Awesome Audio Player". No code is
 * taken from any of them.
 */

/** Quieter than this is drawn as nothing. */
const FLOOR_DB = -90;
/** From the floor to full height. */
const RANGE_DB = 70;

/**
 * First FFT bin of each of `count` bands spaced evenly on a log scale, from
 * `firstBin` to `lastBin`; one more entry closes the last band. Every band holds a bin.
 */
export function logEdges(lastBin: number, count: number, firstBin = 1): number[] {
  const edges: number[] = [];
  for (let i = 0; i <= count; i++) {
    const bin = Math.round(firstBin * (lastBin / firstBin) ** (i / count));
    const previous = edges.at(-1) ?? firstBin - 1;
    edges.push(Math.min(lastBin, Math.max(bin, previous + 1)));
  }
  // At the top the forced steps can pile up on lastBin; spread them back down.
  for (let i = count - 1; i >= 0; i--) {
    edges[i] = Math.min(edges[i] ?? 0, (edges[i + 1] ?? lastBin) - 1);
  }
  return edges;
}

/** The FFT bins from about 45 Hz to 16 kHz, where music has something to show. */
export function musicBins(binCount: number, sampleRate: number): [first: number, last: number] {
  const hzPerBin = sampleRate / 2 / binCount;
  return [Math.max(1, Math.round(45 / hzPerBin)), Math.min(binCount, Math.round(16000 / hzPerBin))];
}

/** Loudest bin of each band (decibels per bin), as 0 to 1, into `out`. */
export function bandLevels(
  spectrum: Float32Array,
  edges: readonly number[],
  out: Float32Array,
): void {
  for (let i = 0; i < out.length; i++) {
    let peak = -Infinity;
    for (let bin = edges[i] ?? 0; bin < (edges[i + 1] ?? 0); bin++) {
      peak = Math.max(peak, spectrum[bin] ?? -Infinity);
    }
    out[i] = Math.max(0, Math.min(1, (peak - FLOOR_DB) / RANGE_DB));
  }
}

/** The last `rows` frames of band levels, oldest first, in a ring. */
export class LevelHistory {
  private readonly frames: Float32Array[];
  private next = 0;

  constructor(
    readonly rows: number,
    readonly bands: number,
  ) {
    this.frames = Array.from({ length: rows }, () => new Float32Array(bands));
  }

  push(levels: Float32Array): void {
    this.frames[this.next]?.set(levels);
    this.next = (this.next + 1) % this.rows;
  }

  /** Row 0 is the oldest frame, row `rows - 1` the newest. */
  row(index: number): Float32Array {
    return this.frames[(this.next + index) % this.rows] ?? new Float32Array(this.bands);
  }
}

/** Index of the first rise through zero in the first half of `samples`, or 0. Holds a scope still. */
export function risingZeroCrossing(samples: Float32Array): number {
  const end = Math.floor(samples.length / 2);
  for (let i = 1; i < end; i++) {
    if ((samples[i - 1] ?? 0) < 0 && (samples[i] ?? 0) >= 0) return i;
  }
  return 0;
}

const HEAT: readonly (readonly [number, number, number])[] = [
  [21, 21, 21],
  [64, 18, 110],
  [190, 40, 90],
  [245, 120, 40],
  [255, 220, 90],
  [255, 255, 235],
];

/** A heat colour for a level of 0 to 1: the label's black, through purple and red, to white. */
export function heatColour(level: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, level)) * (HEAT.length - 1);
  const i = Math.min(HEAT.length - 2, Math.floor(t));
  const f = t - i;
  const [r0, g0, b0] = HEAT[i] ?? [0, 0, 0];
  const [r1, g1, b1] = HEAT[i + 1] ?? [r0, g0, b0];
  const mix = (from: number, to: number): number => Math.round(from + (to - from) * f);
  return [mix(r0, r1), mix(g0, g1), mix(b0, b1)];
}
