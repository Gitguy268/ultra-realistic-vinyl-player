import type { Track } from './db';
import { parseTags, type RawTags } from './tags-html';

/** html-1's tag reader version: rows at it are not read again by the original. */
export const TAG_VERSION = 2;

/** A row as html-1 stores it, plus the optional fields this player adds. */
export interface HtmlRow {
  id: string;
  name: string;
  buffer: ArrayBuffer;
  mime?: string;
  artist?: string;
  album?: string;
  year?: string | number;
  genre?: string;
  notes?: string;
  coverDataUrl?: string;
  tagv?: number;
  rms?: Uint8Array | number[] | null;
  durationSec?: number;
  addedAt?: number;
  fileName?: string;
  lastModified?: number;
}

export function coverFrom(dataUrl: string): Blob | undefined {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return undefined;
  try {
    const text = match[2] ? atob(match[3]!) : decodeURIComponent(match[3]!);
    const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: match[1] || 'image/jpeg' });
  } catch {
    return undefined;
  }
}

export async function coverTo(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(text)}`;
}

export function rowToTrack(row: HtmlRow): Track {
  const blob = new Blob([row.buffer], { type: row.mime || 'audio/mpeg' });
  const year = Number(row.year);
  const cover = row.coverDataUrl ? coverFrom(row.coverDataUrl) : undefined;
  return {
    id: row.id,
    blob,
    name: row.fileName ?? row.name,
    size: blob.size,
    lastModified: row.lastModified ?? 0,
    durationSec: row.durationSec ?? 0,
    tags: {
      title: row.name,
      artist: row.artist ?? '',
      album: row.album ?? '',
      year: Number.isInteger(year) && year > 0 ? year : null,
      genre: row.genre ?? '',
    },
    addedAt: row.addedAt ?? 0,
    ...(cover ? { coverBlob: cover } : {}),
    ...(row.notes ? { notes: row.notes } : {}),
    ...(row.rms?.length ? { levels: Uint8Array.from(row.rms) } : {}),
  };
}

export async function trackToRow(track: Track): Promise<HtmlRow> {
  return {
    id: track.id,
    name: track.tags.title,
    buffer: await track.blob.arrayBuffer(),
    mime: track.blob.type,
    artist: track.tags.artist,
    album: track.tags.album,
    year: track.tags.year ?? '',
    genre: track.tags.genre,
    notes: track.notes ?? '',
    coverDataUrl: track.coverBlob ? await coverTo(track.coverBlob) : '',
    tagv: TAG_VERSION,
    rms: track.levels ?? null,
    durationSec: track.durationSec,
    addedAt: track.addedAt,
    fileName: track.name,
    lastModified: track.lastModified,
  };
}

/**
 * A row saved before its format's tags could be read gets one more look. Only what it lacks is
 * filled in; the result is the row to store (html-1's retag).
 */
export async function retagRow(row: HtmlRow): Promise<HtmlRow> {
  const out: HtmlRow = { ...row, tagv: TAG_VERSION };
  let meta: RawTags;
  try {
    meta = parseTags(row.buffer);
  } catch {
    return out;
  }
  // No tags so far: its name is its file name.
  const bare = !row.artist && !row.album && !row.year && !row.genre && !row.coverDataUrl;
  if (bare && meta.title) out.name = meta.title;
  if (!row.artist && meta.artist) out.artist = meta.artist;
  if (!row.album && meta.album) out.album = meta.album;
  if (!row.year && meta.year) out.year = meta.year;
  if (!row.genre && meta.genre) out.genre = meta.genre;
  if (!row.coverDataUrl && meta.coverBlob) out.coverDataUrl = await coverTo(meta.coverBlob);
  return out;
}
