import { describe, it, expect } from 'vitest';
import {
  createErrorRecord,
  appendError,
  parseErrors,
  recordError,
  loadErrors,
  ERROR_LOG_SCHEMA,
  MAX_ERRORS,
  MAX_MESSAGE_CHARS,
  MAX_STACK_CHARS,
  type ErrorRecordInput,
  type ErrorRecord,
} from '../../src/systems/error-log';

const base: ErrorRecordInput = {
  source: 'error',
  message: 'Cannot read properties of undefined',
  stack: 'Error: boom\n  at update (map-scene.ts:1)',
};

function record(overrides: Partial<ErrorRecord> = {}): ErrorRecord {
  return { ...createErrorRecord(base, 1000), ...overrides };
}

describe('createErrorRecord', () => {
  it('stamps the current schema, timestamp, and a starting count of 1', () => {
    const r = createErrorRecord(base, 1234);
    expect(r.schema).toBe(ERROR_LOG_SCHEMA);
    expect(r.at).toBe(1234);
    expect(r.count).toBe(1);
    expect(r.message).toBe(base.message);
    expect(r.stack).toBe(base.stack);
  });

  it('clamps a non-finite or negative timestamp', () => {
    expect(createErrorRecord(base, Number.NaN).at).toBe(0);
    expect(createErrorRecord(base, -5).at).toBe(0);
  });

  it('falls back to the error source when given an unknown one', () => {
    const r = createErrorRecord({ ...base, source: 'nonsense' as never }, 0);
    expect(r.source).toBe('error');
  });

  // A stack can run to tens of kilobytes and this store shares a quota with the
  // player's save, which must never fail to write because a stack was long.
  it('truncates an oversized message and stack, and marks them as truncated', () => {
    const r = createErrorRecord(
      { source: 'error', message: 'm'.repeat(5000), stack: 's'.repeat(50_000) },
      0,
    );
    expect(r.message.length).toBeLessThan(MAX_MESSAGE_CHARS + 20);
    expect(r.stack.length).toBeLessThan(MAX_STACK_CHARS + 20);
    expect(r.message).toContain('[truncated]');
    expect(r.stack).toContain('[truncated]');
  });

  it('coerces a missing message and stack to empty strings', () => {
    const r = createErrorRecord(
      { source: 'boot', message: undefined as never, stack: undefined as never },
      0,
    );
    expect(r.message).toBe('');
    expect(r.stack).toBe('');
  });
});

describe('appendError', () => {
  it('appends a distinct error as a new record', () => {
    const first = record();
    const second = createErrorRecord({ ...base, message: 'a different fault' }, 2000);
    const list = appendError([first], second);
    expect(list).toHaveLength(2);
    expect(list[1]!.message).toBe('a different fault');
  });

  // A throw inside the update loop fires every frame. Without collapsing repeats,
  // one broken frame floods the ring and erases the history leading up to it.
  it('collapses a consecutive repeat into the newest record count', () => {
    const first = record();
    const repeat = createErrorRecord(base, 5000);
    const list = appendError([first], repeat);
    expect(list).toHaveLength(1);
    expect(list[0]!.count).toBe(2);
    // The timestamp advances to the latest sighting.
    expect(list[0]!.at).toBe(5000);
  });

  it('keeps counting a long run of the same error without growing the list', () => {
    let list: ErrorRecord[] = [];
    for (let i = 0; i < 500; i++) {
      list = appendError(list, createErrorRecord(base, i));
    }
    expect(list).toHaveLength(1);
    expect(list[0]!.count).toBe(500);
  });

  it('does not collapse the same message from a different source', () => {
    const first = record();
    const other = createErrorRecord({ ...base, source: 'rejection' }, 2000);
    expect(appendError([first], other)).toHaveLength(2);
  });

  it('drops the oldest once the cap is reached', () => {
    let list: ErrorRecord[] = [];
    for (let i = 0; i < MAX_ERRORS + 5; i++) {
      list = appendError(list, createErrorRecord({ ...base, message: `fault ${i}` }, i));
    }
    expect(list).toHaveLength(MAX_ERRORS);
    expect(list[0]!.message).toBe('fault 5');
    expect(list[list.length - 1]!.message).toBe(`fault ${MAX_ERRORS + 4}`);
  });
});

describe('parseErrors', () => {
  it('returns [] for anything that is not an array', () => {
    expect(parseErrors(null)).toEqual([]);
    expect(parseErrors({})).toEqual([]);
    expect(parseErrors('nope')).toEqual([]);
  });

  it('skips non-object entries rather than throwing', () => {
    expect(parseErrors([null, 'x', 3, record()])).toHaveLength(1);
  });

  it('drops a record declaring an older schema', () => {
    expect(parseErrors([{ ...record(), schema: 0 }])).toEqual([]);
  });

  it('tolerates a record with no schema as current, like every other missing field', () => {
    const raw = { at: 5, source: 'error', message: 'm', stack: '', count: 1 };
    const parsed = parseErrors([raw]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.schema).toBe(ERROR_LOG_SCHEMA);
  });

  it('defaults missing or malformed fields instead of dropping the record', () => {
    const parsed = parseErrors([{ schema: ERROR_LOG_SCHEMA }]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ at: 0, source: 'error', message: '', stack: '', count: 1 });
  });

  it('floors a fractional count to at least 1', () => {
    expect(parseErrors([{ ...record(), count: 0 }])[0]!.count).toBe(1);
    expect(parseErrors([{ ...record(), count: 2.7 }])[0]!.count).toBe(2);
  });

  it('round-trips a real record through JSON', () => {
    const r = createErrorRecord(base, 999);
    expect(parseErrors(JSON.parse(JSON.stringify([r])))).toEqual([r]);
  });
});

describe('storage wrapper without localStorage (node env)', () => {
  it('loadErrors returns [] when storage is unavailable', () => {
    expect(loadErrors()).toEqual([]);
  });

  // This runs from an error handler: throwing here would turn a recoverable
  // fault into a loop.
  it('recordError degrades gracefully and still returns the appended record', () => {
    const list = recordError(base, 42);
    expect(list).toHaveLength(1);
    expect(list[0]!.message).toBe(base.message);
    expect(list[0]!.at).toBe(42);
  });
});
