import { describe, expect, it } from 'vitest';
import { MAX_PITCH, Motor, SPEED_PRESETS } from '../src/turntable/motor';

function run(motor: Motor, seconds: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) motor.tick(dt);
}

describe('speed presets', () => {
  it('are 33⅓, 45 and 78 rpm', () => {
    expect(SPEED_PRESETS.lp).toBeCloseTo(100 / 3, 12);
    expect(SPEED_PRESETS.single).toBe(45);
    expect(SPEED_PRESETS.shellac).toBe(78);
  });
});

describe('Motor', () => {
  it('starts stopped', () => {
    const motor = new Motor();
    expect(motor.rpm).toBe(0);
    expect(motor.speedMultiplier).toBe(0);
    expect(motor.targetRpm).toBe(0);
  });

  it.each(['lp', 'single', 'shellac'] as const)(
    'converges on %s within 0.5 % after 8 s',
    (preset) => {
      const motor = new Motor();
      motor.preset = preset;
      motor.powered = true;
      run(motor, 8);
      expect(Math.abs(motor.rpm / SPEED_PRESETS[preset] - 1)).toBeLessThan(0.005);
      expect(motor.speedMultiplier).toBeCloseTo(1, 2);
    },
  );

  it('spins up monotonically without overshoot', () => {
    const motor = new Motor();
    motor.powered = true;
    let previous = 0;
    for (let i = 0; i < 600; i++) {
      motor.tick(1 / 60);
      expect(motor.rpm).toBeGreaterThan(previous);
      expect(motor.rpm).toBeLessThanOrEqual(SPEED_PRESETS.lp);
      previous = motor.rpm;
    }
  });

  it('reaches 63 % of target after one spin-up time constant', () => {
    const motor = new Motor();
    motor.powered = true;
    motor.tick(0.9);
    expect(motor.speedMultiplier).toBeCloseTo(1 - Math.exp(-1), 10);
  });

  it('is independent of how the time is sliced', () => {
    const coarse = new Motor();
    const fine = new Motor();
    coarse.powered = true;
    fine.powered = true;
    coarse.tick(1);
    for (let i = 0; i < 1000; i++) fine.tick(0.001);
    expect(fine.rpm).toBeCloseTo(coarse.rpm, 8);
  });

  it('coasts down to about zero, slower than it spins up', () => {
    const motor = new Motor();
    motor.powered = true;
    run(motor, 10);
    motor.powered = false;
    motor.tick(1.6);
    expect(motor.speedMultiplier).toBeCloseTo(Math.exp(-1), 3);
    run(motor, 20);
    expect(motor.rpm).toBeLessThan(0.01);
    expect(motor.rpm).toBeGreaterThanOrEqual(0);
  });

  it('comes to a complete stop instead of creeping forever', () => {
    const motor = new Motor();
    motor.powered = true;
    run(motor, 10);
    motor.powered = false;
    run(motor, 30);
    expect(motor.rpm).toBe(0);
    expect(motor.speedMultiplier).toBe(0);
  });

  it('applies pitch to the target speed', () => {
    const motor = new Motor();
    motor.powered = true;
    motor.pitch = 0.04;
    expect(motor.targetRpm).toBeCloseTo((100 / 3) * 1.04, 10);
    run(motor, 12);
    expect(motor.speedMultiplier).toBeCloseTo(1.04, 4);
  });

  it('clamps pitch to ±8 %', () => {
    const motor = new Motor();
    motor.pitch = 0.5;
    expect(motor.pitch).toBe(MAX_PITCH);
    motor.pitch = -0.5;
    expect(motor.pitch).toBe(-MAX_PITCH);
    expect(() => {
      motor.pitch = Number.NaN;
    }).toThrow(RangeError);
  });

  it('reports speedMultiplier relative to the selected preset', () => {
    const motor = new Motor();
    motor.powered = true;
    run(motor, 12);
    motor.preset = 'single';
    expect(motor.speedMultiplier).toBeCloseTo(100 / 3 / 45, 3);
  });

  it('reports revolutions per second', () => {
    const motor = new Motor();
    motor.rpm = 45;
    expect(motor.revolutionsPerSecond).toBe(0.75);
  });

  it('leaves the speed unchanged for a zero dt', () => {
    const motor = new Motor();
    motor.powered = true;
    motor.tick(0);
    expect(motor.rpm).toBe(0);
  });

  it.each([-0.01, Number.NaN, Number.POSITIVE_INFINITY])('rejects dt = %f', (dt) => {
    expect(() => new Motor().tick(dt)).toThrow(RangeError);
  });
});
