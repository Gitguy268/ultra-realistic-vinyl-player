import {
  DirectionalLight,
  HemisphereLight,
  PMREMGenerator,
  PointLight,
  RectAreaLight,
  Vector3,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { DECK_SPEC } from '../spec/deck';
import { kelvinToColor } from './color';
import type { Room } from './room';

/**
 * Light in physical units: the window gives lux on the deck, the lamp lumens, and the camera an
 * EV100 exposure. Two presets: dusk (the default: lamp on, cool window low) and daylight (window
 * bright, lamp off). The room is then captured into a PMREM environment from the deck's
 * position, so every reflection on the deck is of this room and these lights.
 */

export type LightingPreset = keyof typeof DECK_SPEC.room.lighting;

const R = DECK_SPEC.room;
const LEAN_M = 0.05;

/** EV100 → the exposure three.js multiplies scene luminance by. */
export const exposureFromEV = (ev: number): number => 1 / (1.2 * 2 ** ev);

export class Lighting {
  readonly key = new DirectionalLight();
  readonly windowArea: RectAreaLight;
  readonly lamp = new PointLight();
  readonly fill = new HemisphereLight();
  private pmrem: PMREMGenerator;
  private envTexture: Texture | null = null;
  preset: LightingPreset = 'dusk';
  /** A custom background colour paints the wall and survives preset changes. */
  private wallOverride: string | null = null;

  constructor(
    private renderer: WebGLRenderer,
    private room: Room,
  ) {
    RectAreaLightUniformsLib.init();
    const w = R.window;
    const wallX = R.bounds.left;
    // The key light comes in through the window and across the deck: soft PCF shadows.
    this.key.position.set(wallX + 0.05, w.y + 0.55, w.z + 0.1);
    this.key.target.position.set(0, 0, -0.02);
    this.key.castShadow = true;
    const cam = this.key.shadow.camera;
    cam.left = -0.6;
    cam.right = 0.6;
    cam.top = 0.6;
    cam.bottom = -0.6;
    cam.near = 0.3;
    cam.far = 4;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.radius = 4;
    this.key.shadow.bias = -0.0002;
    this.key.shadow.normalBias = 0.002;
    this.windowArea = new RectAreaLight('#ffffff', 1, w.width, w.height);
    this.windowArea.position.set(wallX + 0.01, w.y, w.z);
    this.windowArea.lookAt(wallX + 1, w.y, w.z);
    this.lamp.position.copy(room.lampPosition);
    this.lamp.decay = 2;
    this.fill.position.set(0, 1, 0);
    this.pmrem = new PMREMGenerator(renderer);
  }

  get lights(): Object3D[] {
    return [this.key, this.key.target, this.windowArea, this.lamp, this.fill];
  }

  /** Sets lights, glows and exposure for a preset. Call `capture` afterwards. */
  apply(preset: LightingPreset): void {
    this.preset = preset;
    const p = R.lighting[preset];
    const windowColour = kelvinToColor(p.windowKelvin);
    this.key.color.copy(windowColour);
    this.key.intensity = p.windowLux;
    // A window's luminance is several times the illuminance it puts on a nearby surface / π.
    const windowNits = (p.windowLux / Math.PI) * 4;
    this.windowArea.color.copy(windowColour);
    this.windowArea.intensity = windowNits;
    this.room.windowGlow.color.copy(windowColour).multiplyScalar(windowNits);
    const lampColour = kelvinToColor(R.lamp.kelvin);
    this.lamp.color.copy(lampColour);
    this.lamp.intensity = p.lampLumens / (4 * Math.PI);
    this.room.shadeGlow.emissive.copy(lampColour);
    this.room.shadeGlow.emissiveIntensity = p.lampLumens > 0 ? p.lampLumens / 6 : 0;
    this.fill.color.copy(windowColour);
    this.fill.groundColor.set('#3a2a1e');
    // Bounce: the share of the direct light on the deck that walls and furniture send back.
    const lampLux = this.lamp.intensity / this.room.lampPosition.lengthSq();
    this.fill.intensity = (p.windowLux + lampLux) * R.bounce;
    this.room.wall.color.set(this.wallOverride ?? p.wall);
    this.renderer.toneMappingExposure = exposureFromEV(p.exposureEV);
  }

  /** Moves the lamp's light a few centimetres with the pointer (−1…1 across the view). */
  lean(x: number, y: number): void {
    const home = this.room.lampPosition;
    this.lamp.position.set(home.x + x * LEAN_M, home.y, home.z + y * LEAN_M);
  }

  /** Captures the room (without the deck) as the environment the deck reflects. */
  capture(scene: Scene, hide: Object3D): Texture {
    const background = scene.background;
    scene.background = null;
    scene.environment = null;
    hide.visible = false;
    const target = this.pmrem.fromScene(scene, 0.015, 0.05, 20, {
      size: 256,
      position: new Vector3(0, 0.25, 0.05),
    });
    hide.visible = true;
    scene.background = background;
    this.envTexture?.dispose();
    this.envTexture = target.texture;
    scene.environment = this.envTexture;
    return this.envTexture;
  }

  /** The wall's paint, for the custom background colour (DECISIONS.md, Custom colours). */
  setWallColour(colour: string | null): void {
    this.wallOverride = colour;
    this.room.wall.color.set(colour ?? R.lighting[this.preset].wall);
  }

  dispose(): void {
    this.envTexture?.dispose();
    this.pmrem.dispose();
  }
}
