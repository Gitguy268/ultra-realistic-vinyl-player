import { describe, expect, it } from 'vitest';
import { Plates } from '../src/core/plates';

describe('speed plate', () => {
  it('rests on OFF with the motor stopped', () => {
    const p = new Plates();
    expect(p.speed).toBe('off');
    expect(p.motorOn).toBe(false);
  });

  it('selects 33 and 45 and powers the motor', () => {
    const p = new Plates();
    expect(p.setSpeed('33')).toBe('detent');
    expect(p.motorOn).toBe(true);
    p.setSpeed('45');
    expect(p.selectedSpeed).toBe('45');
  });

  it('refuses 78 unless the unlock pin is held, stopping at 45', () => {
    const p = new Plates();
    p.setSpeed('33');
    expect(p.setSpeed('78')).toBe('interlock');
    expect(p.speed).toBe('45');
    expect(p.setSpeed('78')).toBe('interlock');
    expect(p.speed).toBe('45');
    p.unlockHeld = true;
    expect(p.setSpeed('78')).toBe('detent');
    expect(p.speed).toBe('78');
  });

  it('steps one detent at a time and blocks at the 78 interlock', () => {
    const p = new Plates();
    expect(p.stepSpeed(1)).toBe('detent');
    expect(p.speed).toBe('33');
    expect(p.stepSpeed(1)).toBe('none');
    p.stepSpeed(-1);
    p.stepSpeed(-1);
    expect(p.speed).toBe('45');
    expect(p.stepSpeed(-1)).toBe('interlock');
    p.unlockLatched = true;
    expect(p.stepSpeed(-1)).toBe('detent');
  });

  it('toggles power to OFF and back to the last speed, as ⏻ and M do', () => {
    const p = new Plates();
    p.setSpeed('45');
    p.togglePower();
    expect(p.speed).toBe('off');
    expect(p.selectedSpeed).toBe('45');
    p.togglePower();
    expect(p.speed).toBe('45');
    expect(p.motorOn).toBe(true);
  });

  it('does not return to 78 through the toggle without the unlock', () => {
    const p = new Plates();
    p.unlockHeld = true;
    p.setSpeed('78');
    p.unlockHeld = false;
    p.togglePower();
    p.togglePower();
    expect(p.speed).toBe('45');
  });
});

describe('start plate and end stop', () => {
  it('stops the motor on its centre detent', () => {
    const p = new Plates();
    p.setSpeed('33');
    p.setStart('centre');
    expect(p.motorOn).toBe(false);
    p.setStart('m');
    expect(p.motorOn).toBe(true);
  });

  it('trips only in START, and a plate move or Play clears the trip', () => {
    const p = new Plates();
    p.setSpeed('33');
    p.setStart('m');
    expect(p.trip()).toBe(false);
    expect(p.motorOn).toBe(true);
    p.setStart('start');
    expect(p.trip()).toBe(true);
    expect(p.motorOn).toBe(false);
    expect(p.start).toBe('start');
    p.readyToPlay();
    expect(p.motorOn).toBe(true);
    p.trip();
    p.setStart('centre');
    p.setStart('start');
    expect(p.motorOn).toBe(true);
  });

  it('readies Play from OFF and centre', () => {
    const p = new Plates();
    p.setStart('centre');
    p.readyToPlay();
    expect(p.speed).toBe('33');
    expect(p.start).toBe('start');
    expect(p.motorOn).toBe(true);
  });
});

describe('cue plate', () => {
  it('reports a detent only when it moves', () => {
    const p = new Plates();
    expect(p.setCue('lower')).toBe('none');
    expect(p.setCue('raise')).toBe('detent');
  });
});

describe('plate offsets', () => {
  it('centres the detents on the rest position', () => {
    const detents = ['78', '45', 'off', '33'];
    expect(Plates.offset(detents, '78', 1)).toBe(-1.5);
    expect(Plates.offset(detents, '33', 1)).toBe(1.5);
  });
});
