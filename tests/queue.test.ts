import { describe, expect, it } from 'vitest';
import { Queue, fisherYates } from '../src/library/queue';
import { seededRandom } from './helpers';

const IDS = ['a', 'b', 'c', 'd', 'e'];

function queueOf(ids: string[] = IDS): Queue {
  const queue = new Queue();
  queue.setIds(ids);
  return queue;
}

describe('fisherYates', () => {
  it('returns a permutation without changing the input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const output = fisherYates(input, seededRandom(1));
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...output].sort()).toEqual(input);
  });

  it('produces every ordering of three items over many seeds', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed++)
      seen.add(fisherYates([...'abc'], seededRandom(seed)).join(''));
    expect(seen.size).toBe(6);
  });

  it('handles empty and single-item lists', () => {
    expect(fisherYates([], Math.random)).toEqual([]);
    expect(fisherYates(['x'], Math.random)).toEqual(['x']);
  });
});

describe('Queue order', () => {
  it('starts empty with no current track', () => {
    const queue = new Queue();
    expect(queue.currentId).toBeNull();
    expect(queue.currentIndex).toBe(-1);
    expect(queue.next()).toBeNull();
    expect(queue.previous()).toBeNull();
  });

  it('plays through in order and stops at the end with repeat off', () => {
    const queue = queueOf();
    const played: (string | null)[] = [];
    for (let i = 0; i < 6; i++) played.push(queue.next());
    expect(played).toEqual(['a', 'b', 'c', 'd', 'e', null]);
    expect(queue.currentId).toBe('e');
  });

  it('wraps to the start with repeat all', () => {
    const queue = queueOf(['a', 'b']);
    queue.repeat = 'all';
    expect([queue.next(), queue.next(), queue.next()]).toEqual(['a', 'b', 'a']);
  });

  it('stays on the same track with repeat one', () => {
    const queue = queueOf();
    queue.select('c');
    queue.repeat = 'one';
    expect(queue.next()).toBe('c');
    expect(queue.next()).toBe('c');
  });

  it('cycles repeat off → all → one → off', () => {
    const queue = new Queue();
    expect([queue.cycleRepeat(), queue.cycleRepeat(), queue.cycleRepeat()]).toEqual([
      'all',
      'one',
      'off',
    ]);
  });

  it('selects a queued track and refuses an unknown one', () => {
    const queue = queueOf();
    expect(queue.select('d')).toBe(true);
    expect(queue.currentIndex).toBe(3);
    expect(queue.select('zzz')).toBe(false);
    expect(queue.currentId).toBe('d');
  });

  it('previous retraces what was played', () => {
    const queue = queueOf();
    queue.select('a');
    queue.select('d');
    queue.select('b');
    expect(queue.previous()).toBe('d');
    expect(queue.previous()).toBe('a');
  });

  it('previous falls back to list order, and wraps only with repeat all', () => {
    const queue = queueOf();
    queue.currentId = 'b';
    expect(queue.previous()).toBe('a');
    expect(queue.previous()).toBeNull();
    queue.repeat = 'all';
    expect(queue.previous()).toBe('e');
  });
});

describe('Queue editing', () => {
  it('moves a track and clamps the target index', () => {
    const queue = queueOf();
    expect(queue.moveTo('a', 2)).toBe(2);
    expect(queue.ids).toEqual(['b', 'c', 'a', 'd', 'e']);
    expect(queue.moveTo('a', 99)).toBe(4);
    expect(queue.moveTo('a', -5)).toBe(0);
    expect(queue.ids).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(queue.moveTo('nope', 1)).toBe(-1);
  });

  it('keeps the current track when it moves', () => {
    const queue = queueOf();
    queue.select('c');
    queue.moveTo('c', 0);
    expect(queue.currentId).toBe('c');
    expect(queue.currentIndex).toBe(0);
  });

  it('adds only new ids', () => {
    const queue = queueOf(['a', 'b']);
    queue.add(['b', 'c', 'c']);
    expect(queue.ids).toEqual(['a', 'b', 'c']);
  });

  it('setIds drops a current track that is gone and removes duplicates', () => {
    const queue = queueOf();
    queue.select('e');
    queue.setIds(['a', 'a', 'b']);
    expect(queue.ids).toEqual(['a', 'b']);
    expect(queue.currentId).toBeNull();
  });

  it('removes a track and keeps the rest in order', () => {
    const queue = queueOf();
    queue.select('b');
    expect(queue.remove('d')).toBe(true);
    expect(queue.ids).toEqual(['a', 'b', 'c', 'e']);
    expect(queue.currentId).toBe('b');
    expect(queue.next()).toBe('c');
    expect(queue.next()).toBe('e');
    expect(queue.remove('nope')).toBe(false);
  });

  it('clears the current track when it is the one removed', () => {
    const queue = queueOf();
    queue.select('c');
    queue.remove('c');
    expect(queue.currentId).toBeNull();
    expect(queue.currentIndex).toBe(-1);
    expect(queue.next()).toBe('a');
  });

  it('never goes back to a removed track', () => {
    const queue = queueOf();
    queue.select('a');
    queue.select('b');
    queue.select('c');
    queue.remove('b');
    expect(queue.previous()).toBe('a');
  });

  it('never draws a removed track while shuffling', () => {
    for (let seed = 0; seed < 100; seed++) {
      const random = seededRandom(seed);
      const queue = queueOf();
      queue.repeat = 'all';
      queue.select('a');
      queue.toggleShuffle(random);
      queue.remove('d');
      queue.remove('a');
      for (let step = 0; step < 15; step++) {
        expect(['b', 'c', 'e']).toContain(queue.next(random));
      }
    }
  });

  it('clear empties everything', () => {
    const queue = queueOf();
    queue.select('b');
    queue.clear();
    expect(queue.ids).toEqual([]);
    expect(queue.currentId).toBeNull();
    expect(queue.next()).toBeNull();
  });
});

describe('Queue shuffle', () => {
  it('never picks the current track as next, over many seeds', () => {
    for (let seed = 0; seed < 500; seed++) {
      const random = seededRandom(seed);
      const queue = queueOf();
      queue.repeat = 'all';
      queue.select(IDS[seed % IDS.length]!);
      queue.toggleShuffle(random);
      for (let step = 0; step < 25; step++) {
        const before = queue.currentId;
        expect(queue.next(random)).not.toBe(before);
      }
    }
  });

  it('plays every other track once before stopping, with repeat off', () => {
    for (let seed = 0; seed < 50; seed++) {
      const random = seededRandom(seed);
      const queue = queueOf();
      queue.select('c');
      queue.toggleShuffle(random);
      const played = [
        queue.next(random),
        queue.next(random),
        queue.next(random),
        queue.next(random),
      ];
      expect([...played].sort()).toEqual(['a', 'b', 'd', 'e']);
      expect(queue.next(random)).toBeNull();
    }
  });

  it('starts a new cycle with repeat all', () => {
    const random = seededRandom(11);
    const queue = queueOf(['a', 'b', 'c']);
    queue.repeat = 'all';
    queue.toggleShuffle(random);
    const played = new Set<string | null>();
    for (let i = 0; i < 12; i++) played.add(queue.next(random));
    expect(played).toEqual(new Set(['a', 'b', 'c']));
  });

  it('replays a single track on repeat all and stops otherwise', () => {
    const repeating = queueOf(['only']);
    repeating.repeat = 'all';
    repeating.toggleShuffle();
    expect(repeating.next()).toBe('only');
    expect(repeating.next()).toBe('only');
    const once = queueOf(['only']);
    once.toggleShuffle();
    expect(once.next()).toBe('only');
    expect(once.next()).toBeNull();
  });

  it('includes tracks added during a shuffle cycle', () => {
    const random = seededRandom(5);
    const queue = queueOf(['a', 'b']);
    queue.select('a');
    queue.toggleShuffle(random);
    queue.add(['c'], random);
    expect(new Set([queue.next(random), queue.next(random)])).toEqual(new Set(['b', 'c']));
  });

  it('returns to list order when shuffle is switched off', () => {
    const queue = queueOf();
    queue.select('b');
    queue.toggleShuffle(seededRandom(2));
    expect(queue.toggleShuffle()).toBe(false);
    expect(queue.next()).toBe('c');
  });
});

describe('Queue persistence', () => {
  it('round-trips ids and settings only', () => {
    const queue = queueOf();
    queue.select('d');
    queue.repeat = 'all';
    queue.toggleShuffle(seededRandom(1));
    const state = JSON.parse(JSON.stringify(queue.toState())) as unknown;
    expect(Object.keys(state as object).sort()).toEqual(['currentId', 'ids', 'repeat', 'shuffle']);
    const restored = Queue.restore(state);
    expect(restored.toState()).toEqual(queue.toState());
  });

  it.each([null, 42, 'x', {}, { ids: 'abc' }, { ids: [1, 2], repeat: 'sometimes', currentId: 9 }])(
    'tolerates malformed state %j',
    (state) => {
      const queue = Queue.restore(state);
      expect(queue.ids).toEqual([]);
      expect(queue.currentId).toBeNull();
      expect(queue.repeat).toBe('off');
      expect(queue.shuffle).toBe(false);
    },
  );

  it('drops a current id that is not in the list', () => {
    expect(Queue.restore({ ids: ['a'], currentId: 'b' }).currentId).toBeNull();
  });
});
