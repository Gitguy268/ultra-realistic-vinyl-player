import { describe, expect, it } from 'vitest';
import { Arm, REST_LIFT } from '../src/core/arm';
import { Groove, type GrooveHost } from '../src/core/groove';
import { Program } from '../src/core/program';
import { RPM_UNITS, SEC_PER_REV, Spin } from '../src/core/spin';
import { REST_DIRECTION, directionFor } from '../src/core/tonearm3d';

function run(spin: Spin, seconds: number, target: number, dt = 1 / 60): void {
  for (let t = 0; t < seconds; t += dt) spin.step(dt, target, 1);
}

describe('Spin', () => {
  it('reaches speed in about 1.4 s and coasts to a stop in about 3 s', () => {
    const s = new Spin();
    run(s, 1.4, 1);
    expect(s.wp).toBeGreaterThan(0.94);
    run(s, 3, 1);
    expect(s.motorState(1, true)).toBe('at speed');
    run(s, 3.2, 0);
    expect(s.wp).toBeLessThan(0.05);
  });

  it('turns 200° per second at 33⅓ and 270° at 45', () => {
    const s = new Spin();
    run(s, 10, RPM_UNITS.single);
    const before = s.angR;
    run(s, 1, RPM_UNITS.single);
    expect(s.angR - before).toBeCloseTo(270, 0);
  });

  it('lets a held record follow the hand, then slips back to platter speed in about 0.25 s', () => {
    const s = new Spin();
    run(s, 10, 1);
    s.held = true;
    s.hand = s.angR - 90;
    run(s, 0.3, 1);
    expect(s.wr).toBeLessThan(0.5);
    s.held = false;
    run(s, 0.12, 1);
    expect(s.wr).toBeLessThan(0.95);
    run(s, 0.3, 1);
    expect(s.wr).toBeGreaterThan(0.95);
  });

  it('is independent of how time is sliced', () => {
    const a = new Spin();
    const b = new Spin();
    a.step(1, 1, 1);
    for (let i = 0; i < 1000; i++) b.step(0.001, 1, 1);
    expect(b.wp).toBeCloseTo(a.wp, 8);
  });

  it('holds the strobe still at the nominal speed and drifts with pitch', () => {
    const s = new Spin();
    run(s, 10, 1);
    expect(Math.abs(s.strobeV)).toBeLessThan(0.01);
    run(s, 10, 1.03);
    expect(Math.abs(s.strobeV)).toBeGreaterThan(5);
  });
});

describe('Arm', () => {
  it('lowers with the damped cue, touches down and bounces once, then rides the groove', () => {
    const a = new Arm();
    let landed = false;
    const to = directionFor(0.14);
    a.cueTo(0, to, true, () => (landed = true));
    let max = 0;
    let touched = false;
    for (let t = 0; t <= 1.2; t += 0.005) {
      a.update(t, 0.005, to);
      if (a.lift < 0.01) touched = true;
      if (touched && !landed) max = Math.max(max, a.lift);
    }
    expect(landed).toBe(true);
    expect(a.mode).toBe('groove');
    expect(a.direction).toBeCloseTo(to, 6);
    expect(max).toBeGreaterThan(0.005);
    expect(max).toBeLessThan(0.08);
  });

  it('changes track (lift, swing, lower fast) in under a second', () => {
    const a = new Arm();
    a.mode = 'groove';
    a.lift = 0;
    a.direction = directionFor(0.14);
    let done = -1;
    a.cueTo(0, directionFor(0.08), false, () => (done = 0));
    for (let t = 0; t < 1; t += 0.01) {
      a.update(t, 0.01, a.direction);
      if (done === 0) {
        done = t;
        break;
      }
    }
    expect(done).toBeGreaterThan(0);
    expect(done).toBeLessThan(1);
  });

  it('parks on its rest', () => {
    const a = new Arm();
    a.mode = 'hover';
    a.lift = 1;
    a.direction = directionFor(0.1);
    a.park(0);
    for (let t = 0; t < 2; t += 0.02) a.update(t, 0.02, a.direction);
    expect(a.mode).toBe('rest');
    expect(a.direction).toBe(REST_DIRECTION);
    expect(a.lift).toBe(REST_LIFT);
  });

  it('jumps to the end of a move under reduced motion', () => {
    const a = new Arm();
    let done = false;
    a.cueTo(0, directionFor(0.1), true, () => (done = true));
    a.finishNow();
    expect(done).toBe(true);
    expect(a.lift).toBeCloseTo(0, 9);
  });
});

describe('Groove', () => {
  function setup(durations = [60, 60, 60]) {
    const program = new Program();
    program.build(durations, 0, { sides: false, size: 'lp' });
    const log: string[] = [];
    let current = 0;
    let pos = 0;
    const host: GrooveHost = {
      program,
      currentIdx: () => current,
      position: () => pos,
      select: (i) => {
        current = i;
        log.push(`select ${i}`);
      },
      seek: (t) => {
        pos = t;
        log.push(`seek ${t}`);
      },
      lockedTurn: (r) => log.push(`turn ${r}`),
      secPerRev: () => SEC_PER_REV,
    };
    return { groove: new Groove(host), program, log, setPos: (t: number) => (pos = t) };
  }

  it('drops into the lead-in before the first track and rides it into the track', () => {
    const { groove, program } = setup();
    const p = groove.dropPoint();
    expect(p.kind).toBe('leadin');
    expect(p.r).toBe(program.geometry.drop);
    groove.land(p);
    groove.ride(1.9);
    expect(groove.seg?.kind).toBe('leadin');
    groove.ride(0.2);
    expect(groove.seg?.kind).toBe('track');
  });

  it('rides the gap into the next track on the same side', () => {
    const { groove, log } = setup();
    groove.begin('track', 0, 0);
    expect(groove.trackEnded(1)).toBe('gap');
    groove.ride(1.6);
    expect(groove.seg).toMatchObject({ kind: 'track', idx: 1 });
    expect(log).toContain('select 1');
  });

  it('enters the run-out after the last track, then turns in the locked groove', () => {
    const { groove, log } = setup();
    groove.begin('track', 2, 0);
    expect(groove.trackEnded(-1)).toBe('runout');
    groove.ride(1.5 * SEC_PER_REV + 0.01);
    expect(groove.seg?.kind).toBe('locked');
    groove.ride(SEC_PER_REV * 3);
    expect(log.filter((l) => l.startsWith('turn'))).toEqual(['turn 1', 'turn 2', 'turn 3']);
  });

  it('asks the caller to relocate for shuffle or repeat one', () => {
    const { groove } = setup();
    groove.begin('track', 0, 0);
    expect(groove.trackEnded(2)).toBe('jump');
    expect(groove.trackEnded(0)).toBe('jump');
  });

  it('runs backward under a hand without going below the segment start', () => {
    const { groove } = setup();
    groove.begin('gap', 1, 0, 0);
    groove.ride(1);
    groove.ride(-3);
    expect(groove.seg?.acc).toBe(0);
  });

  it('maps a hand drop to a lead-in, a track time, a gap or the run-out', () => {
    const { groove, program } = setup();
    const g = program.geometry;
    expect(groove.pointAt(1.01)).toBeNull();
    expect(groove.pointAt((g.outer + 1) / 2)?.kind).toBe('leadin');
    const mid = program.radius(1, 30);
    expect(groove.pointAt(mid)).toMatchObject({ kind: 'track', idx: 1 });
    expect(groove.pointAt(g.inner - 0.005)?.kind).toBe('runout');
  });

  it('a stylus let down on a gap goes to the next track’s start', () => {
    const { groove, program } = setup();
    const gapR = ((program.bands[0]?.r1 ?? 0) + (program.bands[1]?.r0 ?? 0)) / 2;
    const point = groove.pointAt(gapR);
    expect(point?.kind).toBe('gap');
    groove.land(point!);
    expect(groove.seg).toMatchObject({ kind: 'track', idx: 1 });
  });

  it('lifting from a gap loads the next track; from the run-out, the side’s first', () => {
    const a = setup();
    a.groove.begin('gap', 2, 0, 1);
    a.groove.unseat();
    expect(a.log.at(-1)).toBe('select 2');
    const b = setup();
    b.groove.begin('runout', 2);
    b.groove.unseat();
    expect(b.log.at(-1)).toBe('select 0');
  });

  it('follows the radius across the gap and the run-out', () => {
    const { groove, program } = setup();
    groove.begin('gap', 1, 0, 0);
    const start = groove.stylusR();
    groove.ride(0.75);
    const half = groove.stylusR();
    expect(start).toBeCloseTo(program.bands[0]!.r1, 9);
    expect(half).toBeLessThan(start);
    expect(half).toBeGreaterThan(program.bands[1]!.r0);
  });
});
