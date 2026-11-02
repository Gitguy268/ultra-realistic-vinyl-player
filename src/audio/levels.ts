/** Loudness slices per track, for shading its grooves (html-1). */
export const LEVEL_SLICES = 600;
/** Every nth sample is enough to tell loud from quiet, and keeps a long track cheap. */
const STRIDE = 16;

/** RMS of each slice of a track, as a square-root scale where its loudest slice is 255 (html-1). */
export function levelSlices(channels: readonly Float32Array[], slices = LEVEL_SLICES): Uint8Array {
  const out = new Uint8Array(slices);
  const first = channels[0];
  if (!first || first.length === 0) return out;
  const values = new Float64Array(slices);
  let peak = 0;
  for (let s = 0; s < slices; s++) {
    const from = Math.floor((s / slices) * first.length);
    const to = Math.floor(((s + 1) / slices) * first.length);
    let sum = 0;
    let n = 0;
    for (let i = from; i < to; i += STRIDE) {
      for (const channel of channels) sum += (channel[i] ?? 0) ** 2;
      n += channels.length;
    }
    values[s] = n ? Math.sqrt(sum / n) : 0;
    if (values[s]! > peak) peak = values[s]!;
  }
  if (peak > 0)
    for (let s = 0; s < slices; s++) out[s] = Math.round(Math.sqrt(values[s]! / peak) * 255);
  return out;
}
