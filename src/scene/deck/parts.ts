import {
  Float32BufferAttribute,
  Group,
  Mesh,
  Object3D,
  type BufferGeometry,
  type Material,
} from 'three';

/** A named mesh: every part has its own mesh, material and pick volume. */
export function part(name: string, geometry: BufferGeometry, material: Material): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A named group: a pivot or an assembly. */
export function group(name: string, ...children: Object3D[]): Group {
  const g = new Group();
  g.name = name;
  if (children.length) g.add(...children);
  return g;
}

/** An invisible named point that checks and picking read in world space. */
export function marker(name: string, x: number, y: number, z: number): Object3D {
  const m = new Object3D();
  m.name = name;
  m.position.set(x, y, z);
  return m;
}

/**
 * Box-projected UVs in world scale: each face takes the two axes it lies along, divided by
 * `metresPerTile`. U always runs along X where it can, so brushed metal brushes along the strip.
 */
export function boxUV(geometry: BufferGeometry, metresPerTile: number): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.computeVertexNormals();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const [u, v] =
      ay >= ax && ay >= az
        ? [pos.getX(i), pos.getZ(i)]
        : az >= ax
          ? [pos.getX(i), pos.getY(i)]
          : [pos.getZ(i), pos.getY(i)];
    uv[i * 2] = u / metresPerTile;
    uv[i * 2 + 1] = v / metresPerTile;
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}
