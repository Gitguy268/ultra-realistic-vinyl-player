import { describe, expect, it } from 'vitest';
import { Arm, REST_LIFT } from '../src/core/arm';
import { DECK_SPEC } from '../src/spec/deck';

const K = DECK_SPEC.mechanism;
const groove = 1.9;

function run(arm: Arm, from: number, to: number, step = 1 / 120): number {
  let peak = -1;
  for (let t = from; t < to; t += step) {
    arm.update(t, step, groove);
    peak = Math.max(peak, arm.lift);
  }
  return peak;
}

describe('the cue', () => {
  it('lowers without passing through the record, and comes to rest in the groove', () => {
    const arm = new Arm();
    let done = false;
    arm.cueTo(0, groove, true, () => (done = true));
    let lowest = 1;
    for (let t = 0; t < 4; t += 1 / 120) {
      arm.update(t, 1 / 120, groove);
      lowest = Math.min(lowest, arm.lift);
    }
    expect(lowest).toBeGreaterThanOrEqual(-1e-9);
    expect(done).toBe(true);
    expect(arm.mode).toBe('groove');
    expect(arm.lift).toBeCloseTo(0, 3);
  });

  it('touches down at 80 % of its travel, then bounces once', () => {
    const arm = new Arm();
    arm.lift = 1;
    arm.mode = 'hover';
    arm.direction = groove;
    arm.cueTo(0, groove, false, () => undefined);
    const d = K.cueLowerFastS;
    run(arm, 0, d * 0.8);
    const atTouch = arm.lift;
    const bounce = run(arm, d * 0.8, d);
    expect(atTouch).toBeLessThan(0.02);
    expect(bounce).toBeGreaterThan(atTouch);
    expect(bounce).toBeLessThan(0.1);
  });

  it('changes track in under a second: lift, swing, lower', () => {
    const total = K.cueLiftS + K.armSwingMaxS + K.cueLowerFastS;
    expect(total).toBeLessThan(1);
  });

  it('parks back on its rest', () => {
    const arm = new Arm();
    arm.mode = 'hover';
    arm.direction = groove;
    arm.lift = 1;
    let parked = false;
    arm.park(0, 0.45, () => (parked = true));
    run(arm, 0, 3);
    expect(parked).toBe(true);
    expect(arm.mode).toBe('rest');
    expect(arm.lift).toBe(REST_LIFT);
  });
});
