/**
 * The html profile keeps html-1's storage keys and shapes, so a visitor's settings carry over and
 * html-1 can still read them. Its two old keys keep their original shape; anything new lives in
 * `vinyl-deck`, as it did there. The App's keys map onto them here and nowhere else.
 */

const PREFS = 'vinyl-prefs';
const TRACKS = 'vinyl-tracks';
const DECK = 'vinyl-deck';
const EQ = 'vinyl-eq';
const EQ_PRESETS = 'vinyl-eq-presets';

type Fields = Record<string, unknown>;

const SPEED_OF: Record<number, string> = { 33: 'lp', 45: 'single', 78: 'shellac' };
const RPM_OF: Record<string, number> = { lp: 33, single: 45, shellac: 78 };
const REPEAT_OF = ['off', 'one', 'all'];
const THEME_OF: Record<string, string> = { walnut: 'theme-wood', clear: 'theme-clear' };
const PLINTH_OF: Record<string, string> = { 'theme-wood': 'walnut', 'theme-clear': 'clear' };
const COLOURS = ['accent', 'bg', 'surface', 'text'];

function get(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function set(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be disabled or full; the app works without persistence.
  }
}

function fields(key: string): Fields {
  const value = get(key);
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : {};
}

/** html-1 stored its sliders as the strings an input's value gives; absent stays absent. */
function number(value: unknown, scale = 1): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n * scale : undefined;
}

function defined(source: Fields): Fields {
  return Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined));
}

function readSettings(): Fields {
  const prefs = fields(PREFS);
  return defined({
    // Everything new first, so html-1's own fields win where both exist.
    ...fields(DECK),
    volume: number(prefs.volume, 100),
    bass: number(prefs.bass),
    mid: number(prefs.mid),
    treble: number(prefs.treble),
    noise: number(prefs.noise, 100),
    effects: prefs.sfx,
    scratch: prefs.scratch,
    speed: SPEED_OF[prefs.rpm as number],
    graphicEq: get(EQ) ?? undefined,
  });
}

function writeSettings(value: Fields): void {
  const { volume, bass, mid, treble, noise, effects, scratch, speed, graphicEq, ...rest } = value;
  set(PREFS, {
    ...fields(PREFS),
    volume: String((volume as number) / 100),
    bass: String(bass),
    mid: String(mid),
    treble: String(treble),
    noise: String((noise as number) / 100),
    sfx: effects,
    scratch,
    rpm: RPM_OF[speed as string],
  });
  // Settings saved here sit beside the flags other modules keep in the same key.
  set(DECK, { ...fields(DECK), ...rest });
  set(EQ, graphicEq);
}

function readQueue(): Fields {
  const prefs = fields(PREFS);
  return defined({
    ids: get(TRACKS) ?? undefined,
    currentId: fields(DECK).currentId,
    shuffle: prefs.shuffle,
    repeat: REPEAT_OF[prefs.repeat as number],
  });
}

function writeQueue(value: Fields): void {
  set(TRACKS, value.ids);
  set(PREFS, {
    ...fields(PREFS),
    shuffle: value.shuffle,
    repeat: Math.max(0, REPEAT_OF.indexOf(value.repeat as string)),
  });
  set(DECK, { ...fields(DECK), currentId: value.currentId });
}

function readColours(): Fields {
  const prefs = fields(PREFS);
  if (!prefs.hasCustomColors) return {};
  return Object.fromEntries(COLOURS.map((key) => [key, prefs[key]]));
}

function writeColours(value: Fields): void {
  const prefs = { ...fields(PREFS) };
  for (const key of COLOURS) {
    if (value[key] === undefined) delete prefs[key];
    else prefs[key] = value[key];
  }
  prefs.hasCustomColors = COLOURS.some((key) => value[key] !== undefined);
  set(PREFS, prefs);
}

export function readHtml(key: string): unknown {
  switch (key) {
    case 'settings':
      return readSettings();
    case 'queue':
      return readQueue();
    case 'colours':
      return readColours();
    case 'eq-presets':
      return get(EQ_PRESETS);
    case 'mode': {
      const prefs = fields(PREFS);
      return fields(DECK).mode ?? (prefs.lightMode ? 'light' : null);
    }
    case 'plinth': {
      const theme = fields(PREFS).theme as string;
      return fields(DECK).plinth ?? PLINTH_OF[theme] ?? null;
    }
    default:
      return fields(DECK)[key] ?? null;
  }
}

export function writeHtml(key: string, value: unknown): void {
  switch (key) {
    case 'settings':
      writeSettings(value as Fields);
      return;
    case 'queue':
      writeQueue(value as Fields);
      return;
    case 'colours':
      writeColours(value as Fields);
      return;
    case 'eq-presets':
      set(EQ_PRESETS, value);
      return;
    case 'mode':
      set(PREFS, { ...fields(PREFS), lightMode: value === 'light' });
      break;
    case 'plinth':
      set(PREFS, { ...fields(PREFS), theme: THEME_OF[value as string] ?? '' });
      break;
  }
  set(DECK, { ...fields(DECK), [key]: value });
}
