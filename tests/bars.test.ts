import { describe, expect, it } from 'vitest';
import { createBarsState, stepBars } from '../src/ui/bars';

const BINS = 1024;
const spectrum = (db: number): Float32Array => new Float32Array(BINS).fill(db);

describe('createBarsState', () => {
  it('splits every bin above DC into bands that widen with frequency', () => {
    const { edges } = createBarsState(BINS);
    expect(edges[0]).toBe(1);
    expect(edges.at(-1)).toBe(BINS);
    const widths = edges.slice(1).map((edge, i) => edge - edges[i]!);
    expect(Math.min(...widths)).toBeGreaterThan(0);
    expect(widths.at(-2)!).toBeGreaterThan(widths[0]!);
  });
});

describe('stepBars', () => {
  it('stays flat, and a number, in silence', () => {
    const state = createBarsState(BINS);
    for (let i = 0; i < 10; i++) stepBars(state, spectrum(-Infinity), 1 / 60);
    expect([...state.smooth, ...state.smear].every((value) => value === 0)).toBe(true);
  });

  it('raises the loudest band to full height, with the smear behind it', () => {
    const state = createBarsState(BINS);
    const sound = spectrum(-60);
    sound[state.edges[4]!] = -10;
    stepBars(state, sound, 1 / 60);
    expect(state.smear[4]!).toBeLessThan(state.smooth[4]!);
    for (let i = 0; i < 300; i++) stepBars(state, sound, 1 / 60);
    expect(state.smooth[4]).toBeCloseTo(1);
    expect(state.smear[4]).toBeCloseTo(1);
    expect(state.smooth[0]!).toBeLessThan(0.5);
  });

  it('falls back to nothing when the music stops, even after a long gap between frames', () => {
    const state = createBarsState(BINS);
    for (let i = 0; i < 60; i++) stepBars(state, spectrum(-20), 1 / 60);
    stepBars(state, spectrum(-Infinity), 5);
    expect(Math.max(...state.smooth)).toBe(0);
  });

  it('does not stretch faint noise to full height', () => {
    const state = createBarsState(BINS);
    for (let i = 0; i < 300; i++) stepBars(state, spectrum(-60), 1 / 60);
    expect(Math.max(...state.smooth)).toBeLessThan(0.25);
  });
});
