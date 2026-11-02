import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface TrackTags {
  title: string;
  artist: string;
  album: string;
  year: number | null;
  genre: string;
}

export interface Track {
  id: string;
  blob: Blob;
  name: string;
  size: number;
  lastModified: number;
  /** 0 when the tags did not say. */
  durationSec: number;
  tags: TrackTags;
  coverBlob?: Blob;
  /** Liner notes typed in the Record Info panel. */
  notes?: string;
  /** Loudness slices, measured the first time the track is decoded (audio/levels.ts). */
  levels?: Uint8Array;
  addedAt: number;
}

/** Audio or cover data stored as raw bytes, for browsers that refuse Blobs in IndexedDB. */
interface StoredBytes {
  bytes: ArrayBuffer;
  type: string;
}

type StoredTrack = Omit<Track, 'blob' | 'coverBlob'> & {
  blob: Blob | StoredBytes;
  coverBlob?: Blob | StoredBytes;
};

interface LibrarySchema extends DBSchema {
  tracks: { key: string; value: StoredTrack };
  /** The cover dropped on the page, or the first tagged one: the label of tracks without their own. */
  meta: { key: string; value: Blob };
}

async function toBytes(blob: Blob): Promise<StoredBytes> {
  return { bytes: await blob.arrayBuffer(), type: blob.type };
}

function toBlob(data: Blob | StoredBytes): Blob {
  return data instanceof Blob ? data : new Blob([data.bytes], { type: data.type });
}

type LibraryDb = IDBPDatabase<LibrarySchema>;

export const DB_NAME = 'vinyl-library';

/**
 * Migrations table: entry N upgrades the database from version N to N + 1.
 * Append to it to change the schema; never edit an entry that has shipped.
 */
const MIGRATIONS: readonly ((db: LibraryDb) => void)[] = [
  (db) => {
    db.createObjectStore('tracks', { keyPath: 'id' });
  },
  (db) => {
    db.createObjectStore('meta');
  },
];

export const DB_VERSION = MIGRATIONS.length;

/** Where tracks are kept; each build profile has its own database. */
export interface TrackStore {
  all(): Promise<Track[]>;
  put(track: Track): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
  loadCover(): Promise<Blob | null>;
  saveCover(cover: Blob): Promise<void>;
}

/** The track library in IndexedDB. Audio never leaves the device. */
export class Library implements TrackStore {
  private db: Promise<LibraryDb> | null = null;

  private open(): Promise<LibraryDb> {
    this.db ??= openDB<LibrarySchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        for (const migrate of MIGRATIONS.slice(oldVersion)) migrate(db);
      },
    });
    return this.db;
  }

  async all(): Promise<Track[]> {
    const stored = await (await this.open()).getAll('tracks');
    return stored.map(({ blob, coverBlob, ...rest }) => ({
      ...rest,
      blob: toBlob(blob),
      ...(coverBlob ? { coverBlob: toBlob(coverBlob) } : {}),
    }));
  }

  async put(track: Track): Promise<void> {
    const db = await this.open();
    try {
      await db.put('tracks', track);
    } catch {
      // WebKit cannot store Blobs in some contexts (private windows); raw bytes always work.
      // shortcut: tracks saved this way are all read into memory at startup; switch to
      // loading them one by one if this path turns out to be common.
      const { blob, coverBlob, ...rest } = track;
      await db.put('tracks', {
        ...rest,
        blob: await toBytes(blob),
        ...(coverBlob ? { coverBlob: await toBytes(coverBlob) } : {}),
      });
    }
  }

  async delete(id: string): Promise<void> {
    await (await this.open()).delete('tracks', id);
  }

  async clear(): Promise<void> {
    await (await this.open()).clear('tracks');
  }

  async loadCover(): Promise<Blob | null> {
    return (await (await this.open()).get('meta', 'cover')) ?? null;
  }

  async saveCover(cover: Blob): Promise<void> {
    await (await this.open()).put('meta', cover, 'cover');
  }
}
