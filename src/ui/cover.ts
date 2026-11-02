import { pickAccent, readableAccent } from '../library/accent';
import { parseHex } from '../util/color';

const SAMPLE_SIZE = 32;

/** Downscales cover art to 32×32 and returns its RGBA pixels, or null if it cannot be read. */
async function samplePixels(cover: Blob): Promise<Uint8ClampedArray | null> {
  try {
    const bitmap = await createImageBitmap(cover);
    const canvas =
      typeof OffscreenCanvas === 'undefined'
        ? Object.assign(document.createElement('canvas'), {
            width: SAMPLE_SIZE,
            height: SAMPLE_SIZE,
          })
        : new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
    const ctx = canvas.getContext('2d') as
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    bitmap.close();
    return ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } catch {
    return null;
  }
}

/**
 * Takes the accent colour from cover art when dark text stays readable on it;
 * otherwise clears it, so the default (or a custom accent) shows.
 */
export async function applyCoverAccent(cover: Blob | undefined): Promise<void> {
  const root = document.documentElement;
  const pixels = cover ? await samplePixels(cover) : null;
  const ink = getComputedStyle(root).getPropertyValue('--accent-ink-default').trim();
  const accent = pixels && ink ? readableAccent(pickAccent(pixels), parseHex(ink)) : null;
  if (accent) root.style.setProperty('--cover-accent', accent);
  else root.style.removeProperty('--cover-accent');
}
