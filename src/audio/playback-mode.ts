export type PlaybackMode = 'decode' | 'stream';

/** Files up to and including this size are fully decoded; larger ones stream. */
export const DECODE_THRESHOLD_BYTES = 150 * 1024 * 1024;

/** Longer tracks stay on the media element, however small the file (html-1, C8). */
export const DECODE_MAX_SECONDS = 1200;
/** A file whose length cannot be told streams above this size (html-1). */
export const UNKNOWN_LENGTH_MAX_BYTES = 50e6;

/** The next track is decoded ahead only up to this length, or this size when its length is unknown. */
export const PREDECODE_MAX_SECONDS = 600;

export function shouldPredecode(bytes: number, durationSec: number): boolean {
  return durationSec > 0 ? durationSec <= PREDECODE_MAX_SECONDS : bytes <= UNKNOWN_LENGTH_MAX_BYTES;
}

/**
 * `durationSec` is the tagged or probed length, 0 when it could not be told, and left out when
 * the question was not asked.
 */
export function choosePlaybackMode(
  bytes: number,
  threshold: number = DECODE_THRESHOLD_BYTES,
  durationSec?: number,
): PlaybackMode {
  if (Number.isNaN(bytes) || bytes < 0) {
    throw new RangeError('bytes must be a non-negative number');
  }
  if (durationSec !== undefined && durationSec > DECODE_MAX_SECONDS) return 'stream';
  if (durationSec === 0 && bytes > UNKNOWN_LENGTH_MAX_BYTES) return 'stream';
  return bytes <= threshold ? 'decode' : 'stream';
}
