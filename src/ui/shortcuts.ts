export type ShortcutAction =
  | 'play'
  | 'lever'
  | 'motor'
  | 'seekBack'
  | 'seekForward'
  | 'volumeUp'
  | 'volumeDown'
  | 'shuffle'
  | 'repeat'
  | 'focus'
  | 'help'
  | 'armInward'
  | 'armOutward'
  | 'cover'
  | 'tour'
  | 'escape';

export interface KeyContext {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** Focus is in an input, select, textarea or editable element. */
  inFormField: boolean;
  /** Focus is on a button, which handles Space itself. */
  onButton: boolean;
  /** Focus is on the cue-lever button while the lever is up. */
  onRaisedLever: boolean;
}

/** One row per shortcut, shown in the shortcuts dialog. */
export const SHORTCUT_HELP: readonly (readonly [keys: string, description: string])[] = [
  ['Space', 'Play, or lift the needle'],
  ['L', 'Raise or lower the cue lever'],
  ['M', 'Motor on or off'],
  ['← / →', 'Seek 5 seconds back or forward'],
  ['↑ / ↓', 'Volume up or down'],
  ['S', 'Shuffle'],
  ['R', 'Repeat mode'],
  ['F', 'Focus mode'],
  ['C', 'Open or close the dust cover'],
  ['T', 'Tour: the next of four close-ups of the deck'],
  ['Esc', 'Leave the tour or focus mode, or close a dialog'],
  ['?', 'Show this list'],
  ['← / → on the raised cue lever', 'Move the tonearm across the record'],
  ['Alt + ↑ / ↓ on a track', 'Reorder the queue'],
];

const LETTERS: Readonly<Record<string, ShortcutAction>> = {
  l: 'lever',
  m: 'motor',
  s: 'shuffle',
  r: 'repeat',
  f: 'focus',
  c: 'cover',
  t: 'tour',
};

/** Maps a key press to an action, or null when the key should be left alone. */
export function shortcutFor(context: KeyContext): ShortcutAction | null {
  if (context.ctrlKey || context.metaKey || context.altKey) return null;
  if (context.key === 'Escape') return 'escape';
  if (context.inFormField) return null;
  switch (context.key) {
    case ' ':
      return context.onButton ? null : 'play';
    case 'ArrowLeft':
      return context.onRaisedLever ? 'armInward' : 'seekBack';
    case 'ArrowRight':
      return context.onRaisedLever ? 'armOutward' : 'seekForward';
    case 'ArrowUp':
      return 'volumeUp';
    case 'ArrowDown':
      return 'volumeDown';
    case '?':
      return 'help';
    default:
      return LETTERS[context.key.toLowerCase()] ?? null;
  }
}

export interface DeckDescription {
  title: string;
  state: 'rest' | 'dragging' | 'lifted' | 'playing' | 'returning';
  timeText: string;
  durationText: string;
  motorOn: boolean;
  speedLabel: string;
}

const STATE_TEXT: Record<DeckDescription['state'], string> = {
  rest: 'Tonearm at rest',
  dragging: 'Tonearm held',
  lifted: 'Tonearm raised over the record',
  playing: 'Needle down',
  returning: 'Tonearm returning to rest',
};

/** Text alternative for the turntable canvas. */
export function describeDeck(deck: DeckDescription): string {
  const record = deck.title ? `Record: ${deck.title}` : 'No record loaded';
  const position =
    deck.state === 'playing' ? `, playing at ${deck.timeText} of ${deck.durationText}` : '';
  const motor = `Motor ${deck.motorOn ? 'on' : 'off'} at ${deck.speedLabel} RPM`;
  return `Turntable. ${record}. ${STATE_TEXT[deck.state]}${position}. ${motor}.`;
}
