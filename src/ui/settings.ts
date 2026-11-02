import { clampTone, type Equalisation } from '../audio/mix';
import { DEFAULT_NOISE_LEVEL, DEFAULT_WEAR, clampNoiseLevel, clampWear } from '../audio/noise';
import { FLAT_EQ, parseGraphicEq, type GraphicEq } from '../audio/winamp-eq';
import { MAX_PITCH, SPEED_PRESETS, type SpeedPreset } from '../turntable/motor';
import type { MainsHz } from '../turntable/strobe';

/** What the record label shows while a record plays. */
export const VISUALIZER_STYLES = [
  'off',
  'milkdrop',
  'bars',
  'lines',
  'scope',
  'spectrogram',
  'radial',
] as const;
export type VisualizerStyle = (typeof VISUALIZER_STYLES)[number];

/** The deck settings remembered between visits, in the units the controls use. */
export interface Settings {
  speed: SpeedPreset;
  /** Percent, -8 to 8. */
  pitch: number;
  /** 0 to 100. */
  volume: number;
  /** 0 to 100. */
  noise: number;
  /** 0 to 1. */
  wear: number;
  mains: MainsHz;
  equalisation: Equalisation;
  /** Tone controls in dB, -12 to 12. */
  bass: number;
  mid: number;
  treble: number;
  wowFlutter: boolean;
  visualizer: VisualizerStyle;
  graphicEq: GraphicEq;
  /** Deck settings (html-1's and the new ones). */
  keepSpinning: boolean;
  /** Hear the record under the hand (App) or scrub silently with a whoosh (html-1's Scratch off). */
  scratch: boolean;
  /** Mechanical sounds: plates, cue, arm, motor, thump (html-1's Effects). */
  effects: boolean;
  /** The cut-record chain after the EQ (C21). */
  recordCharacter: boolean;
  /** The M/START plate at START: the end stop lifts the arm at the end of a side. */
  autoReturn: boolean;
  /** After the end stop the arm swings back to its rest. */
  armReturn: boolean;
  sides: boolean;
  sizeBySpeed: boolean;
  extendedPitch: boolean;
  condition: Condition;
  /** Wow, flutter, wobble and warp, 0 to 1. */
  imperfection: number;
  /** Route the sound through a media element so a locked phone keeps playing; null = automatic. */
  background: boolean | null;
}

export const CONDITIONS = ['mint', 'good', 'worn', 'beat'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const DEFAULT_SETTINGS: Settings = {
  speed: 'lp',
  pitch: 0,
  volume: 80,
  noise: DEFAULT_NOISE_LEVEL,
  wear: DEFAULT_WEAR,
  mains: 50,
  equalisation: 'flat',
  bass: 0,
  mid: 0,
  treble: 0,
  wowFlutter: true,
  visualizer: 'off',
  graphicEq: FLAT_EQ,
  keepSpinning: false,
  scratch: true,
  effects: true,
  recordCharacter: true,
  autoReturn: true,
  armReturn: true,
  sides: false,
  sizeBySpeed: false,
  extendedPitch: false,
  condition: 'good',
  imperfection: 0.5,
  background: null,
};

const MAX_PITCH_PERCENT = MAX_PITCH * 100;

function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * Builds valid settings from stored data. Storage can hold anything (an older
 * version's shape, a hand-edited value), so every field is checked and falls
 * back to its default on its own.
 */
export function parseSettings(raw: unknown): Settings {
  const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    speed:
      typeof stored.speed === 'string' && Object.hasOwn(SPEED_PRESETS, stored.speed)
        ? (stored.speed as SpeedPreset)
        : d.speed,
    pitch: numberIn(stored.pitch, -MAX_PITCH_PERCENT, MAX_PITCH_PERCENT, d.pitch),
    volume: numberIn(stored.volume, 0, 100, d.volume),
    noise: typeof stored.noise === 'number' ? clampNoiseLevel(stored.noise) : d.noise,
    wear: typeof stored.wear === 'number' ? clampWear(stored.wear) : d.wear,
    mains: stored.mains === 50 || stored.mains === 60 ? stored.mains : d.mains,
    equalisation: stored.equalisation === 'warm' ? 'warm' : d.equalisation,
    bass: typeof stored.bass === 'number' ? clampTone(stored.bass) : d.bass,
    mid: typeof stored.mid === 'number' ? clampTone(stored.mid) : d.mid,
    treble: typeof stored.treble === 'number' ? clampTone(stored.treble) : d.treble,
    wowFlutter: flag(stored.wowFlutter, d.wowFlutter),
    visualizer: VISUALIZER_STYLES.find((style) => style === stored.visualizer) ?? d.visualizer,
    graphicEq: parseGraphicEq(stored.graphicEq),
    keepSpinning: flag(stored.keepSpinning, d.keepSpinning),
    scratch: flag(stored.scratch, d.scratch),
    effects: flag(stored.effects, d.effects),
    recordCharacter: flag(stored.recordCharacter, d.recordCharacter),
    autoReturn: flag(stored.autoReturn, d.autoReturn),
    armReturn: flag(stored.armReturn, d.armReturn),
    sides: flag(stored.sides, d.sides),
    sizeBySpeed: flag(stored.sizeBySpeed, d.sizeBySpeed),
    extendedPitch: flag(stored.extendedPitch, d.extendedPitch),
    condition: CONDITIONS.find((c) => c === stored.condition) ?? d.condition,
    imperfection: numberIn(stored.imperfection, 0, 1, d.imperfection),
    background: typeof stored.background === 'boolean' ? stored.background : null,
  };
}
