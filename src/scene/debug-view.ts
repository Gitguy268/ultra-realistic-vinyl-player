import { Vector3 } from 'three';
import { Program } from '../core/program';
import { hash, rng } from '../core/random';
import { REST_DIRECTION, directionFor } from '../core/tonearm3d';
import { buildWear, type Condition } from '../core/wear';
import { DECK_SPEC } from '../spec/deck';
import { posePlates, poseArm } from './deck/pose';
import type { LightingPreset } from './lighting';
import type { FinishName } from './materials/deck-materials';
import { World, type CameraStop } from './world';

/**
 * `?view=…`: the 3D scene alone, without the player around it, for screenshots, the overlay
 * check and the camera reviews. Views: hero, control, mobile, top, tour0–tour3, photo (with
 * `camera` and `size` from scripts/overhead-camera.js). Options: macro (a camera stop as JSON), finish, light, open (cover
 * degrees), arm (stylus radius in mm, or "rest"), lift (0–1), plates=photo, norecord.
 */
export function run(view: string): void {
  const params = new URLSearchParams(location.search);
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;display:block';
  document.body.replaceChildren(canvas);
  document.body.style.margin = '0';
  const world = new World(canvas);
  const { deck } = world;

  world.setFinish((params.get('finish') ?? 'anthracite') as FinishName);
  world.setLighting((params.get('light') ?? 'dusk') as LightingPreset);
  deck.cover.rotation.x = -((Number(params.get('open') ?? 0) * Math.PI) / 180);
  const arm = params.get('arm');
  poseArm(
    deck,
    arm && arm !== 'rest' ? directionFor(Number(arm) / 1000) : REST_DIRECTION,
    Number(params.get('lift') ?? 1),
  );
  posePlates(
    deck,
    params.get('plates') === 'photo'
      ? { speed: 'off', start: 'centre', cue: 'raise' }
      : { speed: 'off', start: 'start', cue: 'raise' },
  );
  deck.record.visible = !params.has('norecord');
  world.markShadowsDirty();

  // A sample side: four tracks with seeded loudness contours, in "good" condition.
  const program = new Program();
  const durations = [214, 187, 262, 241];
  program.build(durations, 0, { sides: false, size: 'lp' });
  const contours = durations.map((_, i) => {
    const r = rng(hash(`track${i}`));
    return Array.from({ length: 28 }, () => 0.35 + 0.65 * r());
  });
  const loudness = (idx: number, f: number): number => {
    const c = contours[idx] ?? [0.5];
    const x = f * (c.length - 1);
    const i = Math.floor(x);
    return (c[i] ?? 0.5) * (1 - (x - i)) + (c[Math.min(c.length - 1, i + 1)] ?? 0.5) * (x - i);
  };
  world.setRecordFace(
    program,
    loudness,
    buildWear('t0|t1|t2|t3', (params.get('condition') ?? 'good') as Condition, program.geometry),
  );

  const stops: Record<string, CameraStop> = {
    hero: DECK_SPEC.camera.hero,
    control: DECK_SPEC.camera.control,
    mobile: DECK_SPEC.camera.mobile,
    top: { focal: 300, position: [0, 4.2, 0.0001], target: [0, 0, 0] },
    ...Object.fromEntries(DECK_SPEC.camera.tour.map((t, i) => [`tour${i}`, t])),
  };
  const resize = (): void => {
    world.resize(innerWidth, innerHeight, Math.min(2, devicePixelRatio));
    if (view === 'photo')
      world.setPhotoCamera(
        JSON.parse(params.get('camera') ?? '[]') as number[],
        Number(params.get('size') ?? 1254),
      );
    else
      world.setCamera(
        params.has('macro')
          ? (JSON.parse(params.get('macro') ?? '') as CameraStop)
          : (stops[view] ?? DECK_SPEC.camera.hero),
      );
  };
  resize();
  world.warmUp();
  world.render(0);
  addEventListener('resize', () => {
    resize();
    world.render(0);
  });

  // `animate`: the platter turns at 33⅓ rpm and every frame is rendered, for frame-time checks.
  const frames: number[] = [];
  if (params.has('animate')) {
    const omega = ((100 / 3) * 2 * Math.PI) / 60;
    let last = performance.now();
    const tick = (now: number): void => {
      frames.push(now - last);
      if (frames.length > 2000) frames.shift();
      deck.platter.rotation.y -= omega * ((now - last) / 1000);
      last = now;
      world.render(now / 1000);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const at = (name: string): Vector3 => {
    const m = deck.markers.get(name);
    if (!m) throw new Error(`no marker ${name}`);
    return m.getWorldPosition(new Vector3());
  };
  const api = {
    world,
    ready: true,
    stats: () => world.stats(),
    frames,
    render: (time = 0) => world.render(time),
    projectMarker: (name: string) => world.project(at(name)),
    pxPerMm: (name: string) => {
      const p = at(name);
      const a = world.project(p);
      const b = world.project(p.clone().add(new Vector3(0.001, 0, 0)));
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    },
    /** The platter rim's silhouette: its leftmost and rightmost projected points above the plate. */
    rimExtremes: () => {
      const r = DECK_SPEC.platter.diameter / 2;
      let left: [number, number] = [Infinity, 0];
      let right: [number, number] = [-Infinity, 0];
      for (let h = 0; h <= DECK_SPEC.platter.rimDepth; h += 0.002) {
        for (let i = 0; i < 720; i++) {
          const a = (i / 720) * Math.PI * 2;
          const p = deck.platter.localToWorld(new Vector3(r * Math.cos(a), h, r * Math.sin(a)));
          if (p.y < DECK_SPEC.plinth.topHeight) continue;
          const s = world.project(p);
          if (s[0] < left[0]) left = s;
          if (s[0] > right[0]) right = s;
        }
      }
      return [left, right];
    },
  };
  Object.assign(window, { __world: api });
}
