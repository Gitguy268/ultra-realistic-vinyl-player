import {
  BufferAttribute,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  LatheGeometry,
  Quaternion,
  Shape,
  TubeGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
  type Mesh,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { part } from './parts';

/** Machined and moulded shapes: nothing on a real deck has a razor edge. */

/**
 * A profile drawn in (z, y), extruded along X from x0 to x1. `bevel` rounds off every edge while
 * the outer size stays the drawn one.
 */
export function extrudeProfile(
  profile: [number, number][],
  x0: number,
  x1: number,
  bevel = 0,
): BufferGeometry {
  const shape = new Shape(profile.map(([z, y]) => new Vector2(z, y)));
  const geometry = new ExtrudeGeometry(shape, {
    depth: x1 - x0 - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 1,
    curveSegments: 4,
  });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(x1 - bevel, 0, 0);
  return geometry;
}

/** A plan shape in (x, z), extruded up from y0 to y1, its top and bottom edges chamfered. */
export function extrudeUp(shape: Shape, y0: number, y1: number, bevel = 0): BufferGeometry {
  const geometry = new ExtrudeGeometry(shape, {
    depth: y1 - y0 - 2 * bevel,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
    curveSegments: 8,
  });
  // A quarter turn keeps the shape's second axis as plan z and sends the extrusion straight down.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, y1 - bevel, 0);
  return geometry;
}

export function roundedRect(w: number, d: number, r: number, x = 0, z = 0): Shape {
  const s = new Shape();
  const [x0, x1, z0, z1] = [x - w / 2, x + w / 2, z - d / 2, z + d / 2];
  s.moveTo(x0 + r, z0);
  s.lineTo(x1 - r, z0);
  s.quadraticCurveTo(x1, z0, x1, z0 + r);
  s.lineTo(x1, z1 - r);
  s.quadraticCurveTo(x1, z1, x1 - r, z1);
  s.lineTo(x0 + r, z1);
  s.quadraticCurveTo(x0, z1, x0, z1 - r);
  s.lineTo(x0, z0 + r);
  s.quadraticCurveTo(x0, z0, x0 + r, z0);
  return s;
}

export function polygon(points: readonly (readonly [number, number])[]): Shape {
  return new Shape(points.map(([x, z]) => new Vector2(x, z)));
}

/** Turned about Y from a (radius, height) profile. */
export function lathe(
  profile: readonly (readonly [number, number])[],
  segments = 48,
): BufferGeometry {
  return new LatheGeometry(
    profile.map(([r, y]) => new Vector2(r, y)),
    segments,
  );
}

/** Turned about X: the same profile, with height running along +X. */
export function latheX(
  profile: readonly (readonly [number, number])[],
  segments = 48,
): BufferGeometry {
  return lathe(profile, segments).rotateZ(-Math.PI / 2);
}

export function rod(
  from: readonly number[],
  to: readonly number[],
  r: number,
  segments = 12,
): BufferGeometry {
  const a = new Vector3(from[0], from[1], from[2]);
  const b = new Vector3(to[0], to[1], to[2]);
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize());
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return new CylinderGeometry(r, r, a.distanceTo(b), segments)
    .applyQuaternion(q)
    .translate(mid.x, mid.y, mid.z);
}

/** A tube through the given points, for a material of its own colour. */
export function wireBare(
  points: readonly (readonly [number, number, number])[],
  radius: number,
  segments = 32,
): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
  return new TubeGeometry(curve, segments, radius, 6, false);
}

/** A flexible wire through the given points, one colour along its length. */
export function wire(
  points: readonly (readonly [number, number, number])[],
  radius: number,
  colour: readonly [number, number, number],
): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)));
  const g = new TubeGeometry(curve, 16, radius, 6, false);
  return tinted(g, colour);
}

/** Bakes one colour into a geometry, so several can share a vertex-coloured material. */
export function tinted(
  g: BufferGeometry,
  colour: readonly [number, number, number],
): BufferGeometry {
  const n = g.getAttribute('position').count;
  const data = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) data.set(colour, i * 3);
  g.setAttribute('color', new BufferAttribute(data, 3));
  return g;
}

/** One draw call for many small pieces of the same material. */
export function mergedPart(name: string, pieces: BufferGeometry[], material: Material): Mesh {
  const flat = pieces.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat);
  if (!merged) throw new Error(`pieces of ${name} do not merge`);
  return part(name, merged, material);
}
