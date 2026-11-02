import { ModulatedDelay } from '../delay-line';
import { PhonoStage } from '../riaa';
import { ReadHead } from '../scratch';
import {
  DEFAULT_WOW_FLUTTER,
  playbackRateMultiplier,
  validateWowFlutter,
  type WowFlutterParams,
} from '../wowflutter';
import {
  VINYL_PROCESSOR_NAME,
  type DefectData,
  type MotionReply,
  type PositionReply,
  type WorkletMessage,
} from './messages';

declare const sampleRate: number;
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void;

const CHANNELS = 2;
const SCRATCH_SMOOTHING_S = 0.008;
const POSITION_REPORT_BLOCKS = 8;
const DEG_PER_SEC = 200;
const DEG = Math.PI / 180;
const MAX_VOICES = 24;
const BLOCK_FRAMES = 128;

/** One tick or pop: a decaying burst (html-1). */
interface Voice {
  e: number;
  d: number;
  ph: number;
  w: number;
  l: number;
  r: number;
}

class VinylProcessor extends AudioWorkletProcessor {
  private wowFlutter: WowFlutterParams = DEFAULT_WOW_FLUTTER;
  private warm = false;
  private readonly phono = [new PhonoStage(sampleRate), new PhonoStage(sampleRate)];
  private readonly delay = [new ModulatedDelay(), new ModulatedDelay()];
  private readonly smoothing = 1 - Math.exp(-1 / (SCRATCH_SMOOTHING_S * sampleRate));
  private pcm: Float32Array[] = [];
  private head: ReadHead | null = null;
  private scratching = false;
  private scratchRate = 0;
  private scratchTarget = 0;
  private blocks = 0;
  // The record as the audio thread has it.
  private rate = 0;
  private rateTarget = 0;
  private angle = 0;
  private contact = false;
  private radius = 1;
  private phi = 0;
  private defects: DefectData[] = [];
  private pops = 0;
  private surfaceGain = 0;
  private eccentric = 0;
  private readonly voices: Voice[] = [];

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<WorkletMessage>): void => {
      this.handle(event.data);
    };
  }

  private handle(message: WorkletMessage): void {
    switch (message.type) {
      case 'config':
        this.wowFlutter = validateWowFlutter(message.wowFlutter);
        this.warm = message.equalisation === 'warm';
        break;
      case 'pcm': {
        const length = message.channels[0]?.length ?? 0;
        this.pcm = message.channels;
        this.head = length > 0 ? new ReadHead(length) : null;
        break;
      }
      case 'clearPcm':
        this.pcm = [];
        this.head = null;
        this.scratching = false;
        break;
      case 'scratch':
        if (message.active && this.head) {
          this.head.seek(message.position);
          this.scratchRate = message.rate;
          this.scratchTarget = message.rate;
          this.scratching = true;
        } else if (this.scratching) {
          this.scratching = false;
          this.report(true);
        }
        break;
      case 'scratchRate':
        this.scratchTarget = message.rate;
        break;
      case 'motion':
        this.rateTarget = message.rate;
        this.contact = message.contact;
        this.radius = message.radius;
        this.phi = message.phi;
        break;
      case 'angle':
        this.angle = message.angle;
        break;
      case 'surface':
        if (message.defects) this.defects = message.defects;
        if (message.pops !== undefined) this.pops = message.pops;
        if (message.gain !== undefined) this.surfaceGain = message.gain;
        if (message.eccentric !== undefined) this.eccentric = message.eccentric;
        break;
    }
  }

  private report(final: boolean): void {
    const reply: PositionReply = { type: 'position', frames: this.head?.position ?? 0, final };
    this.port.postMessage(reply);
  }

  private hit(amp: number, freq: number, tau: number, pan: number): void {
    if (this.voices.length >= MAX_VOICES) return;
    this.voices.push({
      e: amp,
      d: Math.exp(-1 / (sampleRate * tau)),
      ph: Math.random() * Math.PI * 2,
      w: (Math.PI * 2 * freq) / sampleRate,
      l: Math.cos(pan),
      r: Math.sin(pan) * (Math.random() < 0.3 ? -1 : 1),
    });
  }

  /** Scratches are fixed to the record: each ticks when its angle passes under the stylus. */
  private tickDefects(from: number, to: number): void {
    for (const d of this.defects) {
      if (this.radius > d.r0 || this.radius < d.r1) continue;
      const at = this.phi - (d.a + d.s * (this.radius - d.m));
      if (Math.floor((from - at) / 360) === Math.floor((to - at) / 360)) continue;
      this.hit(d.amp, d.f, d.tau, d.pan);
      if (d.low) this.hit(d.amp * 0.5, d.low, 0.01, 0.785);
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    // Input 0 carries music; input 1 carries sounds made at the stylus.
    const input = inputs[0] ?? [];
    const stylus = inputs[1] ?? [];
    const output = outputs[0];
    const frames = output?.[0]?.length ?? 0;
    if (!output) return true;
    const head = this.scratching ? this.head : null;
    const dps = DEG_PER_SEC / sampleRate;
    const startAngle = this.angle;
    const seated = this.contact;
    // An off-centre hole: once per turn, at the record's own angle.
    const wobble = 1 + this.eccentric * Math.sin(this.angle * DEG);
    const speed = Math.min(1.6, Math.abs(this.rate));
    const popChance = seated ? (this.pops * speed) / sampleRate : 0;
    let eff = 0;
    for (let i = 0; i < frames; i++) {
      const rate = playbackRateMultiplier(currentTime + i / sampleRate, this.wowFlutter) * wobble;
      this.rate += (this.rateTarget - this.rate) * this.smoothing;
      eff = this.rate * rate;
      this.angle += eff * dps;
      if (popChance > 0 && Math.random() < popChance) {
        const pan = 0.45 + Math.random() * 0.67;
        const amp = 0.3 + Math.random() * 0.35;
        this.hit(amp, 500 + Math.random() * 1500, 0.0007, pan);
        this.hit(amp * 0.6, 55 + Math.random() * 40, 0.012, 0.785);
      }
      let vl = 0;
      let vr = 0;
      for (let v = this.voices.length - 1; v >= 0; v--) {
        const o = this.voices[v]!;
        const sample = o.e * Math.sin(o.ph);
        vl += sample * o.l;
        vr += sample * o.r;
        o.ph += o.w;
        o.e *= o.d;
        if (o.e < 0.0002) this.voices.splice(v, 1);
      }
      for (let channel = 0; channel < CHANNELS; channel++) {
        const source = input[channel] ?? input[0];
        let sample = source ? source[i]! : 0;
        const pcm = this.pcm[channel] ?? this.pcm[0];
        if (head && pcm) sample += head.read(pcm);
        const stylusSource = stylus[channel] ?? stylus[0];
        const stylusSample = stylusSource ? stylusSource[i]! : 0;
        const equalised = this.phono[channel]!.process(sample, stylusSample, this.warm);
        const out = this.delay[channel]!.process(equalised, rate);
        const target = output[channel];
        // Ticks and pops are the surface's, not the cut's: past the phono stage, like the noise.
        if (target) target[i] = out + (channel === 0 ? vl : vr) * this.surfaceGain;
      }
      if (head) {
        this.scratchRate += (this.scratchTarget - this.scratchRate) * this.smoothing;
        head.advance(this.scratchRate);
      }
    }
    if (seated && this.defects.length && this.angle !== startAngle) {
      this.tickDefects(startAngle, this.angle);
    }
    if (++this.blocks % POSITION_REPORT_BLOCKS === 0) {
      if (head) this.report(false);
      const motion: MotionReply = {
        type: 'motion',
        angle: this.angle,
        rate: eff,
        time: currentTime,
      };
      this.port.postMessage(motion);
    }
    return true;
  }
}

/** Test tap, only connected with `?debug`: keeps the last seconds of output for a script (html-1). */
class TapProcessor extends AudioWorkletProcessor {
  private readonly buffer = new Float32Array(sampleRate * 12);
  private write = 0;
  private filled = false;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<{ seconds: number }>): void => {
      const { buffer, write } = this;
      const n = Math.min(
        Math.round(event.data.seconds * sampleRate),
        this.filled ? buffer.length : write,
      );
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++)
        samples[i] = buffer[(write - n + i + buffer.length) % buffer.length]!;
      this.port.postMessage({ samples, sr: sampleRate }, [samples.buffer]);
    };
  }

  process(inputs: Float32Array[][]): boolean {
    // A silent input arrives with no channels at all: that is silence to record, not nothing.
    const a = inputs[0]?.[0];
    const b = inputs[0]?.[1] ?? a;
    for (let i = 0; i < BLOCK_FRAMES; i++) {
      this.buffer[this.write] = a && b ? (a[i]! + b[i]!) * 0.5 : 0;
      if (++this.write >= this.buffer.length) {
        this.write = 0;
        this.filled = true;
      }
    }
    return true;
  }
}

registerProcessor(VINYL_PROCESSOR_NAME, VinylProcessor);
registerProcessor('tap', TapProcessor);
