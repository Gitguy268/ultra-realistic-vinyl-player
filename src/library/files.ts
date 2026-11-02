const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'm4b',
  'aac',
  'flac',
  'wav',
  'wave',
  'ogg',
  'oga',
  'opus',
  'weba',
  'aif',
  'aiff',
]);

export function fileExtension(name: string): string {
  const match = /\.([^./\\]+)$/.exec(name);
  return match?.[1]?.toLowerCase() ?? '';
}

/** Accepts audio by MIME type or by extension; skips dot-files such as macOS "._" forks. */
export function isAudioFile(name: string, mimeType: string): boolean {
  const base = name.split(/[/\\]/).pop() ?? name;
  if (base.startsWith('.')) return false;
  return mimeType.toLowerCase().startsWith('audio/') || AUDIO_EXTENSIONS.has(fileExtension(base));
}

export interface FilenameTags {
  artist: string;
  title: string;
}

/** Fallback tags from a file name such as "03 - Artist - Title.mp3". */
export function parseFilename(name: string): FilenameTags {
  const base = (name.split(/[/\\]/).pop() ?? name)
    .replace(/\.[^.]+$/, '')
    .replace(/_/g, ' ')
    .replace(/^\d{1,3}\s*[.)-]\s+/, '')
    .trim();
  const match = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
  if (match?.[1] && match[2]) return { artist: match[1].trim(), title: match[2].trim() };
  return { artist: '', title: base || name };
}

const MAX_TAG_LENGTH = 200;
export const MAX_NOTES_LENGTH = 4000;

export interface EditedTags {
  title: string;
  artist: string;
  album: string;
  year: number | null;
  genre: string;
}

/**
 * Tidies tags typed into the Record Info panel before they are stored: trimmed,
 * length-limited, a title that cannot be emptied, and a year that is a real year.
 */
export function cleanTags(
  input: Record<'title' | 'artist' | 'album' | 'year' | 'genre', string>,
  fallbackTitle: string,
): EditedTags {
  const text = (value: string): string => value.trim().slice(0, MAX_TAG_LENGTH);
  const year = Number(input.year.trim());
  return {
    title: text(input.title) || fallbackTitle,
    artist: text(input.artist),
    album: text(input.album),
    year:
      input.year.trim() !== '' && Number.isInteger(year) && year >= 0 && year <= 9999 ? year : null,
    genre: text(input.genre),
  };
}

/** Stable id for a file, so importing the same file twice replaces rather than duplicates. */
export function trackId(name: string, size: number, lastModified: number): string {
  return `${name}:${size}:${lastModified}`;
}

export interface StorageEstimateLike {
  usage?: number;
  quota?: number;
}

export const QUOTA_WARN_FRACTION = 0.8;

/** A warning when the import would leave storage more than 80 % full, else null. */
export function quotaWarning(estimate: StorageEstimateLike, incomingBytes: number): string | null {
  const { usage, quota } = estimate;
  if (usage === undefined || quota === undefined || !(quota > 0)) return null;
  const fraction = (usage + Math.max(0, incomingBytes)) / quota;
  if (fraction <= QUOTA_WARN_FRACTION) return null;
  return `Storage will be about ${Math.min(999, Math.round(fraction * 100))} % full after this import. The browser may refuse some files.`;
}

/** Rejects if `promise` has not settled within `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
