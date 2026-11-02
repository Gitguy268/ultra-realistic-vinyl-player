/**
 * The library as a desktop: artists are folders, albums are folders inside
 * them, and tracks are files to open or drag onto the turntable. The idea is
 * Winampify's (https://github.com/remigallego/winampify, MIT); no code is taken from it.
 */
import { groupLibrary, type ArtistFolder, type LibraryEntry } from '../library/group';
import { formatTime } from './dom';

/** dataTransfer type of a track dragged out of the desktop. Not "Files", so file drops ignore it. */
export const TRACK_DRAG_TYPE = 'application/x-vinyl-track';
const CASCADE_PX = 28;

export interface DesktopOptions {
  /** Opens and closes the desktop. */
  toggle: HTMLButtonElement;
  overlay: HTMLElement;
  entries: () => LibraryEntry[];
  play: (id: string) => void;
  /** Adds a track to the queue, where there is one apart from the library. */
  enqueue?: (id: string) => void;
}

function icon(
  kind: 'folder' | 'file' | 'deck' | 'queue',
  label: string,
  detail = '',
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `desk-icon desk-${kind}`;
  const glyph = document.createElement('span');
  glyph.className = 'desk-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'desk-name';
  name.textContent = label;
  button.append(glyph, name);
  if (detail) {
    const meta = document.createElement('span');
    meta.className = 'desk-meta';
    meta.textContent = detail;
    button.append(meta);
  }
  return button;
}

/** Wires the desktop library. Returns a function that redraws it after the library changes. */
export function bindDesktop(options: DesktopOptions): () => void {
  const { toggle, overlay, play, enqueue } = options;
  const icons = document.createElement('div');
  icons.className = 'desk-icons';
  const windows = document.createElement('div');
  windows.className = 'desk-windows';
  const bar = document.createElement('div');
  bar.className = 'desk-bar';
  const title = document.createElement('h2');
  title.id = 'desk-title';
  title.textContent = 'Library desktop';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'btn';
  close.textContent = 'Close';
  const hint = document.createElement('p');
  hint.className = 'desk-hint';
  hint.textContent =
    'Open a folder, then double-click a track or drag it onto the turntable. Esc closes.';
  bar.append(title, hint, close);
  overlay.append(bar, icons, windows);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', title.id);
  let folders: ArtistFolder[] = [];
  let top = 0;
  let opened = 0;

  /** Mouse users double-click; keyboard and touch activations arrive as single clicks. */
  function onActivate(button: HTMLButtonElement, action: () => void): void {
    button.addEventListener('click', (event) => {
      const pointer = event as PointerEvent;
      if (event.detail === 0 || pointer.pointerType === 'touch' || pointer.pointerType === 'pen') {
        action();
      }
    });
    button.addEventListener('dblclick', action);
  }

  function dropTarget(button: HTMLButtonElement, use: (id: string) => void): void {
    button.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes(TRACK_DRAG_TYPE)) return;
      event.preventDefault();
      button.classList.add('is-target');
    });
    button.addEventListener('dragleave', () => button.classList.remove('is-target'));
    button.addEventListener('drop', (event) => {
      const id = event.dataTransfer?.getData(TRACK_DRAG_TYPE);
      button.classList.remove('is-target');
      if (!id) return;
      event.preventDefault();
      // The document-wide file drop must not see this one.
      event.stopPropagation();
      use(id);
    });
  }

  function raise(win: HTMLElement): void {
    win.style.zIndex = String(++top);
  }

  function openWindow(name: string, fill: (body: HTMLElement) => void): void {
    const win = document.createElement('section');
    win.className = 'desk-window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', name);
    const head = document.createElement('div');
    head.className = 'desk-window-bar';
    const label = document.createElement('span');
    label.textContent = name;
    const shut = document.createElement('button');
    shut.type = 'button';
    shut.className = 'desk-close';
    shut.setAttribute('aria-label', `Close ${name}`);
    shut.textContent = '✕';
    head.append(label, shut);
    const body = document.createElement('div');
    body.className = 'desk-window-body';
    fill(body);
    win.append(head, body);
    const step = (opened++ % 8) * CASCADE_PX;
    // Clear of the icon column where there is room for both.
    const base = windows.clientWidth > 640 ? 150 : 8;
    win.style.left = `${base + step}px`;
    win.style.top = `${72 + step}px`;
    windows.append(win);
    raise(win);
    win.addEventListener('pointerdown', () => raise(win));
    shut.addEventListener('click', () => {
      win.remove();
      firstFocusable()?.focus();
    });
    head.addEventListener('pointerdown', (event) => {
      if (event.target === shut) return;
      const startX = event.clientX - win.offsetLeft;
      const startY = event.clientY - win.offsetTop;
      head.setPointerCapture(event.pointerId);
      const move = (e: PointerEvent): void => {
        const maxX = windows.clientWidth - 80;
        const maxY = windows.clientHeight - 32;
        win.style.left = `${Math.max(0, Math.min(maxX, e.clientX - startX))}px`;
        win.style.top = `${Math.max(0, Math.min(maxY, e.clientY - startY))}px`;
      };
      const up = (): void => {
        head.removeEventListener('pointermove', move);
        head.removeEventListener('pointerup', up);
      };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });
    body.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function openArtist(artist: ArtistFolder): void {
    openWindow(artist.name, (body) => {
      for (const album of artist.albums) {
        const count = album.tracks.length;
        const folder = icon('folder', album.name, `${count} ${count === 1 ? 'track' : 'tracks'}`);
        onActivate(folder, () =>
          openWindow(`${artist.name} — ${album.name}`, (list) => {
            for (const track of album.tracks) {
              const file = icon(
                'file',
                track.title,
                track.durationSec > 0 ? formatTime(track.durationSec) : '',
              );
              file.draggable = true;
              file.dataset.id = track.id;
              onActivate(file, () => play(track.id));
              file.addEventListener('dragstart', (event) => {
                event.dataTransfer?.setData(TRACK_DRAG_TYPE, track.id);
                if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
              });
              list.append(file);
            }
          }),
        );
        body.append(folder);
      }
    });
  }

  function render(): void {
    folders = groupLibrary(options.entries());
    const deck = icon('deck', 'Turntable', 'Drop a track to play');
    onActivate(deck, hide);
    dropTarget(deck, (id) => play(id));
    const shortcuts = [deck];
    if (enqueue) {
      const queue = icon('queue', 'Queue', 'Drop a track to queue it');
      onActivate(queue, hide);
      dropTarget(queue, enqueue);
      shortcuts.push(queue);
    }
    const artists = folders.map((artist) => {
      const folder = icon(
        'folder',
        artist.name,
        `${artist.albums.length} ${artist.albums.length === 1 ? 'album' : 'albums'}`,
      );
      onActivate(folder, () => openArtist(artist));
      return folder;
    });
    if (artists.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'desk-hint';
      empty.textContent = 'The library is empty. Add files first.';
      icons.replaceChildren(...shortcuts, empty);
    } else {
      icons.replaceChildren(...shortcuts, ...artists);
    }
  }

  function firstFocusable(): HTMLButtonElement | null {
    const wins = [...windows.querySelectorAll<HTMLElement>('.desk-window')];
    const front = wins.sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex))[0];
    return (front ?? icons).querySelector<HTMLButtonElement>('button');
  }

  function show(): void {
    render();
    windows.replaceChildren();
    overlay.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    icons.querySelector<HTMLButtonElement>('button')?.focus();
  }

  function hide(): void {
    overlay.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }

  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => (overlay.hidden ? show() : hide()));
  close.addEventListener('click', hide);
  // Captured on the document, so Escape works wherever focus is and no deck shortcut sees it.
  document.addEventListener(
    'keydown',
    (event) => {
      if (overlay.hidden || event.key !== 'Escape') return;
      event.stopPropagation();
      const wins = [...windows.querySelectorAll<HTMLElement>('.desk-window')];
      const front = wins.sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex))[0];
      if (front) {
        front.remove();
        firstFocusable()?.focus();
      } else hide();
    },
    true,
  );
  return () => {
    if (!overlay.hidden) render();
  };
}
