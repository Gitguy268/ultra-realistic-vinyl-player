import { CanvasTexture, LinearMipmapLinearFilter } from 'three';
import { hash, rng } from '../../core/random';

/**
 * The record's paper label, drawn into a canvas the label mesh shows. It merges both
 * originals' labels: the cover art cropped to the disc with the title and speed on a plate in
 * the label colour (App), text round the edge from Record Info (html-1), and the yellow 45
 * adapter. Paper fibre is drawn once per label. A live visualizer replaces the print and is
 * kept upright by counter-rotating it against the record's turn.
 */

export interface LabelContent {
  title: string;
  /** Artist · album, round the top (html-1). */
  top: string;
  /** SIDE · year · genre · speed · STEREO, round the bottom (html-1). */
  bottom: string;
  speedLabel: string;
  colour: string;
  ink: string;
  cover: ImageBitmap | null;
  /** Changes whenever `cover` does. */
  coverVersion: number;
  /** Adapter hole as a share of the label diameter (7-inch at 45), or 0. */
  hole: number;
}

const SIZE = 1024;
const TAU = Math.PI * 2;

export class LabelPainter {
  readonly canvas = document.createElement('canvas');
  readonly texture: CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  /** The printed label, kept so a live picture can be laid over it each frame. */
  private readonly print = document.createElement('canvas');
  private readonly last: LabelContent = {
    title: '\0',
    top: '',
    bottom: '',
    speedLabel: '',
    colour: '',
    ink: '',
    cover: null,
    coverVersion: -1,
    hole: -1,
  };
  private live = false;
  /** The visualizer canvas last drawn on the label. */
  liveSource: HTMLCanvasElement | null = null;

  constructor() {
    this.canvas.width = this.canvas.height = SIZE;
    this.print.width = this.print.height = SIZE;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = 'srgb';
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.anisotropy = 8;
    // The label disc has planar UVs (u = x, v = z): canvas rows run toward the listener.
    this.texture.flipY = false;
  }

  /** Repaints the print when its content changed. Returns true if the texture changed. */
  paint(content: LabelContent): boolean {
    // Field by field: this runs every frame and must not allocate.
    const k = this.last;
    if (
      !this.live &&
      k.title === content.title &&
      k.top === content.top &&
      k.bottom === content.bottom &&
      k.speedLabel === content.speedLabel &&
      k.colour === content.colour &&
      k.ink === content.ink &&
      k.coverVersion === content.coverVersion &&
      k.hole === content.hole
    )
      return false;
    Object.assign(k, content);
    const g = this.print.getContext('2d')!;
    const c = SIZE / 2;
    const R = SIZE / 2;
    g.clearRect(0, 0, SIZE, SIZE);
    g.fillStyle = content.colour;
    g.beginPath();
    g.arc(c, c, R, 0, TAU);
    g.fill();
    if (content.cover) {
      const cover = content.cover;
      const scale = (2 * R) / Math.min(cover.width, cover.height);
      g.save();
      g.beginPath();
      g.arc(c, c, R, 0, TAU);
      g.clip();
      g.drawImage(
        cover,
        c - (cover.width * scale) / 2,
        c - (cover.height * scale) / 2,
        cover.width * scale,
        cover.height * scale,
      );
      g.restore();
    }
    // Paper fibre: short faint strokes in every direction, seeded so a label never shimmers.
    const r = rng(hash(content.title + content.top));
    g.lineWidth = 1;
    for (let i = 0; i < 2600; i++) {
      const x = r() * SIZE;
      const y = r() * SIZE;
      const a = r() * TAU;
      const len = 3 + r() * 9;
      g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    // Pressing rings.
    for (const [radius, colour] of [
      [0.52, 'rgba(0,0,0,0.20)'],
      [0.535, 'rgba(255,255,255,0.10)'],
      [0.975, 'rgba(0,0,0,0.28)'],
    ] as const) {
      g.strokeStyle = colour;
      g.lineWidth = SIZE * 0.006;
      g.beginPath();
      g.arc(c, c, R * radius, 0, TAU);
      g.stroke();
    }
    // Title and speed, on a plate in the label colour when there is artwork (App).
    const line = (text: string, y: number, weight: number, size: number): void => {
      g.font = `${weight} ${size}px "Inter Variable", system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      let t = text;
      while (t.length > 1 && g.measureText(t).width > R * 1.3) t = t.slice(0, -2) + '…';
      if (content.cover) {
        const w = g.measureText(t).width + size;
        g.globalAlpha = 0.9;
        g.fillStyle = content.colour;
        g.beginPath();
        g.roundRect(c - w / 2, y - size * 0.75, w, size * 1.5, size * 0.4);
        g.fill();
        g.globalAlpha = 1;
      }
      g.fillStyle = content.ink;
      g.fillText(t, c, y);
    };
    if (content.title) line(content.title, c - R * 0.36, 600, SIZE * 0.06);
    line(`${content.speedLabel} RPM`, c + R * 0.36, 500, SIZE * 0.045);
    // Text round the edge (html-1).
    g.fillStyle = content.ink;
    g.globalAlpha = 0.85;
    arcText(g, content.top.toUpperCase(), c, c, R * 0.8, -90, SIZE * 0.05, 1);
    g.globalAlpha = 0.7;
    arcText(g, content.bottom.toUpperCase(), c, c, R * 0.8, 90, SIZE * 0.04, -1);
    g.globalAlpha = 1;
    if (content.hole > 0) drawAdapter(g, c, R * content.hole);
    this.live = false;
    this.ctx.clearRect(0, 0, SIZE, SIZE);
    this.ctx.drawImage(this.print, 0, 0);
    this.texture.needsUpdate = true;
    return true;
  }

  /**
   * Lays a live picture over the label, upright: the record has turned `recordAngle` radians
   * (clockwise from above), so the picture is turned back by as much.
   */
  showLive(source: HTMLCanvasElement | null, recordAngle: number): void {
    this.liveSource = source;
    if (!source) {
      if (this.live) {
        this.live = false;
        this.ctx.clearRect(0, 0, SIZE, SIZE);
        this.ctx.drawImage(this.print, 0, 0);
        this.texture.needsUpdate = true;
      }
      return;
    }
    this.live = true;
    const g = this.ctx;
    g.save();
    g.clearRect(0, 0, SIZE, SIZE);
    g.beginPath();
    g.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, TAU);
    g.clip();
    g.translate(SIZE / 2, SIZE / 2);
    g.rotate(-recordAngle);
    g.drawImage(source, -SIZE / 2, -SIZE / 2, SIZE, SIZE);
    g.restore();
    this.texture.needsUpdate = true;
  }
}

/** Text along a circle, centred on midDeg. dir +1 reads clockwise (top), −1 anticlockwise (bottom). */
function arcText(
  g: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  r: number,
  midDeg: number,
  size: number,
  dir: 1 | -1,
): void {
  if (!text) return;
  g.font = `600 ${size}px "Inter Variable", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const gap = size * 0.14;
  const maxArc = 2.85 * r;
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width + gap);
  let total = widths.reduce((a, b) => a + b, 0);
  while (total > maxArc && chars.length > 2) {
    total -= widths.pop() ?? 0;
    chars.pop();
    chars[chars.length - 1] = '…';
  }
  let a = (midDeg * Math.PI) / 180 - (dir * total) / r / 2;
  chars.forEach((ch, i) => {
    const half = (widths[i] ?? 0) / r / 2;
    a += dir * half;
    g.save();
    g.translate(cx + r * Math.cos(a), cy + r * Math.sin(a));
    g.rotate(a + (dir * Math.PI) / 2);
    g.fillText(ch, 0, 0);
    g.restore();
    a += dir * half;
  });
}

/** The yellow three-spoke 45 adapter in the big centre hole (html-1). */
function drawAdapter(g: CanvasRenderingContext2D, c: number, r: number): void {
  g.fillStyle = '#d9b62c';
  g.beginPath();
  g.arc(c, c, r, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.arc(c, c, r * 0.62, 0, TAU);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.3)';
  g.lineWidth = r * 0.06;
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094 + 0.5;
    g.beginPath();
    g.moveTo(c + r * 0.3 * Math.cos(a), c + r * 0.3 * Math.sin(a));
    g.lineTo(c + r * 0.95 * Math.cos(a), c + r * 0.95 * Math.sin(a));
    g.stroke();
  }
}
