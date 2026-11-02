import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanTags,
  fileExtension,
  isAudioFile,
  parseFilename,
  quotaWarning,
  trackId,
  withTimeout,
} from '../src/library/files';

describe('isAudioFile', () => {
  it.each(['song.mp3', 'SONG.FLAC', 'a/b/c.ogg', 'take.wav', 'x.m4a', 'x.opus', 'x.aiff'])(
    'accepts %s by extension',
    (name) => {
      expect(isAudioFile(name, '')).toBe(true);
    },
  );

  it('accepts any audio MIME type regardless of extension', () => {
    expect(isAudioFile('mystery.bin', 'audio/x-something')).toBe(true);
    expect(isAudioFile('noext', 'Audio/MPEG')).toBe(true);
  });

  it.each(['cover.jpg', 'notes.txt', 'movie.mp4', 'README', 'archive.mp3.zip'])(
    'rejects %s',
    (name) => {
      expect(isAudioFile(name, '')).toBe(false);
      expect(isAudioFile(name, 'image/jpeg')).toBe(false);
    },
  );

  it('rejects dot-files such as macOS resource forks', () => {
    expect(isAudioFile('._song.mp3', 'audio/mpeg')).toBe(false);
    expect(isAudioFile('Music/.DS_Store', '')).toBe(false);
  });

  it('reads extensions case-insensitively', () => {
    expect(fileExtension('A.Mp3')).toBe('mp3');
    expect(fileExtension('noext')).toBe('');
  });
});

describe('parseFilename', () => {
  it.each([
    ['Artist - Title.mp3', 'Artist', 'Title'],
    ['01 - Artist - Title.flac', 'Artist', 'Title'],
    ['07. Some Band – A Song.ogg', 'Some Band', 'A Song'],
    ['Artist_Name - Song_Name.wav', 'Artist Name', 'Song Name'],
    ['folder/sub/Artist - Title.mp3', 'Artist', 'Title'],
    ['Just A Title.mp3', '', 'Just A Title'],
    ['99 Luftballons.mp3', '', '99 Luftballons'],
    ['2Pac - Changes.mp3', '2Pac', 'Changes'],
    ['A - B - C.mp3', 'A', 'B - C'],
  ])('%s → artist "%s", title "%s"', (name, artist, title) => {
    expect(parseFilename(name)).toEqual({ artist, title });
  });

  it('never returns an empty title', () => {
    expect(parseFilename('.mp3').title).toBe('.mp3');
  });
});

describe('cleanTags', () => {
  const input = {
    title: ' So What ',
    artist: ' Miles Davis',
    album: 'Kind of Blue ',
    year: '1959',
    genre: 'Jazz',
  };

  it('trims text and parses the year', () => {
    expect(cleanTags(input, 'fallback')).toEqual({
      title: 'So What',
      artist: 'Miles Davis',
      album: 'Kind of Blue',
      year: 1959,
      genre: 'Jazz',
    });
  });

  it('keeps the old title when the new one is empty', () => {
    expect(cleanTags({ ...input, title: '   ' }, 'Old Title').title).toBe('Old Title');
  });

  it.each(['', 'nineteen', '19.5', '-3', '12345', ' '])(
    'treats the year "%s" as unknown',
    (year) => {
      expect(cleanTags({ ...input, year }, 'x').year).toBeNull();
    },
  );

  it('limits the length of each field', () => {
    const long = 'x'.repeat(5000);
    const cleaned = cleanTags({ ...input, title: long, artist: long }, 'x');
    expect(cleaned.title).toHaveLength(200);
    expect(cleaned.artist).toHaveLength(200);
  });
});

describe('trackId', () => {
  it('is stable for the same file and differs when the file changes', () => {
    expect(trackId('a.mp3', 10, 5)).toBe(trackId('a.mp3', 10, 5));
    expect(trackId('a.mp3', 10, 5)).not.toBe(trackId('a.mp3', 11, 5));
    expect(trackId('a.mp3', 10, 5)).not.toBe(trackId('a.mp3', 10, 6));
  });
});

describe('quotaWarning', () => {
  it('is null at or below 80 % after the import', () => {
    expect(quotaWarning({ usage: 10, quota: 100 }, 70)).toBeNull();
    expect(quotaWarning({ usage: 0, quota: 100 }, 0)).toBeNull();
  });

  it('warns above 80 %', () => {
    expect(quotaWarning({ usage: 10, quota: 100 }, 71)).toMatch(/81 %/);
    expect(quotaWarning({ usage: 95, quota: 100 }, 0)).toMatch(/95 %/);
  });

  it('is null when the browser gives no usable estimate', () => {
    expect(quotaWarning({}, 1e12)).toBeNull();
    expect(quotaWarning({ usage: 5, quota: 0 }, 10)).toBeNull();
  });
});

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves with the value when the promise wins', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('passes a rejection through as an Error', async () => {
    await expect(withTimeout(Promise.reject(new Error('bad tag')), 1000)).rejects.toThrow(
      'bad tag',
    );
    await expect(withTimeout(Promise.reject('text'), 1000)).rejects.toThrow('text');
  });

  it('rejects when the promise takes too long', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => undefined), 500);
    const assertion = expect(pending).rejects.toThrow(/Timed out/);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
  });
});
