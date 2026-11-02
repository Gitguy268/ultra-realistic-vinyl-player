export interface TonearmGeometry {
  size: number;
  centerX: number;
  centerY: number;
  recordRadius: number;
  pivotX: number;
  pivotY: number;
  armLength: number;
  /** Distance from the pivot to the spindle. */
  pivotDistance: number;
  /** Canvas direction (radians) from the pivot toward the spindle. */
  baseAngle: number;
  outerRadius: number;
  innerRadius: number;
  /** Arm angles are measured at the pivot, away from the pivot→spindle line. */
  outerAngle: number;
  innerAngle: number;
  restAngle: number;
}

export interface Point {
  x: number;
  y: number;
}

const REST_RADIUS_FACTOR = 1.3;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function angleForRadiusRaw(armLength: number, pivotDistance: number, radius: number): number {
  const cos =
    (armLength * armLength + pivotDistance * pivotDistance - radius * radius) /
    (2 * armLength * pivotDistance);
  return Math.acos(clamp(cos, -1, 1));
}

export function createGeometry(size: number): TonearmGeometry {
  if (!(size > 0)) throw new RangeError('size must be positive');
  const centerX = 0.44 * size;
  const centerY = 0.54 * size;
  const recordRadius = 0.39 * size;
  const pivotX = 0.8 * size;
  const pivotY = 0.24 * size;
  const armLength = 0.56 * size;
  const pivotDistance = Math.hypot(centerX - pivotX, centerY - pivotY);
  const outerRadius = 0.86 * recordRadius;
  const innerRadius = 0.4 * recordRadius;
  return {
    size,
    centerX,
    centerY,
    recordRadius,
    pivotX,
    pivotY,
    armLength,
    pivotDistance,
    baseAngle: Math.atan2(centerY - pivotY, centerX - pivotX),
    outerRadius,
    innerRadius,
    outerAngle: angleForRadiusRaw(armLength, pivotDistance, outerRadius),
    innerAngle: angleForRadiusRaw(armLength, pivotDistance, innerRadius),
    restAngle: angleForRadiusRaw(armLength, pivotDistance, REST_RADIUS_FACTOR * recordRadius),
  };
}

/** Distance from the spindle to the stylus for an arm angle (cosine law). */
export function stylusRadius(geometry: TonearmGeometry, angle: number): number {
  const { armLength: l, pivotDistance: d } = geometry;
  return Math.sqrt(Math.max(0, l * l + d * d - 2 * l * d * Math.cos(angle)));
}

/** Arm angle that puts the stylus at `radius` from the spindle, clamped to reachable angles. */
export function angleForRadius(geometry: TonearmGeometry, radius: number): number {
  return angleForRadiusRaw(geometry.armLength, geometry.pivotDistance, radius);
}

/** Arm angle for a track position 0 (lead-in) to 1 (run-out). */
export function angleForTrackPosition(geometry: TonearmGeometry, position: number): number {
  const p = clamp(position, 0, 1);
  const radius = geometry.outerRadius - p * (geometry.outerRadius - geometry.innerRadius);
  return angleForRadius(geometry, radius);
}

/** Track position 0..1 for an arm angle, clamped to the grooved area. */
export function trackPositionForAngle(geometry: TonearmGeometry, angle: number): number {
  const radius = stylusRadius(geometry, angle);
  return clamp(
    (geometry.outerRadius - radius) / (geometry.outerRadius - geometry.innerRadius),
    0,
    1,
  );
}

export function isOverGrooves(geometry: TonearmGeometry, angle: number): boolean {
  const radius = stylusRadius(geometry, angle);
  return radius <= geometry.outerRadius && radius >= geometry.innerRadius;
}

/** Canvas coordinates of the stylus tip. The arm swings clockwise from the base line. */
export function stylusPoint(geometry: TonearmGeometry, angle: number): Point {
  const direction = geometry.baseAngle - angle;
  return {
    x: geometry.pivotX + geometry.armLength * Math.cos(direction),
    y: geometry.pivotY + geometry.armLength * Math.sin(direction),
  };
}

/** Arm angle that points the arm at a canvas point, clamped between spindle side and rest. */
export function angleForPoint(geometry: TonearmGeometry, point: Point): number {
  const direction = Math.atan2(point.y - geometry.pivotY, point.x - geometry.pivotX);
  let angle = geometry.baseAngle - direction;
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return clamp(angle, geometry.innerAngle, geometry.restAngle);
}

export type CueState = 'rest' | 'dragging' | 'lifted' | 'playing' | 'returning';

export const RETURN_DURATION_S = 2.2;

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}

/** State machine for the tonearm, cue lever and automatic return. */
export class CueMechanism {
  state: CueState = 'rest';
  angle: number;
  leverLifted = false;
  private readonly restAngle: number;
  private returnFrom = 0;
  private returnProgress = 0;

  constructor(restAngle: number) {
    this.restAngle = restAngle;
    this.angle = restAngle;
  }

  get needleDown(): boolean {
    return this.state === 'playing';
  }

  beginDrag(): boolean {
    if (this.state === 'returning' || this.state === 'dragging') return false;
    this.state = 'dragging';
    return true;
  }

  drag(angle: number): void {
    if (this.state === 'dragging') this.angle = angle;
  }

  /** Ends a drag. Returns true when the needle dropped into the groove. */
  endDrag(overRecord: boolean): boolean {
    if (this.state !== 'dragging') return false;
    if (!overRecord) {
      this.toRest();
      return false;
    }
    this.state = this.leverLifted ? 'lifted' : 'playing';
    return this.state === 'playing';
  }

  /** Moves the cue lever. Returns true when lowering it dropped the needle. */
  setLeverLifted(lifted: boolean, overRecord: boolean): boolean {
    if (this.state === 'returning') return false;
    this.leverLifted = lifted;
    if (lifted) {
      if (this.state === 'playing') this.state = 'lifted';
      return false;
    }
    if (this.state !== 'lifted') return false;
    if (!overRecord) {
      this.toRest();
      return false;
    }
    this.state = 'playing';
    return true;
  }

  /** Lowers the lever and puts the needle down at `angle`. Returns true on success. */
  drop(angle: number): boolean {
    if (this.state !== 'rest' && this.state !== 'lifted') return false;
    this.leverLifted = false;
    this.angle = angle;
    this.state = 'playing';
    return true;
  }

  /**
   * Keyboard cueing: with the lever up, holds the arm over the record at `angle`.
   * Returns false when the lever is down or the arm is busy.
   */
  hoverAt(angle: number): boolean {
    if (!this.leverLifted || (this.state !== 'rest' && this.state !== 'lifted')) return false;
    this.state = 'lifted';
    this.angle = angle;
    return true;
  }

  /** Swings a hovering arm back to its rest. */
  park(): void {
    if (this.state === 'lifted') this.toRest();
  }

  setPlayingAngle(angle: number): void {
    if (this.state === 'playing') this.angle = angle;
  }

  /** The side ran out: lift and start the automatic return. */
  sideEnded(): void {
    if (this.state !== 'playing') return;
    this.state = 'returning';
    this.returnFrom = this.angle;
    this.returnProgress = 0;
  }

  /** Advances the return sweep. Returns true exactly once, when the arm reaches rest. */
  tickReturn(dt: number, restAngle: number): boolean {
    if (this.state !== 'returning') return false;
    this.returnProgress = Math.min(1, this.returnProgress + Math.max(0, dt) / RETURN_DURATION_S);
    this.angle = this.returnFrom + (restAngle - this.returnFrom) * easeInOut(this.returnProgress);
    if (this.returnProgress < 1) return false;
    this.toRest();
    return true;
  }

  private toRest(): void {
    this.state = 'rest';
    this.angle = this.restAngle;
  }
}
