import {
  COLOUR_KEYS,
  contrastRatio,
  parseColours,
  parseHex,
  readableInk,
  toHex,
  type ColourKey,
  type Rgb,
} from '../util/color';
import { readStored, writeStored } from '../util/storage';
import { byId, setText } from './dom';

const MIN_TEXT_CONTRAST = 4.5;

/** Reads an element's computed `rgb(...)` colour, which resolves light-dark() and var(). */
function computedRgb(element: Element, property: 'color' | 'backgroundColor'): Rgb {
  const parts = /(\d+)[, ]+(\d+)[, ]+(\d+)/.exec(getComputedStyle(element)[property]);
  return parts ? [Number(parts[1]), Number(parts[2]), Number(parts[3])] : [0, 0, 0];
}

/**
 * Accent, background, panel and text colour pickers. Chosen colours are set on
 * the root element, so they override the page mode; the accent also overrides
 * one taken from cover art.
 */
export function bindColours(onChange: () => void): void {
  const root = document.documentElement;
  const warning = byId<HTMLElement>('colour-warning');
  const panel = document.querySelector('.panel') ?? document.body;
  let colours = parseColours(readStored('colours'));

  const picker = (key: ColourKey): HTMLInputElement => byId<HTMLInputElement>(`colour-${key}`);
  const hexField = (key: ColourKey): HTMLInputElement =>
    byId<HTMLInputElement>(`colour-${key}-hex`);

  function effective(): Record<ColourKey, Rgb> {
    const accent = getComputedStyle(root).getPropertyValue('--accent').trim();
    return {
      accent: parseHex(accent),
      bg: computedRgb(document.body, 'backgroundColor'),
      surface: computedRgb(panel, 'backgroundColor'),
      text: computedRgb(document.body, 'color'),
    };
  }

  function apply(): void {
    const set = (property: string, value: string | undefined): void => {
      if (value) root.style.setProperty(property, value);
      else root.style.removeProperty(property);
    };
    set('--custom-accent', colours.accent);
    set('--custom-accent-ink', colours.accent && readableInk(parseHex(colours.accent)));
    set('--bg', colours.bg);
    set('--surface', colours.surface);
    set('--surface-raised', colours.surface);
    set('--text', colours.text);
    set('--text-muted', colours.text);

    const now = effective();
    for (const key of COLOUR_KEYS) {
      const hex = toHex(now[key]);
      picker(key).value = hex;
      hexField(key).value = hex;
      hexField(key).removeAttribute('aria-invalid');
    }
    const readable =
      contrastRatio(now.text, now.bg) >= MIN_TEXT_CONTRAST &&
      contrastRatio(now.text, now.surface) >= MIN_TEXT_CONTRAST;
    setText(
      warning,
      readable ? '' : 'Low contrast: the text will be hard to read on these colours.',
    );
    onChange();
  }

  function choose(key: ColourKey, value: string): void {
    colours = parseColours({ ...colours, [key]: value });
    writeStored('colours', colours);
    apply();
  }

  for (const key of COLOUR_KEYS) {
    picker(key).addEventListener('input', () => choose(key, picker(key).value));
    hexField(key).addEventListener('change', () => {
      const field = hexField(key);
      try {
        choose(key, toHex(parseHex(field.value)));
      } catch {
        field.setAttribute('aria-invalid', 'true');
      }
    });
  }
  byId('colours-reset').addEventListener('click', () => {
    colours = {};
    writeStored('colours', colours);
    apply();
  });
  // The page mode changes the colours the pickers should show.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
  byId('mode').addEventListener('change', apply);
  apply();
}
