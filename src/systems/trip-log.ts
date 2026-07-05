// Pure, immutable odometer tracking distance driven and deliveries completed.
// No Phaser dependency -- safe to unit test directly.

/** Cumulative trip statistics for one courier session. */
export interface TripLog {
  readonly distanceTiles: number; // total tiles driven (one tile = one league)
  readonly deliveries: number;    // total completed deliveries
}

/**
 * Create a fresh TripLog.
 * Both arguments default to 0. Negative values are clamped to 0.
 * Non-finite values (NaN, Infinity) are treated as 0.
 */
export function createTripLog(distanceTiles?: number, deliveries?: number): TripLog {
  return {
    distanceTiles: clampStat(distanceTiles),
    deliveries: clampStat(deliveries),
  };
}

/**
 * Return a new TripLog with `tiles` added to distanceTiles.
 * Negative or non-finite `tiles` values are ignored (add 0).
 */
export function addDistance(log: TripLog, tiles: number): TripLog {
  const delta = isFinite(tiles) && tiles > 0 ? tiles : 0;
  return {
    distanceTiles: log.distanceTiles + delta,
    deliveries: log.deliveries,
  };
}

/** Return a new TripLog with deliveries incremented by one. */
export function recordDelivery(log: TripLog): TripLog {
  return {
    distanceTiles: log.distanceTiles,
    deliveries: log.deliveries + 1,
  };
}

/**
 * Format a tile distance as a league string with exactly one decimal place.
 * Examples: 0 -> "0.0 leagues", 12.34 -> "12.3 leagues".
 */
export function formatDistance(distanceTiles: number): string {
  const value = isFinite(distanceTiles) && distanceTiles >= 0 ? distanceTiles : 0;
  return `${value.toFixed(1)} leagues`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Clamp a raw number to a non-negative finite integer-safe value. */
function clampStat(n: number | undefined): number {
  if (n === undefined) return 0;
  if (!isFinite(n)) return 0;
  return Math.max(0, n);
}
