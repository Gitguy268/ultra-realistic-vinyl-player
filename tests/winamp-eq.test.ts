import { describe, expect, it } from 'vitest';
import {
  EQ_BANDS,
  WINAMP_PRESETS,
  activeGains,
  bandType,
  eqfValueToDb,
  parseEqf,
  parsePresets,
} from '../src/audio/winamp-eq';

/** Builds an .eqf file the way Winamp writes one: header, then name and eleven bytes per preset. */
function eqf(presets: { name: string; bytes: number[] }[]): ArrayBuffer {
  const header = [...'Winamp EQ library file v1.1'].map((c) => c.charCodeAt(0));
  const out = [...header, 0x1a, ...[...'!--'].map((c) => c.charCodeAt(0))];
  for (const { name, bytes } of presets) {
    const field = new Array<number>(257).fill(0);
    [...name].forEach((c, i) => (field[i] = c.charCodeAt(0)));
    out.push(...field, ...bytes);
  }
  return new Uint8Array(out).buffer;
}

describe('Winamp bands', () => {
  it('has ten bands, shelves at the ends', () => {
    expect(EQ_BANDS).toHaveLength(10);
    expect(bandType(0)).toBe('lowshelf');
    expect(bandType(5)).toBe('peaking');
    expect(bandType(9)).toBe('highshelf');
  });

  it('maps slider values to ±12 dB with 33 at 0 dB', () => {
    expect(eqfValueToDb(33)).toBe(0);
    expect(eqfValueToDb(64)).toBe(12);
    expect(eqfValueToDb(1)).toBe(-12);
  });

  it('ships Winamp’s 17 presets, every value in range', () => {
    expect(WINAMP_PRESETS).toHaveLength(17);
    expect(WINAMP_PRESETS.map((p) => p.name)).toContain('Full Bass & Treble');
    for (const preset of WINAMP_PRESETS) {
      expect(preset.bands).toHaveLength(10);
      expect(preset.preamp).toBe(0);
      expect(preset.bands.every((db) => Math.abs(db) <= 12)).toBe(true);
    }
  });
});

describe('parseEqf', () => {
  it('reads every preset in a file, inverting the bytes', () => {
    const presets = parseEqf(
      eqf([
        { name: 'Boost', bytes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 31] },
        { name: 'Cut', bytes: [63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63] },
      ]),
    );
    expect(presets.map((p) => p.name)).toEqual(['Boost', 'Cut']);
    expect(presets[0]?.bands.every((db) => db === 12)).toBe(true);
    expect(presets[0]?.preamp).toBe(0);
    expect(presets[1]?.bands.every((db) => db === -12)).toBe(true);
  });

  it('rejects files that are not .eqf, or hold no preset', () => {
    expect(() => parseEqf(new TextEncoder().encode('ID3 not an eq').buffer)).toThrow();
    expect(() => parseEqf(eqf([]))).toThrow();
  });
});

describe('stored presets', () => {
  it('keeps good entries and drops damaged ones', () => {
    const good = { name: 'Mine', preamp: 3, bands: EQ_BANDS.map(() => 1) };
    expect(parsePresets([good, { name: '', preamp: 0, bands: [] }, 'x', null])).toEqual([good]);
    expect(parsePresets('nope')).toEqual([]);
  });

  it('passes no gain while the EQ is off', () => {
    const gains = activeGains({ on: false, preamp: 6, bands: EQ_BANDS.map(() => 6), preset: '' });
    expect(gains.preamp).toBe(0);
    expect(gains.bands.every((db) => db === 0)).toBe(true);
  });
});
