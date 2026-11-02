import { DECK_SPEC } from '../spec/deck';

/**
 * The three flat plates on the strip, as detent machines (docs/REFERENCE.md, Control strip):
 * - speed: 78 · 45 · OFF · 33. OFF powers the motor down; 78 lies past 45 and is reached only
 *   while the recessed unlock pin is held (or latched by a click on it).
 * - start: M · centre · START. Centre stops the motor; START arms the optoelectronic end stop,
 *   M leaves the stylus in the locked groove.
 * - cue: lower · raise, damped.
 * Every move reports what happened, so the deck can play the right mechanism sound.
 */

export type SpeedDetent = (typeof DECK_SPEC.plates.speed.detents)[number];
export type StartDetent = (typeof DECK_SPEC.plates.start.detents)[number];
export type CueDetent = (typeof DECK_SPEC.plates.cue.detents)[number];
export type Speed = Exclude<SpeedDetent, 'off'>;
export type PlateEvent = 'detent' | 'interlock' | 'none';

const SPEEDS = DECK_SPEC.plates.speed.detents;
const STARTS = DECK_SPEC.plates.start.detents;

export interface PlatesState {
  speed: SpeedDetent;
  start: StartDetent;
  cue: CueDetent;
  lastSpeed: Speed;
  unlockLatched: boolean;
  tripped: boolean;
}

export class Plates {
  speed: SpeedDetent = 'off';
  start: StartDetent = 'start';
  /** Lowered, as both originals' levers started: a parked arm let go over a record plays. */
  cue: CueDetent = 'lower';
  /** The speed the ⏻ / M shortcut returns to. */
  lastSpeed: Speed = '33';
  /** The pin is held down by a pointer or latched by a click (a second click releases it). */
  unlockHeld = false;
  unlockLatched = false;
  /** The end stop switched the motor off; cleared by moving the start plate or by Play. */
  tripped = false;

  get unlocked(): boolean {
    return this.unlockHeld || this.unlockLatched;
  }

  /** The motor turns when a speed is selected, the start plate is off centre and the stop has not tripped. */
  get motorOn(): boolean {
    return this.speed !== 'off' && this.start !== 'centre' && !this.tripped;
  }

  /** The selected speed, or the last one while the plate is on OFF. */
  get selectedSpeed(): Speed {
    return this.speed === 'off' ? this.lastSpeed : this.speed;
  }

  /** Slides the speed plate to a detent, one step at a time. Stops at 45 when 78 is locked out. */
  setSpeed(target: SpeedDetent): PlateEvent {
    if (target === this.speed) return 'none';
    if (target === '78' && !this.unlocked) {
      if (this.speed === '45') return 'interlock';
      this.speed = '45';
      this.lastSpeed = '45';
      return 'interlock';
    }
    this.speed = target;
    if (target !== 'off') this.lastSpeed = target;
    if (target === 'off') this.tripped = false;
    return 'detent';
  }

  /** One detent left (−1, toward 78) or right (+1, toward 33). */
  stepSpeed(direction: -1 | 1): PlateEvent {
    const next = SPEEDS[SPEEDS.indexOf(this.speed) + direction];
    return next ? this.setSpeed(next) : 'none';
  }

  /** The ⏻ button and the M key: to OFF, or back to the last speed. */
  togglePower(): PlateEvent {
    if (this.motorOn || this.speed !== 'off') return this.setSpeed('off');
    const event = this.setSpeed(this.lastSpeed === '78' && !this.unlocked ? '45' : this.lastSpeed);
    if (this.start === 'centre') this.start = 'start';
    this.tripped = false;
    return event;
  }

  setStart(target: StartDetent): PlateEvent {
    if (target === this.start) return 'none';
    this.start = target;
    this.tripped = false;
    return 'detent';
  }

  stepStart(direction: -1 | 1): PlateEvent {
    const next = STARTS[STARTS.indexOf(this.start) + direction];
    return next ? this.setStart(next) : 'none';
  }

  setCue(target: CueDetent): PlateEvent {
    if (target === this.cue) return 'none';
    this.cue = target;
    return 'detent';
  }

  /** What Play needs: a speed, the start plate off centre (START unless M was chosen), no trip. */
  readyToPlay(): PlateEvent {
    let event: PlateEvent = 'none';
    if (this.speed === 'off')
      event = this.setSpeed(this.lastSpeed === '78' && !this.unlocked ? '45' : this.lastSpeed);
    if (this.start === 'centre') event = this.setStart('start');
    this.tripped = false;
    return event;
  }

  /** The end stop fired: only meaningful in START. */
  trip(): boolean {
    if (this.start !== 'start' || !this.motorOn) return false;
    this.tripped = true;
    return true;
  }

  /** Detent index → offset along the strip in metres, centred on the plate's rest position. */
  static offset(detents: readonly string[], value: string, pitch: number): number {
    const centre = (detents.length - 1) / 2;
    return (detents.indexOf(value) - centre) * pitch;
  }

  toState(): PlatesState {
    const { speed, start, cue, lastSpeed, unlockLatched, tripped } = this;
    return { speed, start, cue, lastSpeed, unlockLatched, tripped };
  }
}
