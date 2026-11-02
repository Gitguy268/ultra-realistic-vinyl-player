import { Vector3, type Mesh } from 'three';
import { describe, expect, it } from 'vitest';
import { Plates } from '../src/core/plates';
import { REST_DIRECTION, SPINDLE, directionFor } from '../src/core/tonearm3d';
import { plainMaterials } from './helpers-scene';
import { RECORD_SURFACE, buildDeck } from '../src/scene/deck/build';
import { posePlates, poseArm } from '../src/scene/deck/pose';
import { DECK_SPEC } from '../src/spec/deck';

const deck = buildDeck(plainMaterials());
const world = (name: string): Vector3 => {
  deck.root.updateMatrixWorld(true);
  const m = deck.markers.get(name);
  if (!m) throw new Error(`no marker ${name}`);
  return m.getWorldPosition(new Vector3());
};
const lp = DECK_SPEC.records.lp;

describe('deck parts', () => {
  it.each([lp.outer, (lp.outer + lp.inner) / 2, lp.inner, lp.leadIn - 0.001])(
    'puts the lowered stylus on the record surface at radius %f m',
    (radius) => {
      poseArm(deck, directionFor(radius), 0);
      const tip = world('stylusTip');
      expect(tip.y).toBeCloseTo(RECORD_SURFACE, 3);
      expect(Math.hypot(tip.x - SPINDLE.x, tip.z - SPINDLE.z)).toBeCloseTo(radius, 4);
    },
  );

  it('lifts the stylus by the cue height', () => {
    poseArm(deck, directionFor(0.1), 1);
    expect(world('stylusTip').y - RECORD_SURFACE).toBeCloseTo(DECK_SPEC.tonearm.cueLift, 3);
  });

  it('parks the stylus beside the platter', () => {
    poseArm(deck, REST_DIRECTION, 1);
    const tip = world('stylusTip');
    expect(Math.hypot(tip.x - SPINDLE.x, tip.z - SPINDLE.z)).toBeGreaterThan(
      DECK_SPEC.platter.diameter / 2,
    );
  });

  it('turns the platter about Y without moving the spindle', () => {
    const before = world('spindleTip');
    deck.platter.rotation.y = 1.3;
    expect(world('spindleTip').distanceTo(before)).toBeLessThan(1e-9);
  });

  it('slides the plates one detent pitch along X per detent', () => {
    posePlates(deck, { speed: '33', start: 'start', cue: 'raise' });
    const at33 = world('speedPlateLeftEdge');
    posePlates(deck, { speed: 'off', start: 'start', cue: 'raise' });
    const atOff = world('speedPlateLeftEdge');
    expect(at33.x - atOff.x).toBeCloseTo(DECK_SPEC.plates.speed.detentPitch, 9);
    expect(at33.z).toBeCloseTo(atOff.z, 9);
    expect(Plates.offset(DECK_SPEC.plates.speed.detents, 'off', 1)).toBe(0.5);
  });

  it('opens the cover about its hinge line, front up', () => {
    deck.cover.rotation.x = -(DECK_SPEC.cover.maxOpenDeg * Math.PI) / 180;
    deck.root.updateMatrixWorld(true);
    const front = deck.cover.getObjectByName('coverFront') as Mesh;
    front.geometry.computeBoundingBox();
    const centre = front.geometry
      .boundingBox!.getCenter(new Vector3())
      .applyMatrix4(front.matrixWorld);
    expect(centre.y).toBeGreaterThan(0.3);
    deck.cover.rotation.x = 0;
  });
});
