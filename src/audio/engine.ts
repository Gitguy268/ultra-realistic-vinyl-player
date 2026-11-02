import { Emitter } from './emitter';
import { TONE_BANDS, clampTone, type Equalisation, type ToneSettings } from './mix';
import { EQ_BANDS, bandType } from './winamp-eq';
import {
  DECODE_MAX_SECONDS,
  choosePlaybackMode,
  shouldPredecode,
  type PlaybackMode,
} from './playback-mode';
import { PositionTracker } from './position';
import { DEFAULT_WOW_FLUTTER, validateWowFlutter, type WowFlutterParams } from './wowflutter';
import {
  VINYL_PROCESSOR_NAME,
  type DefectData,
  type MotionReply,
  type PositionReply,
  type SurfaceMessage,
  type WorkletMessage,
  type WorkletReply,
} from './worklets/messages';
import { BASS_MONO_HZ, saturate, sideGain } from './cut';
import { levelSlices } from './levels';
import { loadWorklet } from './load-worklet';
import workletUrl from './worklets/vinyl.worklet.ts?worker&url';

export type EngineState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused';

export interface EngineEvents {
  state: EngineState;
  notice: string;
  end: undefined;
}

// HTMLMediaElement.playbackRate throws outside the range browsers support.
const MIN_ELEMENT_RATE = 0.0625;
const MAX_ELEMENT_RATE = 16;
const STREAM_END_GUARD_S = 0.25;
// Safari stalls a Web Audio-routed element for over a second on every playbackRate
// change, so the stream follows the settled speed, in steps too small to hear.
const STREAM_RATE_STEP = 0.003;
const DEG_PER_SEC = 200;
const SHAPER_POINTS = 1024;
/** The chain's filter and drive move this slowly: they follow the stylus, not the music. */
const CUT_TAU_S = 0.3;
const SWITCH_TAU_S = 0.02;
const MUTE_TAU_S = 0.004;

export interface Graph {
  ctx: AudioContext;
  worklet: AudioWorkletNode;
  /** Input for sounds made at the stylus, which are always shaped by the RIAA curve. */
  stylus: GainNode;
  /** Level ahead of the tone controls, from the mix plan. */
  trim: GainNode;
  tone: Record<keyof ToneSettings, BiquadFilterNode>;
  /** The Winamp graphic equaliser's ten bands, after the tone controls. */
  graphicEq: BiquadFilterNode[];
  /** Muted while a hand scrubs with Scratch off (html-1). */
  scrub: GainNode;
  /** The cut-record chain after the EQ, and its bypass for a truly flat signal (C21). */
  cut: {
    rolloff: BiquadFilterNode;
    driveIn: GainNode;
    driveOut: GainNode;
    wet: GainNode;
    dry: GainNode;
  };
  gain: GainNode;
  /** The meters' copy of the volume: they read ahead of the chain's saturation. */
  meterGain: GainNode;
  /** Mechanism sounds: they follow the volume and skip the EQ. */
  mechanism: GainNode;
  /** Everything that is heard leaves through here, to the speakers or the background sink. */
  output: GainNode;
  analyser: AnalyserNode;
  /** Left and right taps for the level meters. */
  meters: [AnalyserNode, AnalyserNode];
}

export class AudioEngine {
  readonly events = new Emitter<EngineEvents>();
  private graph: Graph | null = null;
  private initPromise: Promise<Graph> | null = null;
  private readonly tracker = new PositionTracker();
  private stateValue: EngineState = 'idle';
  private modeValue: PlaybackMode = 'decode';
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private element: HTMLAudioElement | null = null;
  private elementSource: MediaElementAudioSourceNode | null = null;
  private objectUrl: string | null = null;
  private rate = 1;
  private streamRate = 1;
  private volume = 0.8;
  private wowFlutter: WowFlutterParams = DEFAULT_WOW_FLUTTER;
  private equalisation: Equalisation = 'flat';
  private musicGain = 1;
  private toneSettings: ToneSettings = { bass: 0, mid: 0, treble: 0 };
  private eqGains: number[] = EQ_BANDS.map(() => 0);
  private loadToken = 0;
  private scratching = false;
  private scratchEnding = false;
  private scratchTime = 0;
  private pcmSent = false;
  private resumeAfterScratch = false;
  private motion: MotionReply | null = null;
  private levelsValue: Uint8Array | null = null;
  /** The next track, decoded ahead so the stylus crosses the gap without waiting. */
  private ahead: { file: Blob; buffer: Promise<AudioBuffer> } | null = null;
  private cutOn = true;
  private background = false;
  private sinkNode: MediaStreamAudioDestinationNode | null = null;
  private sink: HTMLAudioElement | null = null;
  private routed: 'speakers' | 'sink' | null = null;
  private routedTo: AudioNode | null = null;

  get state(): EngineState {
    return this.stateValue;
  }

  get playing(): boolean {
    return this.stateValue === 'playing';
  }

  get mode(): PlaybackMode {
    return this.modeValue;
  }

  get context(): AudioContext | null {
    return this.graph?.ctx ?? null;
  }

  /** Stylus input of the vinyl worklet: sounds sent here get RIAA and wow/flutter. */
  get sfxBus(): AudioNode | null {
    return this.graph?.stylus ?? null;
  }

  /** The master gain: sounds connected here skip the worklet but follow the volume. */
  get masterInput(): AudioNode | null {
    return this.graph?.gain ?? null;
  }

  /** Everything that is heard passes here: the debug tap listens to it. */
  get outputNode(): AudioNode | null {
    return this.graph?.output ?? null;
  }

  /** Mechanism sounds connect here: they follow the volume but skip the EQ and the cut. */
  get mechanismBus(): AudioNode | null {
    return this.graph?.mechanism ?? null;
  }

  /** Loudness slices of the decoded track, for shading its grooves. Null for a stream. */
  get levels(): Uint8Array | null {
    return this.levelsValue;
  }

  /** The record's angle as heard: the worklet's, less the time the sound takes to reach the ear. */
  heardAngle(): number | null {
    const m = this.motion;
    const ctx = this.graph?.ctx;
    if (!m || !ctx || ctx.state !== 'running') return null;
    const latency = ctx.outputLatency || ctx.baseLatency || 0;
    return m.angle + m.rate * DEG_PER_SEC * (ctx.currentTime - latency - m.time);
  }

  /** The record under the stylus, every tick. Speed in units of 33⅓ rpm. */
  setMotion(rate: number, contact: boolean, radius: number, phi: number): void {
    this.post({ type: 'motion', rate, contact, radius, phi });
  }

  /** The record was placed or a hand let it go: the worklet takes its angle from here. */
  setRecordAngle(angle: number): void {
    this.motion = null;
    this.post({ type: 'angle', angle });
  }

  setSurface(surface: {
    defects?: DefectData[];
    pops?: number;
    gain?: number;
    eccentric?: number;
  }): void {
    const message: SurfaceMessage = { type: 'surface', ...surface };
    this.post(message);
  }

  /** Mutes the music while a hand scrubs with Scratch off. */
  setMusicAudible(audible: boolean): void {
    const graph = this.graph;
    if (graph) graph.scrub.gain.setTargetAtTime(audible ? 1 : 0, graph.ctx.currentTime, MUTE_TAU_S);
  }

  /** The cut chain's roll-off and drive; they glide as the stylus moves in (cut.ts). */
  setCut(rolloffHz: number, drive: number): void {
    const graph = this.graph;
    if (!graph) return;
    const now = graph.ctx.currentTime;
    graph.cut.rolloff.frequency.setTargetAtTime(rolloffHz, now, CUT_TAU_S);
    graph.cut.driveIn.gain.setTargetAtTime(0.5 * drive, now, CUT_TAU_S);
    graph.cut.driveOut.gain.setTargetAtTime(1 / drive, now, CUT_TAU_S);
  }

  /** "Record character": off bypasses the cut chain for a truly flat signal (C21). */
  setRecordCharacter(on: boolean): void {
    this.cutOn = on;
    const graph = this.graph;
    if (!graph) return;
    const now = graph.ctx.currentTime;
    graph.cut.wet.gain.setTargetAtTime(on ? 1 : 0, now, SWITCH_TAU_S);
    graph.cut.dry.gain.setTargetAtTime(on ? 0 : 1, now, SWITCH_TAU_S);
  }

  /** "Keep playing with the screen locked": sound goes through an audio element, which a phone keeps alive. */
  setBackground(on: boolean): void {
    this.background = on;
    this.route();
  }

  /** Runs inside a gesture too: a refused or interrupted sink gets another try (html-1). */
  retryRoute(): void {
    if (this.background && this.sink?.paused) this.route();
  }

  private route(): void {
    const graph = this.graph;
    if (!graph) return;
    const { ctx, output } = graph;
    const to = (node: AudioNode, name: 'speakers' | 'sink'): void => {
      // Only ever this one link: re-connecting on every settings change would be heard as a click.
      if (this.routedTo === node) return;
      if (this.routedTo) output.disconnect(this.routedTo);
      output.connect(node);
      this.routedTo = node;
      this.routed = name;
    };
    if (!this.background || !ctx.createMediaStreamDestination) {
      to(ctx.destination, 'speakers');
      this.sink?.pause();
      return;
    }
    if (!this.sink || !this.sinkNode) {
      this.sinkNode = ctx.createMediaStreamDestination();
      this.sink = new Audio();
      this.sink.srcObject = this.sinkNode.stream;
    }
    to(this.sinkNode, 'sink');
    // If the element is refused, nobody would hear the sink: back to the speakers until the next gesture.
    this.sink.play().catch(() => {
      if (this.routed === 'sink') to(ctx.destination, 'speakers');
    });
  }

  /** Where the sound is going, for tests. */
  get currentRoute(): 'speakers' | 'sink' | null {
    return this.routed;
  }

  /** Copies the mix's byte spectrum into `target`. Returns false before init. */
  readSpectrum(target: Uint8Array<ArrayBuffer>): boolean {
    if (!this.graph) return false;
    this.graph.analyser.getByteFrequencyData(target);
    return true;
  }

  /** Copies the latest left or right waveform block into `target`. Returns false before init. */
  readMeter(channel: 0 | 1, target: Float32Array<ArrayBuffer>): boolean {
    const meter = this.graph?.meters[channel];
    if (!meter) return false;
    meter.getFloatTimeDomainData(target);
    return true;
  }

  get duration(): number {
    if (this.buffer) return this.buffer.duration;
    const duration = this.element?.duration;
    return duration !== undefined && Number.isFinite(duration) ? duration : 0;
  }

  get currentTime(): number {
    if (this.element) return this.element.currentTime;
    if (!this.graph) return 0;
    if (this.scratching) return this.scratchTime;
    return Math.min(this.tracker.timeAt(this.graph.ctx.currentTime), this.duration);
  }

  /** Creates the AudioContext and loads the worklet. Safe to call repeatedly. */
  init(): Promise<Graph> {
    this.initPromise ??= this.createGraph();
    return this.initPromise;
  }

  private async createGraph(): Promise<Graph> {
    const ctx = new AudioContext();
    await loadWorklet(ctx, workletUrl);
    const worklet = new AudioWorkletNode(ctx, VINYL_PROCESSOR_NAME, {
      numberOfInputs: 2,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    const stylus = ctx.createGain();
    stylus.connect(worklet, 0, 1);
    const trim = ctx.createGain();
    const band = (key: keyof ToneSettings): BiquadFilterNode => {
      const filter = ctx.createBiquadFilter();
      filter.type = TONE_BANDS[key].type;
      filter.frequency.value = TONE_BANDS[key].frequency;
      filter.Q.value = TONE_BANDS[key].q;
      return filter;
    };
    const tone = { bass: band('bass'), mid: band('mid'), treble: band('treble') };
    const graphicEq = EQ_BANDS.map((frequency, i) => {
      const filter = ctx.createBiquadFilter();
      filter.type = bandType(i);
      filter.frequency.value = frequency;
      return filter;
    });
    const scrub = ctx.createGain();
    let eqOut: AudioNode = worklet
      .connect(scrub)
      .connect(trim)
      .connect(tone.bass)
      .connect(tone.mid)
      .connect(tone.treble);
    for (const filter of graphicEq) eqOut = eqOut.connect(filter);
    eqOut.channelCount = 2;
    eqOut.channelCountMode = 'explicit';
    const cut = this.createCutChain(ctx, eqOut);
    cut.wet.connect(gain);
    cut.dry.connect(gain);
    const output = ctx.createGain();
    const mechanism = ctx.createGain();
    mechanism.gain.value = this.volume;
    mechanism.connect(output);
    gain.connect(analyser).connect(output);
    const meterGain = ctx.createGain();
    meterGain.gain.value = this.volume;
    eqOut.connect(meterGain);
    const splitter = ctx.createChannelSplitter(2);
    meterGain.connect(splitter);
    const meters: [AnalyserNode, AnalyserNode] = [ctx.createAnalyser(), ctx.createAnalyser()];
    meters.forEach((meter, channel) => {
      meter.fftSize = 1024;
      splitter.connect(meter, channel);
    });
    worklet.port.onmessage = (event: MessageEvent<WorkletReply>): void => {
      if (event.data.type === 'motion') this.motion = event.data;
      else this.onPosition(event.data);
    };
    this.graph = {
      ctx,
      worklet,
      stylus,
      trim,
      tone,
      graphicEq,
      scrub,
      cut,
      gain,
      meterGain,
      mechanism,
      output,
      analyser,
      meters,
    };
    this.route();
    this.sendConfig();
    this.applyMix();
    return this.graph;
  }

  /** Mono bass, crosstalk, roll-off and soft saturation (html-1's buildVinylChain). */
  private createCutChain(ctx: AudioContext, input: AudioNode): Graph['cut'] {
    const gainOf = (value: number): GainNode => {
      const node = ctx.createGain();
      node.gain.value = value;
      return node;
    };
    const split = ctx.createChannelSplitter(2);
    const merge = ctx.createChannelMerger(2);
    const mid = gainOf(1);
    const midL = gainOf(0.5);
    const midR = gainOf(0.5);
    const sideL = gainOf(0.5);
    const sideR = gainOf(-0.5);
    const sideHigh = ctx.createBiquadFilter();
    sideHigh.type = 'highpass';
    sideHigh.frequency.value = BASS_MONO_HZ;
    sideHigh.Q.value = Math.SQRT1_2;
    const side = gainOf(sideGain());
    const flip = gainOf(-1);
    input.connect(split);
    split.connect(midL, 0).connect(mid);
    split.connect(midR, 1).connect(mid);
    split.connect(sideL, 0).connect(sideHigh);
    split.connect(sideR, 1).connect(sideHigh);
    sideHigh.connect(side);
    mid.connect(merge, 0, 0);
    mid.connect(merge, 0, 1);
    side.connect(merge, 0, 0);
    side.connect(flip).connect(merge, 0, 1);
    const rolloff = ctx.createBiquadFilter();
    rolloff.type = 'lowpass';
    rolloff.frequency.value = 16000;
    rolloff.Q.value = Math.SQRT1_2;
    const driveIn = gainOf(0.5);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(SHAPER_POINTS);
    for (let i = 0; i < SHAPER_POINTS; i++) {
      // The curve spans ±1 for an input of ±2, which is why driveIn halves the signal.
      curve[i] = saturate((2 * (2 * i)) / (SHAPER_POINTS - 1) - 2);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const driveOut = gainOf(1);
    const wet = gainOf(this.cutOn ? 1 : 0);
    const dry = gainOf(this.cutOn ? 0 : 1);
    merge.connect(rolloff).connect(driveIn).connect(shaper).connect(driveOut).connect(wet);
    input.connect(dry);
    return { rolloff, driveIn, driveOut, wet, dry };
  }

  async load(file: Blob, durationSec = 0): Promise<void> {
    const token = ++this.loadToken;
    this.unload();
    this.setState('loading');
    try {
      const graph = await this.init();
      this.modeValue = choosePlaybackMode(file.size, undefined, durationSec);
      if (this.modeValue === 'decode') {
        const ready = this.ahead?.file === file ? this.ahead.buffer : null;
        this.ahead = null;
        const decoded = await (ready ??
          file.arrayBuffer().then((b) => graph.ctx.decodeAudioData(b)));
        if (token !== this.loadToken) return;
        this.buffer = decoded;
        const channels: Float32Array[] = [];
        for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
        this.levelsValue = levelSlices(channels);
      } else {
        await this.loadStream(file, graph);
        if (token !== this.loadToken) return;
        this.events.emit(
          'notice',
          'Large file: playing in streaming mode. Scratching is disabled for this track.',
        );
      }
      this.setState('ready');
    } catch (error) {
      if (token !== this.loadToken) return;
      this.unload();
      this.setState('idle');
      throw error;
    }
  }

  /**
   * Decodes the track after this one ahead of time and returns its loudness slices. Only one is
   * held; a later call replaces it. Long tracks are left alone: they would cost too much memory.
   */
  async predecode(file: Blob, durationSec: number): Promise<Uint8Array | null> {
    const graph = this.graph;
    if (!graph || this.ahead?.file === file || !shouldPredecode(file.size, durationSec))
      return null;
    const buffer = file.arrayBuffer().then((b) => graph.ctx.decodeAudioData(b));
    this.ahead = { file, buffer };
    try {
      const decoded = await buffer;
      if (decoded.duration > DECODE_MAX_SECONDS) {
        if (this.ahead?.file === file) this.ahead = null;
        return null;
      }
      const channels: Float32Array[] = [];
      for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
      return levelSlices(channels);
    } catch {
      if (this.ahead?.file === file) this.ahead = null;
      return null;
    }
  }

  private loadStream(file: Blob, graph: Graph): Promise<void> {
    const element = new Audio();
    this.objectUrl = URL.createObjectURL(file);
    element.preservesPitch = false;
    element.src = this.objectUrl;
    this.element = element;
    this.elementSource = graph.ctx.createMediaElementSource(element);
    this.elementSource.connect(graph.worklet);
    element.addEventListener('ended', () => {
      if (this.element !== element) return;
      this.setState('paused');
      this.events.emit('end', undefined);
    });
    element.addEventListener('error', () => {
      // A decode error after loading: stop cleanly instead of leaving the needle down.
      if (this.element !== element || this.stateValue !== 'playing') return;
      this.setState('paused');
      this.events.emit('notice', 'Playback stopped: the rest of this file could not be decoded.');
      this.events.emit('end', undefined);
    });
    return new Promise((resolve, reject) => {
      element.addEventListener('loadedmetadata', () => resolve(), { once: true });
      element.addEventListener('error', () => reject(new Error('This file could not be played.')), {
        once: true,
      });
    });
  }

  async play(): Promise<void> {
    const graph = this.graph;
    if (!graph || this.stateValue === 'playing') return;
    if (!this.buffer && !this.element) return;
    if (this.scratching) {
      this.resumeAfterScratch = true;
      this.setState('playing');
      return;
    }
    await graph.ctx.resume();
    if (this.element) {
      this.applyElementRate();
      await this.element.play();
    } else {
      this.startSource(graph);
    }
    this.setState('playing');
  }

  pause(): void {
    if (this.stateValue !== 'playing' || !this.graph) return;
    if (this.scratching) {
      this.resumeAfterScratch = false;
      this.endScratch();
    } else if (this.element) {
      this.element.pause();
    } else {
      this.tracker.pause(this.graph.ctx.currentTime);
      this.stopSource();
    }
    this.setState('paused');
  }

  seek(seconds: number): void {
    const target = Math.max(0, Math.min(Number.isFinite(seconds) ? seconds : 0, this.duration));
    if (this.element) {
      // Seeking a media element exactly to its end is unreliable: Firefox reports a decode
      // error and others restart from zero. Land just before it and let it run out.
      this.element.currentTime = Math.min(target, Math.max(0, this.duration - STREAM_END_GUARD_S));
      return;
    }
    if (!this.graph || this.scratching) return;
    this.tracker.seek(target, this.graph.ctx.currentTime);
    if (this.stateValue === 'playing') {
      this.stopSource();
      this.startSource(this.graph);
    }
  }

  /** Instantaneous platter speed, for decoded playback. Streams use `setStreamRate`. */
  setRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) throw new RangeError('rate must be positive');
    this.rate = rate;
    if (this.element || !this.graph) return;
    this.tracker.setRate(rate, this.graph.ctx.currentTime);
    if (this.source) this.source.playbackRate.value = rate;
  }

  /**
   * Speed for streaming playback: the speed the motor is heading for, not the
   * speed it has right now, so a stream does not glide while the platter spins up.
   */
  setStreamRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) throw new RangeError('rate must be positive');
    this.streamRate = Math.max(MIN_ELEMENT_RATE, Math.min(MAX_ELEMENT_RATE, rate));
    this.applyElementRate();
  }

  /**
   * Switches to hand-driven playback. AudioBufferSourceNode cannot run backward,
   * so the worklet reads the PCM itself with a signed rate. The channel data is
   * copied to the audio thread once per track, which costs one extra copy of the
   * decoded audio in memory (about 21 MB per stereo minute at 44.1 kHz).
   */
  beginScratch(): boolean {
    const graph = this.graph;
    if (!graph || !this.buffer) return false;
    if (this.scratching) {
      this.scratchEnding = false;
      return true;
    }
    const time = this.currentTime;
    this.resumeAfterScratch = this.stateValue === 'playing';
    this.tracker.pause(graph.ctx.currentTime);
    this.stopSource();
    if (!this.pcmSent) {
      const channels: Float32Array[] = [];
      for (let c = 0; c < this.buffer.numberOfChannels; c++) {
        channels.push(this.buffer.getChannelData(c).slice());
      }
      this.post(
        { type: 'pcm', channels },
        channels.map((channel) => channel.buffer),
      );
      this.pcmSent = true;
    }
    this.scratchTime = time;
    this.scratching = true;
    this.scratchEnding = false;
    this.post({
      type: 'scratch',
      active: true,
      position: time * this.buffer.sampleRate,
      rate: this.rate,
    });
    return true;
  }

  /** Signed playback rate while scratching; negative plays backward. */
  setScratchRate(rate: number): void {
    if (this.scratching && Number.isFinite(rate)) this.post({ type: 'scratchRate', rate });
  }

  /** Hands playback back to the buffer source once the worklet reports where it stopped. */
  endScratch(): void {
    if (!this.scratching || this.scratchEnding) return;
    this.scratchEnding = true;
    this.post({ type: 'scratch', active: false, position: 0, rate: 0 });
  }

  private onPosition(reply: PositionReply): void {
    if (!this.scratching || !this.buffer || !this.graph) return;
    this.scratchTime = reply.frames / this.buffer.sampleRate;
    if (!reply.final || !this.scratchEnding) return;
    this.scratching = false;
    this.scratchEnding = false;
    this.tracker.seek(this.scratchTime, this.graph.ctx.currentTime);
    if (this.resumeAfterScratch && this.stateValue === 'playing') this.startSource(this.graph);
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
    if (!this.graph) return;
    this.graph.gain.gain.value = this.volume;
    this.graph.meterGain.gain.value = this.volume;
    this.graph.mechanism.gain.value = this.volume;
  }

  setWowFlutter(params: WowFlutterParams): void {
    this.wowFlutter = validateWowFlutter(params);
    this.sendConfig();
  }

  /** Chooses whether music bypasses the RIAA curve (`flat`) or goes through it (`warm`). */
  setEqualisation(equalisation: Equalisation): void {
    this.equalisation = equalisation;
    this.sendConfig();
  }

  /** Sets the tone controls, the graphic EQ band gains in dB and the level ahead of them. */
  setMix(musicGain: number, tone: ToneSettings, eqGains: number[]): void {
    this.musicGain = musicGain;
    this.toneSettings = { ...tone };
    this.eqGains = [...eqGains];
    this.applyMix();
  }

  private applyMix(): void {
    const graph = this.graph;
    if (!graph) return;
    graph.trim.gain.value = this.musicGain;
    for (const key of ['bass', 'mid', 'treble'] as const) {
      graph.tone[key].gain.value = clampTone(this.toneSettings[key]);
    }
    graph.graphicEq.forEach((filter, i) => {
      filter.gain.value = this.eqGains[i] ?? 0;
    });
  }

  destroy(): void {
    this.loadToken++;
    this.unload();
    this.events.clear();
    void this.graph?.ctx.close();
    this.graph = null;
    this.initPromise = null;
    this.stateValue = 'idle';
  }

  /** AudioBufferSourceNode is single-use: every start builds a new one at the tracked offset. */
  private startSource(graph: Graph): void {
    if (!this.buffer) return;
    const source = graph.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.rate;
    source.connect(graph.worklet);
    source.onended = (): void => {
      // A stopped node fires onended too; only the live node means the track ran out.
      if (this.source !== source) return;
      this.source = null;
      this.tracker.pause(graph.ctx.currentTime);
      this.tracker.seek(this.duration, graph.ctx.currentTime);
      this.setState('paused');
      this.events.emit('end', undefined);
    };
    const now = graph.ctx.currentTime;
    const offset = Math.min(this.tracker.timeAt(now), this.buffer.duration);
    this.tracker.setRate(this.rate, now);
    this.tracker.seek(offset, now);
    this.tracker.play(now);
    this.source = source;
    source.start(0, offset);
  }

  private stopSource(): void {
    const source = this.source;
    if (!source) return;
    this.source = null;
    source.stop();
    source.disconnect();
  }

  private applyElementRate(): void {
    const element = this.element;
    if (!element || Math.abs(element.playbackRate - this.streamRate) < STREAM_RATE_STEP) return;
    element.playbackRate = this.streamRate;
  }

  private unload(): void {
    this.stopSource();
    if (this.pcmSent) this.post({ type: 'clearPcm' });
    this.pcmSent = false;
    this.scratching = false;
    this.scratchEnding = false;
    if (this.graph) this.tracker.pause(this.graph.ctx.currentTime);
    this.tracker.seek(0, 0);
    this.buffer = null;
    this.levelsValue = null;
    if (this.element) {
      this.element.pause();
      this.element.removeAttribute('src');
      this.element.load();
      this.element = null;
    }
    this.elementSource?.disconnect();
    this.elementSource = null;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }

  private sendConfig(): void {
    this.post({ type: 'config', wowFlutter: this.wowFlutter, equalisation: this.equalisation });
  }

  private post(message: WorkletMessage, transfer: Transferable[] = []): void {
    this.graph?.worklet.port.postMessage(message, transfer);
  }

  private setState(state: EngineState): void {
    if (state === this.stateValue) return;
    this.stateValue = state;
    this.events.emit('state', state);
  }
}
