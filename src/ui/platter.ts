import { createGeometry, stylusPoint, type TonearmGeometry } from '../turntable/tonearm';

export interface PlatterSnapshot {
  revPerSec: number;
  /** Apparent strobe pattern velocity in radians per second. */
  strobeVelocity: number;
  strobeDots: number;
  lampOn: boolean;
  armAngle: number;
  /** True while the arm is off the record surface (dragged, lifted or returning). */
  armLifted: boolean;
  /** True while the pointer holds the arm, so it must track without smoothing. */
  armHeld: boolean;
  needleDown: boolean;
  /** Bass energy 0..1 for the glow ring around the label. */
  glow: number;
  title: string;
  speedLabel: string;
}

type Context = CanvasRenderingContext2D;
type Paint = string | CanvasGradient;

const TAU = Math.PI * 2;
const ARM_SMOOTHING_S = 0.09;
const LIFT_SMOOTHING_S = 0.12;
// Below these the eased values snap to their target, so a resting deck stops redrawing.
const ARM_SETTLED_RAD = 1e-4;
const LIFT_SETTLED = 1e-3;
const LABEL_FALLBACK = '#e0a43a';
const LABEL_RADIUS_FACTOR = 0.34;
// The label is drawn rotated from a bitmap; extra resolution keeps its text sharp.
const LABEL_OVERSAMPLE = 1.5;
// The glow is drawn in this many brightness steps, so tiny changes do not force a redraw.
const GLOW_STEPS = 32;
// Under reduced motion the ring does not pulse; it shows at this steady strength.
const STEADY_GLOW = 0.35;

function disc(ctx: Context, x: number, y: number, radius: number, fill: Paint): void {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

function sheen(ctx: Context, startAngle: number, strength: number): CanvasGradient {
  const gradient = ctx.createConicGradient(startAngle, 0, 0);
  const bright = `rgba(255,255,255,${strength})`;
  const clear = 'rgba(255,255,255,0)';
  gradient.addColorStop(0, bright);
  gradient.addColorStop(0.07, clear);
  gradient.addColorStop(0.43, clear);
  gradient.addColorStop(0.5, bright);
  gradient.addColorStop(0.57, clear);
  gradient.addColorStop(0.93, clear);
  gradient.addColorStop(1, bright);
  return gradient;
}

/** Fills the grooved band of the record, centred on the origin, with a sheen. */
function fillSheen(ctx: Context, recordRadius: number, startAngle: number, strength: number): void {
  const band = new Path2D();
  band.arc(0, 0, recordRadius, 0, TAU);
  band.arc(0, 0, LABEL_RADIUS_FACTOR * recordRadius, 0, TAU, true);
  ctx.fillStyle = sheen(ctx, startAngle, strength);
  ctx.fill(band);
}

function fit(ctx: Context, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end--;
  return `${text.slice(0, end)}…`;
}

/** Paints into an offscreen canvas of `width`×`height` CSS pixels at `scale` device pixels each. */
function layer(
  width: number,
  height: number,
  scale: number,
  paint: (ctx: Context) => void,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(scale, scale);
    paint(ctx);
  }
  return canvas;
}

/**
 * Draws the platter, record, strobe and tonearm onto a square canvas.
 *
 * Everything that does not change between frames (platter, grooves, sheen,
 * label) is painted once into offscreen layers and blitted, and a frame that
 * would look identical to the last one is not drawn at all.
 */
export class PlatterRenderer {
  reducedMotion = false;
  /** A live picture shown upright on the label in place of its print, or null. */
  labelSource: HTMLCanvasElement | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: Context;
  private geometryValue: TonearmGeometry = createGeometry(1);
  private size = 1;
  private dpr = 1;
  private rotation = 0;
  private strobeAngle = 0;
  private shownAngle: number | null = null;
  private lift = 0;
  private labelColor = LABEL_FALLBACK;
  private labelInk = '#1a1208';
  private accent = LABEL_FALLBACK;
  private plate = { base: '#47484b', lo: '#38393c', hi: '#5d5e62', texture: 'speckle' };
  private baseLayer: HTMLCanvasElement | null = null;
  private baseHasRecord = false;
  private sheenLayer: HTMLCanvasElement | null = null;
  private labelLayer: HTMLCanvasElement | null = null;
  private labelKey = '';
  private cover: ImageBitmap | null = null;
  private coverRequest = 0;
  private drawnKey = '';

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.canvas = canvas;
    this.ctx = ctx;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    // The label text is cached, so repaint it once the web font has arrived.
    void document.fonts.ready.then(() => this.invalidate());
  }

  /** Geometry in CSS pixels, for hit-testing pointer positions. */
  get geometry(): TonearmGeometry {
    return this.geometryValue;
  }

  /** Re-reads the label colours from the CSS custom properties. */
  refreshColors(): void {
    const style = getComputedStyle(this.canvas);
    this.labelColor = style.getPropertyValue('--label').trim() || LABEL_FALLBACK;
    this.labelInk = style.getPropertyValue('--label-ink').trim() || '#1a1208';
    const token = (name: string, fallback: string): string =>
      style.getPropertyValue(name).trim() || fallback;
    this.accent = token('--accent', LABEL_FALLBACK);
    this.plate = {
      base: token('--plate', this.plate.base),
      lo: token('--plate-lo', this.plate.lo),
      hi: token('--plate-hi', this.plate.hi),
      texture: token('--plate-texture', 'none'),
    };
    this.invalidate();
  }

  /** Prints cover art on the record label; pass undefined for the plain label. */
  async setCover(blob: Blob | undefined): Promise<void> {
    const request = ++this.coverRequest;
    const bitmap = blob ? await createImageBitmap(blob).catch(() => null) : null;
    if (request !== this.coverRequest) {
      // A newer cover was requested while this one was decoding.
      bitmap?.close();
      return;
    }
    this.cover?.close();
    this.cover = bitmap;
    this.invalidate();
  }

  resize(): void {
    const size = Math.max(1, Math.round(this.canvas.clientWidth));
    const dpr = window.devicePixelRatio || 1;
    this.size = size;
    this.dpr = dpr;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.geometryValue = createGeometry(size);
    this.refreshColors();
  }

  /** Drops the cached layers and forces the next frame to be drawn. */
  private invalidate(): void {
    this.baseLayer = null;
    this.sheenLayer = null;
    this.labelLayer = null;
    this.drawnKey = '';
  }

  update(dt: number, snapshot: PlatterSnapshot): void {
    if (!this.reducedMotion) {
      this.rotation = (this.rotation + snapshot.revPerSec * TAU * dt) % TAU;
      this.strobeAngle = (this.strobeAngle + snapshot.strobeVelocity * dt) % TAU;
    }
    const snap = this.reducedMotion || snapshot.armHeld || this.shownAngle === null;
    const blend = (seconds: number): number => (snap ? 1 : 1 - Math.exp(-dt / seconds));

    let angle = this.shownAngle ?? snapshot.armAngle;
    angle += (snapshot.armAngle - angle) * blend(ARM_SMOOTHING_S);
    if (Math.abs(snapshot.armAngle - angle) < ARM_SETTLED_RAD) angle = snapshot.armAngle;
    this.shownAngle = angle;

    const liftTarget = snapshot.armLifted ? 1 : 0;
    this.lift += (liftTarget - this.lift) * blend(LIFT_SMOOTHING_S);
    if (Math.abs(liftTarget - this.lift) < LIFT_SETTLED) this.lift = liftTarget;

    const glowTarget = this.reducedMotion ? (snapshot.needleDown ? STEADY_GLOW : 0) : snapshot.glow;
    const glow = Math.round(glowTarget * GLOW_STEPS) / GLOW_STEPS;

    const key = [
      this.rotation,
      this.strobeAngle,
      angle,
      this.lift,
      snapshot.needleDown,
      glow,
      snapshot.lampOn,
      snapshot.strobeDots,
      snapshot.speedLabel,
      snapshot.title,
      this.labelSource !== null,
    ].join('|');
    // A live label changes every frame.
    if (key === this.drawnKey && !this.labelSource) return;
    this.drawnKey = key;
    this.draw(snapshot, angle, glow);
  }

  private draw(snapshot: PlatterSnapshot, armAngle: number, glow: number): void {
    const { ctx, dpr } = this;
    const g = this.geometryValue;
    const r = g.recordRadius;
    const labelRadius = LABEL_RADIUS_FACTOR * r;

    // A record lies on the mat only once a track has been put on the platter. It does
    // not move on screen (only its sheen and label turn), so it is part of the base layer.
    const hasRecord = snapshot.title !== '';
    if (!this.baseLayer || hasRecord !== this.baseHasRecord) {
      this.baseHasRecord = hasRecord;
      this.baseLayer = layer(this.size, this.size, dpr, (c) => this.paintBase(c, hasRecord));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.baseLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawStrobe(snapshot);

    if (hasRecord) {
      this.sheenLayer ??= layer(2 * r, 2 * r, dpr, (c) => {
        c.translate(r, r);
        fillSheen(c, r, 0, 0.06);
      });
      const labelKey = `${snapshot.title}|${snapshot.speedLabel}`;
      if (!this.labelLayer || labelKey !== this.labelKey) {
        this.labelKey = labelKey;
        this.labelLayer = layer(2 * labelRadius, 2 * labelRadius, dpr * LABEL_OVERSAMPLE, (c) =>
          this.paintLabel(c, labelRadius, snapshot),
        );
      }
      if (glow > 0) {
        // Bass-reactive ring around the label, in the accent colour.
        const ring = ctx.createRadialGradient(
          g.centerX,
          g.centerY,
          labelRadius,
          g.centerX,
          g.centerY,
          labelRadius * 1.5,
        );
        ring.addColorStop(0, this.accent);
        ring.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.75 * glow;
        disc(ctx, g.centerX, g.centerY, labelRadius * 1.5, ring);
        ctx.globalAlpha = 1;
      }
      ctx.save();
      ctx.translate(g.centerX, g.centerY);
      ctx.rotate(this.rotation);
      ctx.drawImage(this.sheenLayer, -r, -r, 2 * r, 2 * r);
      ctx.drawImage(this.labelLayer, -labelRadius, -labelRadius, 2 * labelRadius, 2 * labelRadius);
      ctx.restore();
      if (this.labelSource) {
        // Not rotated: the record turns around it.
        const d = 2 * labelRadius;
        ctx.save();
        ctx.beginPath();
        ctx.arc(g.centerX, g.centerY, labelRadius, 0, TAU);
        ctx.clip();
        ctx.drawImage(this.labelSource, g.centerX - labelRadius, g.centerY - labelRadius, d, d);
        ctx.restore();
      }
    }
    const spindle = ctx.createRadialGradient(
      g.centerX - 0.004 * this.size,
      g.centerY - 0.004 * this.size,
      0,
      g.centerX,
      g.centerY,
      0.012 * this.size,
    );
    spindle.addColorStop(0, '#f2f2ee');
    spindle.addColorStop(1, '#7c7c79');
    disc(ctx, g.centerX, g.centerY, 0.012 * this.size, spindle);

    this.drawArm(armAngle, true, false);
    this.drawArm(armAngle, false, snapshot.needleDown);
    this.drawPivot();
  }

  /** Top plate, platter rim, rubber mat and the fixed parts of the tonearm. */
  private paintBase(ctx: Context, withRecord: boolean): void {
    const s = this.size;
    const g = this.geometryValue;
    const { centerX: cx, centerY: cy } = g;
    this.paintPlate(ctx);

    // Platter: a shadow, then the aluminium rim. The strobe slots are cut live.
    disc(ctx, cx + 0.004 * s, cy + 0.006 * s, 0.432 * s, 'rgba(0,0,0,0.45)');
    const rim = 0.426 * s;
    const metal = ctx.createLinearGradient(cx - rim, cy - rim, cx + rim, cy + rim);
    metal.addColorStop(0, '#e9e9e5');
    metal.addColorStop(0.45, '#9c9c98');
    metal.addColorStop(0.55, '#b9b9b5');
    metal.addColorStop(1, '#dededa');
    disc(ctx, cx, cy, rim, metal);

    // Rubber mat with raised concentric rings.
    const mat = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.402 * s);
    mat.addColorStop(0, '#1c1c1d');
    mat.addColorStop(1, '#121213');
    disc(ctx, cx, cy, 0.402 * s, mat);
    for (const factor of [0.372, 0.312, 0.248, 0.184, 0.118]) {
      const radius = factor * s;
      ctx.lineWidth = 0.011 * s;
      ctx.strokeStyle = 'rgba(255,255,255,0.055)';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 0.0065 * s, 0, TAU);
      ctx.stroke();
    }
    disc(ctx, cx, cy, 0.05 * s, '#0e0e0f');
    if (withRecord) this.paintRecord(ctx);

    // Tonearm base plate and armrest.
    ctx.fillStyle = '#19191b';
    ctx.beginPath();
    ctx.roundRect(g.pivotX - 0.085 * s, g.pivotY - 0.075 * s, 0.17 * s, 0.2 * s, 0.022 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const direction = g.baseAngle - g.restAngle;
    ctx.save();
    ctx.translate(
      g.pivotX + 0.74 * g.armLength * Math.cos(direction),
      g.pivotY + 0.74 * g.armLength * Math.sin(direction),
    );
    ctx.rotate(direction);
    ctx.fillStyle = '#111112';
    ctx.beginPath();
    ctx.roundRect(-0.02 * s, -0.026 * s, 0.04 * s, 0.052 * s, 0.008 * s);
    ctx.fill();
    ctx.fillStyle = '#8e8e8b';
    ctx.fillRect(-0.02 * s, -0.011 * s, 0.04 * s, 0.003 * s);
    ctx.fillRect(-0.02 * s, 0.008 * s, 0.04 * s, 0.003 * s);
    ctx.restore();
  }

  /** The deck's top surface in the current finish, with its moulded steps and hinges. */
  private paintPlate(ctx: Context): void {
    const s = this.size;
    const { base, lo, hi, texture } = this.plate;
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);

    // A small fixed-seed generator: the texture must look the same every time it is repainted.
    let seed = 20261;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    if (texture === 'speckle') {
      for (let i = 0; i < 9 * s; i++) {
        ctx.fillStyle = random() < 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.09)';
        ctx.fillRect(random() * s, random() * s, 1, 1);
      }
    } else if (texture === 'grain') {
      for (let y = 0; y < s; y += 2 + random() * 5) {
        ctx.strokeStyle = random() < 0.5 ? lo : hi;
        ctx.globalAlpha = 0.18 + random() * 0.2;
        ctx.lineWidth = 0.5 + random() * 1.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(s * 0.3, y + random() * 8 - 4, s * 0.7, y + random() * 8 - 4, s, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (texture === 'brushed') {
      for (let y = 0; y < s; y += 2) {
        ctx.fillStyle = `rgba(255,255,255,${0.03 + random() * 0.07})`;
        ctx.fillRect(0, y, s, 1);
      }
    } else if (texture === 'gloss') {
      const gloss = ctx.createLinearGradient(0, 0, s, s);
      gloss.addColorStop(0.2, 'rgba(255,255,255,0)');
      gloss.addColorStop(0.42, 'rgba(255,255,255,0.13)');
      gloss.addColorStop(0.6, 'rgba(255,255,255,0)');
      ctx.fillStyle = gloss;
      ctx.fillRect(0, 0, s, s);
    }

    // Moulded steps: a well around the front of the platter and a bay for the tonearm.
    const steps = new Path2D();
    steps.roundRect(0.02 * s, 0.6 * s, 0.96 * s, 0.385 * s, 0.035 * s);
    steps.roundRect(0.7 * s, 0.05 * s, 0.28 * s, 0.82 * s, 0.035 * s);
    const emboss = (dx: number, dy: number, fill: string): void => {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.fillStyle = fill;
      ctx.fill(steps);
      ctx.restore();
    };
    emboss(-1.5, -1.5, 'rgba(0,0,0,0.35)');
    emboss(1.5, 1.5, hi);
    emboss(0, 0, lo);

    // Dust cover hinges at the back.
    ctx.fillStyle = '#151516';
    for (const x of [0.06, 0.86]) {
      ctx.beginPath();
      ctx.roundRect(x * s, 0, 0.08 * s, 0.03 * s, [0, 0, 0.008 * s, 0.008 * s]);
      ctx.fill();
    }
  }

  /** The record itself: disc, grooves and its fixed sheen. */
  private paintRecord(ctx: Context): void {
    const s = this.size;
    const g = this.geometryValue;
    const r = g.recordRadius;
    ctx.save();
    ctx.translate(g.centerX, g.centerY);
    disc(ctx, 0, 0, r, '#0b0b0c');
    ctx.lineWidth = 1;
    const step = Math.max(2, 0.006 * s);
    let index = 0;
    for (let radius = g.innerRadius; radius <= g.outerRadius; radius += step) {
      const gap = index % 23 === 22;
      ctx.strokeStyle = gap
        ? 'rgba(0,0,0,0.9)'
        : `rgba(255,255,255,${0.03 + 0.035 * ((index * 7) % 5)})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.stroke();
      index++;
    }
    fillSheen(ctx, r, -Math.PI / 4, 0.17);
    ctx.restore();
  }

  /** The paper label with its art and text, centred in a square of side 2 × `radius`. */
  private paintLabel(ctx: Context, radius: number, snapshot: PlatterSnapshot): void {
    const s = this.size;
    const cover = this.cover;
    ctx.translate(radius, radius);
    disc(ctx, 0, 0, radius, this.labelColor);
    if (cover) {
      // Fill the disc with the art, cropping the longer side.
      const scale = (2 * radius) / Math.min(cover.width, cover.height);
      const width = cover.width * scale;
      const height = cover.height * scale;
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, TAU);
      ctx.clip();
      ctx.drawImage(cover, -width / 2, -height / 2, width, height);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.93, 0, TAU);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const line = (text: string, y: number, weight: number, fontSize: number): void => {
      ctx.font = `${weight} ${fontSize}px "Inter Variable", system-ui, sans-serif`;
      const fitted = fit(ctx, text, radius * 1.5);
      if (cover) {
        // A plate in the label colour keeps the text readable over any artwork.
        const width = ctx.measureText(fitted).width + fontSize;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = this.labelColor;
        ctx.beginPath();
        ctx.roundRect(-width / 2, y - fontSize * 0.75, width, fontSize * 1.5, fontSize * 0.4);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = this.labelInk;
      ctx.fillText(fitted, 0, y);
    };
    line(snapshot.title, -radius * 0.45, 600, Math.max(8, 0.026 * s));
    line(`${snapshot.speedLabel} RPM`, radius * 0.5, 500, Math.max(7, 0.02 * s));
  }

  /**
   * The platter rim is cut into slots; under the strobe lamp they appear to stand
   * still at the right speed. One dashed stroke draws them all.
   */
  private drawStrobe(snapshot: PlatterSnapshot): void {
    const { ctx, size: s } = this;
    const { centerX: cx, centerY: cy } = this.geometryValue;
    const radius = 0.415 * s;
    const pitch = (TAU * radius) / snapshot.strobeDots;
    ctx.save();
    ctx.strokeStyle = '#1b1b1d';
    ctx.lineWidth = 0.015 * s;
    ctx.setLineDash([pitch * 0.42, pitch * 0.58]);
    ctx.lineDashOffset = -this.strobeAngle * radius;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.stroke();
    ctx.restore();
    if (!snapshot.lampOn) return;
    // The neon lamp lights the rim from inside at the front of the deck.
    const x = cx + radius * Math.cos(2.05);
    const y = cy + radius * Math.sin(2.05);
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 0.075 * s);
    glow.addColorStop(0, 'rgba(255,140,50,0.6)');
    glow.addColorStop(1, 'rgba(255,140,50,0)');
    disc(ctx, x, y, 0.075 * s, glow);
  }

  private drawArm(armAngle: number, shadow: boolean, needleDown: boolean): void {
    const { ctx, size: s } = this;
    const g = this.geometryValue;
    const length = g.armLength;
    ctx.save();
    if (shadow) {
      const offset = (0.004 + 0.016 * this.lift) * s;
      ctx.translate(offset * 0.6, offset);
      ctx.globalAlpha = 0.32;
    }
    ctx.translate(g.pivotX, g.pivotY);
    ctx.rotate(g.baseAngle - armAngle);
    const paint = (color: Paint): Paint => (shadow ? '#000' : color);
    const across = (half: number, top: string, bottom: string): CanvasGradient => {
      const gradient = ctx.createLinearGradient(0, -half, 0, half);
      gradient.addColorStop(0, top);
      gradient.addColorStop(1, bottom);
      return gradient;
    };

    // Counterweight with its calibrated ring, behind the pivot.
    ctx.fillStyle = paint(across(0.036 * s, '#343436', '#0c0c0d'));
    ctx.beginPath();
    ctx.roundRect(-0.172 * s, -0.036 * s, 0.092 * s, 0.072 * s, 0.008 * s);
    ctx.fill();
    ctx.fillStyle = paint('#9d9d99');
    ctx.fillRect(-0.094 * s, -0.036 * s, 0.007 * s, 0.072 * s);

    // Black arm tube, with the bright coupling sleeve near the bearing.
    ctx.fillStyle = paint(across(0.006 * s, '#4a4a4d', '#0d0d0e'));
    ctx.fillRect(-0.09 * s, -0.006 * s, length - 0.07 * s + 0.09 * s, 0.012 * s);
    ctx.fillStyle = paint(across(0.009 * s, '#f0f0ec', '#7b7b78'));
    ctx.fillRect(0.05 * s, -0.009 * s, 0.045 * s, 0.018 * s);

    // Headshell, finger lift and cartridge.
    ctx.fillStyle = paint('#111112');
    ctx.beginPath();
    ctx.moveTo(length - 0.09 * s, -0.008 * s);
    ctx.lineTo(length - 0.06 * s, -0.024 * s);
    ctx.lineTo(length + 0.016 * s, -0.024 * s);
    ctx.lineTo(length + 0.016 * s, 0.024 * s);
    ctx.lineTo(length - 0.06 * s, 0.024 * s);
    ctx.lineTo(length - 0.09 * s, 0.008 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = paint('#a3a3a0');
    ctx.fillRect(length - 0.012 * s, 0.022 * s, 0.007 * s, 0.036 * s);
    ctx.fillStyle = paint('#2a2a2e');
    ctx.fillRect(length - 0.038 * s, -0.016 * s, 0.046 * s, 0.032 * s);
    if (!shadow) disc(ctx, length, 0, 0.0065 * s, needleDown ? '#ff3b30' : '#d8d8d4');
    ctx.restore();
  }

  /** The gimbal bearing housing, seen from above as concentric rings. */
  private drawPivot(): void {
    const { ctx, size: s } = this;
    const { pivotX: x, pivotY: y } = this.geometryValue;
    disc(ctx, x, y, 0.052 * s, '#0e0e0f');
    const ring = (radius: number, width: number, color: string): void => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width * s;
      ctx.beginPath();
      ctx.arc(x, y, radius * s, 0, TAU);
      ctx.stroke();
    };
    ring(0.041, 0.006, '#b4b4b0');
    disc(ctx, x, y, 0.03 * s, '#1c1c1e');
    ring(0.019, 0.004, '#8a8a87');
    disc(ctx, x, y, 0.008 * s, '#d2d2ce');
  }

  /** Canvas position of the stylus for the current true arm angle. */
  stylusAt(armAngle: number): { x: number; y: number } {
    return stylusPoint(this.geometryValue, armAngle);
  }
}
