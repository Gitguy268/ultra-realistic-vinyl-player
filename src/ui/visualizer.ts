import { createBarsState, stepBars, type BarsState } from './bars';
import {
  LevelHistory,
  bandLevels,
  heatColour,
  logEdges,
  musicBins,
  risingZeroCrossing,
} from './scopes';

const SIZE_PX = 512;
const BARS_FFT_SIZE = 2048;
const PRESET_SECONDS = 30;
const BLEND_SECONDS = 2.7;

/** A visualizer drawing into its own canvas, for the record label. */
export interface LabelVisualizer {
  readonly canvas: HTMLCanvasElement;
  /** Draws one frame. Copy the canvas in the same task: WebGL clears it afterwards. */
  render(): void;
}

/** Butterchurn needs WebGL 2. */
export function visualizerSupported(): boolean {
  return document.createElement('canvas').getContext('webgl2') !== null;
}

// Both packages are CommonJS bundles; depending on the bundler the export sits one level deeper.
function unwrap<T>(module: { default: T }): T {
  return (module.default as { default?: T }).default ?? module.default;
}

/** Loads butterchurn on demand and listens to `source`. */
export async function createLabelVisualizer(
  ctx: AudioContext,
  source: AudioNode,
): Promise<LabelVisualizer> {
  const [butterchurn, presetPack] = await Promise.all([
    import('butterchurn'),
    import('butterchurn-presets/lib/butterchurnPresetsMinimal.min.js'),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE_PX;
  canvas.height = SIZE_PX;
  const visualizer = unwrap(butterchurn).createVisualizer(ctx, canvas, {
    width: SIZE_PX,
    height: SIZE_PX,
    pixelRatio: 1,
  });
  visualizer.connectAudio(source);
  const presets = Object.values(unwrap(presetPack).getPresets());
  let nextPresetAt = 0;
  return {
    canvas,
    render() {
      const now = performance.now();
      if (now >= nextPresetAt) {
        const preset = presets[Math.floor(Math.random() * presets.length)];
        if (preset) visualizer.loadPreset(preset, nextPresetAt ? BLEND_SECONDS : 0);
        nextPresetAt = now + PRESET_SECONDS * 1000;
      }
      visualizer.render();
    },
  };
}

// The bars are drawn after Musializer's fft_render (https://github.com/tsoding/musializer),
// MIT licensed, Copyright 2023 Alexey Kutepov and Musializer Contributors.

/** Where the bars sit in a drawing area, as fractions of its size. */
export interface BarsFrame {
  left: number;
  right: number;
  /** Top of the tallest possible bar, and the line the bars stand on. */
  top: number;
  bottom: number;
}

/** Inside a circle: the bars stand on a chord below the centre, where it is still wide. */
const LABEL_FRAME: BarsFrame = { left: 0.1, right: 0.9, top: 0.22, bottom: 0.8 };

export function drawBars(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: BarsState,
  frame: BarsFrame,
): void {
  const { smooth, smear } = state;
  const count = smooth.length;
  const cell = ((frame.right - frame.left) * width) / count;
  const floor = frame.bottom * height;
  const reach = (frame.bottom - frame.top) * height;

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#151515';
  ctx.fillRect(0, 0, width, height);
  // Light adds up where glows overlap.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const level = smooth[i];
    const size = Math.sqrt(level);
    const x = frame.left * width + (i + 0.5) * cell;
    const y = floor - reach * level;
    const tail = floor - reach * smear[i];
    const hue = (i / count) * 360;
    const colour = `hsl(${hue} 100% 62.5%)`;

    ctx.fillStyle = colour;
    const thickness = (cell / 3) * size;
    ctx.fillRect(x - thickness / 2, y, thickness, floor - y);

    // The smear: a soft streak from where the bar was to where it is.
    const streak = cell * 3 * size;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(x - streak / 2, Math.min(y, tail), streak, Math.abs(tail - y));
    ctx.globalAlpha = 1;

    // Half the size Musializer gives its dots: a label is a small stage.
    const radius = cell * 3 * size;
    if (radius < 0.5) continue;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, colour);
    glow.addColorStop(0.14, colour);
    glow.addColorStop(0.4, `hsl(${hue} 100% 62.5% / 0.2)`);
    glow.addColorStop(1, `hsl(${hue} 100% 62.5% / 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fill();
  }
}

/** Listens to `source` and draws the bars into its own canvas, for the record label. */
export function createBarsVisualizer(ctx: AudioContext, source: AudioNode): LabelVisualizer {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = BARS_FFT_SIZE;
  // The bars do their own easing.
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  const spectrum = new Float32Array(analyser.frequencyBinCount);
  const state = createBarsState(analyser.frequencyBinCount);

  const canvas = document.createElement('canvas');
  canvas.width = SIZE_PX;
  canvas.height = SIZE_PX;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available');
  let last = performance.now();
  return {
    canvas,
    render() {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      analyser.getFloatFrequencyData(spectrum);
      stepBars(state, spectrum, dt);
      drawBars(context, SIZE_PX, SIZE_PX, state, LABEL_FRAME);
    },
  };
}

/** The styles drawn from the spectrum or waveform in plain 2D canvas. */
export type ScopeStyle = 'lines' | 'scope' | 'spectrogram' | 'radial';

const BACKGROUND = '#151515';
const RIDGE_ROWS = 18;
const RIDGE_POINTS = 61;
const SPECTRO_ROWS = 128;
const SPECTRO_STEP_PX = 3;
/** The spectrogram's rows stay inside the round label. */
const SPECTRO_TOP = 0.16;
const SPECTRO_BOTTOM = 0.84;
const RADIAL_BANDS = 48;
/** Inner and outer reach of the radial bars, as fractions of the canvas: clear of the spindle. */
const RADIAL_INNER = 0.1;
const RADIAL_OUTER = 0.46;

type Draw = (
  ctx: CanvasRenderingContext2D,
  spectrum: Float32Array,
  wave: Float32Array,
  dt: number,
) => void;

function ridgelines([first, last]: [number, number]): Draw {
  // Half the points carry bands; the line mirrors them, bass in the middle as on the pulsar plot.
  const half = Math.ceil(RIDGE_POINTS / 2);
  const edges = logEdges(last, half, first);
  const levels = new Float32Array(half);
  const history = new LevelHistory(RIDGE_ROWS, half);
  const left = 0.17 * SIZE_PX;
  const width = 0.66 * SIZE_PX;
  const top = 0.34 * SIZE_PX;
  const gap = (0.42 * SIZE_PX) / RIDGE_ROWS;
  const lift = 0.2 * SIZE_PX;
  return (ctx, spectrum) => {
    bandLevels(spectrum, edges, levels);
    history.push(levels);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, SIZE_PX, SIZE_PX);
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#f0ede6';
    // Oldest at the top; each newer line is filled so it hides the ones behind it.
    for (let row = 0; row < RIDGE_ROWS; row++) {
      const line = history.row(row);
      const base = top + row * gap;
      ctx.beginPath();
      ctx.moveTo(left, base);
      for (let i = 0; i < RIDGE_POINTS; i++) {
        const offset = Math.abs((2 * i) / (RIDGE_POINTS - 1) - 1);
        const band = Math.min(half - 1, Math.round(offset * (half - 1)));
        // The ends taper flat, so each line starts and stops on its baseline.
        const taper = Math.cos((offset * Math.PI) / 2) ** 0.6;
        const x = left + (i / (RIDGE_POINTS - 1)) * width;
        ctx.lineTo(x, base - lift * (line[band] ?? 0) ** 2 * taper);
      }
      ctx.lineTo(left + width, base);
      ctx.fillStyle = BACKGROUND;
      ctx.fill();
      ctx.stroke();
    }
  };
}

function oscilloscope(): Draw {
  return (ctx, _spectrum, wave) => {
    // Fading what was there leaves a phosphor trail.
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, SIZE_PX, SIZE_PX);
    ctx.globalAlpha = 1;
    const start = risingZeroCrossing(wave);
    const shown = Math.floor(wave.length / 2);
    const mid = SIZE_PX / 2;
    ctx.beginPath();
    for (let i = 0; i < shown; i++) {
      const x = 0.08 * SIZE_PX + (i / (shown - 1)) * 0.84 * SIZE_PX;
      const y = mid - (wave[start + i] ?? 0) * 0.3 * SIZE_PX;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#7dff9a';
    ctx.shadowColor = '#3cff6e';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  };
}

function spectrogram([first, last]: [number, number]): Draw {
  const edges = logEdges(last, SPECTRO_ROWS, first);
  const levels = new Float32Array(SPECTRO_ROWS);
  const rowHeight = ((SPECTRO_BOTTOM - SPECTRO_TOP) * SIZE_PX) / SPECTRO_ROWS;
  let primed = false;
  return (ctx, spectrum) => {
    if (!primed) {
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, SIZE_PX, SIZE_PX);
      primed = true;
    }
    // Scroll left and paint the newest column on the right, low notes at the bottom.
    ctx.drawImage(ctx.canvas, -SPECTRO_STEP_PX, 0);
    bandLevels(spectrum, edges, levels);
    for (let row = 0; row < SPECTRO_ROWS; row++) {
      const [r, g, b] = heatColour(levels[row] ?? 0);
      ctx.fillStyle = `rgb(${r} ${g} ${b})`;
      ctx.fillRect(
        SIZE_PX - SPECTRO_STEP_PX,
        SPECTRO_BOTTOM * SIZE_PX - (row + 1) * rowHeight,
        SPECTRO_STEP_PX,
        rowHeight + 0.5,
      );
    }
  };
}

function radial([first, last]: [number, number]): Draw {
  const edges = logEdges(last, RADIAL_BANDS, first);
  const levels = new Float32Array(RADIAL_BANDS);
  const eased = new Float32Array(RADIAL_BANDS);
  const centre = SIZE_PX / 2;
  const inner = RADIAL_INNER * SIZE_PX;
  const reach = (RADIAL_OUTER - RADIAL_INNER) * SIZE_PX;
  return (ctx, spectrum, _wave, dt) => {
    bandLevels(spectrum, edges, levels);
    const follow = Math.min(1, 10 * dt);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, SIZE_PX, SIZE_PX);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const spoke = (Math.PI / RADIAL_BANDS) * inner * 0.9;
    for (let i = 0; i < RADIAL_BANDS; i++) {
      eased[i] = (eased[i] ?? 0) + ((levels[i] ?? 0) - (eased[i] ?? 0)) * follow;
      const length = reach * (eased[i] ?? 0) ** 2;
      if (length < 0.5) continue;
      const hue = (i / RADIAL_BANDS) * 300;
      ctx.strokeStyle = `hsl(${hue} 100% 62.5%)`;
      ctx.lineWidth = spoke;
      // Bass at the top, mirrored down both sides.
      for (const side of [1, -1]) {
        const angle = -Math.PI / 2 + side * ((i + 0.5) / RADIAL_BANDS) * Math.PI;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        ctx.beginPath();
        ctx.moveTo(centre + cos * inner, centre + sin * inner);
        ctx.lineTo(centre + cos * (inner + length), centre + sin * (inner + length));
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  };
}

/** Listens to `source` and draws one of the 2D styles into its own canvas, for the record label. */
export function createScopeVisualizer(
  style: ScopeStyle,
  ctx: AudioContext,
  source: AudioNode,
): LabelVisualizer {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = BARS_FFT_SIZE;
  analyser.smoothingTimeConstant = style === 'radial' ? 0 : 0.5;
  source.connect(analyser);
  const spectrum = new Float32Array(analyser.frequencyBinCount);
  const wave = new Float32Array(analyser.fftSize);
  const bins = musicBins(analyser.frequencyBinCount, ctx.sampleRate);
  const draws: Record<ScopeStyle, () => Draw> = {
    lines: () => ridgelines(bins),
    scope: () => oscilloscope(),
    spectrogram: () => spectrogram(bins),
    radial: () => radial(bins),
  };
  const draw = draws[style]();

  const canvas = document.createElement('canvas');
  canvas.width = SIZE_PX;
  canvas.height = SIZE_PX;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available');
  context.fillStyle = BACKGROUND;
  context.fillRect(0, 0, SIZE_PX, SIZE_PX);
  let last = performance.now();
  return {
    canvas,
    render() {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      analyser.getFloatFrequencyData(spectrum);
      if (style === 'scope') analyser.getFloatTimeDomainData(wave);
      draw(context, spectrum, wave, dt);
    },
  };
}
