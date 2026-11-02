import type { Texture, WebGLRenderer } from 'three';
import { bake } from './bake';

/**
 * Procedural surface textures, baked once on the GPU at startup. No image files: every grain,
 * brush stroke, fingerprint and wood figure is generated here. Height fields become normal maps
 * by finite differences in the same shader; roughness lives in the green channel, as three.js
 * reads it.
 */

/** A height field `h(uv)` turned into a tangent-space normal map. `strength` scales the slopes. */
const normalFrom = (height: string, strength: number, texel: number): string => /* glsl */ `
  ${height}
  void main() {
    float e = ${texel.toFixed(8)};
    float hx = h(vUv + vec2(e, 0.0)) - h(vUv - vec2(e, 0.0));
    float hy = h(vUv + vec2(0.0, e)) - h(vUv - vec2(0.0, e));
    vec3 n = normalize(vec3(-hx * ${strength.toFixed(3)}, -hy * ${strength.toFixed(3)}, 1.0));
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }
`;

export interface Surfaces {
  /** Fine matte grain of the painted top plate: normal map. */
  plinthNormal: Texture;
  /** Grain and faint dust in the plinth paint: roughness in G. */
  plinthRoughness: Texture;
  /** Brushed aluminium, strokes along U: normal map. */
  brushedNormal: Texture;
  /** Brush streaks and light swirl wear: roughness in G. */
  brushedRoughness: Texture;
  /** The plates: the same brushing, duller where fingertips have rested for forty years (v73, v69). */
  plateRoughness: Texture;
  /** Cast zinc alloy: mottled roughness in G. */
  castRoughness: Texture;
  castNormal: Texture;
  /** Rubber mat: fine stipple normal map. */
  rubberNormal: Texture;
  /** Acrylic: micro-scratches and two faint fingerprints, roughness in G. */
  acrylicRoughness: Texture;
  /** Walnut veneer: colour and roughness. */
  walnutColour: Texture;
  walnutRoughness: Texture;
  /** Wall paint over plaster: brightness variation (colour) and normal. */
  plasterColour: Texture;
  plasterNormal: Texture;
}

export function bakeSurfaces(renderer: WebGLRenderer): Surfaces {
  const size = 1024;
  const texel = 1 / size;

  const plinthHeight = /* glsl */ `
    float h(vec2 uv) {
      float fine = vnoise(uv * 512.0, vec2(512.0));
      float sparkle = step(0.995, hash12(floor(uv * 1024.0))) * 0.25;
      // A fine stipple only: broad undulation reads as hammered paint up close (v13 end block).
      return fine * 0.98 + fbm(uv * 64.0, vec2(64.0), 3) * 0.02 + sparkle;
    }`;
  const brushedHeight = /* glsl */ `
    float h(vec2 uv) {
      // Long strokes along U: noise squeezed 1:200, plus a few deeper scratches.
      float strokes = fbm(vec2(uv.x * 4.0, uv.y * 800.0), vec2(4.0, 800.0), 4);
      float deep = smoothstep(0.92, 1.0, vnoise(vec2(uv.x * 2.0, uv.y * 300.0), vec2(2.0, 300.0)));
      return strokes + deep * 0.4;
    }`;
  const castHeight = /* glsl */ `
    float h(vec2 uv) { return fbm(uv * 48.0, vec2(48.0), 5); }`;
  const rubberHeight = /* glsl */ `
    float h(vec2 uv) { return vnoise(uv * 700.0, vec2(700.0)) * 0.6 + fbm(uv * 90.0, vec2(90.0), 3) * 0.4; }`;
  const plasterHeight = /* glsl */ `
    float h(vec2 uv) { return fbm(uv * 24.0, vec2(24.0), 6); }`;

  return {
    plinthNormal: bake(renderer, normalFrom(plinthHeight, 1.1, texel), { size }),
    plinthRoughness: bake(
      renderer,
      /* glsl */ `
      void main() {
        float grain = vnoise(vUv * 256.0, vec2(256.0));
        float blotch = fbm(vUv * 8.0, vec2(8.0), 4);
        float r = 0.58 + grain * 0.08 + (blotch - 0.5) * 0.08;
        gl_FragColor = vec4(1.0, r, 0.0, 1.0);
      }`,
      { size: 512 },
    ),
    brushedNormal: bake(renderer, normalFrom(brushedHeight, 0.9, 1 / 512), { size: 512 }),
    brushedRoughness: bake(
      renderer,
      /* glsl */ `
      void main() {
        float streak = fbm(vec2(vUv.x * 3.0, vUv.y * 600.0), vec2(3.0, 600.0), 3);
        // Straight strokes only: the strip's grain runs dead along its length (v13, v16).
        float hairline = fbm(vec2(vUv.x * 7.0, vUv.y * 2048.0), vec2(7.0, 2048.0), 2);
        float r = 0.2 + streak * 0.2 + hairline * 0.12;
        gl_FragColor = vec4(1.0, r, 0.0, 1.0);
      }`,
      { size },
    ),
    plateRoughness: bake(
      renderer,
      /* glsl */ `
      void main() {
        float streak = fbm(vec2(vUv.x * 3.0, vUv.y * 600.0), vec2(3.0, 600.0), 3);
        float hairline = fbm(vec2(vUv.x * 7.0, vUv.y * 2048.0), vec2(7.0, 2048.0), 2);
        // Soft patches of polish and grime, large against the strokes, never lines.
        float worn = smoothstep(0.45, 0.8, fbm(vUv * 5.0, vec2(5.0), 3));
        float r = 0.2 + streak * 0.2 + hairline * 0.12 + worn * 0.1;
        gl_FragColor = vec4(1.0, r, 0.0, 1.0);
      }`,
      { size: 512 },
    ),
    castRoughness: bake(
      renderer,
      /* glsl */ `
      void main() {
        float r = 0.42 + fbm(vUv * 32.0, vec2(32.0), 5) * 0.16;
        gl_FragColor = vec4(1.0, r, 0.0, 1.0);
      }`,
      { size: 512 },
    ),
    castNormal: bake(renderer, normalFrom(castHeight, 1.2, 1 / 512), { size: 512 }),
    rubberNormal: bake(renderer, normalFrom(rubberHeight, 1.4, 1 / 512), { size: 512 }),
    acrylicRoughness: bake(
      renderer,
      /* glsl */ `
      float print(vec2 uv, vec2 at, float angle) {
        vec2 p = uv - at;
        float s = sin(angle), c = cos(angle);
        p = mat2(c, -s, s, c) * p;
        p.y *= 1.4;
        float d = length(p);
        float ridges = 0.5 + 0.5 * sin(d * 1400.0 + vnoise(p * 120.0, vec2(4096.0)) * 6.0);
        return ridges * smoothstep(0.045, 0.02, d);
      }
      void main() {
        float r = 0.02;
        // Hairline scratches in every direction, a few hundred over the lid.
        for (int i = 0; i < 6; i++) {
          float fi = float(i);
          float ang = hash12(vec2(fi, 3.0)) * 3.1416;
          vec2 dir = vec2(cos(ang), sin(ang));
          float line = abs(fract(dot(vUv, vec2(-dir.y, dir.x)) * (40.0 + fi * 17.0) + hash12(vec2(fi, 9.0))) - 0.5);
          float along = vnoise(vec2(dot(vUv, dir) * (6.0 + fi), fi), vec2(4096.0));
          r += smoothstep(0.004, 0.0, line) * step(0.72, along) * 0.18;
        }
        r += print(vUv, vec2(0.83, 0.86), 0.4) * 0.22 + print(vUv, vec2(0.18, 0.9), -0.3) * 0.16;
        gl_FragColor = vec4(1.0, clamp(r, 0.0, 1.0), 0.0, 1.0);
      }`,
      { size },
    ),
    walnutColour: bake(
      renderer,
      /* glsl */ `
      vec3 toSrgb(vec3 c) { return pow(c, vec3(1.0 / 2.2)); }
      void main() {
        // Flat-cut figure: growth rings bent by slow noise, pores along the grain.
        vec2 uv = vUv;
        // Quarter-cut: mostly straight grain with a slow drift, no cartoon cathedrals; fine fibres on top.
        float warp = fbm(vec2(uv.x * 2.0, uv.y * 4.0), vec2(2.0, 4.0), 4);
        // Growth is uneven: the rings bunch and spread instead of repeating like corrugation.
        float rings = fract((uv.y + warp * 0.11 + 0.012 * sin(uv.y * 6.2832 * 5.0)) * 58.0);
        float ring = smoothstep(0.0, 0.4, rings) * smoothstep(1.0, 0.5, rings);
        // Fibres follow the same drift, and are far longer than any noise cell shows: no bricks.
        float fibre = vnoise(vec2(uv.x * 3.0 + warp, (uv.y + warp * 0.11) * 900.0), vec2(3.0, 900.0));
        // Pores run with the grain: long along U, fine across it.
        float pores = step(0.88, vnoise(vec2(uv.x * 60.0, uv.y * 900.0), vec2(60.0, 900.0)));
        vec3 light = vec3(0.16, 0.085, 0.045);
        vec3 dark = vec3(0.075, 0.037, 0.02);
        vec3 c = mix(dark, light, ring * 0.2 + fibre * 0.26 + fbm(vec2(uv.x * 3.0, uv.y * 12.0), vec2(3.0, 12.0), 3) * 0.54);
        c *= 1.0 - pores * 0.25;
        gl_FragColor = vec4(toSrgb(c), 1.0);
      }`,
      { size, srgb: true },
    ),
    walnutRoughness: bake(
      renderer,
      /* glsl */ `
      void main() {
        float pores = step(0.82, vnoise(vec2(vUv.x * 60.0, vUv.y * 900.0), vec2(60.0, 900.0)));
        gl_FragColor = vec4(1.0, 0.42 + pores * 0.1 + fbm(vUv * 40.0, vec2(40.0), 3) * 0.1, 0.0, 1.0);
      }`,
      { size: 512 },
    ),
    plasterColour: bake(
      renderer,
      /* glsl */ `
      void main() {
        float v = 0.92 + (fbm(vUv * 12.0, vec2(12.0), 6) - 0.5) * 0.05;
        gl_FragColor = vec4(vec3(pow(v, 1.0 / 2.2)), 1.0);
      }`,
      { size: 512, srgb: true },
    ),
    plasterNormal: bake(renderer, normalFrom(plasterHeight, 0.5, 1 / 512), { size: 512 }),
  };
}
