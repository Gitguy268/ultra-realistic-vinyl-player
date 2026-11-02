import { describe, expect, it } from 'vitest';
import { cutTone, saturate, sideGain } from '../src/audio/cut';
import { levelSlices } from '../src/audio/levels';

describe('the cut-record chain', () => {
  it('narrows the side signal by the −25 dB crosstalk', () => {
    expect(sideGain()).toBeCloseTo((1 - 0.05623) / (1 + 0.05623), 4);
  });

  it('is transparent to small signals and rounds off the peaks', () => {
    expect(saturate(0.01)).toBeCloseTo(0.01, 4);
    expect(saturate(1)).toBeLessThan(0.8);
    expect(saturate(2)).toBeLessThan(1 / 0.9);
  });

  it('rolls off from 16 kHz to 11 kHz toward the label, and to 7.5 kHz at 78', () => {
    expect(cutTone(0, false, 1, 0).rolloffHz).toBeCloseTo(16000, 6);
    expect(cutTone(1, false, 1, 0).rolloffHz).toBeCloseTo(11000, 6);
    expect(cutTone(0, true, 1, 0).rolloffHz).toBeCloseTo(7500, 6);
  });

  it('adds drive toward the label and with a worn record', () => {
    expect(cutTone(0, false, 1, 0).drive).toBe(1);
    expect(cutTone(1, false, 1, 0.22).drive).toBeCloseTo(1.57, 6);
  });
});

describe('level slices', () => {
  it('scales the loudest slice to 255 and tells loud from quiet', () => {
    const data = new Float32Array(6000);
    data.fill(0.5, 0, 3000);
    data.fill(0.1, 3000, 6000);
    const slices = levelSlices([data], 10);
    expect(slices[0]).toBe(255);
    expect(slices[9]).toBe(114);
  });

  it('survives an empty track', () => {
    expect(levelSlices([], 4)).toEqual(new Uint8Array(4));
  });
});
