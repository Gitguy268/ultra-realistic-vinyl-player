import { CanvasTexture, LinearMipmapLinearFilter, type Texture } from 'three';
import type { Program } from '../../core/program';
import { angleAt, type Defect, type Mark } from '../../core/wear';

/**
 * The record's face, drawn whenever the program changes (html-1's Render.disc, moved into the
 * material). The grooves are not geometry: they live in three maps over the disc's planar UVs
 * (u = x, v = z, centre at 0.5):
 * - anisotropy: RG is the groove's tangent direction, B its strength. Tangential anisotropy is
 *   what gives a real record its two light wedges that stay put while it turns.
 * - roughness (G): one ring per texel, shaded by each track's loudness; smooth land in the gaps,
 *   a wide lead-in, the run-out spiral and the locked groove.
 * - albedo: vinyl black with dust specks and scratches, drawn at the angles the audio thread
 *   ticks them at.
 */

export interface RecordFace {
  anisotropy: Texture;
  roughness: Texture;
  dust: Texture;
  dispose(): void;
}

/** Loudness 0..1 of track `idx` at fraction `f` of its length. */
export type Loudness = (idx: number, f: number) => number;

const ANISO_SIZE = 1024;
const ROUGH_SIZE = 2048;
const DUST_SIZE = 1024;
/** sRGB of pressed vinyl. */
export const VINYL_COLOUR = '#0b0b0c';

function canvas(
  size: number,
): [
  HTMLCanvasElement | OffscreenCanvas,
  CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
] {
  const c =
    typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const ctx = c.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  return [c, ctx];
}

function texture(c: HTMLCanvasElement | OffscreenCanvas): CanvasTexture {
  const t = new CanvasTexture(c as HTMLCanvasElement);
  t.minFilter = LinearMipmapLinearFilter;
  t.anisotropy = 8;
  t.flipY = false;
  return t;
}

/** What the stylus would ride at record-radius `rn`, as surface properties. */
function surfaceAt(
  program: Program,
  rn: number,
  loudness: Loudness,
): { rough: number; aniso: number } {
  const g = program.geometry;
  if (rn > 0.995) return { rough: 0.2, aniso: 0.15 }; // pressed edge bead
  if (rn > g.leadIn) return { rough: 0.1, aniso: 0.05 }; // smooth rim land
  if (rn > g.outer) {
    // Lead-in: a few wide, visible turns.
    const turns = ((g.leadIn - rn) / (g.leadIn - g.outer)) * 4;
    return { rough: 0.16 + 0.1 * Math.abs(Math.sin(turns * Math.PI)), aniso: 0.6 };
  }
  const spot = program.locate(rn);
  // Smooth land between tracks: glossier than the grooves, but not a black mirror.
  if (spot.kind === 'gap') return { rough: 0.15, aniso: 0.35 };
  if (spot.kind === 'track') {
    const band = program.bands[spot.idx];
    const f = band && band.dur > 0 ? spot.t / band.dur : 0;
    const level = loudness(spot.idx, f);
    // Loud passages are cut wider and scatter more light.
    return { rough: 0.2 + 0.22 * level, aniso: 0.75 + 0.25 * level };
  }
  if (rn > g.locked) return { rough: 0.1, aniso: 0.35 }; // run-out spiral: few, wide turns
  if (rn > g.locked - 0.006) return { rough: 0.3, aniso: 0.9 }; // the locked groove
  return { rough: 0.12, aniso: 0 }; // under the label
}

export function drawRecordFace(
  program: Program,
  loudness: Loudness,
  wear: { defects: Defect[]; marks: Mark[] },
): RecordFace {
  // Anisotropy: direction tangential to the circle through each texel, strength by radius.
  const [ac, actx] = canvas(ANISO_SIZE);
  const aniso = actx.createImageData(ANISO_SIZE, ANISO_SIZE);
  const [rc, rctx] = canvas(ROUGH_SIZE);
  const rough = rctx.createImageData(ROUGH_SIZE, ROUGH_SIZE);
  // Surface properties per ring, sampled finer than the texels.
  const RINGS = ROUGH_SIZE;
  const ringRough = new Float32Array(RINGS);
  const ringAniso = new Float32Array(RINGS);
  for (let i = 0; i < RINGS; i++) {
    const s = surfaceAt(program, (i + 0.5) / RINGS, loudness);
    // Neighbouring grooves differ a little: the cut is never perfectly even.
    const jitter = 1 + 0.06 * Math.sin(i * 12.9898) * Math.sin(i * 0.37);
    ringRough[i] = s.rough * jitter;
    ringAniso[i] = s.aniso;
  }
  for (let y = 0; y < ANISO_SIZE; y++) {
    for (let x = 0; x < ANISO_SIZE; x++) {
      const dx = (x + 0.5) / ANISO_SIZE - 0.5;
      const dy = (y + 0.5) / ANISO_SIZE - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const o = (y * ANISO_SIZE + x) * 4;
      const ring = Math.min(RINGS - 1, Math.floor(r * RINGS));
      // Tangent of the circle: perpendicular to the radius.
      const inv = r > 0 ? 1 / (r / 2) : 0;
      aniso.data[o] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      aniso.data[o + 1] = Math.round((dx * inv * 0.5 + 0.5) * 255);
      aniso.data[o + 2] = r <= 1 ? Math.round((ringAniso[ring] ?? 0) * 255) : 0;
      aniso.data[o + 3] = 255;
    }
  }
  for (let y = 0; y < ROUGH_SIZE; y++) {
    for (let x = 0; x < ROUGH_SIZE; x++) {
      const dx = (x + 0.5) / ROUGH_SIZE - 0.5;
      const dy = (y + 0.5) / ROUGH_SIZE - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const o = (y * ROUGH_SIZE + x) * 4;
      const ring = Math.min(RINGS - 1, Math.floor(r * RINGS));
      rough.data[o] = 255;
      rough.data[o + 1] = Math.round(Math.min(1, ringRough[ring] ?? 0.2) * 255);
      rough.data[o + 2] = 0;
      rough.data[o + 3] = 255;
    }
  }
  actx.putImageData(aniso, 0, 0);
  rctx.putImageData(rough, 0, 0);

  // Albedo: vinyl black with dust and scratches, in the record's own frame.
  const [dc, dctx] = canvas(DUST_SIZE);
  dctx.fillStyle = VINYL_COLOUR;
  dctx.fillRect(0, 0, DUST_SIZE, DUST_SIZE);
  const c = DUST_SIZE / 2;
  const R = DUST_SIZE / 2;
  const px = Math.max(1, R / 300);
  for (const m of wear.marks) {
    const x = c + m.r * R * Math.cos(m.a);
    const y = c + m.r * R * Math.sin(m.a);
    if (m.scuff) {
      const ddx = (Math.cos(m.a + m.tilt) * m.len * R) / 2;
      const ddy = (Math.sin(m.a + m.tilt) * m.len * R) / 2;
      dctx.strokeStyle = 'rgba(150,146,140,0.12)';
      dctx.lineWidth = px * 0.6;
      dctx.beginPath();
      dctx.moveTo(x - ddx, y - ddy);
      dctx.lineTo(x + ddx, y + ddy);
      dctx.stroke();
    } else {
      dctx.fillStyle = `rgba(150,146,140,${m.alpha * 0.8})`;
      dctx.beginPath();
      dctx.arc(x, y, m.size * px * 0.5, 0, Math.PI * 2);
      dctx.fill();
    }
  }
  for (const d of wear.defects) {
    dctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const rr = d.r1 + ((d.r0 - d.r1) * i) / 12;
      // The scratch's angle is in degrees, clockwise from +x in screen terms; the disc's v runs
      // along +z, which is the same handedness in the texture.
      const a = (angleAt(d, rr) * Math.PI) / 180;
      const x = c + rr * R * Math.cos(a);
      const y = c + rr * R * Math.sin(a);
      if (i) dctx.lineTo(x, y);
      else dctx.moveTo(x, y);
    }
    dctx.lineCap = 'round';
    dctx.strokeStyle = `rgba(120,118,115,${0.2 + 0.9 * d.amp})`;
    dctx.lineWidth = px * 0.9;
    dctx.stroke();
  }

  const anisotropy = texture(ac);
  const roughness = texture(rc);
  const dust = texture(dc);
  dust.colorSpace = 'srgb';
  return {
    anisotropy,
    roughness,
    dust,
    dispose() {
      anisotropy.dispose();
      roughness.dispose();
      dust.dispose();
    },
  };
}
