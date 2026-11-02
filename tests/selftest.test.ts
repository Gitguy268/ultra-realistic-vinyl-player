import { expect, it } from 'vitest';
import { demoFiles } from '../src/demo';
import { selfTest } from '../src/selftest';

it('the page selftest passes', () => {
  const failed: string[] = [];
  expect(
    selfTest((message) => failed.push(message)),
    failed.join('; '),
  ).toBe(true);
  expect(failed).toEqual([]);
});

it('the demo makes three short stereo tracks', () => {
  const files = demoFiles();
  expect(files.map((f) => f.name)).toEqual(['Warm Up.wav', 'Slow Burn.wav', 'Last Call.wav']);
  expect(files[0]!.size).toBe(44 + 24 * 32000 * 4);
});
