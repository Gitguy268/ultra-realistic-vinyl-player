/**
 * Winamp's ten-band graphic equaliser: its bands, its built-in presets and its
 * .eqf preset files. The band layout and the preset values come from Webamp
 * (https://github.com/captbaritone/webamp), MIT licensed, Copyright (c) 2015
 * Jordan Eldredge. Winamp is a trademark of its owner; this project is not
 * affiliated with it.
 */

/** Centre frequencies in Hz. The first band is a low shelf, the last a high shelf. */
export const EQ_BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000] as const;
export const EQ_LIMIT_DB = 12;

export interface EqPreset {
  name: string;
  /** dB, -12 to 12. */
  preamp: number;
  /** dB per band, -12 to 12, in EQ_BANDS order. */
  bands: number[];
}

/** The graphic equaliser as the controls hold it. */
export interface GraphicEq {
  on: boolean;
  preamp: number;
  bands: number[];
  /** Name of the preset last chosen, or '' once a slider has moved. */
  preset: string;
}

export const FLAT_EQ: GraphicEq = {
  on: false,
  preamp: 0,
  bands: EQ_BANDS.map(() => 0),
  preset: '',
};

export function bandType(index: number): 'lowshelf' | 'peaking' | 'highshelf' {
  if (index === 0) return 'lowshelf';
  return index === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking';
}

export function clampEqDb(db: number): number {
  return Number.isFinite(db) ? Math.max(-EQ_LIMIT_DB, Math.min(EQ_LIMIT_DB, db)) : 0;
}

/**
 * Converts Winamp's slider value (1 to 64, as Webamp reads .eqf files) to dB.
 * 33 is 0 dB, 64 is +12 and 1 is -12, so the steps differ slightly above and below.
 */
export function eqfValueToDb(value: number): number {
  const steps = value >= 33 ? 31 : 32;
  return Math.round(((value - 33) / steps) * EQ_LIMIT_DB * 10) / 10;
}

// Webamp's packages/webamp/presets/builtin.json: preamp, then the ten bands.
const BUILT_IN: readonly (readonly [string, readonly number[]])[] = [
  ['Classical', [33, 33, 33, 33, 33, 33, 33, 20, 20, 20, 16]],
  ['Club', [33, 33, 33, 38, 42, 42, 42, 38, 33, 33, 33]],
  ['Dance', [33, 48, 44, 36, 32, 32, 22, 20, 20, 32, 32]],
  ['Laptop speakers/headphones', [33, 40, 50, 41, 26, 28, 35, 40, 48, 53, 56]],
  ['Large hall', [33, 49, 49, 42, 42, 33, 24, 24, 24, 33, 33]],
  ['Party', [33, 44, 44, 33, 33, 33, 33, 33, 33, 44, 44]],
  ['Pop', [33, 29, 40, 44, 45, 41, 30, 28, 28, 29, 29]],
  ['Reggae', [33, 33, 33, 31, 22, 33, 43, 43, 33, 33, 33]],
  ['Rock', [33, 45, 40, 23, 19, 26, 39, 47, 50, 50, 50]],
  ['Soft', [33, 40, 35, 30, 28, 30, 39, 46, 48, 50, 52]],
  ['Ska', [33, 28, 24, 25, 31, 39, 42, 47, 48, 50, 48]],
  ['Full Bass', [33, 48, 48, 48, 42, 35, 25, 18, 15, 14, 14]],
  ['Soft Rock', [33, 39, 39, 36, 31, 25, 23, 26, 31, 37, 47]],
  ['Full Treble', [33, 16, 16, 16, 25, 37, 50, 58, 58, 58, 60]],
  ['Full Bass & Treble', [33, 44, 42, 33, 20, 24, 35, 46, 50, 52, 52]],
  ['Live', [33, 24, 33, 39, 41, 42, 42, 39, 37, 37, 36]],
  ['Techno', [33, 45, 42, 33, 23, 24, 33, 45, 48, 48, 47]],
];

function fromValues(name: string, values: readonly number[]): EqPreset {
  const [preamp = 33, ...bands] = values;
  return { name, preamp: eqfValueToDb(preamp), bands: bands.map(eqfValueToDb) };
}

export const WINAMP_PRESETS: readonly EqPreset[] = BUILT_IN.map(([name, values]) =>
  fromValues(name, values),
);

const EQF_HEADER = 'Winamp EQ library file v1.1';
// The header is followed by Ctrl-Z and "!--".
const EQF_START = EQF_HEADER.length + 4;
const NAME_BYTES = 257;
const ENTRY_BYTES = NAME_BYTES + EQ_BANDS.length + 1;

/**
 * Reads the presets from a Winamp .eqf (or winamp.q1) file. Each entry is a
 * 257-byte name and eleven bytes: the bands, then the preamp, where 0 is +12 dB
 * and 63 is -12 dB. Throws when the file is not one.
 */
export function parseEqf(buffer: ArrayBuffer): EqPreset[] {
  const bytes = new Uint8Array(buffer);
  const header = String.fromCharCode(...bytes.subarray(0, EQF_HEADER.length));
  if (header !== EQF_HEADER) throw new Error('Not a Winamp .eqf file.');
  const presets: EqPreset[] = [];
  for (let at = EQF_START; at + ENTRY_BYTES <= bytes.length; at += ENTRY_BYTES) {
    const nameBytes = bytes.subarray(at, at + NAME_BYTES);
    const end = nameBytes.indexOf(0);
    const name = new TextDecoder('latin1').decode(
      nameBytes.subarray(0, end < 0 ? NAME_BYTES : end),
    );
    const values = [...bytes.subarray(at + NAME_BYTES, at + ENTRY_BYTES)].map((byte) => 64 - byte);
    const preamp = values.pop() ?? 33;
    presets.push(fromValues(name.trim() || 'Imported', [preamp, ...values]));
  }
  if (presets.length === 0) throw new Error('The .eqf file holds no presets.');
  return presets;
}

function dbList(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== EQ_BANDS.length) return null;
  return value.map((db: unknown) => (typeof db === 'number' ? clampEqDb(db) : 0));
}

/** Builds valid EQ settings from stored data, field by field. */
export function parseGraphicEq(raw: unknown): GraphicEq {
  const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    on: typeof stored.on === 'boolean' ? stored.on : FLAT_EQ.on,
    preamp: typeof stored.preamp === 'number' ? clampEqDb(stored.preamp) : FLAT_EQ.preamp,
    bands: dbList(stored.bands) ?? [...FLAT_EQ.bands],
    preset: typeof stored.preset === 'string' ? stored.preset.slice(0, 256) : FLAT_EQ.preset,
  };
}

/** Builds a valid list of imported presets from stored data; bad entries are dropped. */
export function parsePresets(raw: unknown): EqPreset[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const { name, preamp, bands } = entry as Record<string, unknown>;
    const list = dbList(bands);
    if (typeof name !== 'string' || !name || typeof preamp !== 'number' || !list) return [];
    return [{ name: name.slice(0, 256), preamp: clampEqDb(preamp), bands: list }];
  });
}

/** The gains the filters get: all zero while the equaliser is off. */
export function activeGains(eq: GraphicEq): { preamp: number; bands: number[] } {
  return eq.on
    ? { preamp: clampEqDb(eq.preamp), bands: eq.bands.map(clampEqDb) }
    : { preamp: 0, bands: EQ_BANDS.map(() => 0) };
}
