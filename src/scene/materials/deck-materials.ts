import {
  AdditiveBlending,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector2,
  type Texture,
} from 'three';
import { DECK_SPEC } from '../../spec/deck';
import type { Surfaces } from './surfaces';

/** Every material on the deck. The keys are what scene/deck/build.ts assigns to its parts. */
export interface DeckMaterials {
  plinth: MeshPhysicalMaterial;
  aluminium: MeshPhysicalMaterial;
  plate: MeshPhysicalMaterial;
  zamak: MeshPhysicalMaterial;
  lip: MeshPhysicalMaterial;
  rubber: MeshStandardMaterial;
  steel: MeshStandardMaterial;
  black: MeshPhysicalMaterial;
  silver: MeshPhysicalMaterial;
  vinyl: MeshPhysicalMaterial;
  label: MeshStandardMaterial;
  foot: MeshStandardMaterial;
  cover: MeshPhysicalMaterial;
  silkscreen: MeshStandardMaterial;
  neon: MeshStandardMaterial;
  /** The stylus body's pale plastic (v84). */
  ivory: MeshStandardMaterial;
  /** The bass-reactive light round the label; adds to what is under it. */
  glow: MeshBasicMaterial;
  /** Acrylic seen edge-on: nearly black with a green cast (v16, v65, v15). */
  coverEdge: MeshStandardMaterial;
  /** Tag wires and the brass adjuster: colour per vertex, so they share one draw call. */
  wire: MeshStandardMaterial;
}

export type FinishName = keyof typeof DECK_SPEC.finishes;

const M = DECK_SPEC.materials;

/** A texture repeated `n` times over a part's UVs; shares the baked image. */
function tiled(texture: Texture, x: number, y = x): Texture {
  const t = texture.clone();
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
}

export function createDeckMaterials(s: Surfaces, silkscreen: Texture): DeckMaterials {
  return {
    // Metallic anthracite paint: fine grain, a little sparkle, never glossy (v16, v11).
    plinth: new MeshPhysicalMaterial({
      color: M.plinthGrey.colour,
      metalness: M.plinthGrey.metalness,
      roughness: 1,
      roughnessMap: tiled(s.plinthRoughness, 1),
      normalMap: tiled(s.plinthNormal, 3),
      normalScale: new Vector2(0.06, 0.06),
    }),
    // Brushed aluminium: strokes along the strip, anisotropic highlights (v13, v65).
    aluminium: new MeshPhysicalMaterial({
      color: M.aluminium.colour,
      metalness: 1,
      roughness: 1,
      // Mostly anisotropy and streaked roughness; a whisper of stroke normals shows at macro and
      // mips away at viewing distance, where stronger ones alias into sparkle.
      // Repeated across the strokes: hairlines, not bands (v13, v16).
      roughnessMap: tiled(s.brushedRoughness, 1, 7),
      normalMap: tiled(s.brushedNormal, 1, 7),
      normalScale: new Vector2(0.05, 0.05),
      anisotropy: M.aluminium.anisotropy,
    }),
    plate: new MeshPhysicalMaterial({
      color: M.plateTop.colour,
      metalness: 1,
      roughness: 0.95,
      // Repeated across the strokes: hairlines, not bands (v13, v16).
      roughnessMap: tiled(s.plateRoughness, 1, 7),
      normalMap: tiled(s.brushedNormal, 1, 7),
      normalScale: new Vector2(0.05, 0.05),
      anisotropy: M.plateTop.anisotropy,
    }),
    // Cast zinc alloy with a lacquered satin finish (v13, v11).
    zamak: new MeshPhysicalMaterial({
      color: M.zamak.colour,
      metalness: 1,
      roughness: 1,
      roughnessMap: tiled(s.castRoughness, 6, 1),
      normalMap: tiled(s.castNormal, 6, 1),
    }),
    lip: new MeshPhysicalMaterial({
      color: M.machinedLip.colour,
      metalness: 1,
      roughness: M.machinedLip.roughness,
      anisotropy: M.machinedLip.anisotropy,
    }),
    rubber: new MeshStandardMaterial({
      color: M.rubber.colour,
      roughness: M.rubber.roughness,
      metalness: 0,
      normalMap: tiled(s.rubberNormal, 3),
    }),
    steel: new MeshStandardMaterial({
      color: M.steel.colour,
      roughness: M.steel.roughness,
      metalness: 1,
    }),
    black: new MeshPhysicalMaterial({
      color: M.blackAnodised.colour,
      roughness: M.blackAnodised.roughness,
      metalness: M.blackAnodised.metalness,
      clearcoat: 0.2,
    }),
    silver: new MeshPhysicalMaterial({
      color: M.silverCollar.colour,
      roughness: M.silverCollar.roughness,
      metalness: 1,
      anisotropy: 0.15,
    }),
    // The record's maps are set per program (materials/record.ts).
    vinyl: new MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 1,
      metalness: 0,
      anisotropy: 1,
      clearcoat: M.vinyl.clearcoat,
      clearcoatRoughness: 0.18,
      specularIntensity: 0.6,
    }),
    label: new MeshStandardMaterial({
      color: M.labelPaper.colour,
      roughness: M.labelPaper.roughness,
      metalness: 0,
    }),
    foot: new MeshStandardMaterial({
      color: M.foot.colour,
      roughness: M.foot.roughness,
      metalness: 0,
    }),
    // Smoked acrylic: real transmission and thickness, faint scratches and prints (v16, v65, v73).
    cover: new MeshPhysicalMaterial({
      color: '#ffffff',
      metalness: 0,
      roughness: 1,
      roughnessMap: s.acrylicRoughness,
      transmission: 1,
      thickness: DECK_SPEC.cover.wall,
      ior: 1.49,
      attenuationColor: DECK_SPEC.cover.tint,
      // About 55 % through one 3 mm wall: tint^(wall / distance) = 0.55 (spec cover.transmission).
      attenuationDistance: 0.0136,
      specularIntensity: 1,
      side: 2,
    }),
    // The printing's own colours are in the atlas: dark on the strip, white on the headshell.
    silkscreen: new MeshStandardMaterial({
      color: '#ffffff',
      map: silkscreen,
      roughness: 0.6,
      metalness: 0,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    coverEdge: new MeshStandardMaterial({ color: '#0a120f', roughness: 0.18, metalness: 0 }),
    glow: new MeshBasicMaterial({
      color: '#ffffff',
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
    ivory: new MeshStandardMaterial({ color: '#d9cfb8', roughness: 0.55, metalness: 0 }),
    wire: new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.42 }),
    // The strobe neon behind the rim slots (v84): warm orange-red, lit only while powered.
    neon: new MeshStandardMaterial({
      color: '#000000',
      emissive: '#ff5a1f',
      emissiveIntensity: 0,
      roughness: 1,
    }),
  };
}

/** Swaps the plinth to a finish. Each finish is a material preset; the hero grey is the default. */
export function applyFinish(m: DeckMaterials, finish: FinishName, s: Surfaces): void {
  const p = m.plinth;
  const f = DECK_SPEC.finishes[finish];
  p.transmission = 0;
  p.clearcoat = 'clearcoat' in f ? f.clearcoat : 0;
  p.clearcoatRoughness = 0.06;
  p.map = null;
  p.roughnessMap = tiled(s.plinthRoughness, 1);
  p.normalMap = tiled(s.plinthNormal, 3);
  switch (finish) {
    case 'anthracite':
      p.color.set(M.plinthGrey.colour);
      p.metalness = M.plinthGrey.metalness;
      break;
    case 'black':
      p.color.set(M.plinthBlack.colour);
      p.metalness = M.plinthBlack.metalness;
      break;
    case 'gloss':
      p.color.set('#0c0c0d');
      p.metalness = 0;
      p.roughnessMap = null;
      p.roughness = 0.35;
      break;
    case 'walnut':
      p.color.set('#ffffff');
      p.map = tiled(s.walnutColour, 1, 1);
      p.roughnessMap = tiled(s.walnutRoughness, 1, 1);
      p.normalMap = null;
      p.metalness = 0;
      p.clearcoat = 0.4;
      break;
    case 'aluminium':
      p.color.set(M.aluminium.colour);
      p.metalness = 1;
      // As on the strip: brushing through anisotropy and streaked roughness, no normal map.
      p.roughnessMap = tiled(s.brushedRoughness, 1);
      p.normalMap = null;
      p.anisotropy = 0.8;
      break;
    case 'clear':
      p.color.set('#ffffff');
      p.metalness = 0;
      p.roughnessMap = null;
      p.normalMap = null;
      p.roughness = 0.04;
      p.transmission = 0.92;
      p.thickness = 0.012;
      p.ior = 1.49;
      break;
  }
  if (finish !== 'aluminium') p.anisotropy = 0;
  p.needsUpdate = true;
  // html-1's Clear theme: glass plinth with a translucent record whose grooves shimmer like
  // oil on water (its .vinyl-iridescent layer). Every other finish plays black vinyl.
  const v = m.vinyl;
  const clear = finish === 'clear';
  v.color.set(clear ? '#d9dde6' : '#ffffff');
  v.transmission = clear ? 0.7 : 0;
  v.thickness = clear ? DECK_SPEC.records.thickness : 0;
  v.ior = 1.5;
  v.iridescence = clear ? 0.8 : 0;
  v.iridescenceIOR = 1.6;
  v.iridescenceThicknessRange = [220, 640];
  // The albedo map is black vinyl with dust; a clear record shows the light through it instead.
  v.map = clear ? null : ((v.userData.albedo as Texture | undefined) ?? null);
  v.needsUpdate = true;
}
