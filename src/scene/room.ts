import {
  BackSide,
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DECK_SPEC } from '../spec/deck';
import type { Surfaces } from './materials/surfaces';

/**
 * A late-1970s listening room at dusk, modelled just enough to give the deck something real to
 * reflect: a walnut credenza against a plastered wall, a window to the left, a tungsten table
 * lamp to the right, a few LP sleeves and the deck's own cables. Restrained, not cluttered.
 */

const R = DECK_SPEC.room;
const P = DECK_SPEC.plinth;

export interface Room {
  group: Group;
  wall: MeshStandardMaterial;
  /** The window pane's glow (seen directly and in reflections). */
  windowGlow: MeshBasicMaterial;
  /** The lamp shade's glow from inside. */
  shadeGlow: MeshStandardMaterial;
  /** Where the lamp's light comes from. */
  lampPosition: Vector3;
}

function mesh(name: string, geometry: BufferGeometry, material: Material, shadows = true): Mesh {
  const m = new Mesh(geometry, material);
  m.name = name;
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

function tiled(texture: Texture, x: number, y = x): Texture {
  const t = texture.clone();
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
}

export function buildRoom(s: Surfaces): Room {
  const group = new Group();
  group.name = 'room';
  const c = R.credenza;
  const floorY = -c.height;
  const b = R.bounds;

  const wall = new MeshStandardMaterial({
    color: R.lighting.dusk.wall,
    roughness: 0.92,
    map: tiled(s.plasterColour, 3),
    normalMap: tiled(s.plasterNormal, 3),
  });
  // The room as an inward-facing box: back wall with the window, side walls, ceiling.
  const roomW = b.right - b.left;
  const roomD = b.front - R.wallZ;
  const roomH = b.ceiling - floorY;
  const shell = mesh('roomShell', new BoxGeometry(roomW, roomH, roomD), wall, false);
  shell.geometry.translate((b.left + b.right) / 2, floorY + roomH / 2, R.wallZ + roomD / 2);
  (shell.material as MeshStandardMaterial).side = BackSide;
  group.add(shell);

  const floorMat = new MeshStandardMaterial({
    color: '#ffffff',
    map: tiled(s.walnutColour, 4, 8),
    roughnessMap: tiled(s.walnutRoughness, 4, 8),
    roughness: 1,
  });
  const floor = mesh('floor', new PlaneGeometry(roomW, roomD), floorMat, false);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((b.left + b.right) / 2, floorY + 0.001, R.wallZ + roomD / 2);
  group.add(floor);

  // Window in the left wall: an overcast sky behind the glass, a painted frame and a sill.
  const w = R.window;
  const wallX = b.left;
  const windowGlow = new MeshBasicMaterial({ color: '#9fb2c8' });
  const pane = mesh('windowPane', new PlaneGeometry(w.width, w.height), windowGlow, false);
  pane.rotation.y = Math.PI / 2;
  pane.position.set(wallX + 0.002, w.y, w.z);
  const frameMat = new MeshStandardMaterial({ color: '#e8e2d6', roughness: 0.6 });
  const frameParts: Mesh[] = [];
  const bar = (sz: number, sy: number, z: number, y: number): void => {
    const piece = new Mesh(new BoxGeometry(0.05, sy, sz));
    piece.position.set(wallX + 0.025, w.y + y, w.z + z);
    frameParts.push(piece);
  };
  bar(w.width + 0.08, 0.05, 0, w.height / 2);
  bar(w.width + 0.08, 0.05, 0, -w.height / 2);
  bar(0.05, w.height, -w.width / 2, 0);
  bar(0.05, w.height, w.width / 2, 0);
  bar(0.035, w.height, 0, 0);
  bar(w.width, 0.035, 0, w.height * 0.12);
  const sill = new Mesh(new BoxGeometry(0.14, 0.025, w.width + 0.16));
  sill.position.set(wallX + 0.07, w.y - w.height / 2 - 0.035, w.z);
  frameParts.push(sill);
  group.add(pane, merged('windowFrame', frameParts, frameMat));

  // Walnut credenza: top slab, carcass, two sliding doors with a reveal, short tapered legs.
  const walnut = new MeshPhysicalMaterial({
    color: '#ffffff',
    map: tiled(s.walnutColour, 2, 1),
    roughnessMap: tiled(s.walnutRoughness, 2, 1),
    roughness: 1,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
  });
  const cz = c.frontZ - c.depth / 2;
  const top = new Mesh(new BoxGeometry(c.width, c.top, c.depth));
  top.position.set(c.centreX, -c.top / 2, cz);
  const legH = 0.16;
  const bodyH = c.height - c.top - legH;
  const body = new Mesh(new BoxGeometry(c.width - 0.02, bodyH, c.depth - 0.03));
  body.position.set(c.centreX, -c.top - bodyH / 2, cz - 0.01);
  const reveal = mesh(
    'credenzaReveal',
    new BoxGeometry(0.004, bodyH - 0.04, 0.004),
    new MeshStandardMaterial({ color: '#120b07', roughness: 1 }),
  );
  reveal.position.set(c.centreX, -c.top - bodyH / 2, c.frontZ - 0.024);
  group.add(merged('credenza', [top, body], walnut), reveal);
  const legMat = new MeshStandardMaterial({ color: '#2a1a10', roughness: 0.5 });
  const legs: Mesh[] = [];
  for (const lx of [-1, 1]) {
    for (const lz of [-1, 1]) {
      const leg = new Mesh(new CylinderGeometry(0.018, 0.012, legH, 16));
      leg.position.set(
        c.centreX + lx * (c.width / 2 - 0.08),
        floorY + legH / 2,
        cz + lz * (c.depth / 2 - 0.06),
      );
      legs.push(leg);
    }
  }
  group.add(merged('credenzaLegs', legs, legMat));

  // Tungsten table lamp: turned base, brass stem, linen drum shade lit from within.
  const l = R.lamp;
  const brass = new MeshStandardMaterial({ color: '#8a6a3a', metalness: 1, roughness: 0.35 });
  const base = mesh(
    'lampBase',
    new CylinderGeometry(0.06, 0.075, 0.035, 48),
    new MeshStandardMaterial({ color: '#2b2622', roughness: 0.4 }),
  );
  base.position.set(l.x, 0.0175, l.z);
  const stem = mesh('lampStem', new CylinderGeometry(0.008, 0.008, l.shadeY - 0.05, 16), brass);
  stem.position.set(l.x, 0.035 + (l.shadeY - 0.05) / 2, l.z);
  const shadeGlow = new MeshStandardMaterial({
    color: '#d9c7a4',
    roughness: 1,
    emissive: '#ffb46a',
    emissiveIntensity: 1,
    side: DoubleSide,
    transparent: true,
    opacity: 0.96,
  });
  const shade = mesh(
    'lampShade',
    new CylinderGeometry(l.shadeRadius * 0.85, l.shadeRadius, 0.17, 64, 1, true),
    shadeGlow,
    false,
  );
  shade.position.set(l.x, l.shadeY, l.z);
  group.add(base, stem, shade);

  // A few LP sleeves standing at the left end, leaning on the wall: plain printed card, no real covers.
  const sleeveColours = ['#7a5a3a', '#2f4f55', '#c9b89a', '#8c3b2a', '#3e3a52'];
  const sleeves = sleeveColours.map((_, i) => {
    const sleeve = new Mesh(new BoxGeometry(0.004, 0.315, 0.315).translate(0, 0.1575, 0));
    sleeve.position.set(c.centreX - c.width / 2 + 0.06 + i * 0.006, 0, R.wallZ + 0.2);
    sleeve.rotation.z = -0.16 - i * 0.012;
    sleeve.rotation.y = Math.PI / 2 + (i - 2) * 0.02;
    return sleeve;
  });
  group.add(
    merged(
      'lpSleeves',
      sleeves,
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
      sleeveColours,
    ),
  );

  // Cables: the signal lead leaves the rear panel at the left, the mains lead at the right (v15),
  // and both drop behind the credenza.
  const cableMat = new MeshStandardMaterial({ color: '#0e0e0e', roughness: 0.55 });
  const lead = (x: number, drift: number): Mesh => {
    const curve = new CatmullRomCurve3([
      new Vector3(x, 0.03, -P.depth / 2 + 0.005),
      new Vector3(x + drift * 0.3, 0.012, -P.depth / 2 - 0.05),
      new Vector3(x + drift, 0.004, R.wallZ + 0.04),
      new Vector3(x + drift * 1.2, -0.04, R.wallZ + 0.03),
      new Vector3(x + drift * 1.3, -0.3, R.wallZ + 0.03),
    ]);
    return new Mesh(new TubeGeometry(curve, 48, 0.0025, 8, false));
  };
  group.add(merged('leads', [lead(-0.12, -0.06), lead(0.16, 0.08)], cableMat));

  return { group, wall, windowGlow, shadeGlow, lampPosition: new Vector3(l.x, l.shadeY, l.z) };
}

/**
 * Static room pieces that share a material are one mesh: the one-mesh-per-part rule is for the
 * deck, and every room draw call is paid twice (scene and transmission passes). `colours` gives
 * each piece its own vertex colour.
 */
function merged(name: string, pieces: Mesh[], material: Material, colours?: string[]): Mesh {
  const geometries = pieces.map((piece, i) => {
    piece.updateMatrix();
    const g = piece.geometry.index ? piece.geometry.toNonIndexed() : piece.geometry.clone();
    g.applyMatrix4(piece.matrix);
    if (colours) {
      const c = new Color(colours[i]);
      const n = g.getAttribute('position').count;
      const data = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) data.set([c.r, c.g, c.b], k * 3);
      g.setAttribute('color', new Float32BufferAttribute(data, 3));
    }
    return g;
  });
  const geometry = mergeGeometries(geometries);
  if (!geometry) throw new Error(`cannot merge ${name}`);
  return mesh(name, geometry, material);
}
