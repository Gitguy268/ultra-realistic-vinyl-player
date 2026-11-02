import {
  BoxGeometry,
  BufferAttribute,
  PlaneGeometry,
  CircleGeometry,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  Quaternion,
  RingGeometry,
  Vector3,
  ExtrudeGeometry,
  Shape,
  SphereGeometry,
  Vector2,
  type BufferGeometry,
  type Group,
  type Material,
  type Mesh,
  type Object3D,
} from 'three';
import { EFFECTIVE_LENGTH, REST_DIRECTION, WAND_ANGLE, WAND_LENGTH } from '../../core/tonearm3d';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DECK_SPEC } from '../../spec/deck';
import {
  ATLAS_FRONT,
  ATLAS_HEAD,
  ATLAS_MAT,
  ATLAS_RATING,
  ATLAS_TOP,
  FRONT_DECAL,
  HEAD_DECAL,
  MAT_DECAL,
  RATING_DECAL,
  STRIP_ATLAS,
  type AtlasRect,
} from '../materials/silkscreen-layout';
import type { DeckMaterials } from '../materials/deck-materials';
import { boxUV, group, marker, part } from './parts';
import {
  extrudeProfile,
  extrudeUp,
  lathe,
  latheX,
  mergedPart,
  polygon,
  rod,
  roundedRect,
  tinted,
  wire,
  wireBare,
} from './shapes';

/**
 * The deck as a hierarchy of named parts at spec dimensions. World: metres, +Y up, +Z toward
 * the listener, origin at the centre of the plinth's footprint. Pivots:
 * - platter, record: Y
 * - armYaw: Y at the pivot; armPitch: the lift, about the arm's horizontal cross axis
 * - cueLever: X
 * - cover: X at the hinge line
 * - plates: travel along the strip (X), the axis the detent labels are spread along
 */

/** One material per role; the scene passes the real ones, tests pass plain ones. */
export type PartMaterials = Record<keyof DeckMaterials, Material>;

const P = DECK_SPEC.plinth;
const S = DECK_SPEC.strip;
const PL = DECK_SPEC.plates;
const T = DECK_SPEC.platter;
const ARM = DECK_SPEC.tonearm;
const CV = DECK_SPEC.cover;

const HALF_W = P.width / 2;
const HALF_D = P.depth / 2;
export const STRIP_REAR_Z = HALF_D - S.topDepth;
/** Slope of the strip's top face, rising toward the rear. */
export const STRIP_SLOPE = Math.atan2(S.rearTopHeight - S.frontTopHeight, S.topDepth);
export const PLATTER_TOP = P.topHeight + T.topAbovePlate;
export const RECORD_SURFACE = PLATTER_TOP + DECK_SPEC.mat.thickness + DECK_SPEC.records.thickness;
/** Wand axis above the top plate: level with the stylus resting on a record. */
export const ARM_AXIS_HEIGHT = RECORD_SURFACE - P.topHeight + ARM.stylusDrop;
/** The ringed gimbal cap above the top plate. */
export const CAP_HEIGHT = ARM_AXIS_HEIGHT + ARM.capAboveAxis;

/** The chamfer on the long edges of plinth and strip. */
const EDGE = 0.0006;
/** End blocks are cast with a softer corner (v13). */
const BLOCK_BEVEL = 0.0012;
const PLATE_CORNER = 0.002;
const PLATE_TOP = 0.0012;
const GLOW_WIDTH = 0.012;
const REAR = { stripHeight: 0.024, proud: 0.0006, ratingY: 0.012 };
const MOULD = {
  height: 0.0035,
  bevel: 0.0014,
  wellGap: 0.009,
  inset: 0.004,
  armX: ARM.pivotX + 0.004,
  armZ: ARM.pivotZ + 0.012,
  armHalfW: 0.034,
  armHalfD: 0.048,
  armCorner: 0.012,
  blend: 0.028,
  steps: 360,
};

/** A profile drawn in (z, y) and extruded along X from x0 to x1. */
function extrudeAlongX(profile: [number, number][], x0: number, x1: number): BufferGeometry {
  const shape = new Shape(profile.map(([z, y]) => new Vector2(z, y)));
  const geometry = new ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(x1, 0, 0);
  return geometry;
}

/** A plane facing +Y whose UVs show one rectangle of the silkscreen atlas. */
function atlasPlane(w: number, d: number, rect: AtlasRect): BufferGeometry {
  const g = new PlaneGeometry(w, d).rotateX(-Math.PI / 2);
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++)
    uv.setXY(
      i,
      rect.u0 + uv.getX(i) * (rect.u1 - rect.u0),
      rect.v0 + uv.getY(i) * (rect.v1 - rect.v0),
    );
  return g;
}

function mergeBlack(pieces: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(pieces.map((g) => (g.index ? g.toNonIndexed() : g)));
  if (!merged) throw new Error('pieces do not merge');
  return merged;
}

const meshGeometry = (mesh: Mesh): BufferGeometry => mesh.geometry;

function box(w: number, h: number, d: number, x: number, y: number, z: number): BufferGeometry {
  return new BoxGeometry(w, h, d).translate(x, y, z);
}

function cylinder(r: number, h: number, segments = 64): CylinderGeometry {
  return new CylinderGeometry(r, r, h, segments);
}

/**
 * The top plate is moulded: a raised field with a soft step, cut away round the platter's well and
 * round the arm's base (v16, v68). The cut-out is the outline of a circle and a rounded box blended
 * together, walked outward from the spindle.
 */
function mouldedTop(): BufferGeometry {
  const well = T.diameter / 2 + MOULD.wellGap;
  const distance = (x: number, z: number): number => {
    const circle = Math.hypot(x - T.centreX, z - T.centreZ) - well;
    const qx = Math.abs(x - MOULD.armX) - MOULD.armHalfW;
    const qz = Math.abs(z - MOULD.armZ) - MOULD.armHalfD;
    const lobe =
      Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) +
      Math.min(Math.max(qx, qz), 0) -
      MOULD.armCorner;
    const k = MOULD.blend;
    const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (lobe - circle)) / k));
    return lobe * (1 - h) + circle * h - k * h * (1 - h);
  };
  const outline: [number, number][] = [];
  const zMax = STRIP_REAR_Z - 0.001;
  for (let i = 0; i < MOULD.steps; i++) {
    const a = (i / MOULD.steps) * Math.PI * 2;
    let r = well;
    while (r < 0.6 && distance(T.centreX + r * Math.cos(a), T.centreZ + r * Math.sin(a)) < 0)
      r += 0.0005;
    const x = T.centreX + r * Math.cos(a);
    const z = T.centreZ + r * Math.sin(a);
    outline.push([Math.max(-HALF_W + 0.006, Math.min(HALF_W - 0.006, x)), Math.min(zMax, z)]);
  }
  const shape = polygon([
    [-HALF_W + MOULD.inset, -HALF_D + MOULD.inset],
    [HALF_W - MOULD.inset, -HALF_D + MOULD.inset],
    [HALF_W - MOULD.inset, STRIP_REAR_Z],
    [-HALF_W + MOULD.inset, STRIP_REAR_Z],
  ]);
  shape.holes.push(polygon(outline.reverse()));
  return extrudeUp(shape, P.topHeight - 0.001, P.topHeight + MOULD.height, MOULD.bevel);
}

function buildPlinth(m: PartMaterials): Group {
  // Every long edge is chamfered: a real press-formed plate catches a line of light there (v15).
  const body = part(
    'plinthBody',
    boxUV(
      extrudeProfile(
        [
          [-HALF_D, P.skirtHeight],
          [STRIP_REAR_Z, P.skirtHeight],
          [STRIP_REAR_Z, P.topHeight],
          [-HALF_D, P.topHeight],
        ],
        -HALF_W,
        HALF_W,
        EDGE,
      ),
      0.4,
    ),
    m.plinth,
  );
  const rearBand = part(
    'rearBand',
    boxUV(
      extrudeProfile(
        [
          [-HALF_D, P.topHeight - EDGE],
          [-HALF_D + P.rearBandDepth, P.topHeight - EDGE],
          [-HALF_D + P.rearBandDepth, P.topHeight + P.rearBandHeight],
          [-HALF_D, P.topHeight + P.rearBandHeight],
        ],
        -HALF_W,
        HALF_W,
        EDGE,
      ),
      0.4,
    ),
    m.plinth,
  );
  const moulding = part('topMoulding', boxUV(mouldedTop(), 0.4), m.plinth);
  // The back: a brushed strip like the front's, a rating plate, the mains socket's housing at the
  // right and the signal cable leaving at the left (v15).
  const rearStrip = part(
    'rearStrip',
    boxUV(
      box(
        P.width - 2 * S.endBlockWidth,
        REAR.stripHeight,
        REAR.proud,
        0,
        P.topHeight - REAR.stripHeight / 2,
        -HALF_D - REAR.proud / 2,
      ),
      0.4,
    ),
    m.aluminium,
  );
  const rating = part(
    'ratingPlate',
    atlasPlane(RATING_DECAL.width, RATING_DECAL.height, ATLAS_RATING)
      .rotateX(Math.PI / 2)
      .rotateY(Math.PI)
      .translate(0.07, P.skirtHeight + REAR.ratingY, -HALF_D - 0.0001),
    m.silkscreen,
  );
  rating.castShadow = false;
  const rearParts = mergedPart(
    'rearFittings',
    [
      // Mains socket housing, seen from behind at the deck's right.
      box(0.034, 0.024, 0.004, HALF_W - 0.05, P.skirtHeight + 0.018, -HALF_D - 0.0015),
      box(0.022, 0.014, 0.002, HALF_W - 0.05, P.skirtHeight + 0.018, -HALF_D - 0.0035),
      // The signal cable's grommet; the lead itself belongs to the room (scene/room.ts).
      cylinder(0.0042, 0.003, 16)
        .rotateX(Math.PI / 2)
        .translate(-0.12, P.skirtHeight + 0.012, -HALF_D - 0.0015),
    ],
    m.foot,
  );
  const skirt = part(
    'skirt',
    box(
      P.width - 2 * P.skirtInset,
      P.skirtHeight,
      P.depth - 2 * P.skirtInset,
      0,
      P.skirtHeight / 2,
      0,
    ),
    m.foot,
  );
  const feet: Mesh[] = [];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const foot = part(
      `foot${sx < 0 ? 'L' : 'R'}${sz < 0 ? 'R' : 'F'}`,
      cylinder(P.footDiameter / 2, 0.004, 32),
      m.foot,
    );
    foot.geometry.translate(sx * (HALF_W - P.footInset), 0.002, sz * (HALF_D - P.footInset));
    feet.push(foot);
  }
  const corners = [
    marker('plinthRearLeft', -HALF_W, P.topHeight + P.rearBandHeight, -HALF_D),
    marker('plinthRearRight', HALF_W, P.topHeight + P.rearBandHeight, -HALF_D),
    marker('plinthFrontLeft', -HALF_W, S.frontTopHeight, HALF_D),
    marker('plinthFrontRight', HALF_W, S.frontTopHeight, HALF_D),
    marker('stripRearCentre', 0, S.rearTopHeight, STRIP_REAR_Z),
  ];
  return group(
    'plinth',
    // Nothing here moves on its own: one draw call per material.
    mergedPart('plinthShell', [body, rearBand, moulding].map(meshGeometry), m.plinth),
    mergedPart('plinthDark', [skirt, rearParts, ...feet].map(meshGeometry), m.foot),
    rearStrip,
    rating,
    ...corners,
  );
}

function buildStrip(m: PartMaterials): Group {
  const blockX = HALF_W - S.endBlockWidth;
  const frontBottom = S.frontTopHeight - S.frontFaceHeight;
  const slopeDrop = (EDGE * (S.rearTopHeight - S.frontTopHeight)) / S.topDepth;
  const aluminium = part(
    'stripAluminium',
    boxUV(
      extrudeAlongX(
        [
          [STRIP_REAR_Z, frontBottom],
          [HALF_D, frontBottom],
          // The crease between the two faces is where the metal catches the light (v13).
          [HALF_D, S.frontTopHeight - EDGE],
          [HALF_D - EDGE, S.frontTopHeight + slopeDrop],
          [STRIP_REAR_Z, S.rearTopHeight],
        ],
        -blockX,
        blockX,
      ),
      0.4,
    ),
    m.aluminium,
  );
  const lower = part(
    'stripLowerBand',
    boxUV(
      box(
        2 * blockX,
        frontBottom - P.skirtHeight,
        S.topDepth,
        0,
        (frontBottom + P.skirtHeight) / 2,
        HALF_D - S.topDepth / 2,
      ),
      0.4,
    ),
    m.plinth,
  );
  const endProfile: [number, number][] = [
    [STRIP_REAR_Z, P.skirtHeight],
    [HALF_D, P.skirtHeight],
    [HALF_D, S.frontTopHeight],
    [STRIP_REAR_Z, S.rearTopHeight],
  ];
  const left = part(
    'stripEndLeft',
    boxUV(extrudeProfile(endProfile, -HALF_W, -blockX, BLOCK_BEVEL), 0.4),
    m.plinth,
  );
  const right = part(
    'stripEndRight',
    boxUV(extrudeProfile(endProfile, blockX, HALF_W, BLOCK_BEVEL), 0.4),
    m.plinth,
  );
  // The wordmark band, on the front face (v65, v13).
  const lettering = part(
    'silkscreenFront',
    atlasPlane(FRONT_DECAL.width, FRONT_DECAL.height, ATLAS_FRONT)
      .rotateX(Math.PI / 2)
      .translate(FRONT_DECAL.x, frontBottom + S.frontFaceHeight / 2, HALF_D + 0.0001),
    m.silkscreen,
  );
  lettering.castShadow = false;
  return group(
    'strip',
    aluminium,
    mergedPart('stripPlinthParts', [lower, left, right].map(meshGeometry), m.plinth),
    lettering,
  );
}

/** A rectangle lying on the strip's top face, mapped to its place in the silkscreen atlas. */
function stripDecals(m: PartMaterials): Mesh[] {
  const w = STRIP_ATLAS.topWidth;
  const d = Math.hypot(S.topDepth, S.rearTopHeight - S.frontTopHeight);
  const top = part('silkscreenTop', atlasPlane(w, d, ATLAS_TOP), m.silkscreen);
  top.position.y = 0.0001;
  top.castShadow = false;
  return [top];
}

/** The plates, wheel and pin sit in a frame on the strip's sloped top face. */
function buildStripFace(m: PartMaterials): {
  face: Group;
  speed: Group;
  start: Group;
  cue: Group;
  wheel: Group;
  pin: Group;
} {
  const face = group('stripFace');
  face.position.set(0, (S.frontTopHeight + S.rearTopHeight) / 2, (STRIP_REAR_Z + HALF_D) / 2);
  face.rotation.x = STRIP_SLOPE;
  const plateZ = -0.0017;
  const plate = (name: string, x: number): Group => {
    // A thin brushed top with a polished bevel, over a black body that lifts it off the strip
    // (v13, v16): from the front you see the black, and the labels reflected in it.
    const g = group(
      name,
      part(
        `${name}Top`,
        boxUV(
          extrudeUp(
            roundedRect(PL.width, PL.depth, PLATE_CORNER),
            PL.thickness - PLATE_TOP,
            PL.thickness,
            PL.bevel,
          ),
          0.4,
        ),
        m.plate,
      ),
      part(
        `${name}Body`,
        extrudeUp(
          roundedRect(PL.width - 0.0006, PL.depth - 0.0006, PLATE_CORNER),
          -PL.standoff,
          PL.thickness - PLATE_TOP,
        ),
        m.black,
      ),
    );
    g.position.set(x, PL.standoff, plateZ);
    g.userData.baseX = x;
    const top = PL.thickness;
    g.add(
      marker(`${name}LeftEdge`, -PL.width / 2, top, 0),
      marker(`${name}RightEdge`, PL.width / 2, top, 0),
    );
    return g;
  };
  const speed = plate('speedPlate', PL.speed.x);
  const start = plate('startPlate', PL.start.x);
  const cue = plate('cuePlate', PL.cue.x);
  // A knurled black wheel with radial fins, standing in a round recess (v16, v11).
  const W = PL.pitchWheel;
  const wheelR = W.diameter / 2;
  const star: [number, number][] = [];
  for (let i = 0; i < W.knurlCount * 2; i++) {
    const a = (i / (W.knurlCount * 2)) * Math.PI * 2;
    const r = i % 2 ? wheelR : wheelR * 0.8;
    star.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  const wheel = group(
    'pitchWheel',
    part(
      'pitchWheelDisc',
      // The fins catch the light: moulded in the plinth's grey, round a black hub (v16).
      extrudeUp(polygon(star), -0.001, W.exposedHeight - 0.0012),
      m.plinth,
    ),
    part(
      'pitchWheelHub',
      lathe([
        [0, W.exposedHeight - 0.0002],
        [wheelR * 0.42, W.exposedHeight - 0.0002],
        [wheelR * 0.46, W.exposedHeight - 0.0012],
      ]),
      m.black,
    ),
  );
  const recess = part(
    'pitchWheelRecess',
    new RingGeometry(wheelR - 0.0005, wheelR + 0.0016, 48)
      .rotateX(-Math.PI / 2)
      .translate(PL.pitchWheel.x, 0.00015, plateZ),
    m.black,
  );
  recess.castShadow = false;
  wheel.position.set(PL.pitchWheel.x, 0, plateZ);
  wheel.add(marker('pitchWheelCentre', 0, PL.pitchWheel.exposedHeight - 0.001, 0));
  const pin = group(
    'unlockPin',
    part(
      'unlockPinDome',
      new SphereGeometry(PL.unlockPin.diameter / 2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      m.steel,
    ),
  );
  pin.position.set(PL.unlockPin.x, 0, plateZ - 0.004);
  const decals = group('silkscreen', ...stripDecals(m));
  face.add(speed, start, cue, wheel, recess, pin, decals);
  return { face, speed, start, cue, wheel, pin };
}

/** A flat disc in the XZ plane, facing up, with planar UVs: u = x / 2r + ½, v = z / 2r + ½. */
export function planarDisc(radius: number, inner = 0, segments = 128): BufferGeometry {
  const g =
    inner > 0 ? new RingGeometry(inner, radius, segments, 1) : new CircleGeometry(radius, segments);
  g.rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++)
    uv.setXY(i, pos.getX(i) / (2 * radius) + 0.5, pos.getZ(i) / (2 * radius) + 0.5);
  return g;
}

/** The cast texture is repeated six times round the rim; a flat disc needs that across it too. */
function evenCast(disc: BufferGeometry): BufferGeometry {
  const uv = disc.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 6);
  return disc;
}

/** Rim slot count for the mains frequency: the slots stand still at 33⅓ under the neon (C9). */
export const slotCount = (mainsHz: 50 | 60): number =>
  mainsHz === 60 ? T.slots.count60Hz : T.slots.count50Hz;

function buildPlatter(m: PartMaterials): {
  platter: Group;
  record: Group;
  slots: InstancedMesh;
  adapter: Mesh;
} {
  const platter = group('platter');
  platter.position.set(T.centreX, PLATTER_TOP - T.rimDepth, T.centreZ);
  const r = T.diameter / 2;
  const slotH = T.slots.depth;
  // The rim: a solid band below the slots, a recessed core behind them, and the bars between
  // slots as instances whose tops are the bright machined lip (v13, v11).
  const lower = part(
    'platterRimLower',
    new CylinderGeometry(r, r, T.rimDepth - slotH, 180, 1, true).translate(
      0,
      (T.rimDepth - slotH) / 2,
      0,
    ),
    m.zamak,
  );
  const coreR = r - 0.0025;
  const core = part(
    'platterSlotFloor',
    new CylinderGeometry(coreR, coreR, slotH, 180, 1, true).translate(0, T.rimDepth - slotH / 2, 0),
    // Dark recesses that glow orange when the strobe neon behind them is lit (v84).
    m.neon,
  );
  const top = part(
    'platterTop',
    evenCast(planarDisc(coreR, DECK_SPEC.mat.diameter / 2 - 0.001, 180)).translate(
      0,
      T.rimDepth,
      0,
    ),
    m.zamak,
  );
  const bottom = part(
    'platterUnderside',
    planarDisc(r, 0, 96).rotateX(Math.PI).translate(0, 0, 0),
    m.zamak,
  );
  const count = slotCount(50);
  const pitch = (2 * Math.PI * r) / count;
  const barWidth = pitch * (1 - T.slots.dutyCycle);
  const bars = new InstancedMesh(
    new BoxGeometry(0.0025, slotH, barWidth).translate(-0.00125, 0, 0),
    // Satin cast zinc, as the rim below them; the bright line is the machined lip (v13).
    m.zamak,
    slotCount(60),
  );
  bars.name = 'platterSlotBars';
  bars.castShadow = true;
  bars.receiveShadow = true;
  platter.add(lower, core, top, bottom, bars);
  setSlots(bars, count);
  const lip = part(
    'platterLip',
    new RingGeometry(coreR - T.lipWidth, coreR, 180)
      .rotateX(-Math.PI / 2)
      .translate(0, T.rimDepth + 0.0001, 0),
    m.lip,
  );
  // Black rubber with raised concentric rings, and a plain centre with the name pressed in (v16, v68).
  // The rings stand under the record's plane: the record lies on them.
  const MT = DECK_SPEC.mat;
  const matTop = T.rimDepth + MT.thickness;
  const ringBase = matTop - MT.ringHeight;
  const profile: [number, number][] = [
    [0, ringBase],
    ...MT.ringRadii.flatMap((r): [number, number][] => [
      [r - MT.ringWidth, ringBase],
      [r - MT.ringWidth / 2, matTop],
      [r + MT.ringWidth / 2, matTop],
      [r + MT.ringWidth, ringBase],
    ]),
    [MT.diameter / 2 - 0.0008, ringBase],
    [MT.diameter / 2, ringBase - 0.0008],
    [MT.diameter / 2, T.rimDepth],
  ];
  const mat = part('mat', lathe(profile, 180), m.rubber);
  const matName = part(
    'matName',
    atlasPlane(MAT_DECAL.width, MAT_DECAL.height, ATLAS_MAT).translate(
      0,
      ringBase + 0.00008,
      0.024,
    ),
    m.silkscreen,
  );
  matName.castShadow = false;
  const spindleHeight = DECK_SPEC.mat.thickness + DECK_SPEC.spindle.heightAboveMat;
  const sr = DECK_SPEC.spindle.diameter / 2;
  const spindle = part(
    'spindle',
    new CylinderGeometry(sr - DECK_SPEC.spindle.chamfer * 0.6, sr, spindleHeight, 32).translate(
      0,
      T.rimDepth + spindleHeight / 2,
      0,
    ),
    m.steel,
  );
  const record = buildRecord(m);
  record.position.y = T.rimDepth + DECK_SPEC.mat.thickness;
  // The 45 adapter: yellow, three spokes, sitting in a 7-inch's wide hole (v84).
  const A = DECK_SPEC.records.adapter;
  const adapterTop = T.rimDepth + DECK_SPEC.mat.thickness + DECK_SPEC.records.thickness + 0.0002;
  const adapterPieces: BufferGeometry[] = [
    lathe(
      [
        [A.diameter / 2 - 0.0028, adapterTop],
        [A.diameter / 2, adapterTop],
        [A.diameter / 2, adapterTop - 0.0016],
        [A.diameter / 2 - 0.0028, adapterTop - 0.0016],
        [A.diameter / 2 - 0.0028, adapterTop],
      ],
      48,
    ),
    lathe(
      [
        [DECK_SPEC.spindle.diameter / 2, adapterTop],
        [0.0072, adapterTop],
        [0.0072, adapterTop - 0.0016],
        [DECK_SPEC.spindle.diameter / 2, adapterTop - 0.0016],
        [DECK_SPEC.spindle.diameter / 2, adapterTop],
      ],
      32,
    ),
  ];
  for (let i = 0; i < A.spokes; i++) {
    const a = (i / A.spokes) * Math.PI * 2;
    adapterPieces.push(
      new BoxGeometry(A.diameter / 2 - 0.0085, 0.0016, 0.0042)
        .translate((A.diameter / 2 + 0.0058) / 2, adapterTop - 0.0008, 0)
        .rotateY(a),
    );
  }
  const adapter = mergedPart(
    'adapter45',
    adapterPieces.map((g) => tinted(g, [0.8, 0.5, 0.03])),
    m.wire,
  );
  adapter.visible = false;
  platter.add(adapter);
  platter.add(
    lip,
    mat,
    matName,
    spindle,
    record,
    marker('spindleBase', 0, T.rimDepth + DECK_SPEC.mat.thickness, 0),
    marker('spindleTip', 0, T.rimDepth + spindleHeight, 0),
  );
  return { platter, record, slots: bars, adapter };
}

/** Places `count` bars evenly round the rim; the rest of the instances are hidden. */
export function setSlots(bars: InstancedMesh, count: number): void {
  const r = T.diameter / 2;
  const y = T.rimDepth - T.slots.depth / 2;
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < bars.count; i++) {
    const a = (i / count) * Math.PI * 2;
    q.setFromAxisAngle(up, -a);
    m.compose(new Vector3(r * Math.cos(a), y, r * Math.sin(a)), q, new Vector3(1, 1, 1));
    if (i >= count) m.makeScale(0, 0, 0);
    bars.setMatrixAt(i, m);
  }
  bars.instanceMatrix.needsUpdate = true;
}

/**
 * The record: faces with planar UVs for the groove maps, a pressed edge, and paper labels.
 * Built at 12-inch size; smaller records scale the group (scene/deck/pose.ts).
 */
function buildRecord(m: PartMaterials): Group {
  const lp = DECK_SPEC.records.lp;
  const t = DECK_SPEC.records.thickness;
  const r = lp.diameter / 2;
  const face = part('recordFace', planarDisc(r, 0, 256).translate(0, t, 0), m.vinyl);
  const under = part('recordUnderside', planarDisc(r, 0, 128).rotateX(Math.PI), m.vinyl);
  const edge = part(
    'recordEdge',
    new CylinderGeometry(r, r, t, 256, 1, true).translate(0, t / 2, 0),
    m.vinyl,
  );
  const label = part(
    'recordLabel',
    planarDisc(lp.label / 2, lp.hole / 2, 128).translate(0, t + 0.00005, 0),
    m.label,
  );
  // Light from the label's edge on the grooves, rising with the bass (A19, X31). A soft ring: full
  // at the label, nothing a few millimetres out. It adds light, so it never darkens the record.
  const inner = lp.label / 2;
  const glowGeometry = new RingGeometry(inner, inner + GLOW_WIDTH, 128, 1)
    .rotateX(-Math.PI / 2)
    .translate(0, t + 0.00004, 0);
  const position = glowGeometry.getAttribute('position');
  const alpha = new Float32Array(position.count * 4);
  for (let i = 0; i < position.count; i++) {
    const r = Math.hypot(position.getX(i), position.getZ(i));
    alpha.set([1, 1, 1, r < inner + GLOW_WIDTH / 2 ? 1 : 0], i * 4);
  }
  glowGeometry.setAttribute('color', new BufferAttribute(alpha, 4));
  const glow = part('labelGlow', glowGeometry, m.glow);
  glow.castShadow = false;
  glow.receiveShadow = false;
  glow.visible = false;
  const record = group('record', face, under, edge, label, glow);
  return record;
}

function buildTonearm(m: PartMaterials): {
  tonearm: Group;
  yaw: Group;
  pitch: Group;
  cueLever: Group;
  rest: Group;
} {
  const tonearm = group('tonearm');
  tonearm.position.set(ARM.pivotX, P.topHeight, ARM.pivotZ);
  const AXIS = ARM_AXIS_HEIGHT;
  // The octagonal base plate is longer front to back (overhead: 64 × 94 mm); its sides are sloped.
  const base = part(
    'armBase',
    new CylinderGeometry(0.965, 1, ARM.basePlate.height, 8)
      .scale(ARM.basePlate.width / 2, 1, ARM.basePlate.depth / 2)
      .rotateY(Math.PI / 8)
      .translate(0, ARM.basePlate.height / 2, 0),
    m.black,
  );
  // The bearing post under the yoke: a bright turned bell on a black collar (v16, v11).
  const housing = part(
    'yokeHousing',
    lathe([
      [0.0145, ARM.basePlate.height],
      [0.0145, ARM.basePlate.height + 0.003],
      [0.012, ARM.basePlate.height + 0.0045],
      [0.0105, ARM.basePlate.height + 0.009],
      [0.0095, AXIS - 0.002],
    ]),
    m.silver,
  );
  const yaw = group('armYaw');
  yaw.rotation.y = -REST_DIRECTION;
  // The yoke turns with the arm: a flat black racket round the cap, forked at the rear where the
  // counterweight's stub passes through (v11, v16).
  const racket: [number, number][] = [];
  for (let i = -8; i <= 8; i++) {
    const a = (i / 8) * (Math.PI * 0.72);
    racket.push([0.0185 * Math.cos(a), 0.0185 * Math.sin(a)]);
  }
  racket.push([-0.038, 0.0105], [-0.038, 0.0065], [-0.019, 0.0065]);
  racket.push([-0.019, -0.0065], [-0.038, -0.0065], [-0.038, -0.0105]);
  const yoke = mergedPart(
    'gimbalYoke',
    [
      extrudeUp(polygon(racket), AXIS - 0.003, AXIS + 0.0035, 0.0006),
      lathe([
        [0.0145, AXIS + 0.003],
        [0.0145, CAP_HEIGHT - 0.0016],
        [0.0132, CAP_HEIGHT - 0.0004],
        [0.0118, CAP_HEIGHT - 0.0004],
        [0.0118, CAP_HEIGHT - 0.0016],
        [0, CAP_HEIGHT - 0.0016],
      ]),
    ],
    m.black,
  );
  // The cap's concentric rings, and the screws that carry the gimbal (v16, v68).
  const ring = (r0: number, r1: number): BufferGeometry =>
    lathe([
      [r0, CAP_HEIGHT - 0.0016],
      [r0, CAP_HEIGHT - 0.0006],
      [r1, CAP_HEIGHT - 0.0006],
      [r1, CAP_HEIGHT - 0.0016],
    ]);
  const yokeBright = mergedPart(
    'gimbalRings',
    [
      ring(0.0085, 0.0102),
      ring(0.0042, 0.0056),
      rod([0, AXIS, 0.0175], [0, AXIS, 0.0222], 0.0024),
      rod([0, AXIS, -0.0175], [0, AXIS, -0.0222], 0.0024),
    ],
    m.silver,
  );
  yaw.add(yoke, yokeBright);
  const pitch = group('armPitch');
  pitch.position.y = AXIS;
  const wand = group('wand');
  wand.rotation.y = WAND_ANGLE;
  const wandR = ARM.wandDiameter / 2;
  wand.add(
    part(
      'wandTube',
      cylinder(wandR, WAND_LENGTH, 24)
        .rotateZ(-Math.PI / 2)
        .translate(WAND_LENGTH / 2, 0, 0),
      m.black,
    ),
    part(
      'wandSocket',
      latheX([
        [wandR + 0.0009, 0.016],
        [wandR + 0.0018, 0.0175],
        [wandR + 0.0018, 0.0255],
        [wandR + 0.001, 0.027],
      ]),
      m.black,
    ),
    part(
      'wandCollar',
      latheX([
        [wandR + 0.0002, 0.027],
        [wandR + 0.0013, 0.0278],
        [wandR + 0.0013, 0.0335],
        [wandR + 0.0006, 0.0345],
        [wandR + 0.0006, 0.0375],
        [wandR + 0.0002, 0.038],
      ]),
      m.silver,
    ),
  );
  // The headshell runs from the wand's end to the stylus, at the pivot→stylus line's end.
  const headshell = group('headshell');
  headshell.position.set(EFFECTIVE_LENGTH, 0, 0);
  const hsLen = ARM.headshellLength;
  // An L in plan: a neck from the wand, widening to the side that carries the finger lift (v13, v84).
  const shell = polygon([
    [-hsLen + 0.008, 0.006],
    [-0.016, 0.0095],
    [0.008, 0.0095],
    [0.008, -0.012],
    [-0.012, -0.012],
    [-0.018, -0.006],
    [-hsLen + 0.008, -0.006],
  ]);
  const lift = new BoxGeometry(0.005, 0.0007, 0.017).translate(0.002, -0.0022, -0.0195);
  // Its tip is bent down, away from the record's edge of the shell (v13, v84).
  const liftTip = new BoxGeometry(0.005, 0.0007, 0.008)
    .rotateX(-0.6)
    .translate(0.002, -0.00445, -0.0313);
  headshell.add(
    part('headshellBody', extrudeUp(shell, -0.005, -0.001, 0.0003), m.black),
    part('fingerLift', mergeBlack([lift, liftTip]), m.steel),
    mergedPart(
      'cartridgeMount',
      [
        // Spacer block and the two screws holding the cartridge to the shell (v84).
        new BoxGeometry(0.021, 0.0028, 0.018).translate(-0.006, -0.0064, 0),
        rod([-0.006, -0.0078, 0.0127 / 2], [-0.006, -0.0052, 0.0127 / 2], 0.0011, 8),
        rod([-0.006, -0.0078, -0.0127 / 2], [-0.006, -0.0052, -0.0127 / 2], 0.0011, 8),
        // The stylus carrier at the front of the body.
        new BoxGeometry(0.0032, 0.003, 0.0052).translate(0.0012, -ARM.stylusDrop + 0.0032, 0),
      ],
      m.black,
    ),
    part(
      'cartridge',
      // Moulded, so its corners are soft (v84).
      extrudeUp(
        roundedRect(0.0185, 0.0165, 0.0012, -0.0074, 0),
        -ARM.stylusDrop + 0.002,
        -0.0078,
        0.0004,
      ),
      m.ivory,
    ),
    part(
      'cantilever',
      rod([0.0014, -ARM.stylusDrop + 0.0018, 0], [0, -ARM.stylusDrop, 0], 0.00028, 6),
      m.steel,
    ),
    mergedPart(
      'tagWires',
      [
        wire(
          [
            [-0.0165, -0.0115, 0.005],
            [-0.021, -0.0105, 0.0085],
            [-0.024, -0.0035, 0.009],
          ],
          0.00038,
          [0.72, 0.09, 0.07],
        ),
        wire(
          [
            [-0.0165, -0.0145, 0.002],
            [-0.0225, -0.0115, 0.0105],
            [-0.027, -0.0035, 0.0078],
          ],
          0.00038,
          [0.06, 0.42, 0.14],
        ),
        wire(
          [
            [-0.0165, -0.0115, -0.005],
            [-0.0215, -0.0105, -0.0085],
            [-0.024, -0.0035, -0.0085],
          ],
          0.00038,
          [0.07, 0.17, 0.62],
        ),
        wire(
          [
            [-0.0165, -0.0145, -0.002],
            [-0.023, -0.0115, -0.0105],
            [-0.027, -0.0035, -0.0074],
          ],
          0.00038,
          [0.82, 0.82, 0.78],
        ),
      ],
      m.wire,
    ),
    marker('stylusTip', 0, -ARM.stylusDrop, 0),
  );
  const print = part(
    'headshellPrint',
    atlasPlane(HEAD_DECAL.width, HEAD_DECAL.height, ATLAS_HEAD)
      .rotateY(Math.PI / 2)
      .translate(0.0004, -0.00095, -0.0012),
    m.silkscreen,
  );
  print.castShadow = false;
  headshell.add(print);
  // The real part is a small target, and the stylus tip itself has nothing under it: a hand takes
  // the arm anywhere near its head. Nothing draws this mesh; only Stage.pick sees it.
  const grab = part(
    'armGrabTarget',
    box(
      hsLen + 0.008,
      ARM.stylusDrop + 0.006,
      0.032,
      -hsLen / 2 + 0.006,
      -ARM.stylusDrop / 2,
      -0.002,
    ),
    m.black,
  );
  grab.visible = false;
  grab.userData.pickable = true;
  headshell.add(grab);
  // Turned so its body runs from the stylus back to the wand's end: the 23° offset.
  headshell.rotation.y = Math.atan2(
    -WAND_LENGTH * Math.sin(WAND_ANGLE),
    EFFECTIVE_LENGTH - WAND_LENGTH * Math.cos(WAND_ANGLE),
  );
  // Turned from solid: a stepped body with a groove and chamfers that catch the light (v11).
  const CW = ARM.counterweight;
  const cwR = CW.diameter / 2;
  const counterweight = part(
    'counterweight',
    latheX([
      [0, 0],
      [cwR - 0.0016, 0],
      [cwR, 0.0016],
      [cwR, CW.length * 0.52],
      [cwR - 0.0012, CW.length * 0.52 + 0.0005],
      [cwR - 0.0012, CW.length * 0.6],
      [cwR - 0.0003, CW.length * 0.6 + 0.0005],
      [cwR - 0.0003, CW.length - 0.002],
      [cwR - 0.0028, CW.length],
      [0.006, CW.length],
      [0.006, CW.length + 0.0035],
      [0.0042, CW.length + 0.0042],
    ]).translate(-CW.stubLength, 0, 0),
    m.silver,
  );
  const stub = part(
    'counterweightStub',
    cylinder(0.004, CW.stubLength, 16)
      .rotateZ(Math.PI / 2)
      .translate(-CW.stubLength / 2, 0, 0),
    m.steel,
  );
  pitch.add(wand, headshell, counterweight, stub);
  yaw.add(pitch);
  // The arm-lift: a slim bright rod on the lever, with a brass adjuster at its foot (v16).
  const cueLever = group(
    'cueLever',
    part('cueLeverBar', rod([0, 0.01, -0.002], [0, 0.01, 0.034], 0.0017), m.silver),
  );
  cueLever.position.set(0.024, ARM.basePlate.height, 0.012);
  const brass = part(
    'liftAdjuster',
    tinted(
      rod(
        [0.024, ARM.basePlate.height, 0.012],
        [0.024, ARM.basePlate.height + 0.0085, 0.012],
        0.0026,
      ),
      [0.34, 0.22, 0.06],
    ),
    m.wire,
  );
  // A U-shaped cradle on a post, which the wand rests in (v16, v68).
  const floor = AXIS - wandR - 0.0012;
  const rim = AXIS + 0.0035;
  const cradle = extrudeProfile(
    [
      [-0.0075, floor - 0.0025],
      [0.0075, floor - 0.0025],
      [0.0075, rim],
      [0.0058, rim],
      [0.0058, floor],
      [-0.0058, floor],
      [-0.0058, rim],
      [-0.0075, rim],
    ],
    -0.005,
    0.005,
    0.0003,
  ).rotateY(Math.PI / 2);
  const rest = group(
    'armRest',
    mergedPart(
      'armRestCradle',
      [cradle, new BoxGeometry(0.009, floor - 0.002, 0.008).translate(0, (floor - 0.002) / 2, 0)],
      m.black,
    ),
  );
  rest.position.set(0.075 * Math.cos(REST_DIRECTION), 0, 0.075 * Math.sin(REST_DIRECTION));
  tonearm.add(base, housing, brass, yaw, cueLever, rest, marker('pivotCap', 0, CAP_HEIGHT, 0));
  return { tonearm, yaw, pitch, cueLever, rest };
}

function buildCover(m: PartMaterials): { cover: Group; hinges: Group } {
  const hingeY = P.topHeight + 0.012;
  const hingeZ = -HALF_D + 0.012;
  const cover = group('cover');
  cover.position.set(0, hingeY, hingeZ);
  const w = CV.width;
  const d = CV.depth;
  const t = CV.wall;
  const top = P.heightWithCover - hingeY;
  const z0 = -HALF_D + (P.depth - d) / 2 - hingeZ;
  const z1 = z0 + d;
  const bottomRear = P.topHeight - hingeY;
  const bottomFront = S.frontTopHeight - hingeY;
  // Smoked acrylic lets about half the light through, so it casts no hard shadow (shadow maps
  // would treat it as opaque).
  const shell = (name: string, g: BufferGeometry): void => {
    const piece = part(name, g, m.cover);
    piece.castShadow = false;
    cover.add(piece);
  };
  shell('coverTop', box(w, t, d, 0, top - t / 2, (z0 + z1) / 2));
  shell('coverRear', box(w, top - bottomRear, t, 0, (top + bottomRear) / 2, z0 + t / 2));
  shell('coverFront', box(w, top - bottomFront, t, 0, (top + bottomFront) / 2, z1 - t / 2));
  const side: [number, number][] = [
    [z0, bottomRear],
    [STRIP_REAR_Z - hingeZ, bottomRear],
    [z1, bottomFront],
    [z1, top],
    [z0, top],
  ];
  shell('coverLeft', extrudeAlongX(side, -w / 2, -w / 2 + t));
  shell('coverRight', extrudeAlongX(side, w / 2 - t, w / 2));
  // The acrylic's edges read darker than its faces: a line of tinted light along each one.
  const edge = CV.edgeLine;
  const rail = (
    sx: number,
    sy: number,
    sz: number,
    x: number,
    y: number,
    z: number,
  ): BufferGeometry => new BoxGeometry(sx, sy, sz).translate(x, y, z);
  const frontSlope = Math.atan2(bottomFront - bottomRear, z1 - (STRIP_REAR_Z - hingeZ));
  const edges = mergedPart(
    'coverEdges',
    [
      rail(w, edge, edge, 0, top, z0),
      rail(w, edge, edge, 0, top, z1),
      rail(edge, edge, d, -w / 2, top, (z0 + z1) / 2),
      rail(edge, edge, d, w / 2, top, (z0 + z1) / 2),
      rail(edge, top - bottomFront, edge, -w / 2, (top + bottomFront) / 2, z1),
      rail(edge, top - bottomFront, edge, w / 2, (top + bottomFront) / 2, z1),
      rail(edge, top - bottomRear, edge, -w / 2, (top + bottomRear) / 2, z0),
      rail(edge, top - bottomRear, edge, w / 2, (top + bottomRear) / 2, z0),
      rail(w, edge, edge, 0, bottomFront, z1),
      rail(w, edge, edge, 0, bottomRear, z0),
      ...[-w / 2, w / 2].flatMap((x) => [
        rail(
          edge,
          edge,
          STRIP_REAR_Z - hingeZ - z0,
          x,
          bottomRear,
          (z0 + STRIP_REAR_Z - hingeZ) / 2,
        ),
        rail(
          edge,
          edge,
          Math.hypot(z1 - (STRIP_REAR_Z - hingeZ), bottomFront - bottomRear),
          0,
          0,
          0,
        )
          .rotateX(-frontSlope)
          .translate(x, (bottomRear + bottomFront) / 2, (STRIP_REAR_Z - hingeZ + z1) / 2),
      ]),
    ],
    m.coverEdge,
  );
  edges.castShadow = false;
  cover.add(edges);
  // A cast wedge in the plinth's paint with a dark round inset on its outer side, and the clear
  // leaf of the lid going into it (v11, v53).
  // Its clear leaf: the lid's own acrylic, running down into each hinge (v53, v16).
  shell(
    'coverLeaves',
    mergeBlack(
      [-1, 1].map((sx) =>
        box(
          0.022,
          0.03,
          CV.wall,
          sx * (HALF_W - CV.hingeInsetX),
          bottomRear - 0.012,
          z0 + CV.wall / 2,
        ),
      ),
    ),
  );
  const hinges = group('hinges');
  const H = { w: 0.03, front: 0.024, rear: 0.0, base: P.topHeight, high: P.topHeight + 0.03 };
  const springs: BufferGeometry[] = [];
  const housings: BufferGeometry[] = [];
  const insets: BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    const cx = sx * (HALF_W - CV.hingeInsetX);
    const wedge = extrudeProfile(
      [
        [-HALF_D, H.base],
        [-HALF_D + H.front, H.base],
        [-HALF_D + H.front, H.base + 0.012],
        [-HALF_D + 0.011, H.high],
        [-HALF_D, H.high],
      ],
      cx - H.w / 2,
      cx + H.w / 2,
      0.0012,
    );
    // The coil spring that balances the lid, so it holds at any angle (v15, W1).
    const coil: [number, number, number][] = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2 * 9;
      coil.push([
        // Half sunk in the housing's slope behind the leaf: a glimpse, not an ornament (v15).
        cx + 0.0016 * Math.cos(a),
        H.base + 0.003 + (i / 48) * 0.02,
        -HALF_D + H.front - 0.0012 - (i / 48) * 0.009 + 0.0016 * Math.sin(a),
      ]);
    }
    springs.push(wireBare(coil, 0.0003, 120));
    housings.push(boxUV(wedge, 0.4));
    insets.push(
      cylinder(0.0078, 0.0006, 32)
        .rotateZ(Math.PI / 2)
        .translate(cx + sx * (H.w / 2), H.base + 0.014, -HALF_D + 0.0095),
    );
  }
  hinges.add(
    mergedPart('hingeSprings', springs, m.steel),
    mergedPart('hingeHousings', housings, m.plinth),
    mergedPart('hingeInsets', insets, m.rubber),
  );
  return { cover, hinges };
}

export interface DeckParts {
  root: Group;
  subchassis: Group;
  platter: Group;
  record: Group;
  /** The bars between the rim's strobe slots. */
  slots: InstancedMesh;
  adapter: Mesh;
  labelGlow: Mesh;
  armYaw: Group;
  armPitch: Group;
  cueLever: Group;
  cover: Group;
  speedPlate: Group;
  startPlate: Group;
  cuePlate: Group;
  pitchWheel: Group;
  unlockPin: Group;
  /** Named points in world space: plinth corners, spindle, pivot cap, stylus tip, plate edges. */
  markers: Map<string, Object3D>;
}

export function buildDeck(materials: PartMaterials): DeckParts {
  const plinth = buildPlinth(materials);
  const strip = buildStrip(materials);
  const face = buildStripFace(materials);
  const { platter, record, slots, adapter } = buildPlatter(materials);
  const arm = buildTonearm(materials);
  const { cover, hinges } = buildCover(materials);
  // Platter and arm ride the sprung sub-chassis; plinth, strip and cover do not.
  const subchassis = group('subchassis', platter, arm.tonearm);
  const root = group('deck', plinth, strip, face.face, subchassis, hinges, cover);
  const markers = new Map<string, Object3D>();
  root.traverse((o) => {
    if (o.type === 'Object3D' && o.name) markers.set(o.name, o);
  });
  return {
    markers,
    root,
    subchassis,
    platter,
    record,
    slots,
    adapter,
    labelGlow: record.getObjectByName('labelGlow') as Mesh,
    armYaw: arm.yaw,
    armPitch: arm.pitch,
    cueLever: arm.cueLever,
    cover,
    speedPlate: face.speed,
    startPlate: face.start,
    cuePlate: face.cue,
    pitchWheel: face.wheel,
    unlockPin: face.pin,
  };
}

export type { Material };
