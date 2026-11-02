import { describe, expect, it } from 'vitest';
import { CoverHinge } from '../src/core/cover';
import { DECK_SPEC } from '../src/spec/deck';

function settle(c: CoverHinge, seconds = 3): string[] {
  const events: string[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    const e = c.step(1 / 60);
    if (e !== 'none') events.push(e);
  }
  return events;
}

describe('cover hinge', () => {
  it('opens fully and closes from the twin', () => {
    const c = new CoverHinge();
    c.toggle();
    expect(settle(c)).toEqual(['opened']);
    expect(c.angle).toBe(DECK_SPEC.cover.maxOpenDeg);
    c.toggle();
    expect(settle(c)).toEqual(['closed']);
    expect(c.closed).toBe(true);
  });

  it('holds at any angle above the hold angle when let go', () => {
    const c = new CoverHinge();
    c.grab(40);
    c.release();
    settle(c);
    expect(c.angle).toBe(40);
  });

  it('falls closed below the hold angle', () => {
    const c = new CoverHinge();
    c.grab(DECK_SPEC.cover.holdAboveDeg - 2);
    c.release();
    expect(settle(c, 1)).toEqual(['closed']);
  });

  it('snaps under reduced motion', () => {
    const c = new CoverHinge();
    c.toggle();
    expect(c.snap()).toBe('opened');
  });
});
