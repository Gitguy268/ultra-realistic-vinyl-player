import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '../src/ui/settings';

describe('parseSettings', () => {
  it.each([null, undefined, 42, 'text', [], {}])('falls back to the defaults for %j', (raw) => {
    expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips valid settings through JSON', () => {
    const settings: Settings = {
      speed: 'shellac',
      pitch: -3.5,
      volume: 55,
      noise: 70,
      wear: 0.65,
      mains: 60,
      equalisation: 'warm',
      bass: 6,
      mid: -3,
      treble: 12,
      wowFlutter: false,
      visualizer: 'spectrogram',
      graphicEq: {
        on: true,
        preamp: -2.5,
        bands: [4.8, 2.9, -3.6, -5.1, -2.5, 2.5, 5.5, 6.7, 6.7, 6.7],
        preset: 'Rock',
      },
      keepSpinning: true,
      scratch: false,
      effects: false,
      recordCharacter: false,
      autoReturn: false,
      armReturn: false,
      sides: true,
      sizeBySpeed: true,
      extendedPitch: true,
      condition: 'worn',
      imperfection: 0.8,
      background: false,
    };
    expect(parseSettings(JSON.parse(JSON.stringify(settings)))).toEqual(settings);
  });

  it('repairs the deck settings field by field', () => {
    const repaired = parseSettings({
      condition: 'shiny',
      imperfection: 7,
      sides: 'yes',
      background: 'auto',
    });
    expect(repaired.condition).toBe('good');
    expect(repaired.imperfection).toBe(1);
    expect(repaired.sides).toBe(false);
    expect(repaired.background).toBeNull();
  });

  it('accepts every visualizer style and drops unknown ones', () => {
    for (const style of ['lines', 'scope', 'spectrogram', 'radial'] as const) {
      expect(parseSettings({ visualizer: style }).visualizer).toBe(style);
    }
    expect(parseSettings({ visualizer: 'winamp' }).visualizer).toBe('off');
  });

  it('repairs a damaged graphic EQ field by field', () => {
    const eq = parseSettings({
      graphicEq: { on: 'yes', preamp: 40, bands: [1, 2, 3], preset: 7 },
    }).graphicEq;
    expect(eq).toEqual({ ...DEFAULT_SETTINGS.graphicEq, preamp: 12 });
    const bands = parseSettings({
      graphicEq: { bands: [99, -99, 'x', 0, 0, 0, 0, 0, 0, 0] },
    }).graphicEq.bands;
    expect(bands.slice(0, 3)).toEqual([12, -12, 0]);
  });

  it('clamps numbers to the range of their control', () => {
    const parsed = parseSettings({
      pitch: 40,
      volume: -5,
      noise: 900,
      wear: 7,
      bass: 99,
      treble: -99,
    });
    expect(parsed.bass).toBe(12);
    expect(parsed.treble).toBe(-12);
    expect(parsed.pitch).toBe(8);
    expect(parsed.volume).toBe(0);
    expect(parsed.noise).toBe(100);
    expect(parsed.wear).toBe(1);
    expect(parseSettings({ pitch: -40 }).pitch).toBe(-8);
  });

  it('rejects values of the wrong type field by field', () => {
    const parsed = parseSettings({
      speed: 'warp',
      pitch: '2',
      volume: Number.NaN,
      noise: null,
      wear: 'worn',
      mains: 55,
      equalisation: 'loud',
      mid: '3',
      wowFlutter: 0,
      visualizer: true,
    });
    expect(parsed).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps the valid fields when others are bad', () => {
    const parsed = parseSettings({ speed: 'single', volume: 'loud', mains: 60 });
    expect(parsed.speed).toBe('single');
    expect(parsed.mains).toBe(60);
    expect(parsed.volume).toBe(DEFAULT_SETTINGS.volume);
  });

  it('does not accept inherited property names as a speed', () => {
    expect(parseSettings({ speed: 'toString' }).speed).toBe('lp');
    expect(parseSettings({ speed: '__proto__' }).speed).toBe('lp');
  });

  it('ignores the RIAA switch saved by an earlier version', () => {
    expect(parseSettings({ riaa: true }).equalisation).toBe('flat');
    expect(parseSettings({ riaa: false })).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores unknown fields', () => {
    expect(parseSettings({ volume: 10, extra: 'x' })).toEqual({ ...DEFAULT_SETTINGS, volume: 10 });
  });
});
