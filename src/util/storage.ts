import { readHtml, writeHtml } from './storage-html';

const PREFIX = 'realistic-vinyl-player.';

/** Reads JSON from localStorage; null when missing, malformed or blocked (privacy modes). */
export function readStored(key: string): unknown {
  if (__PROFILE__ === 'html') return readHtml(key);
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Writes JSON to localStorage; silently does nothing when storage is unavailable. */
export function writeStored(key: string, value: unknown): void {
  if (__PROFILE__ === 'html') {
    writeHtml(key, value);
    return;
  }
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage can be disabled or full; the app works without persistence.
  }
}
