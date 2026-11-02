import {
  AddEquation,
  CustomBlending,
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  Mesh,
  NoBlending,
  OneFactor,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from 'three';

/**
 * Restrained post-processing: the scene renders into a linear HDR target, a mip-chain bloom
 * picks up only what is truly bright (the lamp, the window, the neon), and one composite pass
 * does the rest: depth of field for the macro views only, ACES tone mapping at the camera's
 * exposure, sRGB, a gentle vignette, 1.5 % grain and chromatic aberration that stays under a
 * pixel even in the corners.
 */

const VERTEX =
  'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const DOWNSAMPLE = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 texel;
  uniform float threshold;
  uniform float exposure;
  varying vec2 vUv;
  void main() {
    // Five bilinear taps: a soft 4×4 box with the centre weighted.
    vec3 c = texture2D(tInput, vUv).rgb * 0.5;
    c += texture2D(tInput, vUv + texel * vec2(-1.0, -1.0)).rgb * 0.125;
    c += texture2D(tInput, vUv + texel * vec2( 1.0, -1.0)).rgb * 0.125;
    c += texture2D(tInput, vUv + texel * vec2(-1.0,  1.0)).rgb * 0.125;
    c += texture2D(tInput, vUv + texel * vec2( 1.0,  1.0)).rgb * 0.125;
    if (threshold > 0.0) {
      // Soft knee on exposed luminance: only light brighter than paper white blooms.
      vec3 e = c * exposure;
      float l = max(e.r, max(e.g, e.b));
      float k = clamp(l - threshold + 0.5, 0.0, 1.0);
      float soft = k * k * 0.5;
      float w = max(soft, l - threshold) / max(l, 1e-4);
      c = e * w;
    }
    gl_FragColor = vec4(c, 1.0);
  }
`;

const UPSAMPLE = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 texel;
  varying vec2 vUv;
  void main() {
    // 3×3 tent filter.
    vec3 c = texture2D(tInput, vUv).rgb * 4.0;
    c += texture2D(tInput, vUv + texel * vec2(-1.0, 0.0)).rgb * 2.0;
    c += texture2D(tInput, vUv + texel * vec2( 1.0, 0.0)).rgb * 2.0;
    c += texture2D(tInput, vUv + texel * vec2(0.0, -1.0)).rgb * 2.0;
    c += texture2D(tInput, vUv + texel * vec2(0.0,  1.0)).rgb * 2.0;
    c += texture2D(tInput, vUv + texel * vec2(-1.0, -1.0)).rgb;
    c += texture2D(tInput, vUv + texel * vec2( 1.0, -1.0)).rgb;
    c += texture2D(tInput, vUv + texel * vec2(-1.0,  1.0)).rgb;
    c += texture2D(tInput, vUv + texel * vec2( 1.0,  1.0)).rgb;
    gl_FragColor = vec4(c / 16.0, 1.0);
  }
`;

const COMPOSITE = /* glsl */ `
  uniform sampler2D tScene;
  uniform sampler2D tDepth;
  uniform sampler2D tBloom;
  uniform vec2 resolution;
  uniform float exposure;
  uniform float bloomStrength;
  uniform float grain;
  uniform float vignette;
  uniform float aberration;
  uniform float time;
  uniform float dofAperture;
  uniform float focusDistance;
  uniform float cameraNear;
  uniform float cameraFar;
  varying vec2 vUv;

  vec3 RRTAndODTFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 aces(vec3 color) {
    const mat3 inM = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 outM = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    color = inM * (color / 0.6);
    color = RRTAndODTFit(color);
    return clamp(outM * color, 0.0, 1.0);
  }
  vec3 toSrgb(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float viewDistance(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return (cameraNear * cameraFar) / ((cameraFar - cameraNear) * d - cameraFar) * -1.0;
  }

  vec3 sampleScene(vec2 uv) {
    // Lateral chromatic aberration: red and blue shift outward and inward with r².
    vec2 fromCentre = uv - 0.5;
    vec2 shift = fromCentre * dot(fromCentre, fromCentre) * 2.0 * aberration / resolution;
    return vec3(texture2D(tScene, uv + shift).r, texture2D(tScene, uv).g, texture2D(tScene, uv - shift).b);
  }

  void main() {
    vec3 hdr = sampleScene(vUv);
    if (dofAperture > 0.0) {
      // Circle of confusion in pixels, from a thin-lens model; a 16-tap disc gathers the blur.
      float dist = viewDistance(vUv);
      float coc = clamp(dofAperture * abs(dist - focusDistance) / max(dist, 1e-3), 0.0, 9.0);
      if (coc > 0.4) {
        vec3 sum = hdr;
        float weight = 1.0;
        for (int i = 0; i < 16; i++) {
          float a = float(i) * 2.39996;
          float r = sqrt((float(i) + 0.5) / 16.0) * coc;
          vec2 o = vec2(cos(a), sin(a)) * r / resolution;
          float sd = viewDistance(vUv + o);
          float scoc = clamp(dofAperture * abs(sd - focusDistance) / max(sd, 1e-3), 0.0, 9.0);
          float w = smoothstep(r - 1.0, r + 1.0, scoc);
          sum += texture2D(tScene, vUv + o).rgb * w;
          weight += w;
        }
        hdr = sum / weight;
      }
    }
    vec3 c = hdr * exposure + texture2D(tBloom, vUv).rgb * bloomStrength;
    c = toSrgb(aces(c));
    vec2 v = vUv - 0.5;
    c *= mix(1.0, smoothstep(0.85, 0.2, length(v * vec2(1.0, 0.8))), vignette);
    c += (hash(vUv * resolution + fract(time) * 917.0) - 0.5) * grain;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export interface PostSettings {
  /** 0 disables depth of field (every view but the macros). */
  dofAperture: number;
  focusDistance: number;
}

const MIPS = 5;

export class Post {
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad = new Mesh(new PlaneGeometry(2, 2));
  private readonly scene = new Scene();
  private target: WebGLRenderTarget;
  private mips: WebGLRenderTarget[] = [];
  private readonly down: ShaderMaterial;
  private readonly up: ShaderMaterial;
  readonly composite: ShaderMaterial;
  private width = 1;
  private height = 1;
  /** The renderer's draw-call count right after the scene pass of the last frame. */
  sceneCalls = 0;

  constructor(private renderer: WebGLRenderer) {
    this.scene.add(this.quad);
    this.target = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      samples: 4,
      depthTexture: new DepthTexture(1, 1),
    });
    this.down = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: DOWNSAMPLE,
      uniforms: {
        tInput: { value: null },
        texel: { value: new Vector2() },
        threshold: { value: 0 },
        exposure: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.up = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: UPSAMPLE,
      uniforms: { tInput: { value: null }, texel: { value: new Vector2() } },
      depthTest: false,
      depthWrite: false,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneFactor,
    });
    this.composite = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: COMPOSITE,
      uniforms: {
        tScene: { value: null },
        tDepth: { value: null },
        tBloom: { value: null },
        resolution: { value: new Vector2() },
        exposure: { value: 1 },
        bloomStrength: { value: 0.05 },
        grain: { value: 0.015 },
        vignette: { value: 0.22 },
        aberration: { value: 0.8 },
        time: { value: 0 },
        dofAperture: { value: 0 },
        focusDistance: { value: 1 },
        cameraNear: { value: 0.01 },
        cameraFar: { value: 20 },
      },
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
    });
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.target.setSize(this.width, this.height);
    for (const m of this.mips) m.dispose();
    this.mips = [];
    let w = this.width;
    let h = this.height;
    for (let i = 0; i < MIPS; i++) {
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
      this.mips.push(
        new WebGLRenderTarget(w, h, {
          type: HalfFloatType,
          minFilter: LinearFilter,
          magFilter: LinearFilter,
          depthBuffer: false,
        }),
      );
    }
    this.composite.uniforms.resolution!.value.set(this.width, this.height);
  }

  private pass(material: ShaderMaterial, target: WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  render(scene: Scene, camera: PerspectiveCamera, settings: PostSettings, time: number): void {
    const r = this.renderer;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    this.sceneCalls = r.info.render.calls;
    const exposure = r.toneMappingExposure;
    // Bloom: threshold into the first mip, down the chain, then back up, adding as it goes.
    let input: Texture = this.target.texture;
    let w = this.width;
    let h = this.height;
    this.mips.forEach((mip, i) => {
      this.down.uniforms.tInput!.value = input;
      this.down.uniforms.texel!.value.set(1 / w, 1 / h);
      this.down.uniforms.threshold!.value = i === 0 ? 0.9 : 0;
      this.down.uniforms.exposure!.value = exposure;
      this.pass(this.down, mip);
      input = mip.texture;
      w = mip.width;
      h = mip.height;
    });
    for (let i = MIPS - 1; i > 0; i--) {
      const from = this.mips[i]!;
      this.up.uniforms.tInput!.value = from.texture;
      this.up.uniforms.texel!.value.set(1 / from.width, 1 / from.height);
      this.pass(this.up, this.mips[i - 1]!);
    }
    const u = this.composite.uniforms;
    u.tScene!.value = this.target.texture;
    u.tDepth!.value = this.target.depthTexture;
    u.tBloom!.value = this.mips[0]!.texture;
    u.exposure!.value = exposure;
    u.time!.value = time;
    u.dofAperture!.value = settings.dofAperture;
    u.focusDistance!.value = settings.focusDistance;
    u.cameraNear!.value = camera.near;
    u.cameraFar!.value = camera.far;
    this.pass(this.composite, null);
  }

  dispose(): void {
    this.target.dispose();
    for (const m of this.mips) m.dispose();
    this.down.dispose();
    this.up.dispose();
    this.composite.dispose();
  }
}
