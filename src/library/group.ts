/** A track as the desktop library shows it. */
export interface LibraryEntry {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
}

export interface AlbumFolder {
  name: string;
  tracks: LibraryEntry[];
}

export interface ArtistFolder {
  name: string;
  albums: AlbumFolder[];
}

export const UNKNOWN_ARTIST = 'Unknown artist';
export const UNKNOWN_ALBUM = 'Unknown album';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Sorts by name, with the unknown folder last. */
function byName<T extends { name: string }>(unknown: string): (a: T, b: T) => number {
  return (a, b) =>
    Number(a.name === unknown) - Number(b.name === unknown) || collator.compare(a.name, b.name);
}

/**
 * Groups tracks into artist folders holding album folders, the way a file
 * manager shows a music folder. Tracks keep their given order inside an album;
 * blank tags go into "Unknown artist" and "Unknown album".
 */
export function groupLibrary(entries: Iterable<LibraryEntry>): ArtistFolder[] {
  const artists = new Map<string, Map<string, LibraryEntry[]>>();
  for (const entry of entries) {
    const artist = entry.artist.trim() || UNKNOWN_ARTIST;
    const album = entry.album.trim() || UNKNOWN_ALBUM;
    const albums = artists.get(artist) ?? new Map<string, LibraryEntry[]>();
    artists.set(artist, albums);
    albums.set(album, [...(albums.get(album) ?? []), entry]);
  }
  return [...artists]
    .map(([name, albums]) => ({
      name,
      albums: [...albums]
        .map(([album, tracks]) => ({ name: album, tracks }))
        .sort(byName(UNKNOWN_ALBUM)),
    }))
    .sort(byName(UNKNOWN_ARTIST));
}
