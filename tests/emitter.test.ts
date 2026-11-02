import { describe, expect, it, vi } from 'vitest';
import { Emitter } from '../src/audio/emitter';

interface Events {
  state: string;
  end: undefined;
}

describe('Emitter', () => {
  it('delivers payloads to listeners of that event only', () => {
    const emitter = new Emitter<Events>();
    const onState = vi.fn();
    const onEnd = vi.fn();
    emitter.on('state', onState);
    emitter.on('end', onEnd);
    emitter.emit('state', 'playing');
    expect(onState).toHaveBeenCalledExactlyOnceWith('playing');
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('supports several listeners per event', () => {
    const emitter = new Emitter<Events>();
    const a = vi.fn();
    const b = vi.fn();
    emitter.on('state', a);
    emitter.on('state', b);
    emitter.emit('state', 'x');
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('returns an unsubscribe function from on', () => {
    const emitter = new Emitter<Events>();
    const listener = vi.fn();
    const off = emitter.on('state', listener);
    off();
    emitter.emit('state', 'x');
    expect(listener).not.toHaveBeenCalled();
  });

  it('lets a listener unsubscribe during emit without skipping others', () => {
    const emitter = new Emitter<Events>();
    const second = vi.fn();
    const off = emitter.on('state', () => off());
    emitter.on('state', second);
    emitter.emit('state', 'x');
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('emits with no listeners without throwing', () => {
    expect(() => new Emitter<Events>().emit('end', undefined)).not.toThrow();
  });

  it('removes every listener on clear', () => {
    const emitter = new Emitter<Events>();
    const listener = vi.fn();
    emitter.on('state', listener);
    emitter.on('end', listener);
    emitter.clear();
    emitter.emit('state', 'x');
    emitter.emit('end', undefined);
    expect(listener).not.toHaveBeenCalled();
  });
});
