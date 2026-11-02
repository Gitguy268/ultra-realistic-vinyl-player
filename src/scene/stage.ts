import {
  Plane,
  Raycaster,
  Vector2,
  Vector3,
  type MeshStandardMaterial,
  type Object3D,
} from 'three';
import { CoverHinge } from '../core/cover';
import { Plates } from '../core/plates';
import { recordGeometry } from '../core/program';
import { hash, rng } from '../core/random';
import type { Deck } from '../deck';
import { DECK_SPEC } from '../spec/deck';
import { CameraRig } from './camera';
import { RECORD_SURFACE, setSlots, slotCount } from './deck/build';
import { poseArm } from './deck/pose';
import { LabelPainter, type LabelContent } from './materials/label';
import { World } from './world';

/**
 * The page's 3D stage: the World, posed every frame from the deck's state, with the camera rig,
 * pointer picking and the record label. It owns no deck state (DECISIONS.md, Deck state); every
 * pick dispatches the same Deck action its DOM twin does.
 */

const DEG = Math.PI / 180;
/** With nothing moving for this long, frames are drawn only this often. */
/** Turning a record over (H14). */
const FLIP_S = 0.5;
const FLIP_LIFT = 0.16;
const GLOW_STRENGTH = 0.55;
const IDLE_AFTER_S = 1;
const IDLE_FRAME_S = 0.25;
/** Averaging under 24 fps for this long lowers the resolution one step. */
const SLOW_FRAME_S = 1 / 24;
const SLOW_FOR_S = 2;
const MIN_PIXEL_SCALE = 0.55;
/** Off-centre hole, in record radii (html-1). */
const ECCENTRIC = 0.0045;
// shortcut: a whole-record tilt stands in for a warp's undulation, and far under html-1's 0.9° sheen
// angle: at that tilt the rim would sink a millimetre into the mat. Upgrade with a displaced surface.
const WARP_DEG = 0.15;
const ARM_VIBRATION_DEG = 0.09;
const PL = DECK_SPEC.plates;
const T = DECK_SPEC.platter;

export type PickKind =
  | 'arm'
  | 'record'
  | 'speedPlate'
  | 'startPlate'
  | 'cuePlate'
  | 'unlockPin'
  | 'pitchWheel'
  | 'cover'
  | 'none';

export interface StageHooks {
  /** The pitch wheel turned to a percentage. */
  pitch(percent: number): void;
  /** Current pitch in percent, for the wheel's angle. */
  pitchPercent(): number;
  /** The visible pitch range in percent (6, or 8 with Extended pitch). */
  pitchRange(): number;
  /** The cover moved: the twin's pressed state and its sound. */
  cover(open: boolean, moved: 'opened' | 'closed' | 'none'): void;
  /** Mains frequency for the rim slots. */
  mainsHz(): 50 | 60;
}

export class Stage {
  readonly world: World;
  readonly rig: CameraRig;
  readonly cover = new CoverHinge();
  readonly label = new LabelPainter();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly plane = new Plane(new Vector3(0, 1, 0), -RECORD_SURFACE);
  private readonly hit = new Vector3();
  private recordVersion = -1;
  private slots = 0;
  private plateX = { speed: 0, start: 0, cue: 0 };
  private shadowA = NaN;
  private shadowB = NaN;
  private shadowC = NaN;
  private lastMotion = NaN;
  private side = -1;
  private restoredVersion = 0;
  private flipLeft = 0;
  private pointerX = 0;
  private pointerY = 0;
  private leanX = 0;
  private leanY = 0;
  private stillFor = 0;
  private sinceDrawn = 0;
  private frameCost = 0;
  private slowFor = 0;
  private pixelScale = 1;
  private readonly lastSize = { width: 1, height: 1, ratio: 1 };
  private drag: {
    kind: PickKind;
    id: number;
    x: number;
    y: number;
    moved: number;
    start: number;
  } | null = null;
  private pinch: { a: number; b: number; distance: number } | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly deck: Deck,
    private readonly hooks: StageHooks,
  ) {
    this.world = new World(canvas);
    this.rig = new CameraRig(this.world.camera);
    const labelMaterial = this.world.materials.label as MeshStandardMaterial;
    labelMaterial.map = this.label.texture;
    labelMaterial.color.set('#ffffff');
    labelMaterial.needsUpdate = true;
    this.bindPointer();
  }

  /** A track's measured loudness, or a contour seeded by its id until it is decoded (html-1). */
  private loudness = (idx: number, f: number): number => {
    const measured = this.deck.levelAt(idx, f);
    if (measured !== undefined) return measured;
    const r = rng(hash(`track${this.deck.idAt(idx)}`));
    const c = Array.from({ length: 28 }, () => 0.35 + 0.65 * r());
    const x = f * (c.length - 1);
    const i = Math.floor(x);
    return (c[i] ?? 0.5) * (1 - (x - i)) + (c[Math.min(c.length - 1, i + 1)] ?? 0.5) * (x - i);
  };

  /** Poses every moving part from the deck and renders a frame. */
  frame(dt: number, time: number, label: LabelContent, live: HTMLCanvasElement | null): void {
    const { deck, world } = this;
    const parts = world.deck;
    const spin = deck.spin;
    // The record: grooves redrawn when the program changes.
    if (deck.recordVersion !== this.recordVersion) {
      this.recordVersion = deck.recordVersion;
      const p = deck.program;
      world.setRecordFace(p, this.loudness, deck.wearMap);
      const scale = recordGeometry(deck.recordSize).scale;
      parts.record.scale.set(scale, 1, scale);
    }
    parts.platter.rotation.y = -spin.angP * DEG;
    parts.record.visible = deck.hasRecord;
    const turned = (spin.angR - spin.angP) * DEG;
    parts.record.rotation.y = -turned;
    // An off-centre pressing wobbles once per turn, and a slight warp makes the light flicker
    // with it. Only the record's own frame moves: the stylus still reads the true groove.
    const imperfection = this.rig.calm ? 0 : deck.imperfection;
    const offset = imperfection * ECCENTRIC * recordGeometry(deck.recordSize).radius;
    parts.record.position.x = offset * Math.cos(turned);
    parts.record.position.z = offset * Math.sin(turned);
    const warp = imperfection * WARP_DEG * DEG;
    parts.record.rotation.x = warp * Math.sin(spin.angR * DEG);
    parts.record.rotation.z = warp * Math.cos(spin.angR * DEG);
    // Turned over by hand: lifted clear of the mat, half a turn, and down on the other side.
    const side = deck.program.side;
    if (deck.restoredVersion !== this.restoredVersion) {
      this.restoredVersion = deck.restoredVersion;
      this.side = side;
      this.flipLeft = 0;
    }
    if (side !== this.side) {
      if (this.side >= 0 && !this.rig.calm) this.flipLeft = FLIP_S;
      this.side = side;
    }
    const flipping = this.flipLeft > 0;
    this.flipLeft = Math.max(0, this.flipLeft - dt);
    const flip = flipping ? 1 - this.flipLeft / FLIP_S : 0;
    parts.record.rotation.z += flip * Math.PI;
    parts.record.position.y = this.recordY + Math.sin(flip * Math.PI) * FLIP_LIFT;
    parts.adapter.visible = deck.recordSize === 'single';
    // The bass lights the grooves round the label; under reduced motion the glow is held.
    const glow = parts.labelGlow;
    const level = this.rig.calm ? 0.3 * Number(deck.engine.playing) : deck.glowLevel;
    glow.visible = level > 0.01;
    world.materials.glow.opacity = level * GLOW_STRENGTH;
    world.materials.glow.color.set(label.colour || '#ffffff');
    // The lamp's highlight leans a little toward the pointer (X30).
    const lean = this.rig.calm ? 0 : 1 - Math.exp(-dt / 0.25);
    this.leanX += (this.pointerX - this.leanX) * lean;
    this.leanY += (this.pointerY - this.leanY) * lean;
    world.lighting.lean(this.leanX, this.leanY);
    // The strobe neon: slots glow, and under its flicker they stand where the strobe puts them.
    const lit = deck.plates.motorOn;
    const neon = world.materials.neon;
    neon.emissiveIntensity = lit ? 2.2 : 0;
    const mains = this.hooks.mainsHz();
    if (slotCount(mains) !== this.slots) {
      this.slots = slotCount(mains);
      setSlots(parts.slots, this.slots);
    }
    parts.slots.rotation.y = lit ? -(spin.strobe - spin.angP) * DEG : 0;
    // Arm, cue lever.
    const arm = deck.arm;
    // The bass shakes the stylus a hair, and the locked groove bobs it (html-1).
    const shake =
      arm.mode === 'groove' && !this.rig.calm
        ? ((Math.random() - 0.5) * ARM_VIBRATION_DEG * deck.glowLevel ** 2 - 0.12 * arm.bob) * DEG
        : 0;
    poseArm(parts, arm.direction + shake, Math.max(0, arm.lift + 0.16 * arm.bob));
    parts.cueLever.rotation.x = -Math.min(1, arm.lift) * 0.35;
    // Plates glide between detents.
    const k = this.rig.calm ? 1 : 1 - Math.exp(-dt / 0.05);
    const plates = deck.plates;
    this.plateX.speed +=
      (Plates.offset(PL.speed.detents, plates.speed, PL.speed.detentPitch) - this.plateX.speed) * k;
    this.plateX.start +=
      (Plates.offset(PL.start.detents, plates.start, PL.start.detentPitch) - this.plateX.start) * k;
    this.plateX.cue +=
      (Plates.offset(PL.cue.detents, plates.cue, PL.cue.detentPitch) - this.plateX.cue) * k;
    parts.speedPlate.position.x = (parts.speedPlate.userData.baseX as number) + this.plateX.speed;
    parts.startPlate.position.x = (parts.startPlate.userData.baseX as number) + this.plateX.start;
    parts.cuePlate.position.x = (parts.cuePlate.userData.baseX as number) + this.plateX.cue;
    parts.unlockPin.position.y = plates.unlocked ? -PL.unlockPin.depth : 0;
    parts.pitchWheel.rotation.y =
      -(this.hooks.pitchPercent() / this.hooks.pitchRange()) * (PL.pitchWheel.sweepDeg / 2) * DEG;
    // Cover.
    const moved = this.rig.calm ? this.cover.snap() : this.cover.step(dt);
    if (moved !== 'none') this.hooks.cover(!this.cover.closed, moved);
    parts.cover.rotation.x = -this.cover.angle * DEG;
    // Label.
    label.hole = recordGeometry(deck.recordSize).hole / recordGeometry(deck.recordSize).label;
    this.label.paint(label);
    this.label.showLive(live, -parts.record.rotation.y - parts.platter.rotation.y);
    // Shadows follow the parts that move them.
    const shadowA = Math.round(arm.direction * 1000);
    const shadowB = Math.round(arm.lift * 100);
    const shadowC = Math.round(this.cover.angle * 10);
    if (shadowA !== this.shadowA || shadowB !== this.shadowB || shadowC !== this.shadowC) {
      this.shadowA = shadowA;
      this.shadowB = shadowB;
      this.shadowC = shadowC;
      world.markShadowsDirty();
    }
    this.rig.update(dt);
    world.postSettings.dofAperture = this.rig.dof ? 2.4 : 0;
    world.postSettings.focusDistance = this.rig.focusDistance;
    // Nothing moving: a still image only needs its grain refreshed now and then.
    const c = world.camera;
    const motion =
      spin.angP +
      spin.angR +
      spin.strobe +
      arm.direction * 1e3 +
      arm.lift * 1e2 +
      arm.bob * 1e2 +
      this.cover.angle +
      this.flipLeft * 1e3 +
      this.leanX * 1e4 +
      this.leanY * 1e4 +
      (this.plateX.speed + this.plateX.start + this.plateX.cue) * 1e4 +
      c.position.x * 1e4 +
      c.position.y * 1e4 +
      c.position.z * 1e4 +
      c.quaternion.x * 1e4 +
      c.quaternion.y * 1e4 +
      c.fov;
    const still =
      motion === this.lastMotion && live === null && !world.shadowsPending && !this.drag;
    this.lastMotion = motion;
    this.stillFor = still ? this.stillFor + dt : 0;
    this.sinceDrawn += dt;
    if (this.stillFor > IDLE_AFTER_S && this.sinceDrawn < IDLE_FRAME_S) return;
    this.adapt(this.sinceDrawn);
    this.sinceDrawn = 0;
    world.render(time);
  }

  /** Where the record rests on the mat. */
  private get recordY(): number {
    return T.rimDepth + DECK_SPEC.mat.thickness;
  }

  get flipping(): boolean {
    return this.flipLeft > 0;
  }

  /** Sustained slow frames: draw fewer pixels rather than drop frames. It never climbs back. */
  private adapt(dt: number): void {
    if (this.stillFor > IDLE_AFTER_S || dt <= 0 || dt >= 0.25) return;
    this.frameCost += (dt - this.frameCost) * 0.05;
    if (this.frameCost < SLOW_FRAME_S || this.pixelScale <= MIN_PIXEL_SCALE) {
      this.slowFor = 0;
      return;
    }
    this.slowFor += dt;
    if (this.slowFor < SLOW_FOR_S) return;
    this.slowFor = 0;
    this.frameCost = 0;
    this.pixelScale = Math.max(MIN_PIXEL_SCALE, this.pixelScale - 0.15);
    this.world.resize(
      this.lastSize.width,
      this.lastSize.height,
      this.lastSize.ratio * this.pixelScale,
    );
  }

  /**
   * `free` is the rectangle of the canvas no panel covers, in CSS px from its top left. The camera's principal point moves
   * to its centre, so the deck is framed in the open part of the page at any size.
   */
  resize(
    width: number,
    height: number,
    pixelRatio: number,
    free?: { left: number; top: number; right: number; bottom: number },
  ): void {
    this.lastSize.width = width;
    this.lastSize.height = height;
    this.lastSize.ratio = pixelRatio;
    this.world.resize(width, height, pixelRatio * this.pixelScale);
    const camera = this.world.camera;
    if (free) {
      // Look through a window shifted so the open rectangle's centre is the image centre.
      const dx = width / 2 - (free.left + free.right) / 2;
      const dy = height / 2 - (free.top + free.bottom) / 2;
      camera.setViewOffset(width, height, dx, dy, width, height);
    } else camera.clearViewOffset();
  }

  // ─── Picking ─────────────────────────────────────────────────────

  /** What lies under a canvas point: the nearest named control. */
  pick(clientX: number, clientY: number): { kind: PickKind; point: Vector3 | null } {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.world.camera);
    const hits = this.raycaster.intersectObject(this.world.deck.root, true);
    for (const h of hits) {
      if (!h.object.visible && !h.object.userData.pickable) continue;
      const kind = this.kindOf(h.object);
      // The open cover is glass: what is behind it stays pickable unless the cover is the target.
      if (
        kind === 'cover' &&
        !this.cover.closed &&
        hits.some((o) => this.kindOf(o.object) !== 'cover' && this.kindOf(o.object) !== 'none')
      )
        continue;
      if (kind !== 'none') return { kind, point: h.point };
    }
    return { kind: 'none', point: null };
  }

  private kindOf(o: Object3D | null): PickKind {
    for (let n = o; n; n = n.parent) {
      switch (n.name) {
        case 'armYaw':
          return 'arm';
        case 'record':
          return 'record';
        case 'speedPlate':
        case 'startPlate':
        case 'cuePlate':
        case 'unlockPin':
        case 'pitchWheel':
        case 'cover':
          return n.name;
      }
    }
    return 'none';
  }

  /** The pointer's ray on the record's plane. */
  private onRecordPlane(clientX: number, clientY: number): Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.world.camera);
    return this.raycaster.ray.intersectPlane(this.plane, this.hit);
  }

  /** Plan direction from the arm pivot to the pointer, for dragging the arm. */
  private armDirection(clientX: number, clientY: number): number | null {
    const p = this.onRecordPlane(clientX, clientY);
    if (!p) return null;
    return Math.atan2(p.z - DECK_SPEC.tonearm.pivotZ, p.x - DECK_SPEC.tonearm.pivotX);
  }

  /** Angle of the pointer round the spindle in degrees, clockwise seen from above. */
  private spindleAngle(clientX: number, clientY: number): number | null {
    const p = this.onRecordPlane(clientX, clientY);
    if (!p) return null;
    return (Math.atan2(p.z - T.centreZ, p.x - T.centreX) * 180) / Math.PI;
  }

  private bindPointer(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.rig.skipIntro();
      // Pressing the scene leaves any text field, or the keyboard shortcuts would stay off. The
      // preventDefault below keeps the browser from doing it.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.entries()];
        this.pinch = {
          a: a![0],
          b: b![0],
          distance: Math.hypot(a![1].x - b![1].x, a![1].y - b![1].y),
        };
        this.cancelDrag();
        return;
      }
      const { kind } = this.pick(e.clientX, e.clientY);
      let grabbed = true;
      if (kind === 'arm') grabbed = this.deck.beginDrag();
      else if (kind === 'record') {
        const angle = this.spindleAngle(e.clientX, e.clientY);
        grabbed = angle !== null && this.deck.beginScratch(angle);
      } else if (kind === 'unlockPin') this.deck.plates.unlockHeld = true;
      this.drag = {
        kind: grabbed ? kind : 'none',
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        moved: 0,
        start: performance.now(),
      };
      c.setPointerCapture(e.pointerId);
      c.classList.add('is-grabbing');
      e.preventDefault();
    });
    c.addEventListener('pointermove', (e) => {
      if (this.pointers.has(e.pointerId))
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch) {
        const a = this.pointers.get(this.pinch.a);
        const b = this.pointers.get(this.pinch.b);
        if (a && b) {
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > 0) this.rig.dolly(this.pinch.distance / d);
          this.pinch.distance = d;
        }
        return;
      }
      const drag = this.drag;
      if (!drag || drag.id !== e.pointerId) {
        this.hover(e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX;
      drag.y = e.clientY;
      switch (drag.kind) {
        case 'arm': {
          const d = this.armDirection(e.clientX, e.clientY);
          if (d !== null) this.deck.dragTo(d);
          break;
        }
        case 'record': {
          const a = this.spindleAngle(e.clientX, e.clientY);
          if (a !== null) this.deck.scratchTo(a);
          break;
        }
        case 'pitchWheel': {
          const range = this.hooks.pitchRange();
          this.hooks.pitch(this.hooks.pitchPercent() + (dx - dy) * 0.02 * (range / 6));
          break;
        }
        case 'cover':
          this.cover.grab(this.cover.angle - dy * 0.35);
          break;
        case 'none':
          this.rig.orbit(dx, dy);
          break;
      }
    });
    const end = (e: PointerEvent): void => {
      this.pointers.delete(e.pointerId);
      if (this.pinch && (e.pointerId === this.pinch.a || e.pointerId === this.pinch.b)) {
        this.pinch = null;
        return;
      }
      const drag = this.drag;
      if (!drag || drag.id !== e.pointerId) return;
      this.drag = null;
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      c.classList.remove('is-grabbing');
      const click = drag.moved < 6;
      switch (drag.kind) {
        case 'arm':
          // A click on the arm is the cue (html-1's tonearm click); a drag moves it.
          if (click) this.deck.clickArm();
          else this.deck.endDrag();
          break;
        case 'record':
          this.deck.endScratch();
          break;
        case 'unlockPin':
          this.deck.plates.unlockHeld = false;
          // A click latches the pin until the next click.
          if (click) this.deck.plates.unlockLatched = !this.deck.plates.unlockLatched;
          break;
        case 'speedPlate':
        case 'startPlate':
        case 'cuePlate':
          this.slidePlate(drag.kind, e.clientX);
          break;
        case 'cover':
          if (click) this.cover.toggle();
          else this.cover.release();
          break;
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener(
      'wheel',
      (e) => {
        // The page itself does not scroll (panels scroll inside themselves), so the wheel over
        // the scene only ever dollies it.
        e.preventDefault();
        this.rig.skipIntro();
        this.rig.dolly(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false },
    );
    c.addEventListener('dblclick', (e) => {
      if (this.pick(e.clientX, e.clientY).kind !== 'none') return;
      this.rig.goTo(this.rig.home);
    });
  }

  /** A plate was clicked or slid: one detent toward the side of the plate the pointer is on. */
  private slidePlate(kind: 'speedPlate' | 'startPlate' | 'cuePlate', clientX: number): void {
    const plate = this.world.deck[kind];
    const centre = this.world.project(plate.getWorldPosition(new Vector3()))[0];
    const direction: -1 | 1 = clientX < centre ? -1 : 1;
    if (kind === 'speedPlate') this.deck.stepSpeed(direction);
    else if (kind === 'startPlate') this.deck.stepStartPlate(direction);
    else this.deck.toggleLever();
  }

  private cancelDrag(): void {
    if (!this.drag) return;
    if (this.drag.kind === 'arm') this.deck.endDrag();
    if (this.drag.kind === 'record') this.deck.endScratch();
    this.drag = null;
  }

  /** The cursor shows what a press would do. */
  private hover(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerX = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerY = ((clientY - rect.top) / rect.height) * 2 - 1;
    const { kind } = this.pick(clientX, clientY);
    this.canvas.dataset.hover = kind;
  }
}
