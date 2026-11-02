import { beforeEach, describe, expect, it, vi } from 'vitest';
import { retagRow, rowToTrack, trackToRow, type HtmlRow } from '../src/library/html-rows';
import { readHtml, writeHtml } from '../src/util/storage-html';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
  });
});
const json = (key: string): Record<string, unknown> => JSON.parse(store.get(key) ?? 'null');

describe('html profile settings', () => {
  it('reads what html-1 wrote: strings, 0..1 sliders, rpm', () => {
    store.set(
      'vinyl-prefs',
      JSON.stringify({
        volume: '0.5',
        bass: '3',
        noise: '0.3',
        sfx: false,
        scratch: true,
        rpm: 45,
      }),
    );
    store.set('vinyl-deck', JSON.stringify({ condition: 'worn', imperfection: 0.7 }));
    expect(readHtml('settings')).toMatchObject({
      volume: 50,
      bass: 3,
      noise: 30,
      effects: false,
      scratch: true,
      speed: 'single',
      condition: 'worn',
      imperfection: 0.7,
    });
  });

  it("writes html-1's shapes and keeps the fields it does not own", () => {
    store.set('vinyl-prefs', JSON.stringify({ theme: 'theme-wood', albumInfo: { year: '1971' } }));
    writeHtml('settings', {
      volume: 80,
      bass: 0,
      mid: 1,
      treble: -2,
      noise: 25,
      effects: true,
      scratch: false,
      speed: 'shellac',
      graphicEq: { on: true, preamp: 0, bands: [], preset: '' },
      condition: 'mint',
      wear: 0.05,
    });
    expect(json('vinyl-prefs')).toMatchObject({
      theme: 'theme-wood',
      albumInfo: { year: '1971' },
      volume: '0.8',
      bass: '0',
      treble: '-2',
      noise: '0.25',
      sfx: true,
      rpm: 78,
    });
    expect(json('vinyl-deck')).toMatchObject({ condition: 'mint', wear: 0.05 });
    expect(json('vinyl-eq')).toMatchObject({ on: true });
  });

  it('round-trips the settings', () => {
    const value = {
      volume: 40,
      bass: 2,
      mid: 0,
      treble: 0,
      noise: 25,
      effects: true,
      scratch: true,
      speed: 'lp',
      graphicEq: { on: false, preamp: 0, bands: [], preset: '' },
      sides: true,
    };
    writeHtml('settings', value);
    expect(readHtml('settings')).toEqual(value);
  });

  it('survives garbage in every key', () => {
    store.set('vinyl-prefs', '{broken');
    store.set('vinyl-deck', '[1,2]');
    store.set('vinyl-tracks', '7');
    expect(readHtml('settings')).toEqual({});
    expect(readHtml('colours')).toEqual({});
    expect(readHtml('coachDone')).toBeNull();
  });
});

describe('html profile queue, theme and colours', () => {
  it('keeps the order as a bare id list and maps repeat to its numbers', () => {
    writeHtml('queue', { ids: ['a', 'b'], currentId: 'b', shuffle: true, repeat: 'all' });
    expect(JSON.parse(store.get('vinyl-tracks')!)).toEqual(['a', 'b']);
    expect(json('vinyl-prefs')).toMatchObject({ shuffle: true, repeat: 2 });
    expect(readHtml('queue')).toEqual({
      ids: ['a', 'b'],
      currentId: 'b',
      shuffle: true,
      repeat: 'all',
    });
  });

  it("reads html-1's repeat one", () => {
    store.set('vinyl-prefs', JSON.stringify({ repeat: 1 }));
    expect(readHtml('queue')).toMatchObject({ repeat: 'one' });
  });

  it('maps the theme to a finish and keeps an exact finish beside it', () => {
    store.set('vinyl-prefs', JSON.stringify({ theme: 'theme-wood' }));
    expect(readHtml('plinth')).toBe('walnut');
    writeHtml('plinth', 'aluminium');
    expect(json('vinyl-prefs').theme).toBe('');
    expect(readHtml('plinth')).toBe('aluminium');
  });

  it('colours count only when html-1 says they were chosen', () => {
    store.set('vinyl-prefs', JSON.stringify({ accent: '#ff0000', hasCustomColors: false }));
    expect(readHtml('colours')).toEqual({});
    writeHtml('colours', { bg: '#101010' });
    expect(json('vinyl-prefs')).toMatchObject({ bg: '#101010', hasCustomColors: true });
    expect(readHtml('colours')).toMatchObject({ bg: '#101010' });
  });

  it('other flags live in vinyl-deck', () => {
    writeHtml('coachDone', true);
    expect(json('vinyl-deck').coachDone).toBe(true);
    expect(readHtml('coachDone')).toBe(true);
  });
});

describe('html profile rows', () => {
  const row: HtmlRow = {
    id: 't7',
    name: 'Song',
    buffer: new Uint8Array([1, 2, 3]).buffer,
    mime: 'audio/flac',
    artist: 'Someone',
    year: '1971',
    coverDataUrl: 'data:image/png;base64,AQID',
    rms: [0, 128, 255],
  };

  it('reads a row html-1 wrote', async () => {
    const track = rowToTrack(row);
    expect(track.tags).toMatchObject({ title: 'Song', artist: 'Someone', year: 1971, album: '' });
    expect(track.blob.type).toBe('audio/flac');
    expect(track.size).toBe(3);
    expect(track.durationSec).toBe(0);
    expect([...track.levels!]).toEqual([0, 128, 255]);
    expect([...new Uint8Array(await track.coverBlob!.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it('writes back the fields html-1 reads', async () => {
    const out = await trackToRow(rowToTrack(row));
    expect(out).toMatchObject({
      id: 't7',
      name: 'Song',
      mime: 'audio/flac',
      artist: 'Someone',
      year: 1971,
      genre: '',
      coverDataUrl: 'data:image/png;base64,AQID',
      tagv: 2,
    });
    expect([...new Uint8Array(out.buffer)]).toEqual([1, 2, 3]);
  });

  it('a row saved before its format was supported gets its tags, once', async () => {
    const text = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
    const le = (n: number): number[] => [n & 255, (n >>> 8) & 255, 0, 0];
    const comments = ['TITLE=Blue', 'ARTIST=Ann', 'DATE=1971-05-01'];
    const vc = [
      ...le(4),
      ...text('test'),
      ...le(comments.length),
      ...comments.flatMap((c) => [...le(c.length), ...text(c)]),
    ];
    const flac = Uint8Array.from([...text('fLaC'), 0x84, 0, 0, vc.length, ...vc]);
    const out = await retagRow({ id: 'x', name: 'Old', buffer: flac.buffer });
    expect(out).toMatchObject({ name: 'Blue', artist: 'Ann', year: '1971', tagv: 2 });
    const kept = await retagRow({ id: 'x', name: 'Mine', artist: 'Me', buffer: flac.buffer });
    expect(kept).toMatchObject({ name: 'Mine', artist: 'Me', year: '1971' });
  });

  it('survives a bad cover and an empty year', () => {
    const track = rowToTrack({ ...row, coverDataUrl: 'nonsense', year: '' });
    expect(track.coverBlob).toBeUndefined();
    expect(track.tags.year).toBeNull();
  });
});
