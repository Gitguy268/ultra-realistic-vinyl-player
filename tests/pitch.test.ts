import { describe, expect, it } from 'vitest';
import { PITCH_DETENT, snapPitch } from '../src/ui/pitch';

describe('pitch centre detent', () => {
  it('catches a hand near zero', () => {
    expect(snapPitch(PITCH_DETENT - 0.01, true)).toBe(0);
    expect(snapPitch(-0.2, true)).toBe(0);
  });

  it('lets a hand go outside it', () => {
    expect(snapPitch(0.5, true)).toBe(0.5);
  });

  it('never traps the keyboard, which steps 0.1 at a time', () => {
    expect(snapPitch(0.1, false)).toBe(0.1);
  });
});
