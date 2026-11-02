/**
 * The deck's mechanical sounds, synthesized (html-1's Sfx, plus the plates' interlock and the
 * cover's hinge). Each is a few hits: a pitched body sweeping down and/or a band of noise, with a
 * fast decay. They follow the volume but skip the tone controls: they are airborne, not cut.
 */

export type MechanismSound =
  | 'detent'
  | 'interlock'
  | 'lift'
  | 'lower'
  | 'thump'
  | 'motor-on'
  | 'motor-off'
  | 'hinge-open'
  | 'hinge-close'
  | 'place'
  | 'whoosh-on'
  | 'whoosh-off';

interface Hit {
  f0?: number;
  f1?: number;
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  noise?: number;
  nf?: number;
  nf1?: number;
  q?: number;
  at?: number;
}

export const MECHANISM_HITS: Record<MechanismSound, readonly Hit[]> = {
  detent: [
    { f0: 1300, f1: 300, dur: 0.025, gain: 0.05, noise: 0.05, nf: 2400, q: 2 },
    { f0: 900, f1: 220, dur: 0.03, gain: 0.06, noise: 0.05, nf: 1800, q: 2, at: 0.055 },
  ],
  // The plate meets the 78 interlock's stop: a dull knock, with no second click.
  interlock: [
    { f0: 120, f1: 40, type: 'triangle', dur: 0.1, gain: 0.12, noise: 0.03, nf: 900, q: 1 },
  ],
  lift: [{ noise: 0.03, nf: 500, nf1: 1300, dur: 0.14, q: 0.8 }],
  lower: [{ noise: 0.025, nf: 1200, nf1: 450, dur: 0.3, q: 0.8 }],
  thump: [
    { f0: 72, f1: 36, dur: 0.2, gain: 0.16 },
    { noise: 0.06, nf: 1500, dur: 0.02, q: 1 },
  ],
  'motor-on': [
    { f0: 130, f1: 46, type: 'triangle', dur: 0.12, gain: 0.13 },
    { noise: 0.05, nf: 1800, dur: 0.025, q: 1.5 },
  ],
  'motor-off': [
    { f0: 95, f1: 36, type: 'triangle', dur: 0.12, gain: 0.13 },
    { noise: 0.05, nf: 1800, dur: 0.025, q: 1.5 },
  ],
  'hinge-open': [{ noise: 0.02, nf: 1400, nf1: 2200, dur: 0.22, q: 3 }],
  'hinge-close': [
    { noise: 0.02, nf: 2000, nf1: 1200, dur: 0.16, q: 3 },
    { f0: 180, f1: 70, dur: 0.1, gain: 0.08, noise: 0.03, nf: 700, q: 0.8, at: 0.14 },
  ],
  place: [
    { f0: 150, f1: 55, dur: 0.22, gain: 0.11 },
    { noise: 0.045, nf: 700, nf1: 250, dur: 0.25, q: 0.6, at: 0.02 },
  ],
  'whoosh-on': [{ noise: 0.07, nf: 300, nf1: 800, dur: 0.15 }],
  'whoosh-off': [{ noise: 0.07, nf: 800, nf1: 300, dur: 0.15 }],
};

let noise: AudioBuffer | null = null;
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

export function playMechanism(ctx: BaseAudioContext, bus: AudioNode, sound: MechanismSound): void {
  for (const h of MECHANISM_HITS[sound]) {
    const t = ctx.currentTime + (h.at ?? 0);
    const dur = h.dur ?? 0.05;
    const envelope = (peak: number): GainNode => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g.connect(bus);
      return g;
    };
    if (h.f0) {
      const osc = ctx.createOscillator();
      osc.type = h.type ?? 'sine';
      osc.frequency.setValueAtTime(h.f0, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, h.f1 ?? h.f0), t + dur);
      osc.connect(envelope(h.gain ?? 0.06));
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }
    if (h.noise) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = h.q ?? 1;
      filter.frequency.setValueAtTime(h.nf ?? 2000, t);
      filter.frequency.exponentialRampToValueAtTime(h.nf1 ?? h.nf ?? 2000, t + dur);
      src.connect(filter).connect(envelope(h.noise));
      src.start(t, Math.random() * 0.7);
      src.stop(t + dur + 0.02);
    }
  }
}
