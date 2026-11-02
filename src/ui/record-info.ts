import { MAX_NOTES_LENGTH, cleanTags } from '../library/files';
import type { Player } from '../player';
import { byId, formatTime, setText } from './dom';

const TAG_FIELDS = ['title', 'artist', 'album', 'year', 'genre'] as const;

/** The Record Info panel: the current track's details and liner notes, editable in place. */
export function bindRecordInfo(player: Player): void {
  const fields = byId<HTMLElement>('info-fields');
  const empty = byId<HTMLElement>('info-empty');
  const notes = byId<HTMLTextAreaElement>('info-notes');
  const length = byId<HTMLElement>('info-length');
  const input = (key: (typeof TAG_FIELDS)[number]): HTMLInputElement =>
    byId<HTMLInputElement>(`info-${key}`);

  function show(): void {
    const track = player.current;
    fields.hidden = !track;
    empty.hidden = Boolean(track);
    if (!track) return;
    for (const key of TAG_FIELDS) input(key).value = String(track.tags[key] ?? '');
    notes.value = track.notes ?? '';
    setText(length, track.durationSec > 0 ? `Length ${formatTime(track.durationSec)}` : '');
  }

  player.events.on('track', show);
  fields.addEventListener('change', () => {
    const track = player.current;
    if (!track) return;
    const typed = Object.fromEntries(TAG_FIELDS.map((key) => [key, input(key).value])) as Record<
      (typeof TAG_FIELDS)[number],
      string
    >;
    const tags = cleanTags(typed, track.tags.title);
    const tidyNotes = notes.value.trim().slice(0, MAX_NOTES_LENGTH);
    // Show the tidied values now, in the same tick. Refreshing after the save
    // finishes could overwrite whatever is being typed in the next field.
    for (const key of TAG_FIELDS) input(key).value = String(tags[key] ?? '');
    notes.value = tidyNotes;
    void player.updateCurrent(tags, tidyNotes);
  });
  show();
}
