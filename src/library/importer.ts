import type { Track, TrackStore, TrackTags } from './db';
import { isAudioFile, parseFilename, trackId, withTimeout } from './files';
import { parseTags } from './tags-html';

const TAG_TIMEOUT_MS = 5000;

interface Metadata {
  tags: TrackTags;
  durationSec: number;
  coverBlob?: Blob;
}

/** Large files are read only this far for tags: every supported format keeps them near the start. */
const TAG_READ_BYTES = 16 * 1024 * 1024;

/** The length a media element reports, or 0 when it cannot tell within the time limit (html-1). */
function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (seconds: number): void => {
      clearTimeout(timer);
      audio.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(seconds) && seconds > 0 ? seconds : 0);
    };
    const timer = setTimeout(() => done(0), TAG_TIMEOUT_MS);
    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => done(audio.duration), { once: true });
    audio.addEventListener('error', () => done(0), { once: true });
    audio.src = url;
  });
}

/** The single file's reader: html-1's own parsers and a media-element duration probe. */
async function readMetadataHtml(file: File): Promise<Metadata> {
  const fallback = parseFilename(file.name);
  const head = file.size > TAG_READ_BYTES ? file.slice(0, TAG_READ_BYTES) : file;
  const [raw, durationSec] = await Promise.all([
    head.arrayBuffer().then(parseTags, () => null),
    probeDuration(file),
  ]);
  const year = raw?.year ? Number.parseInt(raw.year, 10) : NaN;
  return {
    tags: {
      title: raw?.title.trim() || fallback.title,
      artist: raw?.artist.trim() || fallback.artist,
      album: raw?.album.trim() ?? '',
      year: Number.isInteger(year) ? year : null,
      genre: raw?.genre.trim() ?? '',
    },
    durationSec,
    ...(raw?.coverBlob ? { coverBlob: raw.coverBlob } : {}),
  };
}

/** Reads tags with a time limit. A bad or missing tag falls back to the file name. */
async function readMetadata(file: File): Promise<Metadata> {
  if (__PROFILE__ === 'html') return readMetadataHtml(file);
  const fallback = parseFilename(file.name);
  const empty: TrackTags = { ...fallback, album: '', year: null, genre: '' };
  try {
    // Loaded on demand: the tag parser is large and only needed while importing.
    const { parseBlob, selectCover } = await import('music-metadata');
    const { common, format } = await withTimeout(parseBlob(file), TAG_TIMEOUT_MS);
    const cover = selectCover(common.picture);
    const duration = format.duration;
    return {
      tags: {
        title: common.title?.trim() || fallback.title,
        artist: common.artist?.trim() || fallback.artist,
        album: common.album?.trim() ?? '',
        year: common.year ?? null,
        genre: common.genre?.[0] ?? '',
      },
      durationSec: duration !== undefined && Number.isFinite(duration) ? duration : 0,
      ...(cover
        ? { coverBlob: new Blob([new Uint8Array(cover.data)], { type: cover.format }) }
        : {}),
    };
  } catch {
    return { tags: empty, durationSec: 0 };
  }
}

export interface ImportResult {
  tracks: Track[];
  failed: number;
  cancelled: boolean;
}

/** Stores files one by one, reporting progress. Stops early when `signal` aborts. */
export async function importFiles(
  files: readonly File[],
  library: TrackStore,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<ImportResult> {
  const tracks: Track[] = [];
  let failed = 0;
  for (const [index, file] of files.entries()) {
    if (signal.aborted) return { tracks, failed, cancelled: true };
    onProgress(index + 1, files.length);
    const metadata = await readMetadata(file);
    const track: Track = {
      id: trackId(file.name, file.size, file.lastModified),
      blob: file,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      addedAt: Date.now(),
      ...metadata,
    };
    try {
      await library.put(track);
      tracks.push(track);
    } catch {
      failed++;
    }
  }
  return { tracks, failed, cancelled: false };
}

export function audioFilesOf(files: Iterable<File>): File[] {
  return [...files].filter((file) => isAudioFile(file.name, file.type));
}

async function entryFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return [
      await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      ),
    ];
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const files: File[] = [];
  // readEntries returns results in batches and an empty batch when done.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return files;
    for (const child of batch) files.push(...(await entryFiles(child)));
  }
}

/** Audio files from a drop, descending into dropped folders. */
export async function filesFromDrop(data: DataTransfer): Promise<File[]> {
  const entries = [...data.items]
    .map((item) => item.webkitGetAsEntry?.() ?? null)
    .filter((entry): entry is FileSystemEntry => entry !== null);
  if (entries.length === 0) return audioFilesOf(data.files);
  const files: File[] = [];
  for (const entry of entries) files.push(...(await entryFiles(entry).catch(() => [])));
  return audioFilesOf(files);
}

/** Audio files from a File System Access directory handle, recursively. */
export async function filesFromDirectory(directory: FileSystemDirectoryHandle): Promise<File[]> {
  const files: File[] = [];
  for await (const handle of directory.values()) {
    if (handle.kind === 'directory') {
      files.push(...(await filesFromDirectory(handle as FileSystemDirectoryHandle)));
    } else {
      files.push(await (handle as FileSystemFileHandle).getFile());
    }
  }
  return audioFilesOf(files);
}
