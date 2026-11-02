import {
  EQ_BANDS,
  WINAMP_PRESETS,
  clampEqDb,
  parseEqf,
  parsePresets,
  type EqPreset,
  type GraphicEq,
} from '../audio/winamp-eq';
import { readStored, writeStored } from '../util/storage';
import { byId, formatSigned, setAttr, setText } from './dom';

const IMPORTED_KEY = 'eq-presets';
const MAX_IMPORTED = 50;

function bandName(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz);
}

function dbText(db: number): string {
  return `${formatSigned(db).replace('.0', '')} dB`;
}

/**
 * Wires the Winamp-style graphic EQ: on switch, presets (Winamp's own and any
 * imported from .eqf files), and a preamp and ten band sliders built here.
 * `changed` gets the new settings whenever one of them moves.
 */
export function bindGraphicEq(
  initial: GraphicEq,
  changed: (eq: GraphicEq) => void,
  notice: (message: string) => void,
): () => GraphicEq {
  const on = byId<HTMLInputElement>('eq-on');
  const presetSelect = byId<HTMLSelectElement>('eq-preset');
  const fileInput = byId<HTMLInputElement>('eq-file');
  const sliders = byId<HTMLElement>('eq-sliders');
  let imported = parsePresets(readStored(IMPORTED_KEY));
  let preset = initial.preset;

  function slider(id: string, label: string, value: number): HTMLInputElement {
    const wrap = document.createElement('div');
    wrap.className = 'eq-band';
    const input = document.createElement('input');
    input.id = id;
    input.type = 'range';
    input.min = '-12';
    input.max = '12';
    input.step = '0.1';
    input.value = String(value);
    const name = document.createElement('label');
    name.htmlFor = id;
    name.textContent = label;
    const out = document.createElement('output');
    out.htmlFor.add(id);
    wrap.append(out, input, name);
    sliders.append(wrap);
    return input;
  }

  const preamp = slider('eq-preamp', 'Pre', initial.preamp);
  preamp.parentElement?.classList.add('eq-preamp');
  const bands = EQ_BANDS.map((hz, i) => slider(`eq-${hz}`, bandName(hz), initial.bands[i] ?? 0));
  on.checked = initial.on;

  function value(): GraphicEq {
    return {
      on: on.checked,
      preamp: clampEqDb(Number(preamp.value)),
      bands: bands.map((input) => clampEqDb(Number(input.value))),
      preset,
    };
  }

  function showValues(): void {
    for (const [input, hz] of [
      [preamp, 0],
      ...bands.map((input, i) => [input, EQ_BANDS[i]] as const),
    ] as const) {
      const text = dbText(Number(input.value));
      const output = input.parentElement?.querySelector('output');
      // The legend says dB, so the narrow columns only show the number.
      if (output) setText(output, text.replace(' dB', ''));
      const what = hz ? `${hz} hertz` : 'Preamp';
      setAttr(input, 'aria-label', hz ? `${hz} Hz` : 'Preamp');
      setAttr(
        input,
        'aria-valuetext',
        `${what}: ${text.replace('−', 'minus ').replace('dB', 'decibels')}`,
      );
    }
    sliders.classList.toggle('is-off', !on.checked);
  }

  function fillPresets(): void {
    presetSelect.replaceChildren(new Option('Presets…', ''));
    const group = (label: string, list: readonly EqPreset[], prefix: string): void => {
      if (list.length === 0) return;
      const element = document.createElement('optgroup');
      element.label = label;
      list.forEach((entry, i) => element.append(new Option(entry.name, `${prefix}${i}`)));
      presetSelect.append(element);
    };
    group('Winamp', WINAMP_PRESETS, 'w');
    group('Imported', imported, 'i');
    const match = [...presetSelect.options].find((option) => option.text === preset);
    presetSelect.value = match?.value ?? '';
  }

  function emit(): void {
    showValues();
    changed(value());
  }

  function apply(entry: EqPreset): void {
    preset = entry.name;
    preamp.value = String(entry.preamp);
    entry.bands.forEach((db, i) => {
      const input = bands[i];
      if (input) input.value = String(db);
    });
    on.checked = true;
    emit();
  }

  on.addEventListener('change', emit);
  for (const input of [preamp, ...bands]) {
    input.addEventListener('input', () => {
      preset = '';
      presetSelect.value = '';
      emit();
    });
  }
  presetSelect.addEventListener('change', () => {
    const [kind, index] = [presetSelect.value[0], Number(presetSelect.value.slice(1))];
    const entry = (kind === 'w' ? WINAMP_PRESETS : imported)[index];
    if (kind && entry) apply(entry);
  });
  byId('eq-load').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    void file
      .arrayBuffer()
      .then((buffer) => {
        const found = parseEqf(buffer);
        const names = new Set(found.map((entry) => entry.name));
        imported = [...imported.filter((entry) => !names.has(entry.name)), ...found].slice(
          -MAX_IMPORTED,
        );
        writeStored(IMPORTED_KEY, imported);
        const first = found[0];
        if (first) apply(first);
        fillPresets();
        notice(
          found.length === 1
            ? `EQ preset "${first?.name ?? ''}" loaded.`
            : `${found.length} EQ presets loaded.`,
        );
      })
      .catch(() => notice(`${file.name} is not a Winamp EQ preset file (.eqf).`));
  });

  fillPresets();
  showValues();
  return value;
}
