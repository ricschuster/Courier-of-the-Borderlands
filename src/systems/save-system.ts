// Save/resume for the game. The serialize/deserialize functions are pure and
// unit tested. The read/write helpers are a thin, guarded wrapper over
// localStorage so the game keeps running even where storage is unavailable.
import type { ContractStatus } from './contract-system';
import { sanitizeCondition, isDifficulty, type Difficulty } from './wagon-condition';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'courier-of-the-borderlands/save';

/** Marker that the one-time intro card has been shown, so it is not shown again. */
export const INTRO_SEEN_KEY = 'courier-of-the-borderlands/intro-seen';

/** Chosen difficulty preset. A player preference, not save state. */
export const DIFFICULTY_KEY = 'courier-of-the-borderlands/difficulty';

/**
 * Outcome of a save attempt. 'unavailable' means storage could not be reached at
 * all (private mode, storage disabled); 'error' means a write was attempted but
 * threw (typically a quota). Both mean the player's progress was not persisted.
 */
export type SaveResult = 'ok' | 'unavailable' | 'error';

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
  /**
   * Wagon condition (0-100), the travel sink (ADR 0005). Additive: absent in
   * saves made before it existed, which load at full condition (100).
   */
  readonly wagonCondition: number;
  readonly achievements: readonly string[];
  /**
   * Chosen courier skill ranks, keyed by skill id. Experience and level are
   * derived from play stats, so only the player's skill choices are persisted.
   * Absent in saves made before skills existed; such saves load with no skills.
   */
  readonly skills: Readonly<Record<string, number>>;
  /**
   * Story flags set through dialogue and mission progress, as a flat id list.
   * The dialogue engine treats presence as true. Absent in saves made before
   * dialogue existed; such saves load with no flags set.
   */
  readonly storyFlags: readonly string[];
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
 * Upgrades a raw save from one schema version to the next. `MIGRATIONS[n]`
 * reshapes a version-n save's raw fields into the version-(n+1) shape. Purely
 * structural: a step only needs to handle a breaking rename or reshape, because
 * additive fields are already tolerated by the field parsers below (an absent
 * field defaults). This is where a real migration goes when SAVE_VERSION is
 * bumped, so an existing player's save is upgraded rather than discarded.
 */
type SaveMigration = (data: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  // Empty while every schema change so far has been additive (new fields default
  // via absence). Add a step keyed on the source version when a bump needs one,
  // e.g. 1: (data) => ({ ...data, /* reshape v1 -> v2 */ }).
};

/**
 * Walk the migration ladder from `fromVersion` up to `toVersion`. Returns the
 * upgraded raw data, or null if there is no path: a save newer than this build
 * (`fromVersion > toVersion`) cannot be safely downgraded, and a gap with no
 * registered step cannot be crossed. Exported so the ladder can be unit tested
 * with synthetic steps independently of the current SAVE_VERSION.
 */
export function migrateSaveData(
  data: Record<string, unknown>,
  fromVersion: number,
  toVersion: number,
  migrations: Readonly<Record<number, SaveMigration>> = MIGRATIONS,
): Record<string, unknown> | null {
  if (fromVersion > toVersion) {
    return null;
  }
  let out = data;
  for (let v = fromVersion; v < toVersion; v++) {
    const step = migrations[v];
    if (step === undefined) {
      return null;
    }
    out = step(out);
  }
  return out;
}

/**
 * Validate and parse raw save data. An older save is migrated up to the current
 * version before parsing rather than discarded; only a save from a newer build,
 * an unbridgeable version gap, or structurally corrupt data falls back to a new
 * game (null).
 */
export function deserialize(raw: unknown): GameSnapshot | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const rawVersion = (raw as Record<string, unknown>).version;
  const version = isFiniteNumber(rawVersion) ? Math.floor(rawVersion) : 0;
  const data = migrateSaveData(raw as Record<string, unknown>, version, SAVE_VERSION);
  if (data === null) {
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
    wagonCondition: sanitizeCondition(data.wagonCondition),
    achievements: toStringArray(data.achievements),
    skills: toSkillRanks(data.skills),
    storyFlags: toStringArray(data.storyFlags),
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

export function writeSave(snapshot: GameSnapshot): SaveResult {
  const store = storage();
  if (store === null) {
    return 'unavailable';
  }
  try {
    store.setItem(SAVE_KEY, JSON.stringify(serialize(snapshot)));
    return 'ok';
  } catch {
    // A quota or serialization failure: the game keeps running, but the caller
    // can tell the player their progress is not being saved.
    return 'error';
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
    // A New Game is a fresh start, so the premise should introduce itself again.
    // Only clearSave (New Game / reset) touches the intro flag; a normal Continue
    // boot never does, so a returning player is still not shown it twice.
    store.removeItem(INTRO_SEEN_KEY);
  } catch {
    // Ignore.
  }
}

/**
 * Whether the one-time intro card has already been shown. Kept under its own key
 * (not in the save) so it persists across a normal Continue boot: a returning
 * player who has read the premise once should not see it again. A New Game
 * (clearSave) does clear it, so a deliberate fresh start reintroduces the
 * premise. Storage failures read as "not seen" so a player without storage still
 * gets the intro each visit rather than never.
 */
export function hasSeenIntro(): boolean {
  const store = storage();
  if (store === null) {
    return false;
  }
  try {
    return store.getItem(INTRO_SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

/** Record that the intro card has been shown, so later boots skip it. */
export function markIntroSeen(): void {
  const store = storage();
  if (store === null) {
    return;
  }
  try {
    store.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // Ignore: worst case the intro shows again next visit.
  }
}

/**
 * The player's chosen difficulty. Kept under its own key (not in the save) so it
 * is a durable preference: it survives a New Game, and choosing it does not
 * touch a run in progress. An absent or unrecognized value defaults to
 * 'standard', the measured baseline, so a first-time or storage-less player gets
 * the intended tuning.
 */
export function loadDifficulty(): Difficulty {
  const store = storage();
  if (store === null) {
    return 'standard';
  }
  try {
    const raw = store.getItem(DIFFICULTY_KEY);
    return isDifficulty(raw) ? raw : 'standard';
  } catch {
    return 'standard';
  }
}

/** Persist the chosen difficulty preset. */
export function saveDifficulty(difficulty: Difficulty): void {
  const store = storage();
  if (store === null) {
    return;
  }
  try {
    store.setItem(DIFFICULTY_KEY, difficulty);
  } catch {
    // Ignore: worst case the choice resets to standard next visit.
  }
}
