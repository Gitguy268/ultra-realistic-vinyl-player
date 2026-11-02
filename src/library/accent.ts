import { contrastRatio, toHex, type Rgb } from '../util/color';

const MIN_ALPHA = 128;
/** A bucket counts as "common" from this share of the visible pixels. */
const COMMON_SHARE = 0.03;
const MIN_SATURATION = 0.25;
export const MIN_ACCENT_CONTRAST = 4.5;

interface Bucket {
  count: number;
  r: number;
  g: number;
  b: number;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

/**
 * Picks an accent from RGBA pixel data: colours are quantised to 4 bits per
 * channel, and the most saturated bucket among the common ones wins. Returns
 * null for images with no clearly coloured area.
 */
export function pickAccent(pixels: ArrayLike<number>): Rgb | null {
  const buckets = new Map<number, Bucket>();
  let visible = 0;
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if ((pixels[i + 3] ?? 0) < MIN_ALPHA) continue;
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count++;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
    visible++;
  }
  let best: Rgb | null = null;
  let bestSaturation = MIN_SATURATION;
  let bestCount = 0;
  for (const bucket of buckets.values()) {
    if (bucket.count < Math.max(1, visible * COMMON_SHARE)) continue;
    const rgb: Rgb = [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count];
    const s = saturation(...rgb);
    if (s > bestSaturation || (s === bestSaturation && best && bucket.count > bestCount)) {
      best = rgb;
      bestSaturation = s;
      bestCount = bucket.count;
    }
  }
  return best;
}

/** The accent as a hex colour if text in `ink` stays readable on it, else null. */
export function readableAccent(accent: Rgb | null, ink: Rgb): string | null {
  if (!accent) return null;
  return contrastRatio(accent, ink) >= MIN_ACCENT_CONTRAST ? toHex(accent) : null;
}
