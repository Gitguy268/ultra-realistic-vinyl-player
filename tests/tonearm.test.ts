import { describe, expect, it } from 'vitest';
import {
  CueMechanism,
  RETURN_DURATION_S,
  angleForPoint,
  angleForRadius,
  angleForTrackPosition,
  createGeometry,
  isOverGrooves,
  stylusPoint,
  stylusRadius,
  trackPositionForAngle,
} from '../src/turntable/tonearm';

const g = createGeometry(1000);

describe('createGeometry', () => {
  it('places the pivot and sizes the arm from the canvas size', () => {
    expect(g.pivotX).toBeCloseTo(800, 9);
    expect(g.pivotY).toBeCloseTo(240, 9);
    expect(g.armLength).toBeCloseTo(560, 9);
  });

  it('sets the groove radii from the record radius', () => {
    expect(g.outerRadius).toBeCloseTo(0.86 * g.recordRadius, 9);
    expect(g.innerRadius).toBeCloseTo(0.4 * g.recordRadius, 9);
  });

  it('rests the stylus beyond the record edge', () => {
    expect(stylusRadius(g, g.restAngle)).toBeGreaterThan(g.recordRadius);
    expect(g.restAngle).toBeGreaterThan(g.outerAngle);
    expect(g.outerAngle).toBeGreaterThan(g.innerAngle);
  });

  it('scales linearly with size', () => {
    const half = createGeometry(500);
    expect(half.armLength).toBeCloseTo(g.armLength / 2, 9);
    expect(half.restAngle).toBeCloseTo(g.restAngle, 12);
  });

  it('rejects a non-positive size', () => {
    expect(() => createGeometry(0)).toThrow(RangeError);
  });
});

describe('angle and radius mappings', () => {
  it('round-trips radius → angle → radius', () => {
    for (let r = g.innerRadius; r <= g.outerRadius; r += 7) {
      expect(stylusRadius(g, angleForRadius(g, r))).toBeCloseTo(r, 8);
    }
  });

  it('clamps unreachable radii', () => {
    expect(angleForRadius(g, 0)).toBe(0);
    expect(angleForRadius(g, 1e6)).toBeCloseTo(Math.PI, 12);
  });

  it('maps track position 0 to the outer groove and 1 to the inner', () => {
    expect(angleForTrackPosition(g, 0)).toBeCloseTo(g.outerAngle, 12);
    expect(angleForTrackPosition(g, 1)).toBeCloseTo(g.innerAngle, 12);
  });

  it('round-trips track position ↔ angle', () => {
    for (let p = 0; p <= 1; p += 0.05) {
      expect(trackPositionForAngle(g, angleForTrackPosition(g, p))).toBeCloseTo(p, 9);
    }
  });

  it('clamps track positions outside 0..1', () => {
    expect(angleForTrackPosition(g, -1)).toBeCloseTo(g.outerAngle, 12);
    expect(angleForTrackPosition(g, 2)).toBeCloseTo(g.innerAngle, 12);
    expect(trackPositionForAngle(g, g.restAngle)).toBe(0);
    expect(trackPositionForAngle(g, 0)).toBe(1);
  });

  it('knows when the stylus is over the grooves', () => {
    expect(isOverGrooves(g, g.restAngle)).toBe(false);
    expect(isOverGrooves(g, angleForTrackPosition(g, 0.5))).toBe(true);
    expect(isOverGrooves(g, g.innerAngle - 0.05)).toBe(false);
  });

  it('puts the stylus one arm length from the pivot', () => {
    const p = stylusPoint(g, g.outerAngle);
    expect(Math.hypot(p.x - g.pivotX, p.y - g.pivotY)).toBeCloseTo(g.armLength, 9);
    expect(Math.hypot(p.x - g.centerX, p.y - g.centerY)).toBeCloseTo(g.outerRadius, 8);
  });

  it('keeps the resting stylus inside the canvas', () => {
    const p = stylusPoint(g, g.restAngle);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(g.size);
    expect(p.y).toBeLessThan(g.size);
  });

  it('round-trips stylus point → angle', () => {
    const angle = angleForTrackPosition(g, 0.3);
    expect(angleForPoint(g, stylusPoint(g, angle))).toBeCloseTo(angle, 10);
  });

  it('clamps pointer angles between the inner groove and rest', () => {
    expect(angleForPoint(g, { x: 0, y: 0 })).toBe(g.innerAngle);
    expect(angleForPoint(g, { x: g.size, y: g.size })).toBe(g.restAngle);
  });
});

describe('CueMechanism', () => {
  const mid = angleForTrackPosition(g, 0.5);
  const cue = (): CueMechanism => new CueMechanism(g.restAngle);

  function playing(): CueMechanism {
    const c = cue();
    c.drop(mid);
    return c;
  }

  function returning(): CueMechanism {
    const c = playing();
    c.sideEnded();
    return c;
  }

  it('starts at rest with the lever down', () => {
    const c = cue();
    expect(c.state).toBe('rest');
    expect(c.angle).toBe(g.restAngle);
    expect(c.leverLifted).toBe(false);
    expect(c.needleDown).toBe(false);
  });

  it('rest → dragging → playing when released over the record', () => {
    const c = cue();
    expect(c.beginDrag()).toBe(true);
    expect(c.state).toBe('dragging');
    c.drag(mid);
    expect(c.angle).toBe(mid);
    expect(c.endDrag(true)).toBe(true);
    expect(c.state).toBe('playing');
    expect(c.needleDown).toBe(true);
  });

  it('dragging → rest when released off the record', () => {
    const c = cue();
    c.beginDrag();
    c.drag(g.restAngle - 0.01);
    expect(c.endDrag(false)).toBe(false);
    expect(c.state).toBe('rest');
    expect(c.angle).toBe(g.restAngle);
  });

  it('dragging → lifted when released over the record with the lever up', () => {
    const c = cue();
    c.setLeverLifted(true, false);
    c.beginDrag();
    c.drag(mid);
    expect(c.endDrag(true)).toBe(false);
    expect(c.state).toBe('lifted');
  });

  it('ignores drag and endDrag when not dragging', () => {
    const c = cue();
    c.drag(mid);
    expect(c.angle).toBe(g.restAngle);
    expect(c.endDrag(true)).toBe(false);
    expect(c.state).toBe('rest');
  });

  it('playing → dragging lifts the needle', () => {
    const c = playing();
    expect(c.beginDrag()).toBe(true);
    expect(c.needleDown).toBe(false);
  });

  it('does not begin a second drag', () => {
    const c = cue();
    c.beginDrag();
    expect(c.beginDrag()).toBe(false);
  });

  it('lever up: playing → lifted', () => {
    const c = playing();
    expect(c.setLeverLifted(true, true)).toBe(false);
    expect(c.state).toBe('lifted');
    expect(c.leverLifted).toBe(true);
  });

  it('lever down over the record: lifted → playing', () => {
    const c = playing();
    c.setLeverLifted(true, true);
    expect(c.setLeverLifted(false, true)).toBe(true);
    expect(c.state).toBe('playing');
  });

  it('lever down off the record: lifted → rest', () => {
    const c = playing();
    c.setLeverLifted(true, true);
    expect(c.setLeverLifted(false, false)).toBe(false);
    expect(c.state).toBe('rest');
  });

  it('lever moves at rest without changing state', () => {
    const c = cue();
    expect(c.setLeverLifted(true, false)).toBe(false);
    expect(c.state).toBe('rest');
    expect(c.leverLifted).toBe(true);
    expect(c.setLeverLifted(false, false)).toBe(false);
    expect(c.state).toBe('rest');
  });

  it('drop lowers the lever and plays from rest or lifted', () => {
    const c = cue();
    c.setLeverLifted(true, false);
    expect(c.drop(mid)).toBe(true);
    expect(c.state).toBe('playing');
    expect(c.leverLifted).toBe(false);
    expect(c.angle).toBe(mid);
  });

  it('drop is refused while dragging, playing or returning', () => {
    const dragging = cue();
    dragging.beginDrag();
    expect(dragging.drop(mid)).toBe(false);
    expect(playing().drop(mid)).toBe(false);
    expect(returning().drop(mid)).toBe(false);
  });

  it('hoverAt moves the arm over the record only with the lever up', () => {
    const c = cue();
    expect(c.hoverAt(mid)).toBe(false);
    expect(c.state).toBe('rest');
    c.setLeverLifted(true, false);
    expect(c.hoverAt(mid)).toBe(true);
    expect(c.state).toBe('lifted');
    expect(c.angle).toBe(mid);
    expect(c.setLeverLifted(false, true)).toBe(true);
    expect(c.state).toBe('playing');
  });

  it('hoverAt is refused while dragging, playing or returning', () => {
    const dragging = cue();
    dragging.setLeverLifted(true, false);
    dragging.beginDrag();
    expect(dragging.hoverAt(mid)).toBe(false);
    expect(playing().hoverAt(mid)).toBe(false);
    expect(returning().hoverAt(mid)).toBe(false);
  });

  it('park returns a hovering arm to rest and leaves other states alone', () => {
    const c = cue();
    c.setLeverLifted(true, false);
    c.hoverAt(mid);
    c.park();
    expect(c.state).toBe('rest');
    expect(c.angle).toBe(g.restAngle);
    const p = playing();
    p.park();
    expect(p.state).toBe('playing');
  });

  it('setPlayingAngle follows the groove only while playing', () => {
    const c = playing();
    c.setPlayingAngle(mid - 0.01);
    expect(c.angle).toBe(mid - 0.01);
    c.setLeverLifted(true, true);
    c.setPlayingAngle(mid - 0.05);
    expect(c.angle).toBe(mid - 0.01);
  });

  it('sideEnded: playing → returning, and only from playing', () => {
    expect(returning().state).toBe('returning');
    const c = cue();
    c.sideEnded();
    expect(c.state).toBe('rest');
  });

  it('returns to rest in 2.2 s and reports completion exactly once', () => {
    const c = returning();
    let completions = 0;
    let previous = c.angle;
    const steps = Math.ceil(RETURN_DURATION_S * 60) + 5;
    for (let i = 0; i < steps; i++) {
      if (c.tickReturn(1 / 60, g.restAngle)) completions++;
      expect(c.angle).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = c.angle;
    }
    expect(completions).toBe(1);
    expect(c.state).toBe('rest');
    expect(c.angle).toBe(g.restAngle);
  });

  it('is not finished just before 2.2 s', () => {
    const c = returning();
    expect(c.tickReturn(RETURN_DURATION_S - 0.05, g.restAngle)).toBe(false);
    expect(c.state).toBe('returning');
    expect(c.tickReturn(0.1, g.restAngle)).toBe(true);
  });

  it('eases in and out: halfway in time is halfway in angle', () => {
    const c = returning();
    c.tickReturn(RETURN_DURATION_S / 2, g.restAngle);
    expect(c.angle).toBeCloseTo((mid + g.restAngle) / 2, 10);
    const slow = returning();
    slow.tickReturn(RETURN_DURATION_S / 10, g.restAngle);
    expect(slow.angle - mid).toBeLessThan((g.restAngle - mid) / 10);
  });

  it('tickReturn does nothing outside returning', () => {
    const c = playing();
    expect(c.tickReturn(5, g.restAngle)).toBe(false);
    expect(c.state).toBe('playing');
  });

  it('ignores dragging during returning', () => {
    const c = returning();
    const before = c.angle;
    expect(c.beginDrag()).toBe(false);
    c.drag(g.innerAngle);
    expect(c.endDrag(true)).toBe(false);
    expect(c.state).toBe('returning');
    expect(c.angle).toBe(before);
  });

  it('ignores lever input during returning', () => {
    const c = returning();
    expect(c.setLeverLifted(true, true)).toBe(false);
    expect(c.leverLifted).toBe(false);
    expect(c.setLeverLifted(false, true)).toBe(false);
    expect(c.state).toBe('returning');
  });
});
