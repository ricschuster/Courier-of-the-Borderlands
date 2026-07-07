// Save/resume for the game. The serialize/deserialize functions are pure and
// unit tested. The read/write helpers are a thin, guarded wrapper over
// localStorage so the game keeps running even where storage is unavailable.
import type { ContractStatus } from './contract-system';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'courier-of-the-borderlands/save';

/** Plain, JSON-serializable snapshot of everything worth persisting. */
export interface GameSnapshot {
  readonly coins: number;
  readonly reputation: Record<string, number>;
  readonly unlocks: readonly string[];
  readonly upgrades: readonly string[];
  readonly completed: readonly string[];
  readonly visited: readonly string[];
  /** Active region id. */
  readonly regionId: string;
  /** Revealed tile indices per region id. */
  readonly fogByRegion: Readonly<Record<string, readonly number[]>>;
  /**
   * Map [width, height] each region's fog was recorded against. Row-major fog
   * indices only mean the same tile on a same-sized map, so this lets a load
   * discard fog whose region was resized since the save. Absent for saves made
   * before dimensions were tracked; such fog is treated as stale.
   */
  readonly fogDimsByRegion: Readonly<Record<string, readonly [number, number]>>;
  readonly activeContractId: string | null;
  readonly contractStatus: ContractStatus | null;
  readonly distanceTiles: number;
  readonly deliveries: number;
  readonly achievements: readonly string[];
  /**
   * Chosen courier skill ranks, keyed by skill id. Experience and level are
   * derived from play stats, so only the player's skill choices are persisted.
   * Absent in saves made before skills existed; such saves load with no skills.
   */
  readonly skills: Readonly<Record<string, number>>;
}

export interface SaveData extends GameSnapshot {
  readonly version: number;
}

export function serialize(snapshot: GameSnapshot): SaveData {
  return { version: SAVE_VERSION, ...snapshot };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function toNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter(isFiniteNumber) : [];
}

function toReputation(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof value === 'object' && value !== null) {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (isFiniteNumber(val)) {
        out[key] = val;
      }
    }
  }
  return out;
}

function toContractStatus(value: unknown): ContractStatus | null {
  return value === 'accepted' || value === 'carrying' || value === 'delivered' ? value : null;
}

/**
 * Parse persisted skill ranks: a record of skill id to a non-negative integer
 * rank. Anything malformed is dropped. The game further sanitizes against the
 * known skill list on load, so this only needs to guarantee a clean record.
 */
function toSkillRanks(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof value === 'object' && value !== null) {
    for (const [id, rank] of Object.entries(value as Record<string, unknown>)) {
      if (isFiniteNumber(rank) && rank > 0) {
        out[id] = Math.floor(rank);
      }
    }
  }
  return out;
}

/**
 * Parse the per-region fog map. Falls back to the pre-region shape: an older
 * save with a single `revealed` array is migrated to the greybridge region.
 */
function toFogByRegion(data: Record<string, unknown>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  const raw = data.fogByRegion;
  if (typeof raw === 'object' && raw !== null) {
    for (const [regionId, indices] of Object.entries(raw as Record<string, unknown>)) {
      out[regionId] = toNumberArray(indices);
    }
    return out;
  }
  if (Array.isArray(data.revealed)) {
    out.greybridge = toNumberArray(data.revealed);
  }
  return out;
}

/**
 * Parse recorded fog dimensions per region. Each entry must be a pair of finite
 * numbers; anything else is dropped, so its fog falls back to stale on load.
 */
function toFogDims(value: unknown): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  if (typeof value === 'object' && value !== null) {
    for (const [regionId, dims] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(dims) && dims.length === 2 && isFiniteNumber(dims[0]) && isFiniteNumber(dims[1])) {
        out[regionId] = [dims[0], dims[1]];
      }
    }
  }
  return out;
}

/**
 * Legacy unlock id from when the ford was a single global unlock shared by
 * every region. The ford terrain was later split per region (see
 * terrain-types.ts), so this id no longer matches any terrain's unlockId.
 */
const LEGACY_FORD_UNLOCK = 'ford-crossing';

/** Unlock id the legacy global ford unlock maps to (Greybridge stays open). */
const MIGRATED_FORD_UNLOCK = 'ford-crossing-greybridge';

/**
 * Migrate unlock ids from older saves. A save made before the ford unlock
 * was split per region may still contain the legacy 'ford-crossing' id; map
 * it to Greybridge's ford so an existing player keeps their unlocked ford
 * rather than finding it locked again. Saltreach's ford was never reachable
 * under the old id, so it is not granted here.
 */
export function migrateUnlocks(ids: readonly string[]): string[] {
  const migrated = ids.map((id) => (id === LEGACY_FORD_UNLOCK ? MIGRATED_FORD_UNLOCK : id));
  return [...new Set(migrated)];
}

/**
 * Validate and parse raw save data. Returns null for anything that is not a
 * current-version save, so a corrupt or outdated save falls back to a new game.
 */
export function deserialize(raw: unknown): GameSnapshot | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const data = raw as Record<string, unknown>;
  if (data.version !== SAVE_VERSION) {
    return null;
  }
  return {
    coins: isFiniteNumber(data.coins) ? data.coins : 0,
    reputation: toReputation(data.reputation),
    unlocks: migrateUnlocks(toStringArray(data.unlocks)),
    upgrades: toStringArray(data.upgrades),
    completed: toStringArray(data.completed),
    visited: toStringArray(data.visited),
    regionId: typeof data.regionId === 'string' ? data.regionId : 'greybridge',
    fogByRegion: toFogByRegion(data),
    fogDimsByRegion: toFogDims(data.fogDimsByRegion),
    activeContractId: typeof data.activeContractId === 'string' ? data.activeContractId : null,
    contractStatus: toContractStatus(data.contractStatus),
    distanceTiles: isFiniteNumber(data.distanceTiles) ? data.distanceTiles : 0,
    deliveries: isFiniteNumber(data.deliveries) ? data.deliveries : 0,
    achievements: toStringArray(data.achievements),
    skills: toSkillRanks(data.skills),
  };
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Accessing localStorage can throw (for example in some privacy modes).
    return null;
  }
}

export function writeSave(snapshot: GameSnapshot): void {
  const store = storage();
  if (store === null) {
    return;
  }
  try {
    store.setItem(SAVE_KEY, JSON.stringify(serialize(snapshot)));
  } catch {
    // Ignore quota or serialization failures; the game keeps running.
  }
}

export function loadSave(): GameSnapshot | null {
  const store = storage();
  if (store === null) {
    return null;
  }
  try {
    const raw = store.getItem(SAVE_KEY);
    return raw === null ? null : deserialize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearSave(): void {
  const store = storage();
  if (store === null) {
    return;
  }
  try {
    store.removeItem(SAVE_KEY);
  } catch {
    // Ignore.
  }
}
