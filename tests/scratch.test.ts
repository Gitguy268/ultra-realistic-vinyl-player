import { describe, expect, it } from 'vitest';
import {
  HandOverride,
  ReadHead,
  angleDelta,
  rateFromAngularVelocity,
  wrapPosition,
} from '../src/audio/scratch';

const LP = 100 / 3 / 60;

describe('rateFromAngularVelocity', () => {
  it('is 1 at the nominal angular velocity', () => {
    expect(rateFromAngularVelocity(2 * Math.PI * LP, LP)).toBeCloseTo(1, 12);
  });

  it('keeps the sign, so backward motion gives a negative rate', () => {
    expect(rateFromAngularVelocity(-2 * Math.PI * LP, LP)).toBeCloseTo(-1, 12);
    expect(rateFromAngularVelocity(-Math.PI * LP, LP)).toBeCloseTo(-0.5, 12);
  });

  it('is zero for a still hand', () => {
    expect(rateFromAngularVelocity(0, LP)).toBe(0);
  });

  it('scales with the nominal speed (radians, not revolutions)', () => {
    expect(rateFromAngularVelocity(2 * Math.PI * 0.75, 0.75)).toBeCloseTo(1, 12);
    expect(rateFromAngularVelocity(2 * Math.PI * LP, 0.75)).toBeCloseTo(LP / 0.75, 12);
  });

  it('treats a non-finite velocity as zero and rejects a bad nominal speed', () => {
    expect(rateFromAngularVelocity(Number.NaN, LP)).toBe(0);
    expect(() => rateFromAngularVelocity(1, 0)).toThrow(RangeError);
  });
});

describe('angleDelta', () => {
  it('returns the short way round', () => {
    expect(angleDelta(0.1, 0.3)).toBeCloseTo(0.2, 12);
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 12);
    expect(angleDelta(-Math.PI + 0.1, Math.PI - 0.1)).toBeCloseTo(-0.2, 12);
  });
});

describe('HandOverride', () => {
  it('passes the motor rate through when inactive', () => {
    expect(new HandOverride().tick(0.016, 1)).toBe(1);
  });

  it('returns the hand rate while held', () => {
    const hand = new HandOverride();
    hand.grab(1);
    hand.setHandRate(-0.7);
    expect(hand.tick(0.016, 1)).toBeCloseTo(-0.7, 12);
    expect(hand.tick(5, 1)).toBeCloseTo(-0.7, 12);
    expect(hand.active).toBe(true);
  });

  it('ignores hand rates after release', () => {
    const hand = new HandOverride();
    hand.grab(0);
    hand.release();
    hand.setHandRate(5);
    expect(hand.tick(0, 1)).toBeCloseTo(0, 12);
  });

  it('decays back to motor speed within about 0.3 s of release', () => {
    const hand = new HandOverride();
    hand.grab(1);
    hand.setHandRate(-1);
    hand.release();
    let rate = -1;
    let previous = -1;
    for (let t = 0; t < 0.3; t += 1 / 60) {
      rate = hand.tick(1 / 60, 1);
      expect(rate).toBeGreaterThanOrEqual(previous);
      previous = rate;
    }
    expect(rate).toBeGreaterThan(0.85);
    for (let i = 0; i < 20; i++) rate = hand.tick(1 / 60, 1);
    expect(rate).toBe(1);
    expect(hand.active).toBe(false);
  });

  it('can be grabbed again during the decay', () => {
    const hand = new HandOverride();
    hand.grab(1);
    hand.release();
    hand.tick(0.05, 1);
    hand.grab(0.2);
    expect(hand.tick(0.016, 1)).toBeCloseTo(0.2, 12);
  });
});

describe('wrapPosition', () => {
  it('wraps forward and backward into [0, length)', () => {
    expect(wrapPosition(5, 10)).toBe(5);
    expect(wrapPosition(12.5, 10)).toBe(2.5);
    expect(wrapPosition(-0.5, 10)).toBe(9.5);
    expect(wrapPosition(-25, 10)).toBe(5);
    expect(wrapPosition(10, 10)).toBe(0);
  });

  it('never returns the length itself', () => {
    expect(wrapPosition(-1e-20, 10)).toBeLessThan(10);
  });
});

describe('ReadHead', () => {
  const ramp = Float32Array.from({ length: 8 }, (_, i) => i);

  it('advances by the rate each step', () => {
    const head = new ReadHead(8);
    head.advance(1);
    head.advance(0.5);
    expect(head.position).toBe(1.5);
  });

  it('interpolates linearly between frames', () => {
    const head = new ReadHead(8);
    head.seek(2.25);
    expect(head.read(ramp)).toBeCloseTo(2.25, 6);
  });

  it('wraps past the end', () => {
    const head = new ReadHead(8);
    head.seek(7);
    head.advance(2);
    expect(head.position).toBe(1);
  });

  it('moves backward with a negative rate and wraps past the start', () => {
    const head = new ReadHead(8);
    head.seek(1);
    head.advance(-0.5);
    expect(head.position).toBe(0.5);
    head.advance(-1);
    expect(head.position).toBe(7.5);
  });

  it('interpolates across the wrap point', () => {
    const head = new ReadHead(8);
    head.seek(7.5);
    expect(head.read(ramp)).toBeCloseTo(3.5, 6);
  });

  it('plays a buffer in reverse order at rate -1', () => {
    const head = new ReadHead(8);
    head.seek(7);
    const out: number[] = [];
    for (let i = 0; i < 8; i++) {
      out.push(head.read(ramp));
      head.advance(-1);
    }
    expect(out).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it('stays in range over a long back-and-forth run', () => {
    const head = new ReadHead(8);
    for (let i = 0; i < 10000; i++) {
      head.advance(Math.sin(i * 0.37) * 3.3);
      expect(head.position).toBeGreaterThanOrEqual(0);
      expect(head.position).toBeLessThan(8);
      expect(Number.isFinite(head.read(ramp))).toBe(true);
    }
  });

  it('wraps seeks and rejects a bad length', () => {
    const head = new ReadHead(8);
    head.seek(19);
    expect(head.position).toBe(3);
    head.seek(Number.NaN);
    expect(head.position).toBe(0);
    expect(() => new ReadHead(0)).toThrow(RangeError);
    expect(() => new ReadHead(2.5)).toThrow(RangeError);
  });
});
