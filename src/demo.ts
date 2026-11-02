import { hash, rng } from './core/random';
import type { Track, TrackStore } from './library/db';

/** `?demo` runs beside the saved library, never in it: nothing opens or writes the database. */
export class NoStore implements TrackStore {
  all(): Promise<Track[]> {
    return Promise.resolve([]);
  }
  put(): Promise<void> {
    return Promise.resolve();
  }
  delete(): Promise<void> {
    return Promise.resolve();
  }
  clear(): Promise<void> {
    return Promise.resolve();
  }
  loadCover(): Promise<Blob | null> {
    return Promise.resolve(null);
  }
  saveCover(): Promise<void> {
    return Promise.resolve();
  }
}

/** A little procedural tune as a 16-bit stereo WAV: kick, bass, a panned arpeggio and hats (html-1). */
function tune(seconds: number, bpm: number, root: number, seed: string): ArrayBuffer {
  const sr = 32000;
  const n = Math.floor(seconds * sr);
  const rnd = rng(hash(seed));
  const buffer = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buffer);
  const text = (at: number, s: string): void => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  v.setUint32(4, 36 + n * 4, true);
  text(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, n * 4, true);
  const beat = 60 / bpm;
  const scale = [0, 3, 5, 7, 10, 12, 15, 17];
  const progression = [0, 0, 5, 3];
  const hz = (semitones: number): number => root * 2 ** (semitones / 12);
  const TAU = Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const b = t / beat;
    const bar = Math.floor(b / 4);
    const tb = (b % 1) * beat;
    const chord = progression[bar % 4]!;
    const step = Math.floor(b * 2);
    const ts = (((b * 2) % 1) * beat) / 2;
    const fade = Math.min(1, t / 0.4, (seconds - t) / 1.2);
    const kick =
      Math.sin(TAU * (48 * tb + (60 * (1 - Math.exp(-tb * 30))) / 30)) * Math.exp(-tb * 9) * 0.55;
    const bass = Math.sin(TAU * hz(chord - 12) * t) * 0.22 * (0.6 + 0.4 * Math.exp(-tb * 4));
    const note = hz(chord + scale[(step * 3 + bar) % scale.length]!);
    const arp =
      (Math.sin(TAU * note * t) + 0.35 * Math.sin(TAU * note * 2 * t)) * Math.exp(-ts * 7) * 0.2;
    const hat = (rnd() * 2 - 1) * Math.exp((-((b * 2 + 1) % 2) * beat * 60) / 2) * 0.1;
    const pan = step % 2 ? 0.25 : 0.75;
    const l = (kick + bass + arp * (1 - pan) * 2 + hat * 0.8) * fade;
    const r = (kick + bass + arp * pan * 2 + hat * 1.2) * fade;
    v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, l)) * 30000, true);
    v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, r)) * 30000, true);
  }
  return buffer;
}

export const DEMO_ARTIST = 'Synth Demo';
export const DEMO_ALBUM = 'Test Pressing';

export function demoFiles(): File[] {
  const specs = [
    ['Warm Up', 24, 108, 110],
    ['Slow Burn', 30, 84, 98],
    ['Last Call', 18, 124, 123.5],
  ] as const;
  return specs.map(
    ([name, seconds, bpm, root]) =>
      new File([new Uint8Array(tune(seconds, bpm, root, name))], `${name}.wav`, {
        type: 'audio/wav',
      }),
  );
}
