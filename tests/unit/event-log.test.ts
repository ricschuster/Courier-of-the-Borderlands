import { describe, it, expect } from 'vitest';
import { pushEvent, MAX_RECENT_EVENTS } from '../../src/systems/event-log';

describe('pushEvent', () => {
  it('appends a message with newest last', () => {
    expect(pushEvent(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('does not mutate the input list', () => {
    const log = ['a'];
    pushEvent(log, 'b');
    expect(log).toEqual(['a']);
  });

  it('caps to the newest max entries, dropping the oldest', () => {
    const log = pushEvent(['a', 'b', 'c'], 'd', 3);
    expect(log).toEqual(['b', 'c', 'd']);
  });

  it('defaults to MAX_RECENT_EVENTS', () => {
    let log: string[] = [];
    for (let i = 0; i < MAX_RECENT_EVENTS + 2; i++) {
      log = pushEvent(log, `m${i}`);
    }
    expect(log).toHaveLength(MAX_RECENT_EVENTS);
    expect(log[log.length - 1]).toBe(`m${MAX_RECENT_EVENTS + 1}`);
    expect(log[0]).toBe('m2');
  });
});
