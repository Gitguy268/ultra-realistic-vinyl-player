export type Rgb = readonly [number, number, number];

/** Parses "#rgb" or "#rrggbb". */
export function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) throw new RangeError(`Not a hex colour: ${hex}`);
  const digits =
    match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join('') : match[1];
  const value = Number.parseInt(digits, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function toHex(rgb: Rgb): string {
  return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

/** WCAG 2 relative luminance of an sRGB colour. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, from 1 (identical) to 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// In order of preference. Mid-tone backgrounds exist where neither the warm
// dark ink nor white reaches 4.5:1; pure black always covers that gap.
const INKS = ['#1a1208', '#ffffff', '#000000'];

/** An ink colour that reaches at least 4.5:1 on `background`. */
export function readableInk(background: Rgb): string {
  return INKS.find((ink) => contrastRatio(background, parseHex(ink)) >= 4.5) ?? '#000000';
}

export const COLOUR_KEYS = ['accent', 'bg', 'surface', 'text'] as const;
export type ColourKey = (typeof COLOUR_KEYS)[number];
/** Colours the user has chosen; a missing key means "use the theme's". */
export type CustomColours = Partial<Record<ColourKey, string>>;

/** Keeps only valid hex colours from stored or typed data, normalised to #rrggbb. */
export function parseColours(raw: unknown): CustomColours {
  const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const colours: CustomColours = {};
  for (const key of COLOUR_KEYS) {
    const value = stored[key];
    if (typeof value !== 'string') continue;
    try {
      colours[key] = toHex(parseHex(value));
    } catch {
      // Not a colour: leave the theme's value in place.
    }
  }
  return colours;
}
