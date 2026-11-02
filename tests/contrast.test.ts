import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, parseHex } from '../src/util/color';

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');

type Mode = 'light' | 'dark';

/** Reads `--name: #hex` and `--name: light-dark(#hex, #hex)` from the root block. */
function readTokens(): Map<string, Record<Mode, string>> {
  const tokens = new Map<string, Record<Mode, string>>();
  const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
  const pattern =
    /--([\w-]+):\s*(?:light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)|(#[0-9a-f]{6}))\s*;/gi;
  for (const match of root.matchAll(pattern)) {
    const [, name, light, dark, single] = match;
    if (name) tokens.set(name, { light: light ?? single ?? '', dark: dark ?? single ?? '' });
  }
  return tokens;
}

const tokens = readTokens();

function ratio(foreground: string, background: string, mode: Mode): number {
  const fg = tokens.get(foreground)?.[mode];
  const bg = tokens.get(background)?.[mode];
  if (!fg || !bg) throw new Error(`Missing token ${foreground} or ${background}`);
  return contrastRatio(parseHex(fg), parseHex(bg));
}

const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['text', 'surface-raised'],
  ['text-muted', 'bg'],
  ['text-muted', 'surface'],
  ['text-muted', 'surface-raised'],
  ['accent-ink-default', 'accent-default'],
  ['meter-ink', 'meter-face'],
  ['strip-ink', 'strip'],
  ['strip-ink', 'strip-shade'],
  ['strip-ink', 'strip-key'],
];

const NON_TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['focus', 'bg'],
  ['focus', 'surface'],
  ['focus', 'surface-raised'],
  ['strip-focus', 'strip'],
  ['strip-focus', 'strip-shade'],
];

describe('design tokens', () => {
  it('parses the colour tokens', () => {
    expect(tokens.size).toBeGreaterThanOrEqual(15);
    expect(tokens.get('bg')?.light).not.toBe(tokens.get('bg')?.dark);
  });

  describe.each(['light', 'dark'] as const)('%s mode', (mode) => {
    it.each(TEXT_PAIRS)('%s on %s reaches 4.5:1', (foreground, background) => {
      expect(ratio(foreground, background, mode)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(NON_TEXT_PAIRS)('%s on %s reaches 3:1 (non-text)', (foreground, background) => {
      expect(ratio(foreground, background, mode)).toBeGreaterThanOrEqual(3);
    });
  });
});
