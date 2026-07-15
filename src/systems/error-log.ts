// Runtime error log (#221). The game already catches uncaught errors and raises
// a recovery overlay (see main.ts), but that overlay is deliberately
// player-facing ("The road washed out") and never says what broke: the detail
// reached only the console and died with the tab, so an error during a real
// playtest left no trace.
//
// This keeps a small rolling history of what actually threw, in localStorage
// alongside the telemetry store, and the telemetry.html dashboard reads it. No
// dependency and no external service, so it stays Pages-friendly.
//
// Deliberately modelled on src/systems/telemetry.ts: same schema-version field,
// same capped ring, same tolerant parse, same guarded storage wrapper. The
// serialize/summarize logic is pure and unit tested; the read/write helpers are a
// thin guard over localStorage so a logging failure can never break the game.

import { namespacedKey } from './storage-namespace';

/** Record format version, so an older stored record can be recognized or dropped. */
export const ERROR_LOG_SCHEMA = 1;

/** localStorage key the rolling error history lives under. Namespaced per deploy (#278). */
export const ERROR_LOG_KEY = namespacedKey('courier-of-the-borderlands/errors');

/**
 * Cap on stored records. A ring: the oldest is dropped once the cap is reached.
 * Smaller than the telemetry cap because a stack is far bigger than a run record
 * and this shares a same-origin storage quota with the save.
 */
export const MAX_ERRORS = 30;

/**
 * Caps on stored strings. A stack can run to tens of kilobytes, and this store
 * shares its quota with the player's save, which must never be the thing that
 * fails to write because a stack was long.
 */
export const MAX_MESSAGE_CHARS = 300;
export const MAX_STACK_CHARS = 2000;

/** Where an error was caught. Mirrors the three handlers in main.ts. */
export type ErrorSource = 'error' | 'rejection' | 'boot';

/** One captured error. Flat and JSON-serializable. */
export interface ErrorRecord {
  readonly schema: number;
  /** Epoch milliseconds first seen. */
  readonly at: number;
  readonly source: ErrorSource;
  readonly message: string;
  /** Stack if one was available, else empty. Truncated. */
  readonly stack: string;
  /**
   * How many times this error repeated consecutively. A throw inside the update
   * loop fires every frame; without collapsing repeats, one broken frame would
   * flood the ring and erase the history of what led up to it.
   */
  readonly count: number;
}

/** The live figures a capture draws from; timestamp is supplied separately. */
export type ErrorRecordInput = Omit<ErrorRecord, 'schema' | 'at' | 'count'>;

/** Trim a string to a cap, marking it so a truncated stack is not mistaken for a short one. */
function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}... [truncated]`;
}

/** Build a normalized ErrorRecord. Non-string input is coerced so a capture is always clean. */
export function createErrorRecord(input: ErrorRecordInput, at: number): ErrorRecord {
  return {
    schema: ERROR_LOG_SCHEMA,
    at: Number.isFinite(at) ? Math.max(0, at) : 0,
    source: isErrorSource(input.source) ? input.source : 'error',
    message: truncate(String(input.message ?? ''), MAX_MESSAGE_CHARS),
    stack: truncate(String(input.stack ?? ''), MAX_STACK_CHARS),
    count: 1,
  };
}

/**
 * Append a record, collapsing a consecutive repeat of the same message+source
 * into the newest record's count rather than adding a row. Returns a new list
 * capped to the newest `max`. Pure, so it is unit tested.
 */
export function appendError(
  records: readonly ErrorRecord[],
  record: ErrorRecord,
  max = MAX_ERRORS,
): ErrorRecord[] {
  const newest = records[records.length - 1];
  if (newest !== undefined && newest.message === record.message && newest.source === record.source) {
    const merged = { ...newest, count: newest.count + 1, at: record.at };
    return [...records.slice(0, -1), merged];
  }
  const next = [...records, record];
  return next.length > max ? next.slice(next.length - max) : next;
}

/**
 * Tolerant parse of the stored list. Anything malformed is dropped or defaulted
 * rather than throwing, so a partially corrupt store still yields what it can
 * (mirrors telemetry and save-system). A record declaring an older schema is
 * dropped; one with no schema at all is tolerated as current, matching how every
 * other missing field is treated.
 */
export function parseErrors(raw: unknown): ErrorRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: ErrorRecord[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const e = entry as Record<string, unknown>;
    const schema = isFiniteNumber(e.schema) ? Math.floor(e.schema) : ERROR_LOG_SCHEMA;
    if (schema < ERROR_LOG_SCHEMA) {
      continue;
    }
    out.push({
      schema,
      at: isFiniteNumber(e.at) ? Math.max(0, e.at) : 0,
      source: isErrorSource(e.source) ? e.source : 'error',
      message: typeof e.message === 'string' ? e.message : '',
      stack: typeof e.stack === 'string' ? e.stack : '',
      count: isFiniteNumber(e.count) ? Math.max(1, Math.floor(e.count)) : 1,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Storage wrapper (guarded, side-effecting). Kept thin; the logic above is pure.
// ---------------------------------------------------------------------------

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Read the rolling error history. Returns [] when storage is unavailable or empty. */
export function loadErrors(): ErrorRecord[] {
  const store = storage();
  if (store === null) {
    return [];
  }
  try {
    const raw = store.getItem(ERROR_LOG_KEY);
    return raw === null ? [] : parseErrors(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Capture one error and persist it. Returns the new list (also useful for tests).
 * Every failure is swallowed: this runs from an error handler, so throwing here
 * would turn a recoverable fault into a loop.
 */
export function recordError(input: ErrorRecordInput, now = Date.now()): ErrorRecord[] {
  try {
    const next = appendError(loadErrors(), createErrorRecord(input, now));
    const store = storage();
    if (store !== null) {
      store.setItem(ERROR_LOG_KEY, JSON.stringify(next));
    }
    return next;
  } catch {
    // Quota, serialization, or storage failure: logging is best-effort.
    return [];
  }
}

/** Clear the whole error history (dashboard reset). */
export function clearErrors(): void {
  const store = storage();
  if (store === null) {
    return;
  }
  try {
    store.removeItem(ERROR_LOG_KEY);
  } catch {
    // Ignore.
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isErrorSource(value: unknown): value is ErrorSource {
  return value === 'error' || value === 'rejection' || value === 'boot';
}
