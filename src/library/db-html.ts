import type { Track, TrackStore } from './db';
import {
  TAG_VERSION,
  coverFrom,
  coverTo,
  retagRow,
  rowToTrack,
  trackToRow,
  type HtmlRow,
} from './html-rows';

/** html-1's database: an original that opens it finds the rows it wrote. */
export const HTML_DB_NAME = 'vinyl-db';
const HTML_DB_VERSION = 2;
const TRACKS = 'tracks';

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** The track library in html-1's database. Audio never leaves the device. */
export class HtmlLibrary implements TrackStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(HTML_DB_NAME, HTML_DB_VERSION);
      request.onupgradeneeded = (): void => {
        const db = request.result;
        if (!db.objectStoreNames.contains(TRACKS)) db.createObjectStore(TRACKS, { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB did not open'));
    });
    return this.db;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.open()).transaction(TRACKS, mode).objectStore(TRACKS);
  }

  async all(): Promise<Track[]> {
    const rows = await done((await this.store('readonly')).getAll() as IDBRequest<HtmlRow[]>);
    const fresh = await Promise.all(
      rows.map(async (row) => {
        if (row.tagv === TAG_VERSION) return row;
        const updated = await retagRow(row);
        await done((await this.store('readwrite')).put(updated));
        return updated;
      }),
    );
    return fresh.map(rowToTrack);
  }

  async put(track: Track): Promise<void> {
    // The row is built first: a transaction would not survive the awaits inside it.
    const row = await trackToRow(track);
    await done((await this.store('readwrite')).put(row));
  }

  async delete(id: string): Promise<void> {
    await done((await this.store('readwrite')).delete(id));
  }

  async clear(): Promise<void> {
    await done((await this.store('readwrite')).clear());
  }

  private async meta(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.open()).transaction('meta', mode).objectStore('meta');
  }

  async loadCover(): Promise<Blob | null> {
    const row = await done(
      (await this.meta('readonly')).get('cover') as IDBRequest<{ dataUrl?: string } | undefined>,
    );
    return row?.dataUrl ? (coverFrom(row.dataUrl) ?? null) : null;
  }

  async saveCover(cover: Blob): Promise<void> {
    const dataUrl = await coverTo(cover);
    await done((await this.meta('readwrite')).put({ key: 'cover', dataUrl }));
  }
}
