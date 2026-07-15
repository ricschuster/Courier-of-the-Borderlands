// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  recordError,
  loadErrors,
  clearErrors,
  ERROR_LOG_KEY,
  MAX_ERRORS,
  type ErrorRecordInput,
} from '../../src/systems/error-log';

// These cover the localStorage-backed helpers, which the pure append/parse tests
// cannot reach. Runs under jsdom (see the env directive above) so a real
// localStorage is present. Mirrors save-storage.test.ts.
//
// This half matters more than usual for the error log: every path here runs from
// inside an error handler (#221), so a throw would turn a recoverable fault into
// a loop, and the guards are the whole point.

const input: ErrorRecordInput = {
  source: 'error',
  message: 'boom',
  stack: 'Error: boom\n  at update (map-scene.ts:1)',
};

describe('error-log storage helpers (jsdom)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('records an error and reads it back', () => {
    recordError(input, 100);
    const list = loadErrors();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ message: 'boom', source: 'error', count: 1, at: 100 });
  });

  it('persists under the documented key', () => {
    recordError(input, 1);
    expect(localStorage.getItem(ERROR_LOG_KEY)).not.toBeNull();
  });

  it('accumulates distinct errors across calls', () => {
    recordError(input, 1);
    recordError({ ...input, message: 'a second fault' }, 2);
    expect(loadErrors()).toHaveLength(2);
  });

  it('collapses a repeat across calls rather than growing the store', () => {
    recordError(input, 1);
    recordError(input, 2);
    const list = loadErrors();
    expect(list).toHaveLength(1);
    expect(list[0]!.count).toBe(2);
  });

  it('never exceeds the cap, so a long session cannot grow without bound', () => {
    for (let i = 0; i < MAX_ERRORS + 10; i++) {
      recordError({ ...input, message: `fault ${i}` }, i);
    }
    expect(loadErrors()).toHaveLength(MAX_ERRORS);
  });

  it('swallows a store that throws on write (for example a quota)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => recordError(input, 1)).not.toThrow();
  });

  it('swallows a store that throws on read and reports no history', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(loadErrors()).toEqual([]);
  });

  it('returns [] for unparseable stored JSON rather than throwing', () => {
    localStorage.setItem(ERROR_LOG_KEY, '{not json');
    expect(loadErrors()).toEqual([]);
  });

  it('clears the history', () => {
    recordError(input, 1);
    expect(loadErrors()).toHaveLength(1);
    clearErrors();
    expect(loadErrors()).toEqual([]);
    expect(localStorage.getItem(ERROR_LOG_KEY)).toBeNull();
  });

  it('swallows a store that throws on clear', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => clearErrors()).not.toThrow();
  });
});
