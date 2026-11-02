export interface WowFlutterParams {
  wowHz: number;
  /** Peak fractional speed deviation from wow, e.g. 0.0012 = 0.12 %. */
  wowDepth: number;
  flutterHz: number;
  flutterDepth: number;
}

export const DEFAULT_WOW_FLUTTER: WowFlutterParams = {
  wowHz: 0.73,
  wowDepth: 0.0012,
  flutterHz: 6.7,
  flutterDepth: 0.0005,
};

export const NO_WOW_FLUTTER: WowFlutterParams = {
  ...DEFAULT_WOW_FLUTTER,
  wowDepth: 0,
  flutterDepth: 0,
};

export const MAX_DEPTH = 0.05;

/** The Imperfection control scales wow and flutter: 0.5 is exactly the default depth (C24). */
export function wowFlutterFor(enabled: boolean, imperfection: number): WowFlutterParams {
  if (!enabled) return NO_WOW_FLUTTER;
  const scale = Math.max(0, Math.min(1, imperfection)) / 0.5;
  return {
    ...DEFAULT_WOW_FLUTTER,
    wowDepth: DEFAULT_WOW_FLUTTER.wowDepth * scale,
    flutterDepth: DEFAULT_WOW_FLUTTER.flutterDepth * scale,
  };
}

// Each component is two sines whose frequency ratio is irrational, so the
// combined waveform never repeats exactly.
const SECOND_PARTIAL_RATIO = Math.SQRT2;
const PRIMARY_WEIGHT = 0.7;
const SECONDARY_WEIGHT = 0.3;

export function validateWowFlutter(params: WowFlutterParams): WowFlutterParams {
  for (const key of ['wowHz', 'flutterHz'] as const) {
    if (!Number.isFinite(params[key]) || params[key] <= 0) {
      throw new RangeError(`${key} must be a positive finite number`);
    }
  }
  for (const key of ['wowDepth', 'flutterDepth'] as const) {
    if (!Number.isFinite(params[key]) || params[key] < 0 || params[key] > MAX_DEPTH) {
      throw new RangeError(`${key} must be between 0 and ${MAX_DEPTH}`);
    }
  }
  return params;
}

function dualSine(timeSec: number, hz: number): number {
  const phase = 2 * Math.PI * hz * timeSec;
  return (
    PRIMARY_WEIGHT * Math.sin(phase) + SECONDARY_WEIGHT * Math.sin(phase * SECOND_PARTIAL_RATIO)
  );
}

/** Instantaneous speed multiplier at `timeSec`; within 1 ± (wowDepth + flutterDepth). */
export function playbackRateMultiplier(timeSec: number, params: WowFlutterParams): number {
  return (
    1 +
    params.wowDepth * dualSine(timeSec, params.wowHz) +
    params.flutterDepth * dualSine(timeSec, params.flutterHz)
  );
}
