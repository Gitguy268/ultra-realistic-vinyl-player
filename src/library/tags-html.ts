/**
 * html-1's own tag readers, used by the single-file build (PARITY.md C16): ID3 v1/v2.3/v2.4,
 * FLAC, MP4/M4A, Ogg Vorbis, Opus and WAV. A damaged file simply has no tags. Ported from
 * html-1's ID3 and Tags modules; the app build keeps music-metadata.
 */

export interface RawTags {
  title: string;
  artist: string;
  album: string;
  /** Four characters, or ''. */
  year: string;
  genre: string;
  coverBlob: Blob | null;
}

/** The standard ID3v1 genre list (index = genre number). */
export const GENRES: readonly string[] = [
  'Blues',
  'Classic Rock',
  'Country',
  'Dance',
  'Disco',
  'Funk',
  'Grunge',
  'Hip-Hop',
  'Jazz',
  'Metal',
  'New Age',
  'Oldies',
  'Other',
  'Pop',
  'R&B',
  'Rap',
  'Reggae',
  'Rock',
  'Techno',
  'Industrial',
  'Alternative',
  'Ska',
  'Death Metal',
  'Pranks',
  'Soundtrack',
  'Euro-Techno',
  'Ambient',
  'Trip-Hop',
  'Vocal',
  'Jazz+Funk',
  'Fusion',
  'Trance',
  'Classical',
  'Instrumental',
  'Acid',
  'House',
  'Game',
  'Sound Clip',
  'Gospel',
  'Noise',
  'Alt. Rock',
  'Bass',
  'Soul',
  'Punk',
  'Space',
  'Meditative',
  'Instrumental Pop',
  'Instrumental Rock',
  'Ethnic',
  'Gothic',
  'Darkwave',
  'Techno-Industrial',
  'Electronic',
  'Pop-Folk',
  'Eurodance',
  'Dream',
  'Southern Rock',
  'Comedy',
  'Cult',
  'Gangsta Rap',
  'Top 40',
  'Christian Rap',
  'Pop/Funk',
  'Jungle',
  'Native American',
  'Cabaret',
  'New Wave',
  'Psychedelic',
  'Rave',
  'Showtunes',
  'Trailer',
  'Lo-Fi',
  'Tribal',
  'Acid Punk',
  'Acid Jazz',
  'Polka',
  'Retro',
  'Musical',
  'Rock & Roll',
  'Hard Rock',
];

const blank = (): RawTags => ({
  title: '',
  artist: '',
  album: '',
  year: '',
  genre: '',
  coverBlob: null,
});
const is = (b: Uint8Array, at: number, s: string): boolean =>
  at + s.length <= b.length && [...s].every((ch, i) => b[at + i] === ch.charCodeAt(0));
const u32 = (b: Uint8Array, p: number): number =>
  (((b[p] ?? 0) << 24) | ((b[p + 1] ?? 0) << 16) | ((b[p + 2] ?? 0) << 8) | (b[p + 3] ?? 0)) >>> 0;
/** A copy in its own ArrayBuffer, which Blob accepts. */
const copy = (b: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(b);

function syncsafe(view: DataView, off: number): number {
  return (
    (view.getUint8(off) << 21) |
    (view.getUint8(off + 1) << 14) |
    (view.getUint8(off + 2) << 7) |
    view.getUint8(off + 3)
  );
}

function decodeText(data: Uint8Array): string {
  if (data.length < 2) return '';
  const enc = data[0];
  const text = data.subarray(1);
  if (enc === 3) return new TextDecoder('utf-8').decode(text).replace(/\0/g, '');
  if (enc === 0)
    return Array.from(text, (c) => String.fromCharCode(c))
      .join('')
      .replace(/\0/g, '');
  if (enc === 1 || enc === 2) {
    let start = 0;
    let le = false;
    if (enc === 1 && text.length >= 2) {
      le = text[0] === 0xff && text[1] === 0xfe;
      start = 2;
    }
    let out = '';
    for (let i = start; i < text.length - 1; i += 2) {
      const a = text[i] ?? 0;
      const b = text[i + 1] ?? 0;
      const code = le ? a | (b << 8) : (a << 8) | b;
      if (code === 0) break;
      out += String.fromCharCode(code);
    }
    return out;
  }
  return '';
}

function decodeGenre(data: Uint8Array): string {
  const text = decodeText(data);
  const m = /^\((\d+)\)/.exec(text);
  const idx = m ? parseInt(m[1] ?? '', 10) : -1;
  return idx >= 0 && idx < GENRES.length ? (GENRES[idx] ?? text) : text;
}

function parseApic(data: Uint8Array): Blob | null {
  if (data.length < 4) return null;
  const enc = data[0];
  let pos = 1;
  let mime = '';
  while (pos < data.length && data[pos] !== 0) mime += String.fromCharCode(data[pos++] ?? 0);
  pos += 2; // the terminator and the picture type
  if (enc === 0 || enc === 3) {
    while (pos < data.length && data[pos] !== 0) pos++;
    pos++;
  } else {
    while (pos < data.length - 1) {
      if (data[pos] === 0 && data[pos + 1] === 0) {
        pos += 2;
        break;
      }
      pos += 2;
    }
  }
  if (pos >= data.length) return null;
  if (!mime || mime === 'image/') mime = 'image/jpeg';
  return new Blob([copy(data.subarray(pos))], { type: mime });
}

function parseId3Frames(
  bytes: Uint8Array,
  view: DataView,
  pos: number,
  end: number,
  ver: number,
  r: RawTags,
): void {
  while (pos < end - 10) {
    const id = String.fromCharCode(
      bytes[pos] ?? 0,
      bytes[pos + 1] ?? 0,
      bytes[pos + 2] ?? 0,
      bytes[pos + 3] ?? 0,
    );
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const size = ver === 4 ? syncsafe(view, pos + 4) : view.getUint32(pos + 4);
    if (size <= 0 || pos + 10 + size > end) break;
    const data = bytes.subarray(pos + 10, pos + 10 + size);
    switch (id) {
      case 'TIT2':
        r.title = decodeText(data);
        break;
      case 'TPE1':
        r.artist = decodeText(data);
        break;
      case 'TALB':
        r.album = decodeText(data);
        break;
      case 'TYER':
      case 'TDRC':
        r.year = decodeText(data).slice(0, 4);
        break;
      case 'TCON':
        r.genre = decodeGenre(data);
        break;
      case 'APIC':
        r.coverBlob = parseApic(data);
        break;
    }
    pos += 10 + size;
  }
}

function parseId3v1(view: DataView, len: number, r: RawTags): void {
  const off = len - 128;
  if (
    String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2)) !==
    'TAG'
  )
    return;
  const read = (s: number, n: number): string => {
    let out = '';
    for (let i = 0; i < n; i++) {
      const c = view.getUint8(off + s + i);
      if (c === 0) break;
      out += String.fromCharCode(c);
    }
    return out.trim();
  };
  r.title = r.title || read(3, 30);
  r.artist = r.artist || read(33, 30);
  r.album = r.album || read(63, 30);
  r.year = r.year || read(93, 4);
  const genre = view.getUint8(off + 127);
  if (!r.genre && genre < GENRES.length) r.genre = GENRES[genre] ?? '';
}

/** ID3v2 at the start, then ID3v1 at the end if v2 gave no title or artist. */
export function parseId3(buf: ArrayBuffer): RawTags {
  const r = blank();
  if (buf.byteLength < 10) return r;
  const view = new DataView(buf);
  if (String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2)) === 'ID3') {
    const ver = view.getUint8(3);
    const flags = view.getUint8(5);
    const size = syncsafe(view, 6);
    let offset = 10;
    if (flags & 0x40) offset += ver === 4 ? syncsafe(view, 10) : view.getUint32(10);
    parseId3Frames(new Uint8Array(buf), view, offset, offset + size, ver, r);
  }
  if (!r.title && !r.artist && buf.byteLength >= 128) parseId3v1(view, buf.byteLength, r);
  return r;
}

const VORBIS_KEYS: Record<string, 'title' | 'artist' | 'album' | 'year' | 'genre'> = {
  TITLE: 'title',
  ARTIST: 'artist',
  ALBUM: 'album',
  DATE: 'year',
  GENRE: 'genre',
};

/** Vorbis comments (FLAC, Ogg Vorbis, Opus), from the vendor string on, little-endian. */
function vorbis(b: Uint8Array, p: number, end: number, r: RawTags): void {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const td = new TextDecoder();
  let q = p + 4 + dv.getUint32(p, true);
  const n = dv.getUint32(q, true);
  q += 4;
  for (let i = 0; i < n && q + 4 <= end; i++) {
    const l = dv.getUint32(q, true);
    q += 4;
    if (q + l > end) break;
    // Read the key first: an embedded cover is megabytes of base64.
    const head = td.decode(b.subarray(q, Math.min(q + l, q + 32)));
    const eq = head.indexOf('=');
    const name = head.slice(0, eq).toUpperCase();
    const at = q;
    const value = (): string => td.decode(b.subarray(at + eq + 1, at + l));
    if (name === 'METADATA_BLOCK_PICTURE') {
      try {
        const pic = Uint8Array.from(atob(value()), (ch) => ch.charCodeAt(0));
        picture(pic, 0, pic.length, r);
      } catch {
        // A broken picture leaves the cover empty.
      }
    } else {
      const key = VORBIS_KEYS[name];
      if (key && !r[key]) r[key] = key === 'year' ? value().slice(0, 4) : value();
    }
    q += l;
  }
}

/** A FLAC picture block, big-endian. The front cover (type 3) wins. */
function picture(b: Uint8Array, p: number, end: number, r: RawTags): void {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const kind = dv.getUint32(p);
  const ml = dv.getUint32(p + 4);
  const mime = new TextDecoder().decode(b.subarray(p + 8, p + 8 + ml));
  let q = p + 8 + ml;
  q += 4 + dv.getUint32(q);
  q += 16;
  const dl = dv.getUint32(q);
  q += 4;
  if (q + dl <= end && (!r.coverBlob || kind === 3)) {
    r.coverBlob = new Blob([copy(b.subarray(q, q + dl))], {
      type: /^image\/(jpeg|png|gif|webp)$/.test(mime) ? mime : 'image/jpeg',
    });
  }
}

function flac(b: Uint8Array, p: number): RawTags {
  const r = blank();
  for (let last = false; !last && p + 4 <= b.length;) {
    const type = (b[p] ?? 0) & 0x7f;
    const len = ((b[p + 1] ?? 0) << 16) | ((b[p + 2] ?? 0) << 8) | (b[p + 3] ?? 0);
    const end = p + 4 + len;
    last = !!((b[p] ?? 0) & 0x80);
    p += 4;
    if (end > b.length) break;
    if (type === 4) vorbis(b, p, end, r);
    else if (type === 6) picture(b, p, end, r);
    p = end;
  }
  return r;
}

/** Ogg Vorbis and Opus: the comments are the second packet, possibly over several pages. */
function ogg(b: Uint8Array): RawTags {
  const r = blank();
  const parts: Uint8Array[] = [];
  let p = 0;
  let packet = 0;
  let size = 0;
  while (packet < 2 && p + 27 <= b.length && is(b, p, 'OggS')) {
    const segments = b[p + 26] ?? 0;
    let q = p + 27 + segments;
    for (let i = 0; i < segments; i++) {
      const len = b[p + 27 + i] ?? 0;
      if (packet === 1) {
        parts.push(b.subarray(q, q + len));
        size += len;
      }
      q += len;
      if (len < 255) packet++;
    }
    p = q;
  }
  const c = new Uint8Array(size);
  parts.reduce((at, part) => (c.set(part, at), at + part.length), 0);
  if (is(c, 0, '\x03vorbis')) vorbis(c, 7, c.length, r);
  else if (is(c, 0, 'OpusTags')) vorbis(c, 8, c.length, r);
  return r;
}

const INFO_KEYS: Record<string, 'title' | 'artist' | 'album' | 'year' | 'genre'> = {
  INAM: 'title',
  IART: 'artist',
  IPRD: 'album',
  ICRD: 'year',
  IGNR: 'genre',
};

/** WAV: a LIST/INFO chunk, or an ID3 block in an 'id3 ' chunk (which wins). */
function wav(b: Uint8Array): RawTags {
  const r = blank();
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // INFO text predates Unicode: UTF-8 when valid, Windows Latin otherwise.
  const text = (u: Uint8Array): string => {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(u);
    } catch {
      return new TextDecoder('windows-1252').decode(u);
    }
  };
  const each = (p: number, end: number, fn: (id: string, s: number, e: number) => void): void => {
    while (p + 8 <= end) {
      const size = dv.getUint32(p + 4, true);
      fn(
        String.fromCharCode(b[p] ?? 0, b[p + 1] ?? 0, b[p + 2] ?? 0, b[p + 3] ?? 0),
        p + 8,
        Math.min(end, p + 8 + size),
      );
      p += 8 + size + (size & 1);
    }
  };
  let id3: RawTags | null = null;
  each(12, b.length, (id, s, e) => {
    if (id === 'LIST' && is(b, s, 'INFO')) {
      each(s + 4, e, (key, s2, e2) => {
        const field = INFO_KEYS[key];
        if (!field || r[field]) return;
        const v = text(b.subarray(s2, e2))
          .replace(/\0[^]*$/, '')
          .trim();
        r[field] = field === 'year' ? v.slice(0, 4) : v;
      });
    } else if (id.toLowerCase() === 'id3 ') id3 = parseId3(copy(b.subarray(s, e)).buffer);
  });
  if (id3) {
    const found: RawTags = id3;
    for (const key of ['title', 'artist', 'album', 'year', 'genre'] as const)
      if (found[key]) r[key] = found[key];
    if (found.coverBlob) r.coverBlob = found.coverBlob;
  }
  return r;
}

interface Atom {
  type: string;
  s: number;
  e: number;
}

function atoms(b: Uint8Array, p: number, end: number): Atom[] {
  const out: Atom[] = [];
  while (p + 8 <= end) {
    let size = u32(b, p);
    let head = 8;
    if (size === 1) {
      size = u32(b, p + 8) * 4294967296 + u32(b, p + 12);
      head = 16;
    } else if (size === 0) size = end - p;
    if (size < head || p + size > end) break;
    out.push({
      type: String.fromCharCode(b[p + 4] ?? 0, b[p + 5] ?? 0, b[p + 6] ?? 0, b[p + 7] ?? 0),
      s: p + head,
      e: p + size,
    });
    p += size;
  }
  return out;
}

/** iTunes-style tags: moov / udta / meta / ilst, each item holding one 'data' atom. */
function mp4(b: Uint8Array): RawTags {
  const r = blank();
  const td = new TextDecoder();
  const find = (a: Atom | undefined, t: string): Atom | undefined =>
    a ? atoms(b, a.s, a.e).find((x) => x.type === t) : undefined;
  const moov = find({ type: '', s: 0, e: b.length }, 'moov');
  const meta = find(find(moov, 'udta'), 'meta') ?? find(moov, 'meta');
  if (!meta) return r;
  // ISO files put 4 bytes of version and flags before meta's children; QuickTime files do not.
  const ilst = find(
    { type: 'meta', s: is(b, meta.s + 4, 'hdlr') ? meta.s : meta.s + 4, e: meta.e },
    'ilst',
  );
  for (const item of ilst ? atoms(b, ilst.s, ilst.e) : []) {
    const d = find(item, 'data');
    if (!d || d.e - d.s < 8) continue;
    const body = b.subarray(d.s + 8, d.e);
    const text = (): string => td.decode(body).replace(/\0/g, '');
    switch (item.type) {
      case '\xA9nam':
        r.title = text();
        break;
      case '\xA9ART':
        r.artist = text();
        break;
      case '\xA9alb':
        r.album = text();
        break;
      case '\xA9day':
        r.year = text().slice(0, 4);
        break;
      case '\xA9gen':
        r.genre = text();
        break;
      case 'gnre':
        if (!r.genre && body.length >= 2)
          r.genre = GENRES[(((body[0] ?? 0) << 8) | (body[1] ?? 0)) - 1] ?? '';
        break;
      case 'covr':
        if (!r.coverBlob)
          r.coverBlob = new Blob([copy(body)], {
            type: (u32(b, d.s) & 0xffffff) === 14 ? 'image/png' : 'image/jpeg',
          });
        break;
    }
  }
  return r;
}

/** Same result whatever the container. */
export function parseTags(buf: ArrayBuffer): RawTags {
  const b = new Uint8Array(buf);
  try {
    // Some taggers put an ID3v2 block in front of a FLAC stream.
    const skip = b.length > 10 && is(b, 0, 'ID3') ? 10 + syncsafe(new DataView(buf), 6) : 0;
    if (is(b, skip, 'fLaC')) return flac(b, skip + 4);
    if (is(b, 4, 'ftyp')) return mp4(b);
    if (is(b, 0, 'OggS')) return ogg(b);
    if (is(b, 0, 'RIFF') && is(b, 8, 'WAVE')) return wav(b);
  } catch {
    // A damaged container falls through to ID3.
  }
  return parseId3(buf);
}
