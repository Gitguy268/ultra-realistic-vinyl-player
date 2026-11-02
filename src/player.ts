import { Emitter } from './audio/emitter';
import type { Deck } from './deck';
import { Library, type Track, type TrackStore, type TrackTags } from './library/db';
import { HtmlLibrary } from './library/db-html';
import { DEMO_ALBUM, DEMO_ARTIST, NoStore, demoFiles } from './demo';
import { quotaWarning } from './library/files';
import { importFiles } from './library/importer';
import { Queue, type RepeatMode } from './library/queue';
import { readStored, writeStored } from './util/storage';

export interface ImportProgress {
  done: number;
  total: number;
}

export interface PlayerEvents {
  /** The library, queue order, settings or current track changed. */
  change: undefined;
  /** A different track became current (or none). */
  track: Track | null;
  status: string;
  announce: string;
  /** The browser's answer on whether it will keep the library. */
  storage: string;
  progress: ImportProgress | null;
}

const LARGE_IMPORT_BYTES = 50 * 1024 * 1024;

/** The library and queue, and the rules for moving between tracks on the deck. */
export class Player {
  readonly events = new Emitter<PlayerEvents>();
  readonly tracks = new Map<string, Track>();
  queue = new Queue();
  autoAdvance = false;
  readonly deck: Deck;
  private readonly library: TrackStore;
  private globalCover: Blob | null = null;
  /** `?demo`: three synthesized tracks beside the library, which stays closed and untouched. */
  private readonly demo: boolean;
  private loadedId: string | null = null;
  private importAbort: AbortController | null = null;

  constructor(deck: Deck, demo = false) {
    this.deck = deck;
    this.demo = demo;
    this.library = demo
      ? new NoStore()
      : __PROFILE__ === 'html'
        ? new HtmlLibrary()
        : new Library();
    deck.attach({
      ids: () => this.queue.ids,
      levels: (index) => this.tracks.get(this.queue.ids[index] ?? '')?.levels,
      saveLevels: (index, levels) => {
        const track = this.tracks.get(this.queue.ids[index] ?? '');
        if (!track || track.levels) return;
        track.levels = levels;
        void this.library.put(track).catch(() => undefined);
      },
      fileAt: (index) => this.tracks.get(this.queue.ids[index] ?? '')?.blob,
      durations: () => this.queue.ids.map((id) => this.tracks.get(id)?.durationSec),
      currentIndex: () =>
        this.queue.currentId === null ? -1 : this.queue.ids.indexOf(this.queue.currentId),
      selectIndex: (index, play) => {
        const id = this.queue.ids[index];
        if (id !== undefined) this.select(id, play);
      },
      nextIndex: () => {
        // The last track of a side ends in the run-out: the queue moves on only when it is turned over.
        const { sides, last } = deck.program;
        const cur =
          this.queue.currentId === null ? -1 : this.queue.ids.indexOf(this.queue.currentId);
        if (sides.length > 1 && cur === last && !this.queue.shuffle && this.queue.repeat !== 'one')
          return -1;
        const id = this.queue.next();
        this.persist();
        return id === null ? -1 : this.queue.ids.indexOf(id);
      },
    });
    // The end stop has lifted the arm at the end of a side. With "Play the next track when a
    // side ends" on, the record is turned over and the next side plays (C19).
    deck.events.on('returned', () => {
      if (!this.autoAdvance) return;
      const sides = deck.program.sides;
      const next = sides[deck.program.side + 1];
      if (!next) return;
      const id = this.queue.ids[next[0]];
      if (id !== undefined) this.select(id, true);
    });
    this.events.on('change', () => deck.rebuild());
  }

  get current(): Track | null {
    return this.queue.currentId === null ? null : (this.tracks.get(this.queue.currentId) ?? null);
  }

  /** Restores the library and queue saved by an earlier visit. */
  async start(): Promise<void> {
    this.autoAdvance = readStored('autoAdvance') === true;
    if (this.demo) {
      await this.import(demoFiles());
      for (const track of this.tracks.values()) {
        track.tags = { ...track.tags, artist: DEMO_ARTIST, album: DEMO_ALBUM };
      }
      this.events.emit('change', undefined);
      return;
    }
    let stored: Track[] = [];
    try {
      stored = await this.library.all();
    } catch {
      this.events.emit('status', 'The saved library could not be opened in this browser.');
    }
    stored.sort((a, b) => a.addedAt - b.addedAt);
    for (const track of stored) this.tracks.set(track.id, track);
    this.globalCover = await this.library.loadCover().catch(() => null);
    this.queue = Queue.restore(readStored('queue'));
    const known = this.queue.ids.filter((id) => this.tracks.has(id));
    this.queue.setIds([...known, ...stored.map((track) => track.id)]);
    this.events.emit('change', undefined);
    const current = this.current;
    if (!current) return;
    this.loadedId = current.id;
    this.deck.cueUp(current.blob, current.tags.title, current.durationSec);
    this.events.emit('track', current);
    this.deck.restored();
  }

  async import(files: readonly File[]): Promise<void> {
    if (files.length === 0) {
      this.events.emit('status', 'No audio files found.');
      return;
    }
    if (this.importAbort) return;
    const bytes = files.reduce((sum, file) => sum + file.size, 0);
    const notes: string[] = [];
    if (bytes > LARGE_IMPORT_BYTES && navigator.storage?.estimate) {
      const warning = quotaWarning(await navigator.storage.estimate(), bytes);
      if (warning) notes.push(warning);
    }
    this.importAbort = new AbortController();
    const result = await importFiles(
      files,
      this.library,
      (done, total) => this.events.emit('progress', { done, total }),
      this.importAbort.signal,
    );
    this.importAbort = null;
    this.events.emit('progress', null);
    for (const track of result.tracks) this.tracks.set(track.id, track);
    // The first tagged cover becomes the label of tracks that have none (X40).
    if (!this.globalCover) {
      const cover = result.tracks.find((track) => track.coverBlob)?.coverBlob;
      if (cover) {
        this.globalCover = cover;
        void this.library.saveCover(cover).catch(() => undefined);
      }
    }
    this.queue.add(result.tracks.map((track) => track.id));
    this.persist();
    const count = result.tracks.length;
    notes.unshift(
      `${result.cancelled ? 'Import cancelled after' : 'Imported'} ${count} ${count === 1 ? 'track' : 'tracks'}.`,
    );
    if (result.failed > 0) notes.push(`${result.failed} could not be stored.`);
    this.events.emit('status', notes.join(' '));
    // Firefox asks the user before answering, so this must not hold up the import.
    void this.requestPersistence().then((answer) => {
      if (answer) this.events.emit('storage', answer);
    });
    this.events.emit('announce', notes[0] ?? '');
    this.events.emit('change', undefined);
    const first = result.tracks[0];
    if (first && !this.deck.needleDown) this.select(first.id, false);
  }

  cancelImport(): void {
    this.importAbort?.abort();
  }

  /** Asks the browser once not to evict the library, and reports its answer. */
  private async requestPersistence(): Promise<string | null> {
    if (readStored('persistAsked') === true || !navigator.storage?.persist) return null;
    writeStored('persistAsked', true);
    const granted = await navigator.storage.persist().catch(() => false);
    return granted
      ? 'The browser will keep the library until you clear it.'
      : 'The browser may clear the library if storage runs low.';
  }

  async clearLibrary(): Promise<void> {
    await this.library.clear();
    this.tracks.clear();
    this.queue.clear();
    this.loadedId = null;
    this.persist();
    this.events.emit(
      'status',
      'Library cleared. The record on the platter stays until you load another.',
    );
    this.events.emit('track', null);
    this.events.emit('change', undefined);
  }

  /** Saves edited tags and notes for the current track. */
  async updateCurrent(tags: TrackTags, notes: string): Promise<void> {
    const track = this.current;
    if (!track) return;
    const updated: Track = { ...track, tags };
    if (notes) updated.notes = notes;
    else delete updated.notes;
    this.tracks.set(track.id, updated);
    this.deck.title = tags.title;
    this.events.emit('change', undefined);
    try {
      await this.library.put(updated);
    } catch {
      this.events.emit('status', 'These details could not be saved in this browser.');
    }
  }

  /** A cover dropped on the page: the label of every track without its own (H18). */
  async setGlobalCover(cover: Blob): Promise<void> {
    this.globalCover = cover;
    this.events.emit('track', this.current);
    try {
      await this.library.saveCover(cover);
    } catch {
      this.events.emit('status', 'This cover could not be saved in this browser.');
    }
  }

  /** The label a track shows: its own cover, or the page's. */
  coverOf(track: Track | null): Blob | undefined {
    return track?.coverBlob ?? this.globalCover ?? undefined;
  }

  /** Turns the record over: the next side's first track, on the same needle intent (H14). */
  flip(): void {
    const { sides, side } = this.deck.program;
    if (sides.length < 2) return;
    const first = sides[(side + 1) % sides.length]?.[0] ?? 0;
    const id = this.queue.ids[first];
    if (id !== undefined) this.select(id, true);
  }

  /** Removes one track from the library and the queue. A record on the platter stays there. */
  async remove(id: string): Promise<void> {
    const track = this.tracks.get(id);
    if (!track) return;
    await this.library.delete(id);
    this.tracks.delete(id);
    this.queue.remove(id);
    if (this.loadedId === id) this.loadedId = null;
    this.persist();
    this.deck.trackRemoved();
    this.events.emit('status', `Removed ${track.tags.title} from the library.`);
    this.events.emit('announce', `Removed ${track.tags.title}.`);
    this.events.emit('change', undefined);
  }

  /** Makes a track current and puts it on the platter. */
  select(id: string, autoplay: boolean): void {
    const track = this.tracks.get(id);
    if (!track || !this.queue.select(id)) return;
    this.persist();
    void this.load(track, autoplay);
  }

  next(autoplay = false): void {
    this.step(this.queue.next(), autoplay, 'End of the queue.');
  }

  previous(): void {
    this.step(this.queue.previous(), false, 'Start of the queue.');
  }

  private step(id: string | null, autoplay: boolean, endMessage: string): void {
    const track = id === null ? undefined : this.tracks.get(id);
    if (!track) {
      this.events.emit('status', endMessage);
      return;
    }
    this.persist();
    void this.load(track, autoplay);
  }

  /** Applies a new order from drag or keyboard reordering. */
  reorder(ids: readonly string[]): void {
    this.queue.setIds(ids.filter((id) => this.tracks.has(id)));
    this.persist();
    this.events.emit('change', undefined);
  }

  move(id: string, delta: number): number {
    const index = this.queue.moveTo(id, this.queue.ids.indexOf(id) + delta);
    this.persist();
    this.events.emit('change', undefined);
    return index;
  }

  toggleShuffle(): boolean {
    const shuffle = this.queue.toggleShuffle();
    this.persist();
    this.events.emit('change', undefined);
    return shuffle;
  }

  cycleRepeat(): RepeatMode {
    const repeat = this.queue.cycleRepeat();
    this.persist();
    this.events.emit('change', undefined);
    return repeat;
  }

  setAutoAdvance(enabled: boolean): void {
    this.autoAdvance = enabled;
    writeStored('autoAdvance', enabled);
  }

  private async load(track: Track, autoplay: boolean): Promise<void> {
    this.events.emit('track', track);
    this.events.emit('change', undefined);
    if (track.id === this.loadedId && this.deck.hasTrack) {
      this.deck.restart(autoplay);
      return;
    }
    this.loadedId = track.id;
    await this.deck.load(track.blob, track.tags.title, autoplay);
  }

  private persist(): void {
    if (this.demo) return;
    writeStored('queue', this.queue.toState());
  }
}
