import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RGBAFormat,
  UnsignedByteType,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  WebGLRenderTarget,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { NOISE_GLSL } from './noise.glsl';

export interface BakeOptions {
  size: number;
  /** sRGB colour data (albedo) or linear data (roughness, normals, anisotropy). */
  srgb?: boolean;
  repeat?: [number, number];
}

const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quad = new PlaneGeometry(2, 2);

/** Total bytes of the textures baked so far, with mipmaps: the 100 MB budget is checked against it. */
export let bakedBytes = 0;

/**
 * Renders a fragment shader into a texture once, on the GPU, and keeps the result. The shader gets `vUv` (0..1) and the
 * noise library, and writes gl_FragColor. Used for every procedural surface: no image files.
 */
export function bake(renderer: WebGLRenderer, fragment: string, options: BakeOptions): Texture {
  const target = new WebGLRenderTarget(options.size, options.size, { depthBuffer: false });
  const material = new ShaderMaterial({
    vertexShader:
      'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `varying vec2 vUv;\n${NOISE_GLSL}\n${fragment}`,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new Scene();
  const mesh = new Mesh(quad, material);
  scene.add(mesh);
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(previous);
  // Read back into an ordinary texture: a render target's texture cannot be cloned for tiling
  // (a clone would upload an empty image), and this one never changes again.
  const pixels = new Uint8Array(options.size * options.size * 4);
  renderer.readRenderTargetPixels(target, 0, 0, options.size, options.size, pixels);
  material.dispose();
  target.dispose();
  const texture = new DataTexture(pixels, options.size, options.size, RGBAFormat, UnsignedByteType);
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (options.srgb) texture.colorSpace = 'srgb';
  if (options.repeat) texture.repeat.set(...options.repeat);
  texture.needsUpdate = true;
  bakedBytes += Math.round(options.size * options.size * 4 * (4 / 3));
  return texture;
}
