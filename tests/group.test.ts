import { describe, expect, it } from 'vitest';
import { UNKNOWN_ALBUM, UNKNOWN_ARTIST, groupLibrary } from '../src/library/group';

const track = (id: string, artist: string, album: string) => ({
  id,
  title: id,
  artist,
  album,
  durationSec: 0,
});

describe('groupLibrary', () => {
  it('nests albums in artists, sorted, with unknowns last and track order kept', () => {
    const folders = groupLibrary([
      track('b2', 'Björk', 'Post'),
      track('u', '', ''),
      track('a1', 'ABBA', 'Arrival'),
      track('b1', 'björk', 'Debut'),
      track('b3', 'Björk', 'Post'),
      track('a2', 'ABBA', '  '),
    ]);
    expect(folders.map((f) => f.name)).toEqual(['ABBA', 'Björk', 'björk', UNKNOWN_ARTIST]);
    expect(folders[0]?.albums.map((a) => a.name)).toEqual(['Arrival', UNKNOWN_ALBUM]);
    expect(folders[1]?.albums[0]?.tracks.map((t) => t.id)).toEqual(['b2', 'b3']);
    expect(groupLibrary([])).toEqual([]);
  });
});
