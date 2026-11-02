import type { Track } from '../library/db';
import { audioFilesOf, filesFromDirectory, filesFromDrop } from '../library/importer';
import type { Player } from '../player';
import { byId, formatTime, setAttr, setText } from './dom';

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};

const REPEAT_LABELS = { off: 'Repeat: off', all: 'Repeat: all', one: 'Repeat: one' } as const;

function describe(track: Track): string {
  const parts = [track.tags.artist, track.durationSec > 0 ? formatTime(track.durationSec) : ''];
  return parts.filter(Boolean).join(' · ');
}

/** Wires the library panel: import, queue list, reordering and queue settings. */
export function bindLibraryPanel(player: Player, announce: (message: string) => void): void {
  const list = byId<HTMLOListElement>('tracks');
  const fileInput = byId<HTMLInputElement>('file');
  const folderInput = byId<HTMLInputElement>('folder');
  const importBox = byId<HTMLElement>('import');
  const importProgress = byId<HTMLProgressElement>('import-progress');
  const importText = byId<HTMLElement>('import-text');
  const shuffle = byId<HTMLButtonElement>('shuffle');
  const repeat = byId<HTMLButtonElement>('repeat');
  const autoAdvance = byId<HTMLInputElement>('auto-advance');
  const empty = byId<HTMLElement>('tracks-empty');
  let dragged: HTMLLIElement | null = null;

  function item(track: Track, current: boolean, side: string): HTMLLIElement {
    const li = document.createElement('li');
    li.dataset.id = track.id;
    const handle = document.createElement('span');
    handle.className = 'handle';
    handle.setAttribute('aria-hidden', 'true');
    handle.textContent = '⋮⋮';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'track';
    button.setAttribute('aria-current', String(current));
    button.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
    const title = document.createElement('span');
    title.className = 'track-title';
    title.textContent = track.tags.title;
    const meta = document.createElement('span');
    meta.className = 'track-meta';
    meta.textContent = describe(track);
    button.append(title, meta);
    if (side) {
      const badge = document.createElement('span');
      badge.className = 'trk-side';
      badge.textContent = `Side ${side}`;
      title.append(badge);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.setAttribute('aria-label', `Remove ${track.tags.title}`);
    remove.textContent = '✕';
    li.append(handle, button, remove);
    return li;
  }

  function render(): void {
    if (dragged) return;
    const focusedId = (document.activeElement?.closest('li') as HTMLLIElement | null)?.dataset.id;
    const { program } = player.deck;
    const several = program.sides.length > 1;
    const items = player.queue.ids.flatMap((id, index) => {
      const track = player.tracks.get(id);
      // A badge where each side begins (html-1).
      const begins = several && program.sides.some(([first]) => first === index);
      const side = begins ? String.fromCharCode(65 + program.sideOf(index)) : '';
      return track ? [item(track, id === player.queue.currentId, side)] : [];
    });
    list.replaceChildren(...items);
    empty.hidden = items.length > 0;
    if (focusedId) focusTrack(focusedId);
    setAttr(shuffle, 'aria-pressed', String(player.queue.shuffle));
    setText(repeat, REPEAT_LABELS[player.queue.repeat]);
    setAttr(repeat, 'aria-pressed', String(player.queue.repeat !== 'off'));
    shuffle.classList.toggle('on', player.queue.shuffle);
    repeat.classList.toggle('on', player.queue.repeat !== 'off');
    autoAdvance.checked = player.autoAdvance;
  }

  function focusTrack(id: string): void {
    for (const li of list.children) {
      if ((li as HTMLLIElement).dataset.id === id) li.querySelector<HTMLElement>('.track')?.focus();
    }
  }

  function trackIdOf(target: EventTarget | null): string | undefined {
    return (target as HTMLElement | null)?.closest('li')?.dataset.id;
  }

  player.events.on('change', render);
  player.events.on('progress', (progress) => {
    importBox.hidden = progress === null;
    if (!progress) return;
    importProgress.max = progress.total;
    importProgress.value = progress.done;
    setText(importText, `Importing ${progress.done} / ${progress.total}…`);
  });

  byId('add-files').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    void player.import(audioFilesOf(fileInput.files ?? []));
    fileInput.value = '';
  });

  byId('add-folder').addEventListener('click', async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      folderInput.click();
      return;
    }
    try {
      void player.import(await filesFromDirectory(await picker.call(window)));
    } catch {
      // The picker rejects when the user cancels it; there is nothing to import.
    }
  });
  folderInput.addEventListener('change', () => {
    void player.import(audioFilesOf(folderInput.files ?? []));
    folderInput.value = '';
  });

  byId('import-cancel').addEventListener('click', () => player.cancelImport());

  byId('clear-library').addEventListener('click', () => {
    if (
      window.confirm('Remove every track from the library? The files on your disk are not touched.')
    ) {
      void player.clearLibrary();
    }
  });

  // The whole page takes files. Desktop tracks travel as their own type and never show this.
  const overlay = byId<HTMLElement>('drop-overlay');
  const showDrop = (on: boolean): void => {
    overlay.classList.toggle('active', on);
  };
  document.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    showDrop(true);
  });
  document.addEventListener('dragleave', (event) => {
    // Leaving a child is not leaving the page: only the way out has nowhere to go.
    if (!event.relatedTarget) showDrop(false);
  });
  document.addEventListener('drop', (event) => {
    showDrop(false);
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    const image = [...event.dataTransfer.files].find((file) => file.type.startsWith('image/'));
    const audio = [...event.dataTransfer.files].some((file) => !file.type.startsWith('image/'));
    if (image && !audio) {
      void player.setGlobalCover(image);
      announce('Cover set.');
      return;
    }
    void filesFromDrop(event.dataTransfer).then((files) => player.import(files));
  });

  byId('prev').addEventListener('click', () => player.previous());
  byId('next').addEventListener('click', () => player.next());
  shuffle.addEventListener('click', () => {
    announce(player.toggleShuffle() ? 'Shuffle on.' : 'Shuffle off.');
  });
  repeat.addEventListener('click', () => announce(`${REPEAT_LABELS[player.cycleRepeat()]}.`));
  autoAdvance.addEventListener('change', () => player.setAutoAdvance(autoAdvance.checked));

  /** Removes a track and moves focus to the next row, or the previous one at the end. */
  async function removeTrack(id: string): Promise<void> {
    const ids = player.queue.ids;
    const index = ids.indexOf(id);
    const neighbour = ids[index + 1] ?? ids[index - 1];
    await player.remove(id);
    if (neighbour) focusTrack(neighbour);
    else byId('add-files').focus();
  }

  list.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const id = trackIdOf(target);
    if (!id) return;
    if (target.closest('.remove')) void removeTrack(id);
    // Lever down: the track plays (html-1). Lever raised: it is only cued up (the App) (C26).
    else if (target.closest('.track')) player.select(id, !player.deck.leverRaised);
  });

  list.addEventListener('keydown', (event) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    const id = trackIdOf(event.target);
    if (!id) return;
    event.preventDefault();
    const index = player.move(id, event.key === 'ArrowUp' ? -1 : 1);
    focusTrack(id);
    announce(`Moved to position ${index + 1} of ${player.queue.ids.length}.`);
  });

  list.addEventListener('pointerdown', (event) => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('.handle');
    if (!handle) return;
    dragged = handle.closest('li');
    dragged?.classList.add('is-dragging');
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  list.addEventListener('pointermove', (event) => {
    if (!dragged) return;
    const over = document.elementFromPoint(event.clientX, event.clientY)?.closest('li');
    if (!over || over === dragged || over.parentElement !== list) return;
    const rect = over.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    list.insertBefore(dragged, before ? over : over.nextSibling);
  });

  function endDrag(): void {
    if (!dragged) return;
    dragged.classList.remove('is-dragging');
    dragged = null;
    player.reorder([...list.children].map((li) => (li as HTMLLIElement).dataset.id ?? ''));
  }
  list.addEventListener('pointerup', endDrag);
  list.addEventListener('pointercancel', endDrag);

  render();
}
