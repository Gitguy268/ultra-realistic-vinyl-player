import notice from '../../NOTICE?raw';
import { readStored, writeStored } from '../util/storage';
import { byId, setAttr } from './dom';
import { SHORTCUT_HELP } from './shortcuts';

const MODES = ['auto', 'light', 'dark'];
const PLINTHS = ['anthracite', 'black', 'walnut', 'aluminium', 'gloss', 'clear'];

interface CoachStep {
  title: string;
  text: string;
  target: string;
}

const COACH_STEPS: readonly CoachStep[] = [
  {
    title: 'Load a record',
    text: 'Use Add files or Add folder, or drop audio files anywhere on the page. Your music stays on this device.',
    target: '#add-files',
  },
  {
    title: 'Play, or drag the tonearm',
    text: 'Press Play to drop the needle at the start. Or drag the headshell over the record and let go where you want to listen.',
    target: '#play',
  },
  {
    title: 'The cue lever',
    text: 'The cue lever lifts and lowers the needle without moving the arm. While the lever is up and focused, the left and right arrow keys move the arm.',
    target: '#lever',
  },
  {
    title: 'Speed and pitch',
    text: 'Pick 33⅓, 45 or 78 RPM and fine-tune with the pitch wheel. The slots in the platter rim, lit by the strobe lamp, stand still when the speed is exact.',
    target: '.speed',
  },
];

export interface Chrome {
  toggleFocusMode(): void;
  /** Handles Escape. Returns true when it closed or left something. */
  escape(): boolean;
  openShortcuts(): void;
}

/** Page chrome: page mode, plinth, dust cover, focus mode, help dialogs and the tutorial. */
/**
 * `onCoachStep` gets the tutorial's step index (−1 when it closes), so the camera can look at
 * what each step talks about.
 */
export function bindChrome(
  onThemeChange: () => void,
  onCoachStep?: (step: number) => void,
): Chrome {
  const root = document.documentElement;

  function bindSelect(
    id: string,
    key: string,
    allowed: string[],
    apply: (value: string) => void,
  ): void {
    const select = byId<HTMLSelectElement>(id);
    const stored = readStored(key);
    if (typeof stored === 'string' && allowed.includes(stored)) select.value = stored;
    const update = (): void => {
      apply(select.value);
      onThemeChange();
    };
    select.addEventListener('change', () => {
      writeStored(key, select.value);
      update();
    });
    update();
  }

  bindSelect('mode', 'mode', MODES, (mode) => {
    if (mode === 'auto') root.removeAttribute('data-mode');
    else root.dataset.mode = mode;
  });
  bindSelect('plinth', 'plinth', PLINTHS, (plinth) => {
    root.dataset.plinth = plinth;
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onThemeChange);

  const coverButton = byId<HTMLButtonElement>('cover');
  const plinth = byId<HTMLElement>('plinth-box');
  coverButton.addEventListener('click', () => {
    const closed = plinth.classList.toggle('cover-closed');
    setAttr(coverButton, 'aria-pressed', String(closed));
  });

  const focusButton = byId<HTMLButtonElement>('focus-mode');
  let displaced: HTMLElement | null = null;
  function toggleFocusMode(): void {
    const active = document.activeElement as HTMLElement | null;
    const entering = document.body.classList.toggle('focus-mode');
    setAttr(focusButton, 'aria-pressed', String(entering));
    if (entering) {
      // Keep keyboard focus on something visible; remember where it was.
      displaced =
        active && active !== document.body && active.offsetParent === null ? active : null;
      if (displaced) focusButton.focus();
    } else if (displaced?.isConnected) {
      displaced.focus();
      displaced = null;
    }
  }
  focusButton.addEventListener('click', toggleFocusMode);

  const helpMenu = byId<HTMLDetailsElement>('help-menu');
  const shortcutsDialog = byId<HTMLDialogElement>('shortcuts-dialog');
  const creditsDialog = byId<HTMLDialogElement>('credits-dialog');
  const table = byId<HTMLTableSectionElement>('shortcuts-body');
  for (const [keys, description] of SHORTCUT_HELP) {
    const row = table.insertRow();
    const key = document.createElement('th');
    key.scope = 'row';
    key.textContent = keys;
    row.append(key);
    row.insertCell().textContent = description;
  }
  byId('credits-text').textContent = notice;

  function openDialog(dialog: HTMLDialogElement): void {
    helpMenu.open = false;
    if (!dialog.open) dialog.showModal();
  }
  byId('open-shortcuts').addEventListener('click', () => openDialog(shortcutsDialog));
  byId('open-credits').addEventListener('click', () => openDialog(creditsDialog));

  const coach = byId<HTMLDialogElement>('coach');
  const coachCount = byId<HTMLElement>('coach-count');
  const coachTitle = byId<HTMLElement>('coach-title');
  const coachText = byId<HTMLElement>('coach-text');
  const coachBack = byId<HTMLButtonElement>('coach-back');
  const coachNext = byId<HTMLButtonElement>('coach-next');
  let step = 0;

  function clearHighlight(): void {
    document.querySelector('.coach-target')?.classList.remove('coach-target');
  }

  function showStep(index: number): void {
    step = Math.max(0, Math.min(COACH_STEPS.length - 1, index));
    const current = COACH_STEPS[step];
    if (!current) return;
    coachCount.textContent = `Step ${step + 1} of ${COACH_STEPS.length}`;
    coachTitle.textContent = current.title;
    coachText.textContent = current.text;
    coachBack.disabled = step === 0;
    coachNext.textContent = step === COACH_STEPS.length - 1 ? 'Done' : 'Next';
    clearHighlight();
    const target = document.querySelector(current.target);
    target?.classList.add('coach-target');
    target?.scrollIntoView({ block: 'nearest' });
    onCoachStep?.(step);
  }

  function closeCoach(): void {
    if (!coach.open) return;
    coach.close();
    clearHighlight();
    writeStored('coachDone', true);
    onCoachStep?.(-1);
  }

  function openCoach(): void {
    helpMenu.open = false;
    if (!coach.open) coach.show();
    showStep(0);
  }

  coachBack.addEventListener('click', () => showStep(step - 1));
  coachNext.addEventListener('click', () => {
    if (step === COACH_STEPS.length - 1) closeCoach();
    else showStep(step + 1);
  });
  byId('coach-close').addEventListener('click', closeCoach);
  byId('open-coach').addEventListener('click', openCoach);
  if (readStored('coachDone') !== true) openCoach();

  return {
    toggleFocusMode,
    openShortcuts: () => openDialog(shortcutsDialog),
    escape(): boolean {
      if (coach.open) {
        closeCoach();
        return true;
      }
      if (helpMenu.open) {
        helpMenu.open = false;
        return true;
      }
      if (document.body.classList.contains('focus-mode')) {
        toggleFocusMode();
        return true;
      }
      return false;
    },
  };
}
