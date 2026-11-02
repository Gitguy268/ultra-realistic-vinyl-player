import { describe, expect, it } from 'vitest';
import { SHORTCUT_HELP, describeDeck, shortcutFor, type KeyContext } from '../src/ui/shortcuts';

function press(key: string, patch: Partial<KeyContext> = {}): ReturnType<typeof shortcutFor> {
  return shortcutFor({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    inFormField: false,
    onButton: false,
    onRaisedLever: false,
    ...patch,
  });
}

describe('shortcutFor', () => {
  it.each([
    [' ', 'play'],
    ['l', 'lever'],
    ['L', 'lever'],
    ['m', 'motor'],
    ['ArrowLeft', 'seekBack'],
    ['ArrowRight', 'seekForward'],
    ['ArrowUp', 'volumeUp'],
    ['ArrowDown', 'volumeDown'],
    ['s', 'shuffle'],
    ['r', 'repeat'],
    ['f', 'focus'],
    ['F', 'focus'],
    ['?', 'help'],
    ['Escape', 'escape'],
  ])('maps "%s" to %s', (key, action) => {
    expect(press(key)).toBe(action);
  });

  it('ignores unmapped keys', () => {
    expect(press('x')).toBeNull();
    expect(press('Enter')).toBeNull();
    expect(press('Tab')).toBeNull();
  });

  it.each(['l', ' ', 'ArrowLeft', 'ArrowUp', 's', '?'])(
    'ignores "%s" inside form fields',
    (key) => {
      expect(press(key, { inFormField: true })).toBeNull();
    },
  );

  it('still handles Escape inside form fields', () => {
    expect(press('Escape', { inFormField: true })).toBe('escape');
  });

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('ignores keys pressed with %s', (modifier) => {
    expect(press('r', { [modifier]: true })).toBeNull();
    expect(press('ArrowUp', { [modifier]: true })).toBeNull();
  });

  it('leaves Space to a focused button, which clicks itself', () => {
    expect(press(' ', { onButton: true })).toBeNull();
    expect(press('m', { onButton: true })).toBe('motor');
  });

  it('moves the tonearm with the arrows on the raised cue lever', () => {
    expect(press('ArrowLeft', { onButton: true, onRaisedLever: true })).toBe('armInward');
    expect(press('ArrowRight', { onButton: true, onRaisedLever: true })).toBe('armOutward');
  });

  it('documents every letter shortcut in the help table', () => {
    const keys = SHORTCUT_HELP.map(([key]) => key).join(' ');
    for (const key of ['Space', 'L', 'M', 'S', 'R', 'F', '?', 'Esc']) expect(keys).toContain(key);
  });
});

describe('describeDeck', () => {
  const base = {
    title: 'Blue Train',
    state: 'playing',
    timeText: '1:05',
    durationText: '10:43',
    motorOn: true,
    speedLabel: '33⅓',
  } as const;

  it('describes a playing record', () => {
    expect(describeDeck(base)).toBe(
      'Turntable. Record: Blue Train. Needle down, playing at 1:05 of 10:43. Motor on at 33⅓ RPM.',
    );
  });

  it('describes an empty, stopped deck', () => {
    expect(describeDeck({ ...base, title: '', state: 'rest', motorOn: false })).toBe(
      'Turntable. No record loaded. Tonearm at rest. Motor off at 33⅓ RPM.',
    );
  });

  it.each(['dragging', 'lifted', 'returning'] as const)('has text for the %s state', (state) => {
    const text = describeDeck({ ...base, state });
    expect(text).toContain('Tonearm');
    expect(text).not.toContain('playing at');
  });
});
