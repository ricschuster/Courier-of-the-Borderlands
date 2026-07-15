// Gameplay telemetry (#220). Captures a compact record at each run milestone
// (a region cleared, or the arc finished) and keeps a rolling history in
// localStorage, so balance can be read from real play instead of hand-reported
// numbers (see the opt-in travel-sink measure spec, which does the same by
// sampling an automated arc). The standalone telemetry.html dashboard reads
// this store.
//
// The serialize/summarize logic is pure and unit tested. The read/write helpers
// are a thin, guarded wrapper over localStorage so the game keeps running even
// where storage is unavailable (private mode, quota, storage disabled), exactly
// like save-system.ts.

/**
 * Record format version, so an older stored record can be recognized or dropped.
 *
 * 2 added `source` (#264). v1 records are dropped rather than defaulted: the
 * only stored v1 history was a hand-seeded automated arc, and defaulting it to
 * 'play' would mislabel precisely the records the field exists to separate.
 */
export const TELEMETRY_SCHEMA = 2;

/** localStorage key the rolling record history lives under. */
export const TELEMETRY_KEY = 'courier-of-the-borderlands/telemetry';

/**
 * Cap on stored records. A ring: the oldest is dropped once the cap is reached,
 * so the store cannot grow without bound across many sessions. Generous enough
 * to hold many full arcs (4 records each).
 */
export const MAX_RECORDS = 200;

/** What produced a record: one region cleared, or the whole arc finished. */
export type RunMilestone = 'region' | 'arc';

/**
 * Who drove the run (#264). An automated driver routes near-optimally and
 * repairs at every home visit, so its wear is a lower bound and its condition an
 * upper bound on a real player's. Averaging the two together flatters the travel
 * sink, so the dashboard reports them apart.
 */
export type RunSource = 'auto' | 'play';

/**
 * One captured milestone. Flat and JSON-serializable. Every field is required so
 * the dashboard never has to reason about partial records; the parser fills a
 * sensible default for any field an older or corrupt record is missing.
 */
export interface RunRecord {
  readonly schema: number;
  /** Epoch milliseconds the record was captured. */
  readonly at: number;
  readonly milestone: RunMilestone;
  /** Whether an automated driver or a human produced this run. */
  readonly source: RunSource;
  readonly regionId: string;
  readonly regionName: string;
  readonly difficulty: string;
  readonly coins: number;
  readonly deliveries: number;
  readonly distanceTiles: number;
  /** Cumulative condition points worn away this session (ADR 0005 travel sink). */
  readonly wagonWearTotal: number;
  /** Wagon condition (0-100) at the moment of capture. */
  readonly wagonCondition: number;
  /** Times the wagon hit 0 condition (stranded) this session. */
  readonly strandEvents: number;
  readonly upgradesOwned: number;
  readonly totalReputation: number;
}

/** The live figures a milestone capture draws from; timestamp is supplied separately. */
export type RunRecordInput = Omit<RunRecord, 'schema' | 'at'>;

/**
 * Build a normalized RunRecord from live run figures. Non-finite numbers are
 * coerced to 0 and negatives clamped, so a record is always clean regardless of
 * the caller's state.
 */
export function createRunRecord(input: RunRecordInput, at: number): RunRecord {
  return {
    schema: TELEMETRY_SCHEMA,
    at: nonNeg(at),
    milestone: input.milestone === 'arc' ? 'arc' : 'region',
    source: input.source === 'auto' ? 'auto' : 'play',
    regionId: input.regionId,
    regionName: input.regionName,
    difficulty: input.difficulty,
    coins: nonNeg(input.coins),
    deliveries: nonNeg(input.deliveries),
    distanceTiles: nonNeg(input.distanceTiles),
    wagonWearTotal: nonNeg(input.wagonWearTotal),
    wagonCondition: nonNeg(input.wagonCondition),
    strandEvents: nonNeg(input.strandEvents),
    upgradesOwned: nonNeg(input.upgradesOwned),
    totalReputation: input.totalReputation,
  };
}

/**
 * Append a record, returning a new list capped to the newest `max` (oldest
 * dropped). Newest is last. Pure, so it is unit tested.
 */
export function appendRecord(
  records: readonly RunRecord[],
  record: RunRecord,
  max = MAX_RECORDS,
): RunRecord[] {
  const next = [...records, record];
  return next.length > max ? next.slice(next.length - max) : next;
}

/** Dashboard record filter: one source, or everything mixed together. */
export type SourceFilter = RunSource | 'all';

/**
 * Narrow records to one source. 'all' passes everything through, which mixes
 * bot and human numbers, so it is a deliberate choice rather than the default.
 * Pure, so it is unit tested.
 */
export function filterBySource(
  records: readonly RunRecord[],
  filter: SourceFilter,
): RunRecord[] {
  return filter === 'all' ? [...records] : records.filter((r) => r.source === filter);
}

/** Per-region rollup for the dashboard. Averages are over that region's records. */
export interface RegionRollup {
  readonly regionId: string;
  readonly regionName: string;
  readonly records: number;
  readonly avgCoins: number;
  readonly avgWear: number;
  readonly avgWagonCondition: number;
  readonly avgDeliveries: number;
  readonly strandEvents: number; // summed across the region's records
}

/** Whole-store rollup the dashboard renders. */
export interface TelemetrySummary {
  readonly totalRecords: number;
  readonly arcCompletions: number;
  readonly regions: readonly RegionRollup[];
}

/**
 * Aggregate records into per-region averages plus arc-completion count. Regions
 * are ordered by first appearance. Pure and unit tested.
 */
export function summarizeRecords(records: readonly RunRecord[]): TelemetrySummary {
  const order: string[] = [];
  const byRegion = new Map<string, RunRecord[]>();
  for (const r of records) {
    let bucket = byRegion.get(r.regionId);
    if (bucket === undefined) {
      bucket = [];
      byRegion.set(r.regionId, bucket);
      order.push(r.regionId);
    }
    bucket.push(r);
  }

  const regions: RegionRollup[] = order.map((id) => {
    const rs = byRegion.get(id) ?? [];
    const n = rs.length;
    return {
      regionId: id,
      regionName: rs[rs.length - 1]?.regionName ?? id,
      records: n,
      avgCoins: mean(rs.map((r) => r.coins)),
      avgWear: mean(rs.map((r) => r.wagonWearTotal)),
      avgWagonCondition: mean(rs.map((r) => r.wagonCondition)),
      avgDeliveries: mean(rs.map((r) => r.deliveries)),
      strandEvents: rs.reduce((sum, r) => sum + r.strandEvents, 0),
    };
  });

  return {
    totalRecords: records.length,
    arcCompletions: records.filter((r) => r.milestone === 'arc').length,
    regions,
  };
}

/**
 * Tolerant parse of the stored record list. Anything malformed is dropped or
 * defaulted rather than throwing, so a partially corrupt store still yields the
 * clean records it can (mirrors save-system's parsers).
 *
 * A record that explicitly declares a schema older than the current one is
 * dropped, because it predates `source` and cannot be labelled honestly (#264).
 * A record with no schema at all stays tolerated as current, matching how the
 * parser treats every other missing field.
 */
export function parseRecords(raw: unknown): RunRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: RunRecord[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const e = entry as Record<string, unknown>;
    const schema = isFiniteNumber(e.schema) ? Math.floor(e.schema) : TELEMETRY_SCHEMA;
    if (schema < TELEMETRY_SCHEMA) {
      continue;
    }
    out.push({
      schema,
      at: isFiniteNumber(e.at) ? Math.max(0, e.at) : 0,
      milestone: e.milestone === 'arc' ? 'arc' : 'region',
      source: e.source === 'auto' ? 'auto' : 'play',
      regionId: typeof e.regionId === 'string' ? e.regionId : 'unknown',
      regionName: typeof e.regionName === 'string' ? e.regionName : 'Unknown',
      difficulty: typeof e.difficulty === 'string' ? e.difficulty : 'standard',
      coins: num(e.coins),
      deliveries: num(e.deliveries),
      distanceTiles: num(e.distanceTiles),
      wagonWearTotal: num(e.wagonWearTotal),
      wagonCondition: num(e.wagonCondition),
      strandEvents: num(e.strandEvents),
      upgradesOwned: num(e.upgradesOwned),
      totalReputation: isFiniteNumber(e.totalReputation) ? e.totalReputation : 0,
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

/** Read the rolling record history. Returns [] when storage is unavailable or empty. */
export function loadRecords(): RunRecord[] {
  const store = storage();
  if (store === null) {
    return [];
  }
  try {
    const raw = store.getItem(TELEMETRY_KEY);
    return raw === null ? [] : parseRecords(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * Capture one milestone: append it to the stored history and persist. Returns
 * the new list (also useful for tests). A storage failure is swallowed so a
 * telemetry write can never interrupt play.
 */
export function recordRun(input: RunRecordInput, now = Date.now()): RunRecord[] {
  const next = appendRecord(loadRecords(), createRunRecord(input, now));
  const store = storage();
  if (store !== null) {
    try {
      store.setItem(TELEMETRY_KEY, JSON.stringify(next));
    } catch {
      // Quota or serialization failure: telemetry is best-effort, so ignore.
    }
  }
  return next;
}

/** Clear the whole telemetry history (dashboard reset). */
export function clearRecords(): void {
  const store = storage();
  if (store === null) {
    return;
  }
  try {
    store.removeItem(TELEMETRY_KEY);
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

/** Coerce to a non-negative finite number (default 0). */
function num(value: unknown): number {
  return isFiniteNumber(value) ? Math.max(0, value) : 0;
}

/** Clamp a finite number to non-negative; non-finite becomes 0. */
function nonNeg(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Arithmetic mean, rounded to one decimal. 0 for an empty list. */
function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 10) / 10;
}
