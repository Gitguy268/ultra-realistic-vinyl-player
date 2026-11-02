import { describe, expect, it } from 'vitest';
import {
  DECODE_THRESHOLD_BYTES,
  choosePlaybackMode,
  shouldPredecode,
} from '../src/audio/playback-mode';

const MIB = 1024 * 1024;

describe('choosePlaybackMode', () => {
  it('defaults to a 150 MiB threshold', () => {
    expect(DECODE_THRESHOLD_BYTES).toBe(150 * MIB);
  });

  it('decodes small files and empty files', () => {
    expect(choosePlaybackMode(0)).toBe('decode');
    expect(choosePlaybackMode(5 * MIB)).toBe('decode');
  });

  it('decodes at exactly the threshold', () => {
    expect(choosePlaybackMode(150 * MIB)).toBe('decode');
  });

  it('streams one byte above the threshold', () => {
    expect(choosePlaybackMode(150 * MIB + 1)).toBe('stream');
  });

  it('honours a custom threshold', () => {
    expect(choosePlaybackMode(10, 10)).toBe('decode');
    expect(choosePlaybackMode(11, 10)).toBe('stream');
  });

  it('streams a track over 20 minutes, however small the file', () => {
    expect(choosePlaybackMode(30 * MIB, DECODE_THRESHOLD_BYTES, 1201)).toBe('stream');
    expect(choosePlaybackMode(30 * MIB, DECODE_THRESHOLD_BYTES, 1200)).toBe('decode');
  });

  it('streams a file of unknown length above 50 MB', () => {
    expect(choosePlaybackMode(51e6, DECODE_THRESHOLD_BYTES, 0)).toBe('stream');
    expect(choosePlaybackMode(49e6, DECODE_THRESHOLD_BYTES, 0)).toBe('decode');
  });

  it('decodes the next track ahead only when it is short', () => {
    expect(shouldPredecode(30 * MIB, 600)).toBe(true);
    expect(shouldPredecode(30 * MIB, 601)).toBe(false);
    expect(shouldPredecode(49e6, 0)).toBe(true);
    expect(shouldPredecode(51e6, 0)).toBe(false);
  });

  it('rejects negative and NaN sizes', () => {
    expect(() => choosePlaybackMode(-1)).toThrow(RangeError);
    expect(() => choosePlaybackMode(Number.NaN)).toThrow(RangeError);
  });
});
