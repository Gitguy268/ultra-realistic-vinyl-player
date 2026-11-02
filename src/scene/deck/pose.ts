import { Plates, type PlatesState } from '../../core/plates';
import { DECK_SPEC } from '../../spec/deck';
import type { DeckParts } from './build';

const PL = DECK_SPEC.plates;
const ARM = DECK_SPEC.tonearm;

/** Slides each plate to its detent. */
export function posePlates(
  parts: DeckParts,
  state: Pick<PlatesState, 'speed' | 'start' | 'cue'>,
): void {
  const slide = (
    plate: DeckParts['speedPlate'],
    detents: readonly string[],
    value: string,
    pitch: number,
  ): void => {
    plate.position.x = (plate.userData.baseX as number) + Plates.offset(detents, value, pitch);
  };
  slide(parts.speedPlate, PL.speed.detents, state.speed, PL.speed.detentPitch);
  slide(parts.startPlate, PL.start.detents, state.start, PL.start.detentPitch);
  slide(parts.cuePlate, PL.cue.detents, state.cue, PL.cue.detentPitch);
}

/** Lift angle of the arm when the cue holds the headshell `cueLift` above the record. */
export const LIFT_ANGLE = Math.atan2(ARM.cueLift, ARM.effectiveLength);

/**
 * Points the arm in a plan direction (atan2(z, x), radians) and lifts it: 0 = stylus on the
 * record, 1 = held up by the cue. Three.js turns +X toward −Z for positive Y rotation, hence
 * the sign.
 */
export function poseArm(parts: DeckParts, direction: number, lift: number): void {
  parts.armYaw.rotation.y = -direction;
  parts.armPitch.rotation.z = lift * LIFT_ANGLE;
}
