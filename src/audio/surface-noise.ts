import { DEFAULT_WEAR, renderSurfaceNoise } from './noise';

const LOOP_SECONDS = 11;
const FADE_TAU_S = 0.08;
/** Below this record speed (units of its cut speed) the noise fades out. */
const FADE_BELOW = 0.3;
const MAX_RATE = 1.6;
/** Lead-in crackle is at least this loud (html-1). */
const LEAD_IN_FLOOR = 0.09;
const GRIT_HZ = 3200;
const GRIT_Q = 0.8;
const GRIT = 2.6;
const RUMBLE_HZ = 28;
const RUMBLE = 0.05;

/**
 * Hiss and clicks as a looping, pre-rendered buffer. It connects after the vinyl
 * worklet, so the RIAA bass boost does not turn the noise into rumble.
 */
export class SurfaceNoise {
  private readonly ctx: AudioContext;
  private readonly gain: GainNode;
  private readonly filter: BiquadFilterNode;
  private source: AudioBufferSourceNode | null = null;
  private level = 0;
  private active = false;
  private speed = 0;
  private moving = 0;
  private leadIn = false;
  /** Shellac's gritty band at 78, and the motor's rumble reaching the stylus (html-1). */
  private readonly gritGain: GainNode;
  private readonly rumbleGain: GainNode;
  private shellac = false;
  private motor = false;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'highpass';
    this.filter.frequency.value = 700;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.filter.connect(this.gain).connect(destination);
    this.gritGain = ctx.createGain();
    this.gritGain.gain.value = 0;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    const white = ctx.createBuffer(1, 2 * ctx.sampleRate, ctx.sampleRate);
    const data = white.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const layer = (type: BiquadFilterType, hz: number, q: number, gain: GainNode): void => {
      const source = ctx.createBufferSource();
      source.buffer = white;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = hz;
      filter.Q.value = q;
      source.connect(filter).connect(gain).connect(destination);
      source.start();
    };
    layer('bandpass', GRIT_HZ, GRIT_Q, this.gritGain);
    layer('lowpass', RUMBLE_HZ, 0.7, this.rumbleGain);
    this.setWear(DEFAULT_WEAR);
  }

  /** Output gain while the needle is down, from the mix plan. */
  setGain(gain: number): void {
    this.level = gain;
    this.applyGain();
  }

  /** Re-renders the loop with a new click density. */
  setWear(wear: number): void {
    const { ctx } = this;
    const frames = Math.floor(LOOP_SECONDS * ctx.sampleRate);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    buffer.getChannelData(0).set(renderSurfaceNoise(frames, ctx.sampleRate, wear, Math.random));
    this.source?.stop();
    this.source?.disconnect();
    this.source = ctx.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.source.playbackRate.value = this.rateFor(this.speed);
    this.source.connect(this.filter);
    this.source.start();
  }

  /** The noise is only heard while the needle is in a turning groove. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.applyGain();
  }

  /**
   * The record under the stylus: noise is what a moving groove makes, so its pitch follows the
   * record's speed (a hand's too) and it fades out as the record stops. `leadIn` is the denser
   * crackle of the lead-in groove; `shellac` adds grit at 78; `motor` adds rumble.
   */
  setRecord(speed: number, state: { leadIn: boolean; shellac: boolean; motor: boolean }): void {
    this.speed = Math.abs(speed);
    if (this.source) this.source.playbackRate.value = this.rateFor(this.speed);
    const changed =
      state.leadIn !== this.leadIn || state.shellac !== this.shellac || state.motor !== this.motor;
    this.leadIn = state.leadIn;
    this.shellac = state.shellac;
    this.motor = state.motor;
    const moving = Math.min(1, this.speed / FADE_BELOW);
    if (changed || Math.abs(moving - this.moving) > 0.02) {
      this.moving = moving;
      this.applyGain();
    }
  }

  private rateFor(speed: number): number {
    return Math.max(0.01, Math.min(MAX_RATE, speed));
  }

  private applyGain(): void {
    const seated = this.active ? this.moving : 0;
    const now = this.ctx.currentTime;
    const floor = this.leadIn ? Math.max(this.level, LEAD_IN_FLOOR) : this.level;
    this.gain.gain.setTargetAtTime(seated * floor, now, FADE_TAU_S);
    this.gritGain.gain.setTargetAtTime(
      this.shellac ? seated * this.level * GRIT : 0,
      now,
      FADE_TAU_S,
    );
    this.rumbleGain.gain.setTargetAtTime(this.motor ? seated * RUMBLE : 0, now, FADE_TAU_S);
  }
}
