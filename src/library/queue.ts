export type RepeatMode = 'off' | 'one' | 'all';
export type Random = () => number;

/** What is persisted: track ids and settings only, never audio. */
export interface QueueState {
  ids: string[];
  currentId: string | null;
  repeat: RepeatMode;
  shuffle: boolean;
}

const REPEAT_ORDER: readonly RepeatMode[] = ['off', 'all', 'one'];
const HISTORY_LIMIT = 200;

/** Returns a shuffled copy (Fisher–Yates). */
export function fisherYates<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i] as T;
    result[i] = result[j] as T;
    result[j] = a;
  }
  return result;
}

export class Queue {
  ids: string[] = [];
  currentId: string | null = null;
  repeat: RepeatMode = 'off';
  shuffle = false;
  /** Ids still to play in this shuffle cycle. Never contains the current track. */
  private bag: string[] = [];
  private history: string[] = [];

  get currentIndex(): number {
    return this.currentId === null ? -1 : this.ids.indexOf(this.currentId);
  }

  /** Replaces the order, keeping the current track if it is still present. */
  setIds(ids: readonly string[], random: Random = Math.random): void {
    this.ids = [...new Set(ids)];
    if (this.currentId !== null && !this.ids.includes(this.currentId)) this.currentId = null;
    this.history = this.history.filter((id) => this.ids.includes(id));
    this.refillBag(random);
  }

  /** Appends ids that are not queued yet. */
  add(ids: readonly string[], random: Random = Math.random): void {
    const fresh = [...new Set(ids)].filter((id) => !this.ids.includes(id));
    this.ids.push(...fresh);
    if (this.shuffle) this.bag = fisherYates([...this.bag, ...fresh], random);
  }

  /** Drops a track from the order, the shuffle cycle and the history. */
  remove(id: string): boolean {
    if (!this.ids.includes(id)) return false;
    const without = (list: string[]): string[] => list.filter((queued) => queued !== id);
    this.ids = without(this.ids);
    this.bag = without(this.bag);
    this.history = without(this.history);
    if (this.currentId === id) this.currentId = null;
    return true;
  }

  clear(): void {
    this.ids = [];
    this.bag = [];
    this.history = [];
    this.currentId = null;
  }

  /** Makes `id` the current track. Returns false when it is not queued. */
  select(id: string): boolean {
    if (!this.ids.includes(id)) return false;
    this.makeCurrent(id);
    return true;
  }

  /** Moves a track to a new index, clamped to the list. Returns the final index. */
  moveTo(id: string, index: number): number {
    const from = this.ids.indexOf(id);
    if (from < 0) return -1;
    const to = Math.max(0, Math.min(this.ids.length - 1, Math.trunc(index)));
    this.ids.splice(from, 1);
    this.ids.splice(to, 0, id);
    return to;
  }

  /** Advances and returns the new current id, or null when the queue has run out. */
  next(random: Random = Math.random): string | null {
    if (this.ids.length === 0) return null;
    if (this.currentId === null) {
      const first = this.shuffle ? this.drawFromBag(random) : (this.ids[0] ?? null);
      if (first !== null) this.makeCurrent(first);
      return first;
    }
    if (this.repeat === 'one') return this.currentId;
    const id = this.shuffle ? this.drawFromBag(random) : this.sequentialNext();
    if (id !== null) this.makeCurrent(id);
    return id;
  }

  /** Goes back through what was played, then backward through the list. */
  previous(): string | null {
    const played = this.history.pop();
    if (played !== undefined) {
      this.currentId = played;
      this.bag = this.bag.filter((id) => id !== played);
      return played;
    }
    const index = this.currentIndex;
    if (index > 0) this.currentId = this.ids[index - 1] ?? null;
    else if (this.repeat === 'all' && this.ids.length > 0) this.currentId = this.ids.at(-1) ?? null;
    else return null;
    return this.currentId;
  }

  cycleRepeat(): RepeatMode {
    const index = REPEAT_ORDER.indexOf(this.repeat);
    this.repeat = REPEAT_ORDER[(index + 1) % REPEAT_ORDER.length] ?? 'off';
    return this.repeat;
  }

  toggleShuffle(random: Random = Math.random): boolean {
    this.shuffle = !this.shuffle;
    this.refillBag(random);
    return this.shuffle;
  }

  toState(): QueueState {
    return {
      ids: [...this.ids],
      currentId: this.currentId,
      repeat: this.repeat,
      shuffle: this.shuffle,
    };
  }

  /** Rebuilds a queue from persisted data, ignoring anything malformed. */
  static restore(state: unknown, random: Random = Math.random): Queue {
    const queue = new Queue();
    if (typeof state !== 'object' || state === null) return queue;
    const raw = state as Partial<Record<keyof QueueState, unknown>>;
    if (REPEAT_ORDER.includes(raw.repeat as RepeatMode)) queue.repeat = raw.repeat as RepeatMode;
    queue.shuffle = raw.shuffle === true;
    if (Array.isArray(raw.ids)) {
      queue.ids = [...new Set(raw.ids.filter((id): id is string => typeof id === 'string'))];
    }
    if (typeof raw.currentId === 'string' && queue.ids.includes(raw.currentId)) {
      queue.currentId = raw.currentId;
    }
    queue.refillBag(random);
    return queue;
  }

  private makeCurrent(id: string): void {
    if (this.currentId !== null && this.currentId !== id) {
      this.history.push(this.currentId);
      if (this.history.length > HISTORY_LIMIT) this.history.shift();
    }
    this.currentId = id;
    this.bag = this.bag.filter((queued) => queued !== id);
  }

  private sequentialNext(): string | null {
    const index = this.currentIndex + 1;
    if (index < this.ids.length) return this.ids[index] ?? null;
    return this.repeat === 'all' ? (this.ids[0] ?? null) : null;
  }

  private drawFromBag(random: Random): string | null {
    if (this.bag.length === 0) {
      if (this.repeat !== 'all' && this.currentId !== null) return null;
      this.refillBag(random);
      // A single-track queue on repeat-all can only play itself again.
      if (this.bag.length === 0) return this.currentId;
    }
    return this.bag.pop() ?? null;
  }

  private refillBag(random: Random): void {
    this.bag = this.shuffle
      ? fisherYates(
          this.ids.filter((id) => id !== this.currentId),
          random,
        )
      : [];
  }
}
