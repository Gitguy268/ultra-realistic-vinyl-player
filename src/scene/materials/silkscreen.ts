import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';
import { DECK_SPEC } from '../../spec/deck';
import { MODEL_LETTERING, WORDMARK_BOX, WORDMARK_PATHS } from '../../spec/wordmark';
import {
  ATLAS_FRONT,
  ATLAS_HEAD,
  ATLAS_MAT,
  ATLAS_RATING,
  ATLAS_SIZE,
  ATLAS_TOP,
  FRONT_DECAL,
  STRIP_ATLAS,
} from './silkscreen-layout';

const PL = DECK_SPEC.plates;
const S = DECK_SPEC.strip;
const INK = DECK_SPEC.materials.silkscreen.colour;
const FACE = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/** The strip's printing and the headshell's: labels (v16, v11, v13, v72), wordmark (v65). */
export function paintSilkscreen(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE.width;
  canvas.height = ATLAS_SIZE.height;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = INK;

  // Strip top: origin at the strip's centre, in metres; +y toward the front edge.
  ctx.save();
  const topScale = ATLAS_SIZE.width / STRIP_ATLAS.topWidth;
  const topH = (ATLAS_TOP.v1 - ATLAS_TOP.v0) * ATLAS_SIZE.height;
  ctx.translate(ATLAS_SIZE.width / 2, topH / 2);
  ctx.scale(topScale, topScale * (topH / (S.topDepth * topScale)));
  ctx.globalAlpha = 0.72;
  const LINE = 0.0152;
  const label = (
    text: string,
    x: number,
    size = 0.0034,
    align: CanvasTextAlign = 'center',
  ): void => {
    // Wide italic figures (v16): the system's grotesque, stretched and slanted.
    ctx.save();
    ctx.translate(x, LINE);
    ctx.transform(1.3, 0, -0.22, 1, 0, 0);
    // Canvas fonts misbehave at sub-pixel sizes: draw in millimetres under a scale.
    ctx.scale(1e-3, 1e-3);
    ctx.textAlign = align;
    ctx.font = `600 ${size * 1000}px ${FACE}`;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  const sx = PL.speed.x;
  for (const [text, dx] of [
    ['78', -25],
    ['45', -11],
    ['OFF', 7],
    ['33', 23],
  ] as const)
    label(text, sx + dx / 1000);
  // The pitch scale under the wheel: six bars, narrowing (v16, v11).
  const widths = [2.6, 2.2, 1.8, 1.3, 0.9, 0.5];
  let bar = PL.pitchWheel.x - 0.0085;
  for (const w of widths) {
    ctx.fillRect(bar, LINE - 0.0014, w / 1000, 0.0028);
    bar += (w + 0.75) / 1000;
  }
  label('M', PL.start.x - 0.0255);
  label('START', PL.start.x + 0.0125);
  const triangle = (x: number, y: number, size: number, direction: 1 | -1 = 1): void => {
    ctx.beginPath();
    if (direction > 0) {
      ctx.moveTo(x - size / 2, y - size / 2);
      ctx.lineTo(x + size / 2, y - size / 2);
      ctx.lineTo(x, y + size / 2);
    } else {
      ctx.moveTo(x - size / 2, y - size / 2);
      ctx.lineTo(x - size / 2, y + size / 2);
      ctx.lineTo(x + size / 2, y);
    }
    ctx.closePath();
    ctx.fill();
  };
  // START ▸▸
  triangle(PL.start.x + 0.0242, LINE, 0.0026, -1);
  triangle(PL.start.x + 0.0272, LINE, 0.0026, -1);
  // Cue: ▼ on a bar at the left (lower), ▼ over a gapped bar at the right (raise) (v13, v72).
  const cueLeft = PL.cue.x - 0.0245;
  triangle(cueLeft, LINE - 0.0005, 0.003);
  ctx.fillRect(cueLeft - 0.0024, LINE + 0.001, 0.0048, 0.00035);
  const cueRight = PL.cue.x + 0.0245;
  triangle(cueRight, LINE - 0.0008, 0.003);
  ctx.fillRect(cueRight - 0.0024, LINE + 0.0018, 0.0048, 0.00035);
  ctx.restore();

  const wordmark = (x: number, y: number, capHeight: number, colour: string): number => {
    const k = capHeight / 192;
    ctx.save();
    ctx.fillStyle = colour;
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.translate(-WORDMARK_BOX.x, -100);
    for (const path of WORDMARK_PATHS) ctx.fill(new Path2D(path), 'evenodd');
    ctx.restore();
    return WORDMARK_BOX.width * k;
  };

  // Front face: THORENS with its swash, then the model, set in a wide grotesque (v65, v13).
  ctx.save();
  const frontW = (ATLAS_FRONT.u1 - ATLAS_FRONT.u0) * ATLAS_SIZE.width;
  const frontH = (ATLAS_FRONT.v1 - ATLAS_FRONT.v0) * ATLAS_SIZE.height;
  const frontScale = frontW / FRONT_DECAL.width;
  ctx.translate(0, ATLAS_SIZE.height * (1 - ATLAS_FRONT.v1));
  ctx.scale(frontScale, frontH / FRONT_DECAL.height);
  ctx.globalAlpha = 0.74;
  const CAP = 0.0052;
  const rowY = FRONT_DECAL.height / 2 - CAP / 2;
  const startX = 0.052;
  const width = wordmark(startX, rowY, CAP, INK);
  ctx.save();
  ctx.translate(startX + width + MODEL_LETTERING.gapToWordmarkEm * CAP, rowY + CAP / 2);
  ctx.transform(1.22, 0, 0, 1, 0, 0);
  ctx.textAlign = 'left';
  ctx.scale(1e-3, 1e-3);
  ctx.font = `700 ${CAP * 1360}px ${FACE}`;
  ctx.letterSpacing = `${(MODEL_LETTERING.trackingEm * CAP * 1000).toFixed(2)}px`;
  ctx.fillText(MODEL_LETTERING.text, 0, 0);
  ctx.restore();
  ctx.restore();

  // Headshell: white print on the black shell (v13, v84).
  ctx.save();
  const hx = ATLAS_HEAD.u0 * ATLAS_SIZE.width;
  const hy = ATLAS_SIZE.height * (1 - ATLAS_HEAD.v1);
  const hw = (ATLAS_HEAD.u1 - ATLAS_HEAD.u0) * ATLAS_SIZE.width;
  ctx.translate(hx + hw * 0.03, hy + 34);
  wordmark(0, 0, 78, '#f2f0ea');
  ctx.restore();

  // The mat's name: pressed into black rubber, so it only shows as a slightly lighter shape (v16, v68).
  ctx.save();
  const mx = ATLAS_MAT.u0 * ATLAS_SIZE.width;
  const my = ATLAS_SIZE.height * (1 - ATLAS_MAT.v1);
  ctx.translate(mx + 30, my + 40);
  wordmark(0, 0, 78, 'rgba(255, 255, 255, 0.13)');
  ctx.restore();

  // A rating plate: a pale label with ruled fields. The wording is this project's, not a copy (v15).
  ctx.save();
  const rx = ATLAS_RATING.u0 * ATLAS_SIZE.width;
  const ry = ATLAS_SIZE.height * (1 - ATLAS_RATING.v1);
  const rw = (ATLAS_RATING.u1 - ATLAS_RATING.u0) * ATLAS_SIZE.width;
  const rh = (ATLAS_RATING.v1 - ATLAS_RATING.v0) * ATLAS_SIZE.height;
  ctx.fillStyle = '#d6d5cf';
  ctx.fillRect(rx, ry, rw, rh);
  ctx.fillStyle = '#26262a';
  ctx.fillRect(rx, ry + rh / 2, rw, 3);
  for (const u of [0.42, 0.74]) ctx.fillRect(rx + rw * u, ry, 3, rh);
  ctx.textAlign = 'left';
  ctx.font = `600 34px ${FACE}`;
  ctx.fillText('TYPE TD 115', rx + 22, ry + rh * 0.75);
  ctx.fillText('230 V~  50 Hz', rx + rw * 0.45, ry + rh * 0.75);
  ctx.font = `600 26px ${FACE}`;
  ctx.fillText('MK II', rx + rw * 0.77, ry + rh * 0.75);
  wordmark(rx + 22, ry + 20, 62, '#26262a');
  ctx.restore();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 16;
  texture.minFilter = LinearMipmapLinearFilter;
  return texture;
}
