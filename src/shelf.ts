import type { Deck } from './deck';
import type { Player } from './player';
import { isShelfLoad, type ShelfLoad } from './shelf-message';

/**
 * `?shelf`: a Vinyl Shelf page (the parent frame or the opener) hands this deck one album over the
 * vinyl-shelf/1 protocol. It plays beside the saved library, which stays closed (NoStore).
 * Protocol: docs/PROTOCOL.md in the Gitguy268/vinyl-shelf repository.
 */
const STATE_MS = 500;
const AUTOPLAY_CHECK_MS = 1200;

export function listenForShelf(deck: Deck, player: Player): void {
  const host = window.parent !== window ? window.parent : (window.opener as Window | null);
  if (!host) return;
  const post = (msg: Record<string, unknown>): void => {
    try {
      host.postMessage({ v: 1, ...msg }, '*');
    } catch {
      // The shelf page has gone.
    }
  };
  let taken = false;
  let last = '';

  const state = (): void => {
    const msg = {
      type: 'vinyl-shelf:state',
      playing: deck.engine.playing,
      track: player.current ? player.queue.ids.indexOf(player.current.id) : -1,
      title: player.current?.tags.title ?? '',
      position: Math.round(deck.engine.currentTime * 10) / 10,
      duration: Math.round(deck.duration * 10) / 10,
      blocked: document.getElementById('shelf-tap') !== null,
      sound: deck.engine.context?.state ?? 'none',
    };
    const key = JSON.stringify(msg);
    if (key === last) return;
    last = key;
    post(msg);
  };

  // Some browsers (Safari) keep sound off in a framed page until a click lands inside it.
  const prompt = (): void => {
    if (document.getElementById('shelf-tap')) return;
    const tap = document.createElement('button');
    tap.id = 'shelf-tap';
    tap.type = 'button';
    tap.textContent = '▶  Tap to drop the needle';
    tap.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;border:0;background:rgba(0,0,0,.55);color:#fff;font:600 20px system-ui,sans-serif;cursor:pointer';
    tap.addEventListener('click', () => {
      tap.remove();
      void deck.engine.context?.resume();
      if (!deck.needleDown) deck.play();
    });
    document.body.append(tap);
    tap.focus();
    post({ type: 'vinyl-shelf:blocked' });
  };

  const take = async (load: ShelfLoad): Promise<void> => {
    const files = load.tracks.map((t) => t?.file).filter((f): f is File => f instanceof File);
    if (files.length === 0) return;
    taken = true;
    await player.import(files);
    const cover = load.album?.cover;
    if (cover instanceof Blob) await player.setGlobalCover(cover);
    post({ type: 'vinyl-shelf:loaded', tracks: player.queue.ids.length });
    // The import put the first track on the platter; this is the Play button.
    if (load.autoplay !== false && player.current) {
      deck.play();
      setTimeout(() => {
        if (deck.engine.context?.state !== 'running') prompt();
      }, AUTOPLAY_CHECK_MS);
    }
    setInterval(state, STATE_MS);
  };

  window.addEventListener('message', (event) => {
    if (event.source !== host || taken || !isShelfLoad(event.data)) return;
    void take(event.data);
  });
  post({ type: 'vinyl-shelf:hello', player: 'ultra-realistic-vinyl-player' });
}
