import type { Track } from '../library/db';

export interface MediaSessionActions {
  play(): void;
  pause(): void;
  previous(): void;
  next(): void;
  seekTo(seconds: number): void;
  /** Moves by this many seconds; the browser may suggest its own offset (html-1's default is 5). */
  seekBy(seconds: number): void;
}

const SEEK_OFFSET_S = 5;
let artworkUrl: string | null = null;

/** Registers hardware and lock-screen media keys where the browser supports them. */
export function bindMediaSession(actions: MediaSessionActions): void {
  if (!('mediaSession' in navigator)) return;
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => actions.play()],
    ['pause', () => actions.pause()],
    ['previoustrack', () => actions.previous()],
    ['nexttrack', () => actions.next()],
    [
      'seekto',
      (details) => {
        if (details.seekTime !== undefined) actions.seekTo(details.seekTime);
      },
    ],
    ['seekbackward', (details) => actions.seekBy(-(details.seekOffset ?? SEEK_OFFSET_S))],
    ['seekforward', (details) => actions.seekBy(details.seekOffset ?? SEEK_OFFSET_S)],
  ];
  for (const [action, handler] of handlers) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Browsers throw for actions they do not know; the others still register.
    }
  }
}

/** Publishes the track's tags and cover. The previous artwork URL is revoked. */
export function showMediaMetadata(track: Track | null): void {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  if (artworkUrl) URL.revokeObjectURL(artworkUrl);
  artworkUrl = track?.coverBlob ? URL.createObjectURL(track.coverBlob) : null;
  navigator.mediaSession.metadata = track
    ? new MediaMetadata({
        title: track.tags.title,
        artist: track.tags.artist,
        album: track.tags.album,
        artwork: artworkUrl ? [{ src: artworkUrl, type: track.coverBlob?.type ?? '' }] : [],
      })
    : null;
}

/** Lock screens draw their progress from this; the rate is the platter's target speed (html-1). */
export function showPosition(duration: number, position: number, rate: number): void {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  if (!(duration > 0) || !(rate > 0)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      position: Math.min(duration, Math.max(0, position)),
      playbackRate: rate,
    });
  } catch {
    // Some browsers refuse rates outside their range; the position is only a courtesy.
  }
}

export function showPlaybackState(playing: boolean): void {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }
}
