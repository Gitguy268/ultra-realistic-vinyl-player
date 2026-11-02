import {
  EFFECTIVE_LENGTH,
  MOUNTING_DISTANCE,
  REST_DIRECTION,
  directionFor,
  radiusFor,
} from './core/tonearm3d';
import { Program, packSides, recordGeometry } from './core/program';
import { WINAMP_PRESETS, eqfValueToDb, parseEqf, parseGraphicEq } from './audio/winamp-eq';
import { mixPlan } from './audio/mix';
import { groupLibrary } from './library/group';
import { GENRES, parseTags } from './library/tags-html';
import { heatColour, logEdges, risingZeroCrossing } from './ui/scopes';

/**
 * `?selftest` (html-1): checks the pure logic in the page itself and logs the verdict. It holds
 * html-1's synthesized tag files; tests/selftest.test.ts runs the same list.
 */
// eslint-disable-next-line no-console
const logFailure = (failed: string): void => console.error(failed);

export function selfTest(report: (failed: string) => void = logFailure): boolean {
  let pass = true;
  const ok = (condition: unknown, message: string): void => {
    if (condition) return;
    pass = false;
    report(message);
  };

  const g = recordGeometry('lp');
  for (const rn of [g.locked, g.inner, 0.7, g.outer, 1.05]) {
    const r = rn * g.radius;
    ok(Math.abs(radiusFor(directionFor(r)) - r) < 1e-6, `arm direction round trip at r=${rn}`);
  }
  ok(
    directionFor(g.outer * g.radius) > REST_DIRECTION &&
      directionFor(g.locked * g.radius) > directionFor(g.outer * g.radius),
    'arm swings inward from the rest',
  );
  ok(
    MOUNTING_DISTANCE + EFFECTIVE_LENGTH > g.radius &&
      Math.abs(MOUNTING_DISTANCE - EFFECTIVE_LENGTH) < g.locked * g.radius,
    'stylus can reach the locked groove',
  );

  const program = new Program();
  program.build([180, 240, 95], 0, { sides: false, size: 'lp' });
  program.bands.forEach((band, i) => {
    if (!band) return;
    for (const f of [0.01, 0.5, 0.99]) {
      const hit = program.locate(program.radius(i, f * band.dur));
      ok(
        hit.kind === 'track' && hit.idx === i && Math.abs(hit.t - f * band.dur) < 1e-6,
        `track ${i} locate round trip at ${f}`,
      );
    }
    const before = program.bands[i - 1];
    if (before) {
      const gap = program.locate((before.r1 + band.r0) / 2);
      ok('idx' in gap && gap.idx === i, `gap before track ${i} resolves to its start`);
    }
  });
  ok(
    program.locate(1.01).kind === 'off' &&
      program.locate(program.geometry.locked).kind === 'runout',
    'edges',
  );
  ok(
    JSON.stringify(packSides([600, 600, 600, 100, 2000, 60])) === '[[0,1],[2,3],[4,4],[5,5]]',
    'sides pack in order',
  );
  for (const size of ['lp', 'single', 'shellac'] as const) {
    const z = recordGeometry(size);
    ok(
      z.leadIn > z.outer && z.outer > z.inner && z.inner > z.locked && z.locked > z.label,
      `record size table is ordered: ${size}`,
    );
  }

  // Tag parsers: one tiny synthesized file per container.
  const cat = (...parts: (string | number[] | Uint8Array)[]): Uint8Array =>
    Uint8Array.from(
      parts.flatMap((x) => (typeof x === 'string' ? [...x].map((ch) => ch.charCodeAt(0)) : [...x])),
    );
  const parse = (bytes: Uint8Array) => parseTags(bytes.buffer as ArrayBuffer);
  const be = (n: number): number[] => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const le = (n: number): number[] => be(n).reverse();
  const atom = (type: string, ...body: (string | number[] | Uint8Array)[]): Uint8Array => {
    const d = cat(...body);
    return cat(be(d.length + 8), type, d);
  };
  const tag = (name: string, type: number, ...v: (string | number[])[]): Uint8Array =>
    atom(name, atom('data', be(type), be(0), ...v));
  const vc = cat(
    le(4),
    'test',
    le(3),
    ...['title=Blue', 'ARTIST=Ann', 'DATE=1971-05-01'].flatMap((s) => [le(s.length), s]),
  );
  const pic = cat(be(3), be(9), 'image/png', be(0), be(1), be(1), be(24), be(0), be(3), [1, 2, 3]);
  const flac = parse(
    cat(
      'ID3',
      [4, 0, 0],
      [0, 0, 0, 2],
      [0, 0],
      'fLaC',
      [0, 0, 0, 2],
      [0, 0],
      [4, ...be(vc.length).slice(1)],
      vc,
      [0x86, ...be(pic.length).slice(1)],
      pic,
    ),
  );
  ok(
    flac.title === 'Blue' &&
      flac.artist === 'Ann' &&
      flac.year === '1971' &&
      flac.coverBlob?.type === 'image/png' &&
      flac.coverBlob.size === 3,
    'FLAC tags behind an ID3 header',
  );
  const ilst = atom(
    'ilst',
    tag('\xA9nam', 1, 'Red'),
    tag('\xA9ART', 1, 'Bo'),
    tag('\xA9day', 1, '1984'),
    tag('gnre', 0, [0, 18]),
    tag('covr', 13, [9, 9]),
  );
  // 64-bit size, in front of moov.
  const mdat = cat(be(1), 'mdat', be(0), be(20), [1, 2, 3, 4]);
  const m4a = parse(
    cat(
      atom('ftyp', 'M4A '),
      mdat,
      atom('moov', atom('udta', atom('meta', be(0), atom('hdlr', be(0)), ilst))),
    ),
  );
  ok(
    m4a.title === 'Red' &&
      m4a.artist === 'Bo' &&
      m4a.year === '1984' &&
      m4a.genre === GENRES[17] &&
      m4a.coverBlob?.type === 'image/jpeg',
    'MP4 tags',
  );
  const qt = parse(
    cat(atom('ftyp', 'qt  '), atom('moov', atom('meta', atom('hdlr', be(0)), ilst))),
  );
  ok(qt.title === 'Red', 'MP4 tags, QuickTime layout');
  ok(parse(cat('fLaC', [4, 0, 0, 9], 'x')).title === '', 'truncated FLAC has no tags');
  const big = cat(
    'OpusTags',
    le(4),
    'test',
    le(3),
    ...[
      'TITLE=Green',
      'artist=Cy',
      `METADATA_BLOCK_PICTURE=${btoa(String.fromCharCode(...pic))}`,
    ].flatMap((s) => [le(s.length), s]),
    new Array<number>(300).fill(32),
  );
  const page = (segments: number[], data: Uint8Array): Uint8Array =>
    cat('OggS', [0, 0], be(0), be(0), be(1), be(0), be(0), [segments.length], segments, data);
  const ogg = parse(
    cat(
      page([19], cat('OpusHead', be(0), be(0), [0, 0, 0])),
      page([255], big.subarray(0, 255)),
      page([big.length - 255], big.subarray(255)),
    ),
  );
  ok(
    ogg.title === 'Green' &&
      ogg.artist === 'Cy' &&
      ogg.coverBlob?.type === 'image/png' &&
      ogg.coverBlob.size === 3,
    'Ogg tags, comment packet over two pages',
  );
  const chunk = (id: string, ...body: (string | number[] | Uint8Array)[]): Uint8Array => {
    const d = cat(...body);
    return cat(id, le(d.length), d, d.length & 1 ? [0] : []);
  };
  const wav = parse(
    cat(
      'RIFF',
      le(0),
      'WAVE',
      chunk('fmt ', be(0)),
      chunk('data', [1, 2, 3]),
      chunk(
        'LIST',
        'INFO',
        chunk('INAM', 'Grey\0'),
        chunk('IART', [0x42, 0xe9, 0]),
        chunk('ICRD', '1999'),
      ),
    ),
  );
  ok(
    wav.title === 'Grey' && wav.artist === 'B\xE9' && wav.year === '1999',
    'WAV INFO tags, Latin text',
  );

  // Graphic EQ: Winamp's slider values, an .eqf file built here, stored values, the headroom trim.
  const eqf = parseEqf(
    cat(
      'Winamp EQ library file v1.1',
      [0x1a],
      '!--',
      'Test',
      new Array<number>(253).fill(0),
      [0, 63, 31, 31, 31, 31, 31, 31, 31, 31, 31],
    ).buffer as ArrayBuffer,
  )[0];
  ok(
    eqf?.name === 'Test' &&
      eqf.bands[0] === 12 &&
      eqf.bands[1] === -12 &&
      eqf.bands[2] === 0 &&
      eqf.preamp === 0,
    '.eqf preset: name, bands and preamp',
  );
  ok(
    eqfValueToDb(33) === 0 &&
      eqfValueToDb(64) === 12 &&
      eqfValueToDb(1) === -12 &&
      WINAMP_PRESETS.length === 17,
    'Winamp presets: slider values to dB',
  );
  let threw = false;
  try {
    parseEqf(new Uint8Array(40).buffer);
  } catch {
    threw = true;
  }
  ok(
    threw &&
      parseGraphicEq({ on: 'yes', bands: [1, 2] }).on === false &&
      parseGraphicEq({ bands: new Array(10).fill(99) }).bands[0] === 12,
    'graphic EQ: bad files and stored values are refused',
  );
  const boosted = mixPlan({
    equalisation: 'flat',
    noiseLevel: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    graphicEq: { on: true, preamp: 0, bands: new Array<number>(10).fill(12), preset: '' },
  });
  ok(boosted.musicGain < 0.3, 'graphic EQ: a full boost is trimmed below full scale');

  // Library desktop: artist folders of album folders, unknown ones last.
  const entry = (id: string, artist: string, album: string) => ({
    id,
    title: id,
    artist,
    album,
    durationSec: 0,
  });
  const folders = groupLibrary([
    entry('a', 'Bo', ''),
    entry('b', '', 'X'),
    entry('c', 'Ann', 'Z'),
    entry('d', 'Bo', 'Y'),
  ]);
  ok(
    folders.map((f) => f.name).join() === 'Ann,Bo,Unknown artist' &&
      folders[1]?.albums.map((a) => a.name).join() === 'Y,Unknown album',
    'library desktop groups artists and albums',
  );

  // 2D visualizers: log bands, the scope's trigger and the spectrogram's colours.
  const edges = logEdges(100, 10, 2);
  ok(
    edges[0] === 2 && edges[10] === 100 && edges.every((e, i) => !i || e > edges[i - 1]!),
    'visualizer log bands in order, one bin at least',
  );
  ok(
    risingZeroCrossing(Float32Array.from([0.5, -0.2, -0.1, 0.3, 0.4, -0.5, 0, 0])) === 3 &&
      heatColour(0).join() === '21,21,21' &&
      heatColour(1).join() === '255,255,235',
    'scope trigger and spectrogram colours',
  );
  return pass;
}
