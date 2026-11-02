import { describe, expect, it } from 'vitest';
import { PositionTracker } from '../src/audio/position';

describe('PositionTracker', () => {
  it('starts paused at zero', () => {
    const tracker = new PositionTracker();
    expect(tracker.playing).toBe(false);
    expect(tracker.timeAt(5)).toBe(0);
  });

  it('advances with the clock while playing', () => {
    const tracker = new PositionTracker();
    tracker.play(10);
    expect(tracker.playing).toBe(true);
    expect(tracker.timeAt(12.5)).toBeCloseTo(2.5, 12);
  });

  it('holds its position across pause and resume', () => {
    const tracker = new PositionTracker();
    tracker.play(0);
    tracker.pause(3);
    expect(tracker.timeAt(100)).toBeCloseTo(3, 12);
    tracker.play(100);
    expect(tracker.timeAt(101)).toBeCloseTo(4, 12);
  });

  it('treats pause while paused as a no-op', () => {
    const tracker = new PositionTracker();
    tracker.play(0);
    tracker.pause(2);
    tracker.pause(50);
    expect(tracker.timeAt(60)).toBeCloseTo(2, 12);
  });

  it('treats play while playing as a no-op', () => {
    const tracker = new PositionTracker();
    tracker.play(0);
    tracker.play(5);
    expect(tracker.timeAt(6)).toBeCloseTo(6, 12);
  });

  it('is continuous across a rate ramp', () => {
    const tracker = new PositionTracker();
    tracker.play(0);
    let expected = 0;
    let rate = 1;
    for (let step = 1; step <= 100; step++) {
      const now = step * 0.01;
      expected += 0.01 * rate;
      const before = tracker.timeAt(now);
      rate = 1 - step / 200;
      tracker.setRate(rate, now);
      expect(tracker.timeAt(now)).toBeCloseTo(before, 12);
      expect(before).toBeCloseTo(expected, 9);
    }
  });

  it('applies the new rate after setRate', () => {
    const tracker = new PositionTracker();
    tracker.play(0);
    tracker.setRate(0.5, 2);
    expect(tracker.timeAt(4)).toBeCloseTo(3, 12);
  });

  it('does not move when the rate changes while paused', () => {
    const tracker = new PositionTracker();
    tracker.play(0);
    tracker.pause(4);
    tracker.setRate(2, 10);
    expect(tracker.timeAt(20)).toBeCloseTo(4, 12);
    tracker.play(20);
    expect(tracker.timeAt(21)).toBeCloseTo(6, 12);
  });

  it('seeks while paused and while playing', () => {
    const tracker = new PositionTracker();
    tracker.seek(30, 0);
    expect(tracker.timeAt(9)).toBe(30);
    tracker.play(10);
    tracker.seek(5, 12);
    expect(tracker.timeAt(13)).toBeCloseTo(6, 12);
  });

  it('clamps seeks and positions at zero', () => {
    const tracker = new PositionTracker();
    tracker.seek(-4, 0);
    expect(tracker.timeAt(0)).toBe(0);
    tracker.seek(Number.NaN, 0);
    expect(tracker.timeAt(0)).toBe(0);
    tracker.setRate(-1, 0);
    tracker.play(0);
    expect(tracker.timeAt(3)).toBe(0);
  });

  it('rejects a non-finite rate', () => {
    expect(() => new PositionTracker().setRate(Number.NaN, 0)).toThrow(RangeError);
  });
});
