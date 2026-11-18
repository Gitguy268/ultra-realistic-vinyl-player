import { describe, expect, it } from 'vitest';
import { isShelfLoad } from '../src/shelf-message';

describe('Vinyl Shelf hand-off (vinyl-shelf/1)', () => {
  it('accepts a version 1 load with a track list', () => {
    expect(isShelfLoad({ type: 'vinyl-shelf:load', v: 1, tracks: [] })).toBe(true);
    expect(
      isShelfLoad({ type: 'vinyl-shelf:load', v: 1, tracks: [{}], album: {}, autoplay: false }),
    ).toBe(true);
  });

  it('ignores anything else a page might post', () => {
    for (const data of [
      null,
      'vinyl-shelf:load',
      { type: 'vinyl-shelf:load', v: 2, tracks: [] },
      { type: 'vinyl-shelf:load', v: 1 },
      { type: 'vinyl-shelf:load', v: 1, tracks: 'a.mp3' },
      { type: 'vinyl-shelf:hello', v: 1, tracks: [] },
    ]) {
      expect(isShelfLoad(data)).toBe(false);
    }
  });
});
