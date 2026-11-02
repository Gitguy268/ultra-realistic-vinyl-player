import { Vector3, type PerspectiveCamera } from 'three';
import { DECK_SPEC } from '../spec/deck';

/**
 * The camera: a slow, deliberate orbit around a target on the deck. Drag orbits, the wheel or a
 * pinch dollies, a double-click reframes, Focus returns to the control view. It never leaves the
 * room: the azimuth stays in front of the back wall, the polar angle above the credenza, and the
 * position inside the room's bounds. The intro and the tour are timed moves between stops.
 */

export interface Stop {
  focal: number;
  position: readonly number[];
  target: readonly number[];
  dof?: boolean;
}

const L = DECK_SPEC.camera.limits;
const ROOM = DECK_SPEC.room;
const DEG = Math.PI / 180;
/** Never closer than this to a wall, the ceiling or the floor. */
const WALL_MARGIN = 0.08;
/** Azimuth limits, measured from +Z (straight in front of the deck). */
const MAX_AZIMUTH = 82 * DEG;

interface Pose {
  target: Vector3;
  radius: number;
  azimuth: number;
  polar: number;
  focal: number;
}

const smooth = (u: number): number => u * u * (3 - 2 * u);

function poseOf(stop: Stop): Pose {
  const target = new Vector3().fromArray(stop.target as number[]);
  const offset = new Vector3().fromArray(stop.position as number[]).sub(target);
  const radius = offset.length();
  return {
    target,
    radius,
    azimuth: Math.atan2(offset.x, offset.z),
    polar: Math.acos(Math.min(1, Math.max(-1, offset.y / radius))),
    focal: stop.focal,
  };
}

function lerpPose(a: Pose, b: Pose, u: number, out: Pose): Pose {
  out.target.lerpVectors(a.target, b.target, u);
  out.radius = a.radius + (b.radius - a.radius) * u;
  out.azimuth = a.azimuth + (b.azimuth - a.azimuth) * u;
  out.polar = a.polar + (b.polar - a.polar) * u;
  out.focal = a.focal + (b.focal - a.focal) * u;
  return out;
}

export class CameraRig {
  private readonly current: Pose;
  private readonly goal: Pose;
  private move: {
    from: Pose;
    to: Pose;
    t: number;
    duration: number;
    keys?: { t: number; pose: Pose }[];
  } | null = null;
  /** Depth of field for macro stops. */
  dof = false;
  /** prefers-reduced-motion: no intro, no drift, moves snap. */
  calm = false;
  /** Where the camera rests: the intro ends there and a double-click returns there. */
  home: Stop = DECK_SPEC.camera.hero;
  /** The intro is playing; a gesture skips it. */
  introPlaying = false;
  private readonly scratch = new Vector3();

  constructor(
    private readonly camera: PerspectiveCamera,
    start: Stop = DECK_SPEC.camera.hero,
  ) {
    camera.filmGauge = DECK_SPEC.camera.filmGauge;
    this.current = poseOf(start);
    this.goal = poseOf(start);
    this.apply();
  }

  /** Glides to a stop over `seconds` (or at once when calm). */
  goTo(stop: Stop, seconds = 1.6): void {
    this.dof = !!stop.dof;
    const to = poseOf(stop);
    this.clamp(to);
    if (this.calm || seconds <= 0) {
      Object.assign(this.goal, to);
      this.goal.target = to.target.clone();
      Object.assign(this.current, to);
      this.current.target = to.target.clone();
      this.move = null;
      this.apply();
      return;
    }
    this.move = { from: this.copy(this.current), to, t: 0, duration: seconds };
  }

  /** The opening move: keyframes from the spec, once per session, skippable. */
  playIntro(): void {
    const intro = DECK_SPEC.camera.intro;
    if (this.calm) {
      this.goTo(this.home, 0);
      return;
    }
    // The last keyframe is wherever the camera rests on this screen.
    const keys = intro.keyframes.map((k, i, all) => ({
      t: k.t,
      pose: poseOf(i === all.length - 1 ? this.home : k),
    }));
    const first = keys[0]!.pose;
    Object.assign(this.current, this.copy(first));
    this.move = {
      from: this.copy(first),
      to: this.copy(keys.at(-1)!.pose),
      t: 0,
      duration: intro.durationS,
      keys,
    };
    this.introPlaying = true;
    this.dof = false;
  }

  skipIntro(): void {
    if (!this.introPlaying || !this.move) return;
    this.introPlaying = false;
    this.goTo(this.home, 0.8);
  }

  /** Drag: pixels of pointer travel turn the view. */
  orbit(dx: number, dy: number): void {
    this.endMove();
    this.goal.azimuth -= dx * 0.005;
    this.goal.polar -= dy * 0.004;
    this.clamp(this.goal);
  }

  /** Wheel or pinch: a factor above 1 moves away. */
  dolly(factor: number): void {
    this.endMove();
    this.goal.radius *= factor;
    this.clamp(this.goal);
  }

  private endMove(): void {
    if (!this.move) return;
    Object.assign(this.goal, this.copy(this.current));
    this.move = null;
    this.introPlaying = false;
  }

  /** Keeps a pose inside the limits and the room. */
  private clamp(p: Pose): void {
    p.radius = Math.min(L.maxDistance, Math.max(L.minDistance, p.radius));
    p.polar = Math.min(L.maxPolarDeg * DEG, Math.max(L.minPolarDeg * DEG, p.polar));
    p.azimuth = Math.min(MAX_AZIMUTH, Math.max(-MAX_AZIMUTH, p.azimuth));
    // Shorten the radius until the eye is inside the room.
    for (let i = 0; i < 40 && !this.inside(this.positionOf(p, this.scratch)); i++) p.radius *= 0.95;
  }

  private inside(v: Vector3): boolean {
    const b = ROOM.bounds;
    const floor = -ROOM.credenza.height;
    return (
      v.x > b.left + WALL_MARGIN &&
      v.x < b.right - WALL_MARGIN &&
      v.z > ROOM.wallZ + WALL_MARGIN &&
      v.z < b.front - WALL_MARGIN &&
      v.y > floor + WALL_MARGIN &&
      v.y < b.ceiling - WALL_MARGIN
    );
  }

  private positionOf(p: Pose, out: Vector3): Vector3 {
    const s = Math.sin(p.polar);
    return out.set(
      p.target.x + p.radius * s * Math.sin(p.azimuth),
      p.target.y + p.radius * Math.cos(p.polar),
      p.target.z + p.radius * s * Math.cos(p.azimuth),
    );
  }

  private copy(p: Pose): Pose {
    return { ...p, target: p.target.clone() };
  }

  /** Is the camera position inside the room? (for check-camera) */
  get insideRoom(): boolean {
    return this.inside(this.camera.position);
  }

  update(dt: number): void {
    if (this.move) {
      const m = this.move;
      m.t += dt;
      const u = Math.min(1, m.t / m.duration);
      if (m.keys) {
        const k = m.keys.findIndex((key) => key.t >= u);
        const b = m.keys[Math.max(1, k)]!;
        const a = m.keys[Math.max(0, Math.max(1, k) - 1)]!;
        lerpPose(a.pose, b.pose, smooth((u - a.t) / Math.max(1e-6, b.t - a.t)), this.current);
      } else lerpPose(m.from, m.to, smooth(u), this.current);
      if (u >= 1) {
        Object.assign(this.goal, this.copy(this.current));
        this.move = null;
        this.introPlaying = false;
      }
    } else {
      const k = this.calm ? 1 : 1 - Math.exp(-dt / 0.12);
      const c = this.current;
      const g = this.goal;
      c.target.lerp(g.target, k);
      c.radius += (g.radius - c.radius) * k;
      c.azimuth += (g.azimuth - c.azimuth) * k;
      c.polar += (g.polar - c.polar) * k;
      c.focal += (g.focal - c.focal) * k;
    }
    this.apply();
  }

  private apply(): void {
    const c = this.current;
    // The eased path between two valid poses can swing past a wall: pull the eye in.
    for (let i = 0; i < 40 && !this.inside(this.positionOf(c, this.scratch)); i++) c.radius *= 0.95;
    this.positionOf(c, this.camera.position);
    this.camera.setFocalLength(c.focal);
    this.camera.lookAt(c.target);
    this.camera.updateMatrixWorld();
  }

  /** Distance from the eye to what it looks at, for depth of field. */
  get focusDistance(): number {
    return this.current.radius;
  }
}
