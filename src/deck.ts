import { Emitter } from './audio/emitter';
import { AudioEngine } from './audio/engine';
import { mixPlan, type Equalisation, type MixSettings, type ToneSettings } from './audio/mix';
import { DEFAULT_NOISE_LEVEL, DEFAULT_WEAR } from './audio/noise';
import { cutTone } from './audio/cut';
import { playMechanism, type MechanismSound } from './audio/mechanism';
import { playLeverClack, playNeedleThunk } from './audio/sfx';
import { SurfaceNoise } from './audio/surface-noise';
import { FLAT_EQ, activeGains, type GraphicEq } from './audio/winamp-eq';
import { Arm } from './core/arm';
import { Groove, type DropPoint } from './core/groove';
import { Plates, type PlateEvent, type SpeedDetent } from './core/plates';
import { Program, recordGeometry, sizeFor, type RecordSize } from './core/program';
import {
  DEG_PER_SEC,
  RPM_UNITS,
  SEC_PER_DEG,
  SEC_PER_REV,
  Spin,
  type MotorState,
} from './core/spin';
import { REST_DIRECTION, directionFor, radiusFor, stylusPhi } from './core/tonearm3d';
import { CONDITIONS, buildWear, type Condition, type Defect, type Mark } from './core/wear';
import { DECK_SPEC } from './spec/deck';
import { Motor, SPEED_PRESETS, type SpeedPreset } from './turntable/motor';
import { strobeDotCount, type MainsHz } from './turntable/strobe';
import { GlowEnvelope, bassLevel } from './ui/glow';
import { angleForTrackPosition, createGeometry } from './turntable/tonearm';
import type { PlatterSnapshot } from './ui/platter';

/** The 2D fallback deck's own unit geometry. */
const FALLBACK_GEOMETRY = createGeometry(1);

export interface DeckEvents {
  /** Text for the visible status line. */
  status: string;
  /** Text for the polite screen-reader live region. */
  announce: string;
  /** The end stop fired and the arm is back on its rest. */
  returned: undefined;
  /** A mechanism moved: plate detent, interlock, cue, arm lift or lower, needle drop, thump. */
  mechanism: MechanismSound | 'cue' | 'drop';
}

/** What the deck needs from the queue: the record's tracks, in order, and track changes. */
export interface DeckQueue {
  /** Ids of every queued track in list order: they seed each side's wear. */
  ids(): string[];
  /** Measured loudness slices of a list index, if it was decoded before. */
  levels(index: number): Uint8Array | undefined;
  /** The audio file of a list index, to decode it ahead. */
  fileAt(index: number): Blob | undefined;
  /** Keeps a track's loudness slices, so its grooves are shaded the same next time. */
  saveLevels(index: number, levels: Uint8Array): void;
  /** Durations of every queued track in list order (seconds, 0 when unknown). */
  durations(): (number | undefined)[];
  /** List index of the track on the platter, or −1. */
  currentIndex(): number;
  /** Puts the track at a list index on the platter. `play` keeps the needle's intent. */
  selectIndex(index: number, play: boolean): void;
  /** The queue's next track as a list index (−1 for none). Advances shuffle and repeat. */
  nextIndex(): number;
}

export const SPEED_LABELS: Record<SpeedPreset, string> = { lp: '33⅓', single: '45', shellac: '78' };
const DETENT_OF: Record<SpeedPreset, SpeedDetent> = { lp: '33', single: '45', shellac: '78' };
const PRESET_OF = { '33': 'lp', '45': 'single', '78': 'shellac' } as const;

/** Below this record speed the music is gated: a platter that has stopped plays nothing. */
const MIN_RATE = 0.05;
const RATE_EPSILON = 1e-4;
/** The cut chain follows the stylus this often; it moves far too slowly to need every tick. */
const CUT_UPDATE_S = 0.3;
/** Once-per-turn speed wobble at full Imperfection (html-1). */
const ECCENTRIC_SPEED = 0.0016;
/** A mint record's surface is this much quieter (html-1's hiss ratio). */
const MINT_NOISE = 0.35;

export interface DeckOptions {
  /** Motor stays on when playback pauses (html-1's keepSpinning). */
  keepSpinning: boolean;
  /** Arm returns to its rest after the end stop (new; on by default, as both originals did). */
  armReturn: boolean;
  sides: boolean;
  sizeBySpeed: boolean;
  /** ±8 % instead of the real ±6 %. */
  extendedPitch: boolean;
  /** Mechanism sounds. */
  effects: boolean;
  /** A hand on the record scrubs the music; off, it mutes the music and whooshes. */
  scratch: boolean;
  /** The cut-record chain; off is a truly flat signal (C21). */
  recordCharacter: boolean;
}

/** The turntable as a whole: plates, motor, platter, arm, the record's grooves and the engine. */
export class Deck {
  readonly engine = new AudioEngine();
  readonly motor = new Motor();
  readonly plates = new Plates();
  readonly spin = new Spin();
  readonly arm = new Arm();
  readonly program = new Program();
  readonly groove: Groove;
  readonly events = new Emitter<DeckEvents>();
  readonly options: DeckOptions = {
    keepSpinning: false,
    armReturn: true,
    sides: false,
    sizeBySpeed: false,
    extendedPitch: false,
    effects: true,
    scratch: true,
    recordCharacter: true,
  };
  condition: Condition = 'good';
  imperfection = 0.5;
  /** This side's scratches and dust: the same list ticks in the worklet and is drawn. */
  wearMap: { defects: Defect[]; marks: Mark[] } = { defects: [], marks: [] };
  mainsHz: MainsHz = 50;
  title = '';
  /** Calm mode (prefers-reduced-motion): moves finish at once. */
  reducedMotion = false;
  /** The stylus is on its way down. */
  dropping = false;
  /** The record changed (program, size, side): the scene redraws its face. */
  recordVersion = 0;
  private queue: DeckQueue | null = null;
  private lastRate = 1;
  private loadToken = 0;
  private resumeAfterLoad = false;
  /** Where to start once the track being loaded is ready. */
  private pendingSeek = 0;
  private pending: { file: Blob; title: string; durationSec: number } | null = null;
  private scratchingEngine = false;
  private noise: SurfaceNoise | null = null;
  private readonly glow = new GlowEnvelope();
  private readonly spectrum = new Uint8Array(8);
  private mix: MixSettings = {
    equalisation: 'flat',
    noiseLevel: DEFAULT_NOISE_LEVEL,
    bass: 0,
    mid: 0,
    treble: 0,
    graphicEq: FLAT_EQ,
  };
  private plan = mixPlan(this.mix);
  private wear = DEFAULT_WEAR;
  private clock = 0;
  /** List index of the track the engine holds (or is loading). */
  private loadedIndex = -1;
  /** Where keyboard cueing has sent the arm, as a share of the side's groove area. */
  private nudgeTarget: number | null = null;
  private starting = false;
  /** The record on the platter could not be decoded: the stylus stays up. */
  private unplayable = false;
  private cutClock = 0;
  private motorHeard = false;

  constructor(private readonly now: () => number = () => performance.now() / 1000) {
    this.clock = now();
    this.groove = new Groove({
      program: this.program,
      // The track the engine holds, not the queue's current one: asking the queue for the next
      // track advances it before the stylus has crossed the gap.
      currentIdx: () => this.loadedIndex,
      position: () => this.engine.currentTime || this.pendingSeek,
      select: (idx) => {
        this.pendingSeek = 0;
        // Never a reason to play by itself: a stylus riding into a band is already in contact, which
        // keeps the music going, and one just lifted from the locked groove has finished the side.
        this.queue?.selectIndex(idx, false);
      },
      seek: (t) => {
        this.pendingSeek = t;
        if (this.engine.duration > 0) this.engine.seek(t);
      },
      lockedTurn: (revs) => this.lockedTurn(revs),
      secPerRev: () => SEC_PER_REV / this.cutUnits,
    });
    this.engine.events.on('notice', (message) => this.events.emit('status', message));
    this.engine.events.on('end', () => this.trackEnded());
    this.events.on('mechanism', (sound) => this.sound(sound));
  }

  attach(queue: DeckQueue): void {
    this.queue = queue;
    this.rebuild();
  }

  // ─── The record ──────────────────────────────────────────────────

  get recordSize(): RecordSize {
    return sizeFor(this.motor.preset, this.options.sizeBySpeed);
  }

  /** The speed the record on the platter was cut at, in units of 33⅓ (C20). */
  get cutUnits(): number {
    return RPM_UNITS[this.recordSize];
  }

  /** Lays the queue onto the record: call after the queue, sides or record size change. */
  rebuild(): void {
    const q = this.queue;
    this.program.build(q?.durations() ?? [], Math.max(0, q?.currentIndex() ?? 0), {
      sides: this.options.sides,
      size: this.recordSize,
    });
    this.buildWearMap();
    this.recordVersion++;
  }

  /** Seeded by the side's real track ids, so a record keeps its damage from visit to visit. */
  private buildWearMap(): void {
    const p = this.program;
    const ids = this.queue?.ids().slice(p.first, p.last + 1) ?? [];
    this.wearMap = buildWear(ids.join('|'), this.condition, p.geometry);
    this.pushSurface();
  }

  private pushSurface(): void {
    this.engine.setSurface({
      defects: this.wearMap.defects,
      pops: CONDITIONS[this.condition].pops,
      gain: this.plan.noiseGain,
      eccentric: this.imperfection * ECCENTRIC_SPEED,
    });
  }

  /** Loudness of a track at fraction `f` of its length, 0..1; undefined until it has been decoded. */
  levelAt(idx: number, f: number): number | undefined {
    const levels = this.queue?.levels(idx);
    if (!levels?.length) return undefined;
    return levels[Math.min(levels.length - 1, Math.floor(f * levels.length))]! / 255;
  }

  /** Degrees round the spindle where the stylus sits now: scratches tick as they pass it. */
  tickPhi(): number {
    return (stylusPhi(this.directionForRn(this.groove.stylusR())) * 180) / Math.PI;
  }

  /** Id of a list index, to seed what has not been measured yet. */
  idAt(idx: number): string {
    return this.queue?.ids()[idx] ?? String(idx);
  }

  setCondition(condition: Condition): void {
    if (condition === this.condition) return;
    this.condition = condition;
    this.buildWearMap();
    this.recordVersion++;
    this.applyNoiseGain();
  }

  setImperfection(imperfection: number): void {
    this.imperfection = imperfection;
    this.pushSurface();
  }

  /** Stylus radius in metres from the spindle, for the current record. */
  private metres(rn: number): number {
    return rn * recordGeometry(this.recordSize).radius;
  }

  private directionForRn(rn: number): number {
    return directionFor(this.metres(rn));
  }

  /** The record radius (record radii) under the arm's current direction. */
  private rnForArm(): number {
    return radiusFor(this.arm.direction) / recordGeometry(this.recordSize).radius;
  }

  /** Counts the times the record was simply found on a side, as at start-up: no turnover to show. */
  restoredVersion = 0;

  /** The library is back and the record laid out: whichever side is up was always up. */
  restored(): void {
    this.rebuild();
    this.restoredVersion++;
  }

  /** Nothing to put on the platter until a track is queued: the bare mat shows (X12). */
  get hasRecord(): boolean {
    return (this.queue?.ids().length ?? 0) > 0;
  }

  get needleDown(): boolean {
    return this.groove.contact;
  }

  get hasTrack(): boolean {
    return this.engine.duration > 0;
  }

  /** Track length for display: the decoded length, or the tagged one until decoding happens. */
  get duration(): number {
    return this.engine.duration || this.pending?.durationSec || 0;
  }

  // ─── Loading ─────────────────────────────────────────────────────

  /** Puts a record on the platter without decoding it (lazy start: no audio before a gesture). */
  cueUp(file: Blob, title: string, durationSec: number): void {
    if (this.loadedIndex < 0) this.events.emit('mechanism', 'place');
    this.loadedIndex = this.queue?.currentIndex() ?? -1;
    this.loadToken++;
    this.resumeAfterLoad = false;
    this.pending = { file, title, durationSec };
    this.title = title;
    this.events.emit('status', `On the platter: ${title}`);
  }

  async load(file: Blob, title: string, autoplay = false): Promise<void> {
    // A load that replaces one still in flight inherits its intent to keep playing.
    const resume = autoplay || this.groove.contact || this.dropping || this.resumeAfterLoad;
    const idx = this.queue?.currentIndex() ?? -1;
    if (this.loadedIndex < 0) this.events.emit('mechanism', 'place');
    this.loadedIndex = idx;
    // The stylus rode into this track's band: keep it there. Anywhere else (another track was
    // chosen), lift now and lower at the new track once it is ready (html-1's jumpTo).
    const arriving =
      this.groove.contact && this.groove.seg?.kind === 'track' && this.groove.seg.idx === idx;
    if (!arriving && (this.groove.contact || this.dropping)) this.liftNeedle();
    this.pending = null;
    this.resumeAfterLoad = resume;
    this.engine.pause();
    if (!(await this.decode(file, title))) return;
    if (this.groove.contact && this.groove.seg?.kind === 'track' && this.groove.seg.idx === idx)
      this.startAudio();
    else if (resume) {
      this.pendingSeek = 0;
      this.mechanism(this.plates.readyToPlay());
      this.moveCue('lower');
      this.dropAt(this.groove.dropPoint(), this.arm.mode === 'rest');
    } else if (this.arm.mode === 'hover' && !this.dropping && !this.groove.contact) {
      // A hovering arm swings over the newly chosen track, so Play lowers it there (html-1).
      // Not when Play already started a drop while the track was decoding.
      this.pendingSeek = 0;
      this.arm.liftTo(this.clock, this.directionForRn(this.groove.dropPoint().r));
      if (this.reducedMotion) this.arm.finishNow();
    }
  }

  private async decode(file: Blob, title: string): Promise<boolean> {
    this.unplayable = false;
    const token = ++this.loadToken;
    this.title = title;
    this.events.emit('status', `Loading ${title}…`);
    let failed = false;
    try {
      await this.engine.load(file, this.queue?.durations()[this.loadedIndex] ?? 0);
    } catch {
      failed = true;
    }
    if (token !== this.loadToken) return false;
    this.resumeAfterLoad = false;
    if (failed) {
      this.title = '';
      this.unplayable = true;
      // Nothing to play under the stylus: it does not stay down on a record that cannot sound.
      if (this.groove.contact || this.dropping) this.pause();
      this.events.emit('status', `Can't play ${title}. The format may not be supported.`);
      return false;
    }
    if (this.engine.mode === 'decode') this.events.emit('status', `Ready: ${title}`);
    this.events.emit('announce', `Loaded ${title}.`);
    const levels = this.engine.levels;
    if (levels && this.loadedIndex >= 0) this.queue?.saveLevels(this.loadedIndex, levels);
    this.rebuild();
    void this.predecodeNext();
    return true;
  }

  /** The next groove along is ready before the stylus gets there, and its band gets real shading. */
  private async predecodeNext(): Promise<void> {
    const index = this.loadedIndex + 1;
    const file = this.queue?.fileAt(index);
    if (!file) return;
    const levels = await this.engine.predecode(file, this.queue?.durations()[index] ?? 0);
    if (!levels || this.queue?.levels(index)) return;
    this.queue?.saveLevels(index, levels);
    this.recordVersion++;
  }

  private async loadPending(): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    if ((await this.decode(pending.file, pending.title)) && this.groove.contact) this.startAudio();
  }

  /** Jumps to a time in the track. Inside a track the arm glides there without lifting. */
  seek(seconds: number): void {
    this.pendingSeek = seconds;
    this.engine.seek(seconds);
    const idx = this.queue?.currentIndex() ?? -1;
    if (this.groove.contact && this.groove.seg?.kind !== 'track' && idx >= 0)
      this.groove.begin('track', idx, seconds);
  }

  /** Starts the loaded track again from its start (the lead-in for a side's first track). */
  restart(autoplay: boolean): void {
    const resume = autoplay || this.groove.contact;
    this.pendingSeek = 0;
    this.engine.seek(0);
    if (!resume) return;
    // Like every other way of playing: a stylus in a groove that never turns would wait for ever.
    this.mechanism(this.plates.readyToPlay());
    this.moveCue('lower');
    this.dropAt(this.groove.dropPoint());
  }

  // ─── Transport ───────────────────────────────────────────────────

  /** Play: power up, then lower the stylus where the music is. Pause: lift. */
  togglePlay(): void {
    if (this.groove.contact || this.dropping) {
      this.pause();
      return;
    }
    this.play();
  }

  play(): void {
    this.prime();
    if (!this.queue || this.queue.currentIndex() < 0) {
      this.events.emit('status', 'Add a record first.');
      return;
    }
    if (this.unplayable) {
      this.events.emit('status', `Can't play this record. Choose another track.`);
      return;
    }
    this.mechanism(this.plates.readyToPlay());
    this.moveCue('lower');
    // Hovering over the grooves: lower right there. An arm still swinging is on its way to the
    // chosen track, so it goes to that track's drop point.
    const over = this.arm.mode === 'hover' ? this.groove.pointAt(this.rnForArm()) : null;
    // Only in the chosen track's band: a track picked from the list takes precedence.
    const hovering = over && over.idx === this.queue.currentIndex() ? over : null;
    this.dropAt(hovering ?? this.groove.dropPoint());
  }

  /** A track left the queue: the grooves the stylus rides in a gap or run-out are gone (X28). */
  trackRemoved(): void {
    const kind = this.groove.seg?.kind;
    const inSilence = this.groove.contact && kind !== 'track';
    this.rebuild();
    if (inSilence) this.pause();
  }

  /** Lifts the stylus; the motor stops unless "Keep the platter spinning" is on (C14). */
  pause(): void {
    // The transport lifts the stylus without moving the cue plate (the App's START did not
    // touch the lever), so a drag after a pause still plays where it is let go.
    this.liftNeedle();
    if (!this.options.keepSpinning && this.plates.motorOn)
      this.mechanism(this.plates.setSpeed('off'));
  }

  /** M and ⏻: slide the speed plate to OFF and back. The stylus stays where it is (C15). */
  toggleMotor(): void {
    this.prime();
    this.mechanism(this.plates.togglePower());
    this.events.emit('announce', this.plates.motorOn ? 'Motor on.' : 'Motor off.');
  }

  /** The cue plate and the L key: lift or lower the stylus only; the motor keeps turning. */
  toggleLever(): void {
    this.prime();
    if (this.arm.mode === 'drag') return;
    if (this.groove.contact || this.dropping) {
      this.moveCue('raise');
      this.liftNeedle();
      return;
    }
    // On its rest the arm is out of the way: the plate simply moves, either way (C26 needs it up).
    if (this.arm.mode === 'rest') {
      this.moveCue(this.plates.cue === 'lower' ? 'raise' : 'lower');
      return;
    }
    this.moveCue('lower');
    // Over the record, still rising or already hovering: lower right there (or where a
    // keyboard nudge is taking it).
    const over = this.groove.pointAt(this.nudgeRn() ?? this.rnForArm());
    if (over) {
      // Lowering onto a record starts the motor too, as both originals did.
      this.mechanism(this.plates.readyToPlay());
      this.dropAt(over, false);
    } else this.park();
  }

  /** The cue plate is raised: the lever twin's pressed state. */
  get leverRaised(): boolean {
    return this.plates.cue === 'raise';
  }

  /**
   * Keyboard cueing: with the lever up, steps the arm across the side by `delta` of its groove
   * area. Stepping outward past the lead-in parks the arm.
   */
  nudgeArm(delta: number): void {
    if (!this.leverRaised || this.groove.contact) return;
    // Steps are shares of the current track's band (the App's keyboard cueing), or of the side's
    // groove area when no track is on the platter.
    const g = this.program.geometry;
    const band = this.program.bands[this.queue?.currentIndex() ?? -1];
    const outer = band?.r0 ?? g.outer;
    const inner = band?.r1 ?? g.inner;
    // Successive presses build on the last target, not on an arm still swinging toward it.
    const position =
      this.nudgeTarget ??
      (this.arm.mode === 'hover' ? (outer - this.rnForArm()) / (outer - inner) : -delta);
    const target = position + delta;
    if (target < 0) {
      this.nudgeTarget = null;
      this.park();
      this.events.emit('announce', 'Tonearm at rest.');
      return;
    }
    const clamped = Math.min(1, target);
    this.nudgeTarget = clamped;
    this.arm.liftTo(this.clock, this.directionForRn(outer - clamped * (outer - inner)));
    if (this.reducedMotion) this.arm.finishNow();
    this.events.emit('announce', `Tonearm at ${Math.round(clamped * 100)} percent.`);
  }

  /** Record radius a keyboard nudge is taking the arm to, or null. */
  private nudgeRn(): number | null {
    if (this.nudgeTarget === null) return null;
    const g = this.program.geometry;
    const band = this.program.bands[this.queue?.currentIndex() ?? -1];
    const outer = band?.r0 ?? g.outer;
    const inner = band?.r1 ?? g.inner;
    return outer - this.nudgeTarget * (outer - inner);
  }

  /** The speed radios and the plate: 78 needs the unlock pin, which the 78 twin presses for you. */
  setSpeed(preset: SpeedPreset, viaTwin = true): PlateEvent {
    // With the plate on OFF, choosing a speed does not start the motor (neither original's
    // speed keys did): it sets the speed the plate returns to.
    if (this.plates.speed === 'off') {
      this.plates.lastSpeed = DETENT_OF[preset] as Exclude<SpeedDetent, 'off'>;
      this.syncPreset();
      return 'none';
    }
    if (preset === 'shellac' && viaTwin) this.plates.unlockLatched = true;
    const event = this.plates.setSpeed(DETENT_OF[preset]);
    if (preset === 'shellac' && viaTwin) this.plates.unlockLatched = false;
    this.mechanism(event);
    this.syncPreset();
    return event;
  }

  /** The 3D M/START plate moved one detent. Centre stops the motor; START arms the end stop. */
  stepStartPlate(direction: -1 | 1): void {
    this.mechanism(this.plates.stepStart(direction));
  }

  /** html-1's "Auto-return" checkbox: the M/START plate at START (on) or M (off). */
  setEndStop(enabled: boolean): void {
    this.mechanism(this.plates.setStart(enabled ? 'start' : 'm'));
  }

  /** The 3D speed plate moved one detent. */
  stepSpeed(direction: -1 | 1): void {
    this.mechanism(this.plates.stepSpeed(direction));
    this.syncPreset();
  }

  private syncPreset(): void {
    const speed = this.plates.selectedSpeed;
    const preset = PRESET_OF[speed];
    if (preset === this.motor.preset) return;
    const before = this.recordSize;
    this.motor.preset = preset;
    if (this.recordSize !== before) this.swapRecord();
  }

  /** Percent; clamped to ±6 %, or ±8 % with Extended pitch. */
  setPitch(percent: number): number {
    const range =
      (this.options.extendedPitch
        ? DECK_SPEC.motor.extendedPitchRange
        : DECK_SPEC.motor.pitchRange) * 100;
    const clamped = Math.max(-range, Math.min(range, percent));
    this.motor.pitch = clamped / 100;
    return clamped;
  }

  /** Another record goes on the platter (a size or sides change): lift, swap, lower again. */
  swapRecord(): void {
    const was = this.groove.contact || this.dropping;
    if (was) this.groove.unseat();
    this.dropping = false;
    this.rebuild();
    this.events.emit('mechanism', 'place');
    if (this.arm.mode === 'rest') return;
    if (was) this.dropAt(this.groove.dropPoint(), false);
    else this.arm.liftTo(this.clock, this.directionForRn(this.groove.dropPoint().r));
  }

  setOptions(change: Partial<DeckOptions>): void {
    const before = { ...this.options };
    Object.assign(this.options, change);
    if (before.sides !== this.options.sides || before.sizeBySpeed !== this.options.sizeBySpeed)
      this.swapRecord();
    this.engine.setRecordCharacter(this.options.recordCharacter);
    if (before.extendedPitch !== this.options.extendedPitch) this.setPitch(this.motor.pitch * 100);
  }

  // ─── Arm by hand ─────────────────────────────────────────────────

  beginDrag(): boolean {
    this.prime();
    if (this.arm.mode === 'drag') return false;
    this.dragFromRest = this.arm.mode === 'rest';
    this.dragFromGroove = this.groove.contact || this.dropping;
    if (this.groove.contact) this.liftNeedle(false);
    this.dropping = false;
    this.nudgeTarget = null;
    this.arm.grab(this.clock);
    return true;
  }

  /**
   * The arm was pressed and let go without moving: that is the cue, not a drag (H12). From its rest
   * it lowers onto the record and plays; in the groove it has already lifted; hovering, it lowers.
   */
  clickArm(): void {
    if (this.arm.mode !== 'drag') return;
    this.arm.mode = this.dragFromRest ? 'rest' : 'hover';
    if (this.dragFromRest) this.play();
    else if (this.dragFromGroove) this.moveCue('raise');
    else this.toggleLever();
  }

  private dragFromRest = false;
  private dragFromGroove = false;

  /** The hand moves the arm toward a plan direction; it stops at the rest and at the locked groove. */
  dragTo(direction: number): void {
    if (this.arm.mode !== 'drag') return;
    const inner = this.directionForRn(this.program.geometry.locked);
    const outer = REST_DIRECTION - 1 * (Math.PI / 180);
    this.arm.dragDirection = Math.min(inner, Math.max(outer, direction));
  }

  endDrag(): void {
    if (this.arm.mode !== 'drag') return;
    this.arm.direction = this.arm.dragDirection;
    const point = this.groove.pointAt(this.rnForArm());
    if (!point) {
      this.park();
      if (!this.options.keepSpinning) this.mechanism(this.plates.setSpeed('off'));
      return;
    }
    // With the cue plate raised the arm hovers where it was let go (the App's lever); otherwise
    // the stylus goes down there and plays (both originals).
    if (this.leverRaised) {
      this.arm.liftTo(this.clock);
      return;
    }
    this.mechanism(this.plates.readyToPlay());
    this.moveCue('lower');
    this.dropAt(point, true);
  }

  // ─── Hand on the record ──────────────────────────────────────────

  get scratching(): boolean {
    return this.spin.held;
  }

  /** A hand on the record. `angleDeg` is the pointer's angle round the spindle. */
  beginScratch(angleDeg: number): boolean {
    if (!this.groove.contact || !this.hasTrack) return false;
    if (this.engine.mode === 'stream') {
      this.events.emit('status', 'Scratching is disabled for large files in streaming mode.');
      return false;
    }
    if (!this.engine.beginScratch()) return false;
    this.scratchingEngine = true;
    this.spin.held = true;
    this.handOffset = this.spin.angR - angleDeg;
    this.spin.hand = this.spin.angR;
    this.lastHand = angleDeg;
    if (!this.options.scratch) {
      this.engine.setMusicAudible(false);
      this.events.emit('mechanism', 'whoosh-on');
    }
    return true;
  }

  private handOffset = 0;
  private lastHand = 0;

  scratchTo(angleDeg: number): void {
    if (!this.spin.held) return;
    // Unwrap so a hand going round keeps counting.
    let d = angleDeg - this.lastHand;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    this.lastHand += d;
    this.spin.hand = this.lastHand + this.handOffset;
  }

  endScratch(): void {
    if (!this.spin.held) return;
    this.spin.held = false;
    this.engine.setRecordAngle(this.spin.angR);
    if (!this.options.scratch) {
      this.engine.setMusicAudible(true);
      this.events.emit('mechanism', 'whoosh-off');
    }
  }

  // ─── Mix ─────────────────────────────────────────────────────────

  setSurfaceNoise(level: number): void {
    this.applyMix({ noiseLevel: level });
  }

  setEqualisation(equalisation: Equalisation): void {
    this.applyMix({ equalisation });
  }

  setTone(tone: ToneSettings): void {
    this.applyMix(tone);
  }

  setGraphicEq(graphicEq: GraphicEq): void {
    this.applyMix({ graphicEq });
  }

  private applyMix(change: Partial<MixSettings>): void {
    this.mix = { ...this.mix, ...change };
    this.plan = mixPlan(this.mix);
    this.engine.setEqualisation(this.mix.equalisation);
    this.engine.setMix(this.plan.musicGain, this.mix, activeGains(this.mix.graphicEq).bands);
    this.applyNoiseGain();
    this.engine.setSurface({ gain: this.plan.noiseGain });
  }

  /** The share of the level the music leaves for the surface noise. */
  get noiseRoom(): number {
    return 1 - this.plan.noiseGain;
  }

  private applyNoiseGain(): void {
    this.noise?.setGain(this.plan.noiseGain * (this.condition === 'mint' ? MINT_NOISE : 1));
  }

  setWear(wear: number): void {
    this.wear = wear;
    this.noise?.setWear(wear);
  }

  // ─── Time ────────────────────────────────────────────────────────

  /** Target platter speed in units of 33⅓ (0 with the motor off). */
  get targetUnits(): number {
    this.motor.powered = this.plates.motorOn;
    return this.motor.targetRpm / SPEED_PRESETS.lp;
  }

  get motorState(): MotorState {
    return this.spin.motorState(this.targetUnits, this.plates.motorOn);
  }

  /**
   * Advances everything to now. Runs from the frame loop and, while the page is hidden, from a
   * timer: every step is closed-form in elapsed time, so playback never depends on frames.
   */
  tick(): void {
    const t = this.now();
    const dt = Math.min(2, Math.max(0, t - this.clock));
    this.clock = t;
    const target = this.targetUnits;
    const nominal = RPM_UNITS[this.motor.preset];
    const turned = this.spin.step(dt, target, nominal);
    // The drawn record locks to what is heard, so a mark passes the stylus as its tick sounds.
    const heard = this.spin.held ? null : this.engine.heardAngle();
    if (heard !== null) this.spin.syncTo(heard, dt);
    this.motor.rpm = this.spin.wp * SPEED_PRESETS.lp;
    // Silent stretches of groove are timed by the record itself.
    this.groove.ride((turned * SEC_PER_DEG) / this.cutUnits);
    this.tickAudio();
    this.tickSurface(t);
    const bass =
      this.groove.contact && this.engine.readSpectrum(this.spectrum) ? bassLevel(this.spectrum) : 0;
    this.glow.step(bass, dt);
    this.arm.update(t, dt, this.directionForRn(this.groove.stylusR()));
  }

  /** What the record's surface and the cut chain need from the stylus. */
  private tickSurface(t: number): void {
    const contact = this.groove.contact;
    const radius = contact ? this.groove.stylusR() : this.rnForArm();
    const direction = this.directionForRn(radius);
    this.engine.setMotion(this.spin.wr, contact, radius, (stylusPhi(direction) * 180) / Math.PI);
    const shellac = this.motor.preset === 'shellac';
    this.noise?.setActive(contact);
    this.noise?.setRecord(this.spin.wr / this.cutUnits, {
      leadIn: contact && this.groove.seg?.kind === 'leadin',
      shellac,
      motor: this.plates.motorOn,
    });
    if (t - this.cutClock < CUT_UPDATE_S) return;
    this.cutClock = t;
    const g = this.program.geometry;
    const cond = CONDITIONS[this.condition];
    const tone = cutTone((g.outer - radius) / (g.outer - g.inner), shellac, cond.lp, cond.dist);
    this.engine.setCut(tone.rolloffHz, tone.drive);
  }

  private tickAudio(): void {
    const inTrack = this.groove.contact && this.groove.seg?.kind === 'track' && this.hasTrack;
    const rate = this.spin.wr / this.cutUnits;
    if (this.spin.held || (this.scratchingEngine && Math.abs(this.spin.wr - this.spin.wp) > 0.01)) {
      // The record is under a hand, or still slipping back: the read head follows it.
      this.engine.setScratchRate(rate);
      return;
    }
    if (this.scratchingEngine) {
      this.engine.endScratch();
      this.scratchingEngine = false;
    }
    if (!inTrack) return;
    if (rate < MIN_RATE) {
      if (this.engine.playing) this.engine.pause();
      return;
    }
    if (Math.abs(rate - this.lastRate) > RATE_EPSILON) {
      this.engine.setRate(rate);
      this.lastRate = rate;
    }
    if (this.plates.motorOn) this.engine.setStreamRate(rate);
    // One start at a time: play() is async and this runs every frame.
    if (!this.engine.playing && !this.starting) {
      this.starting = true;
      void this.engine
        .play()
        .catch(() => this.events.emit('status', 'Tap play again to start the sound.'))
        .finally(() => (this.starting = false));
    }
  }

  /**
   * Readies the audio graph inside a user gesture. The music itself starts later (after the cue
   * and the lead-in), when browsers would no longer let a page start sound (html-1's
   * Engine.ensure on every click).
   */
  private prime(): void {
    this.withAudio(() => this.engine.retryRoute());
  }

  // ─── Inside the deck ─────────────────────────────────────────────

  /** Lower the stylus at a point. The full damped cue from the rest; a quicker one otherwise. */
  private dropAt(point: DropPoint, slow = this.arm.mode === 'rest'): void {
    this.nudgeTarget = null;
    this.groove.unseat();
    // The time shown follows the stylus to where it is going; the engine is paused meanwhile.
    if (point.kind === 'track' && point.idx === this.loadedIndex && this.hasTrack) {
      this.pendingSeek = point.t;
      this.engine.seek(point.t);
    }
    this.dropping = true;
    this.events.emit('mechanism', 'lower');
    this.arm.cueTo(this.clock, this.directionForRn(point.r), slow, () => {
      this.dropping = false;
      this.groove.land(point);
      this.arm.bob = 0.25;
      this.needleDropped();
    });
    if (this.reducedMotion) this.arm.finishNow();
  }

  private liftNeedle(hover = true): void {
    const was = this.groove.contact || this.dropping;
    this.groove.unseat();
    this.dropping = false;
    this.engine.pause();
    if (!was) return;
    this.events.emit('mechanism', 'lift');
    this.events.emit('announce', 'Needle lifted.');
    if (hover) {
      this.arm.liftTo(this.clock);
      if (this.reducedMotion) this.arm.finishNow();
    }
  }

  private park(swingS?: number, done?: () => void): void {
    this.nudgeTarget = null;
    this.groove.unseat();
    this.dropping = false;
    this.engine.pause();
    if (this.arm.mode !== 'rest') this.events.emit('mechanism', 'lift');
    this.arm.park(this.clock, swingS, done);
    if (this.reducedMotion) this.arm.finishNow();
  }

  private needleDropped(): void {
    this.events.emit('mechanism', 'drop');
    this.events.emit('announce', 'Needle down.');
    // A record cued at start-up is decoded now, while the stylus rides the lead-in.
    if (!this.hasTrack && this.pending) void this.loadPending();
    else this.startAudio();
  }

  /** Starts the engine at the groove under the stylus, if a track is loaded. */
  private startAudio(): void {
    const seg = this.groove.seg;
    if (!seg || seg.kind !== 'track') return;
    if (this.engine.duration <= 0) {
      void this.loadPending();
      return;
    }
    this.engine.seek(this.pendingSeek);
    this.lastRate = -1;
    if (this.title) this.events.emit('announce', `Now playing ${this.title}.`);
    // tickAudio starts the engine on the next frame, once, at the record's speed.
  }

  /** The engine reached the end of the track. */
  private trackEnded(): void {
    if (!this.groove.contact || this.groove.seg?.kind !== 'track') return;
    const next = this.queue?.nextIndex() ?? -1;
    const result = this.groove.trackEnded(next);
    if (result === 'runout') this.events.emit('announce', 'End of the side.');
    if (result === 'jump' && next >= 0) {
      this.liftNeedle(false);
      this.pendingSeek = 0;
      this.queue?.selectIndex(next, true);
    }
  }

  /** One more turn in the locked groove: thump, a bob of the arm, and the end stop in START. */
  private lockedTurn(revs: number): void {
    this.events.emit('mechanism', 'thump');
    this.arm.bob = 1;
    if (revs < DECK_SPEC.motor.tripTurns || !this.plates.trip()) return;
    // The optoelectronic end stop: the arm lifts and the motor switches off (W2).
    this.mechanism('none');
    this.events.emit('announce', 'End of record.');
    if (this.options.armReturn) {
      this.park(DECK_SPEC.mechanism.armReturnS, () => this.events.emit('returned', undefined));
    } else {
      this.liftNeedle();
      this.events.emit('returned', undefined);
    }
  }

  private mechanism(event: PlateEvent): void {
    if (event === 'detent' || event === 'interlock') this.events.emit('mechanism', event);
    if (this.plates.motorOn !== this.motorHeard) {
      this.motorHeard = this.plates.motorOn;
      this.events.emit('mechanism', this.motorHeard ? 'motor-on' : 'motor-off');
    }
  }

  private moveCue(target: 'raise' | 'lower'): void {
    if (this.plates.setCue(target) !== 'none') this.events.emit('mechanism', 'cue');
  }

  /** Effects gates them all. The graph exists only after a gesture; before it, nothing sounds. */
  private sound(sound: DeckEvents['mechanism']): void {
    const ctx = this.engine.context;
    const stylus = this.engine.sfxBus;
    const bus = this.engine.mechanismBus;
    if (!this.options.effects || !ctx || !stylus || !bus) return;
    if (sound === 'cue') playLeverClack(ctx, this.plan.leverLevel);
    else if (sound === 'drop') playNeedleThunk(ctx, stylus);
    else playMechanism(ctx, bus, sound);
  }

  /** Runs `fn` once the audio graph exists; creating it needs a user gesture. */
  withAudio(fn: (ctx: AudioContext, sfxBus: AudioNode) => void): void {
    void this.engine
      .init()
      .then(async ({ ctx, stylus }) => {
        await ctx.resume();
        if (!this.noise) {
          this.noise = this.createNoise(ctx);
          this.engine.setRecordAngle(this.spin.angR);
          this.pushSurface();
        }
        fn(ctx, stylus);
      })
      .catch(() => this.events.emit('status', 'Audio is not available in this browser.'));
  }

  private createNoise(ctx: AudioContext): SurfaceNoise | null {
    const destination = this.engine.masterInput;
    if (!destination) return null;
    const noise = new SurfaceNoise(ctx, destination);
    noise.setGain(this.plan.noiseGain * (this.condition === 'mint' ? MINT_NOISE : 1));
    noise.setWear(this.wear);
    return noise;
  }

  // ─── For the renderers ───────────────────────────────────────────

  get glowLevel(): number {
    return this.glow.value;
  }

  /** The 2D fallback deck's picture of the same state. */
  snapshot(): PlatterSnapshot {
    const reference = SPEED_PRESETS[this.motor.preset] / 60;
    const g = this.program.geometry;
    const rn = this.arm.mode === 'rest' ? 1.3 : this.rnForArm();
    return {
      revPerSec: (this.spin.wr * DEG_PER_SEC) / 360,
      strobeVelocity: (this.spin.strobeV * Math.PI) / 180,
      strobeDots: strobeDotCount(reference, this.mainsHz),
      lampOn: this.plates.motorOn,
      armAngle:
        this.arm.mode === 'rest'
          ? FALLBACK_GEOMETRY.restAngle
          : angleForTrackPosition(
              FALLBACK_GEOMETRY,
              Math.max(0, Math.min(1, (g.outer - rn) / (g.outer - g.inner))),
            ),
      armLifted: this.arm.lift > 0.5,
      armHeld: this.arm.mode === 'drag',
      needleDown: this.groove.contact,
      glow: this.glow.value,
      title: this.title,
      speedLabel: SPEED_LABELS[this.motor.preset],
    };
  }
}
