import { paintSilkscreen } from './materials/silkscreen';
import {
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
  type Object3D,
} from 'three';
import type { Program } from '../core/program';
import type { Defect, Mark } from '../core/wear';
import { DECK_SPEC } from '../spec/deck';
import { buildDeck, type DeckParts } from './deck/build';
import { Lighting, type LightingPreset } from './lighting';
import { bake, bakedBytes } from './materials/bake';
import {
  applyFinish,
  createDeckMaterials,
  type DeckMaterials,
  type FinishName,
} from './materials/deck-materials';
import { drawRecordFace, type Loudness, type RecordFace } from './materials/record';
import { bakeSurfaces, type Surfaces } from './materials/surfaces';
import { Post, type PostSettings } from './post';
import { buildRoom, type Room } from './room';

/** A camera stop: 36 mm-film focal length, position and target in metres. */
export interface CameraStop {
  focal: number;
  position: readonly number[];
  target: readonly number[];
  dof?: boolean;
}

/**
 * The one persistent scene: the deck in its room, lit, with its environment and post-processing.
 * The page is this scene; everything else floats over it.
 */
export class World {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(30, 1, 0.02, 12);
  readonly deck: DeckParts;
  readonly materials: DeckMaterials;
  readonly surfaces: Surfaces;
  readonly room: Room;
  readonly lighting: Lighting;
  readonly post: Post;
  readonly postSettings: PostSettings = { dofAperture: 0, focusDistance: 1 };
  private recordFace: RecordFace | null = null;
  private shadowsDirty = true;
  // 4 × 4, not 1 × 1: the transmission pre-pass renders at half size and must not reach zero.
  private readonly shadowPass = new WebGLRenderTarget(4, 4);
  private width = 1;
  private height = 1;

  /** The GPU took the context away: nothing can draw until it comes back. */
  contextLost = false;

  constructor(canvas: HTMLCanvasElement) {
    canvas.addEventListener('webglcontextlost', (event) => {
      // Without this the browser never offers the context back.
      event.preventDefault();
      this.contextLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      // three.js uploads geometry, baked textures and programs again by itself. What was only ever
      // on the GPU is drawn again: the shadow map and the environment.
      this.setLighting(this.lighting.preset);
    });
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    // Lit once: the key light does not move, so its shadow map is rendered on demand.
    this.renderer.shadowMap.autoUpdate = false;
    // Counted per frame across the scene pass and the post passes.
    this.renderer.info.autoReset = false;
    // What shows through the smoked cover is blurred by it anyway: half resolution is enough,
    // and saves a full-size multisampled buffer.
    this.renderer.transmissionResolutionScale = 0.5;
    this.camera.filmGauge = DECK_SPEC.camera.filmGauge;
    this.surfaces = bakeSurfaces(this.renderer);
    this.materials = createDeckMaterials(this.surfaces, paintSilkscreen());
    this.deck = buildDeck(this.materials);
    this.room = buildRoom(this.surfaces);
    this.lighting = new Lighting(this.renderer, this.room);
    this.post = new Post(this.renderer);
    this.scene.add(this.room.group, this.deck.root, this.contactShadow(), ...this.lighting.lights);
    this.setFinish('anthracite');
    this.setLighting('dusk');
  }

  /** A soft darkening under the plinth where no light reaches: baked once from its footprint. */
  private contactShadow(): Object3D {
    const P = DECK_SPEC.plinth;
    const margin = 0.06;
    const w = P.width + 2 * margin;
    const d = P.depth + 2 * margin;
    const texture = bake(
      this.renderer,
      /* glsl */ `
      float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main() {
        vec2 p = (vUv - 0.5) * vec2(${w.toFixed(4)}, ${d.toFixed(4)});
        float dist = box(p, vec2(${(P.width / 2).toFixed(4)}, ${(P.depth / 2).toFixed(4)}), 0.004);
        float a = 0.85 * (1.0 - smoothstep(-0.03, ${margin.toFixed(3)}, dist));
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
      { size: 256 },
    );
    // Black with the baked falloff in alpha.
    const plane = new Mesh(
      new PlaneGeometry(w, d),
      new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.0004;
    plane.name = 'contactShadow';
    plane.renderOrder = -1;
    return plane;
  }

  setFinish(finish: FinishName): void {
    applyFinish(this.materials, finish, this.surfaces);
  }

  setLighting(preset: LightingPreset): void {
    this.lighting.apply(preset);
    // Shadows first, with the deck present: the capture hides the deck, and its materials need
    // a shadow map to exist (an empty one trips WebGL's shadow-sampler check).
    this.updateShadows();
    this.lighting.capture(this.scene, this.deck.root);
  }

  /**
   * Redraws the key light's shadow map in a pass of its own: a render into a 4 × 4 target, which
   * runs the full-size shadow pass and almost nothing else.
   */
  private updateShadows(): void {
    const previous = this.renderer.getRenderTarget();
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.setRenderTarget(this.shadowPass);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previous);
    this.renderer.shadowMap.needsUpdate = false;
    this.shadowsDirty = false;
  }

  get shadowsPending(): boolean {
    return this.shadowsDirty;
  }

  /** Parts moved: the key light's shadow map is redrawn with the next frame. */
  markShadowsDirty(): void {
    this.shadowsDirty = true;
  }

  /** Redraws the record's grooves, dust and scratches for a new program or condition. */
  setRecordFace(
    program: Program,
    loudness: Loudness,
    wear: { defects: Defect[]; marks: Mark[] },
  ): void {
    this.recordFace?.dispose();
    this.recordFace = drawRecordFace(program, loudness, wear);
    const v = this.materials.vinyl;
    v.userData.albedo = this.recordFace.dust;
    // A clear record (Clear finish) shows light through itself instead of the black albedo.
    v.map = v.transmission > 0 ? null : this.recordFace.dust;
    v.roughnessMap = this.recordFace.roughness;
    v.anisotropyMap = this.recordFace.anisotropy;
    v.needsUpdate = true;
  }

  setCamera(stop: CameraStop): void {
    this.camera.setFocalLength(stop.focal);
    this.camera.position.fromArray(stop.position as number[]);
    this.camera.lookAt(new Vector3().fromArray(stop.target as number[]));
    this.camera.updateMatrixWorld();
    this.postSettings.dofAperture = stop.dof ? 2.4 : 0;
    this.postSettings.focusDistance = this.camera.position.distanceTo(
      new Vector3().fromArray(stop.target as number[]),
    );
  }

  /**
   * The pinhole camera solved for the overhead photo (scripts/overhead-camera.js): focal in pixels
   * of a `size` px square image, Euler angles, translation in millimetres.
   */
  setPhotoCamera(params: readonly number[], size: number): void {
    const [f = 1, a = 0, b = 0, c = 0, tx = 0, ty = 0, tz = 0] = params;
    this.camera.fov = (2 * Math.atan(size / 2 / f) * 180) / Math.PI;
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    const [ca, sa, cb, sb, cc, sc] = [
      Math.cos(a),
      Math.sin(a),
      Math.cos(b),
      Math.sin(b),
      Math.cos(c),
      Math.sin(c),
    ];
    const view = new Matrix4().set(
      cc * cb,
      cc * sb * sa - sc * ca,
      cc * sb * ca + sc * sa,
      tx / 1000,
      sc * cb,
      sc * sb * sa + cc * ca,
      sc * sb * ca - cc * sa,
      ty / 1000,
      -sb,
      cb * sa,
      cb * ca,
      tz / 1000,
      0,
      0,
      0,
      1,
    );
    this.camera.matrixAutoUpdate = false;
    this.camera.matrix.copy(view.invert());
    this.camera.matrix.decompose(this.camera.position, this.camera.quaternion, this.camera.scale);
    this.camera.updateMatrixWorld(true);
    this.postSettings.dofAperture = 0;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    if (this.camera.matrixAutoUpdate) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    this.post.setSize(width * pixelRatio, height * pixelRatio);
  }

  /** Compiles every shader before the first frame, so nothing stalls during the intro. */
  warmUp(): void {
    this.renderer.compile(this.scene, this.camera);
  }

  render(time: number): void {
    if (this.contextLost) return;
    const info = this.renderer.info;
    info.reset();
    if (this.shadowsDirty) this.updateShadows();
    const afterShadows = info.render.calls;
    this.deck.root.updateMatrixWorld();
    this.framesDrawn++;
    this.post.render(this.scene, this.camera, this.postSettings, time);
    this.lastCalls = {
      shadow: afterShadows,
      scene: this.post.sceneCalls - afterShadows,
      post: info.render.calls - this.post.sceneCalls,
    };
  }

  /** Frames actually sent to the GPU: the idle throttle leaves some out. */
  framesDrawn = 0;

  /** Draw calls of the last frame by pass. The scene pass includes the transmission pre-pass. */
  private lastCalls = { shadow: 0, scene: 0, post: 0 };

  /** A world point in CSS pixels of the canvas. */
  project(point: Vector3): [number, number] {
    const v = point.clone().project(this.camera);
    return [((v.x + 1) / 2) * this.width, ((1 - v.y) / 2) * this.height];
  }

  /**
   * Draw calls by pass, triangles and an estimate of GPU memory, for the budgets in the README.
   * Texture memory is what the scene samples (baked surfaces, the record's maps, the shadow map
   * and the environment); render-target memory is the frame's own buffers, which scale with the
   * canvas and the pixel ratio.
   */
  stats(): {
    calls: { shadow: number; scene: number; post: number; total: number };
    triangles: number;
    textureMB: number;
    targetMB: number;
  } {
    const info = this.renderer.info;
    const mb = (bytes: number): number => Math.round(bytes / 1e5) / 10;
    const mips = 4 / 3;
    const record = (2048 * 2048 + 2 * 1024 * 1024) * 4 * mips;
    const shadowMap = this.lighting.key.shadow.mapSize.x * this.lighting.key.shadow.mapSize.y * 4;
    // PMREM's cube-UV layout for a 256 face: about 3 × 4 faces of half-float RGBA.
    const environment = 768 * 1024 * 8;
    const size = this.renderer.getDrawingBufferSize(new Vector2());
    const pixels = size.x * size.y;
    // Scene target: 4× MSAA half-float colour + depth, resolved colour + depth texture; the
    // transmission pass keeps one more such target at a quarter of the pixels; the bloom chain
    // adds a third of a frame.
    const sceneTarget = pixels * (4 * (8 + 4) + 8 + 4);
    const targets = sceneTarget * 1.25 + pixels * 8 * (1 / 3);
    return {
      calls: { ...this.lastCalls, total: info.render.calls },
      triangles: info.render.triangles,
      textureMB: mb(bakedBytes + record + shadowMap + environment),
      targetMB: mb(targets),
    };
  }
}
