// Pure logic for the travel sink (ADR 0005): wagon condition, wear per tile,
// repair cost, and the zero-condition penalty. No Phaser here so it is unit
// testable. The scene owns the live condition value and calls these helpers.
//
// Wear is computed off RAW terrain roughness (not the relief-adjusted speed
// modifier), so relief upgrades and the Off-road skill reduce wear through their
// own separate, weaker floored factors. This keeps the sink's teeth on a fully
// upgraded wagon (owner decision 5): a maxed wagon wears less, never nothing.
//
// Every difficulty-tunable knob lives in a WagonTuning profile rather than a bare
// constant, so a future difficulty selector just picks a preset and threads it
// through (the scene holds one profile). The functions default to the standard
// profile so tests and callers that do not care about difficulty stay terse.

export const MAX_CONDITION = 100;
export const MIN_CONDITION = 0;

// Structural, not difficulty-tunable: the road/bridge speed modifier, so roads
// normalise to roughness 0.
export const MAX_SPEED_MODIFIER = 1.4;

/**
 * The difficulty-tunable knobs of the travel sink. Grouped into one profile so a
 * difficulty setting is a matter of choosing a preset (see WAGON_TUNING), not
 * editing scattered constants. All values are playtest-gated starting points.
 */
export interface WagonTuning {
  readonly wearBase: number; // per-tile wear even on roads (roughness 0)
  readonly wearCoef: number; // extra per-tile wear at maximum roughness
  readonly wearReliefPerUpgrade: number; // wear cut per owned relief upgrade
  readonly wearReliefFloor: number; // minimum wear multiplier from upgrades
  readonly offRoadWearPerRank: number; // wear cut per Off-road rank
  readonly offRoadWearFloor: number; // minimum wear multiplier from Off-road
  readonly costPerPercent: number; // gold to repair one missing condition point
  readonly rescueCost: number; // gold to be towed home while stranded
  readonly limpSpeed: number; // movement multiplier while stranded at 0
  // Capacity grows with the courier's level (RPG-style): the wagon starts with a
  // small tank that lengthens as you play, so the early game is fragile and
  // progression eases the pressure you earned. Max is capped at MAX_CONDITION.
  readonly startingMaxCondition: number; // capacity at level 1
  readonly maxConditionGrowthPerLevel: number; // capacity added per level above 1
}

/**
 * The standard profile. Wear rates were raised after a measured full-arc run
 * (2026-07-11): at 0.02/0.5 a whole arc wore only ~52 points, far too light on
 * this small road-connected map, so a rough leg now visibly costs condition.
 */
export const DEFAULT_WAGON_TUNING: WagonTuning = {
  wearBase: 0.06,
  wearCoef: 1.5,
  wearReliefPerUpgrade: 0.15,
  wearReliefFloor: 0.5,
  offRoadWearPerRank: 0.1,
  offRoadWearFloor: 0.6,
  costPerPercent: 5,
  rescueCost: 50,
  limpSpeed: 0.35,
  // Start at 40 of 100 (owner call: a hard, fragile early game), reaching the
  // full 100 around level 8, roughly the end of the three-region arc.
  startingMaxCondition: 40,
  maxConditionGrowthPerLevel: 9,
};

/**
 * Difficulty presets. 'standard' is the measured default; 'relaxed' and
 * 'demanding' scale the two primary knobs (wear and repair price) down and up.
 * The off-difficulty profiles are illustrative starting points, not yet tuned;
 * wiring a player-facing selector is future work (it just stores the chosen key
 * and passes the matching profile into the scene).
 */
export type Difficulty = 'relaxed' | 'standard' | 'demanding';

export const WAGON_TUNING: Record<Difficulty, WagonTuning> = {
  relaxed: {
    ...DEFAULT_WAGON_TUNING,
    wearBase: 0.03,
    wearCoef: 0.75,
    costPerPercent: 3,
    startingMaxCondition: 60,
  },
  standard: DEFAULT_WAGON_TUNING,
  demanding: {
    ...DEFAULT_WAGON_TUNING,
    wearBase: 0.1,
    wearCoef: 2.5,
    costPerPercent: 7,
    startingMaxCondition: 30,
  },
};

/**
 * The wagon's maximum condition at a given courier level. Starts small and grows
 * with level, capped at MAX_CONDITION. A level below 1 is treated as level 1.
 */
export function maxConditionForLevel(
  level: number,
  tuning: WagonTuning = DEFAULT_WAGON_TUNING,
): number {
  const levelsAboveFirst = Math.max(0, Math.floor(level) - 1);
  const raw = tuning.startingMaxCondition + levelsAboveFirst * tuning.maxConditionGrowthPerLevel;
  return Math.min(MAX_CONDITION, Math.max(0, raw));
}

/** Terrain roughness in 0..1 from a raw terrain speed modifier. Roads => 0. */
export function roughness(rawSpeedModifier: number): number {
  return Math.max(0, 1 - rawSpeedModifier / MAX_SPEED_MODIFIER);
}

/** Wear multiplier from owned relief upgrades, floored so it never reaches 0. */
export function wearReliefFactor(
  reliefUpgradeCount: number,
  tuning: WagonTuning = DEFAULT_WAGON_TUNING,
): number {
  const raw = 1 - tuning.wearReliefPerUpgrade * Math.max(0, reliefUpgradeCount);
  return Math.max(tuning.wearReliefFloor, raw);
}

/** Wear multiplier from the Off-road skill rank, floored so it never reaches 0. */
export function offRoadWearFactor(
  offRoadRank: number,
  tuning: WagonTuning = DEFAULT_WAGON_TUNING,
): number {
  const raw = 1 - tuning.offRoadWearPerRank * Math.max(0, offRoadRank);
  return Math.max(tuning.offRoadWearFloor, raw);
}

/**
 * Condition points lost per tile travelled on the given terrain, after relief.
 * `rawSpeedModifier` is the terrain's own modifier (not relief-adjusted).
 */
export function wearPerTile(
  rawSpeedModifier: number,
  reliefUpgradeCount: number,
  offRoadRank: number,
  tuning: WagonTuning = DEFAULT_WAGON_TUNING,
): number {
  const base = tuning.wearBase + tuning.wearCoef * roughness(rawSpeedModifier);
  return (
    base * wearReliefFactor(reliefUpgradeCount, tuning) * offRoadWearFactor(offRoadRank, tuning)
  );
}

/** Apply a wear amount to a condition value, clamped to [0, 100]. */
export function applyWear(condition: number, wear: number): number {
  return clampCondition(condition - Math.max(0, wear));
}

/** Clamp a condition value into [0, max]; non-finite becomes the max. */
export function clampCondition(value: number, max: number = MAX_CONDITION): number {
  if (!Number.isFinite(value)) {
    return max;
  }
  return Math.min(max, Math.max(MIN_CONDITION, value));
}

/**
 * Sanitize a persisted condition value. An absent or malformed field (older
 * save, corruption) loads as a full wagon, so legacy saves are unaffected.
 */
export function sanitizeCondition(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? clampCondition(value)
    : MAX_CONDITION;
}

/** Gold to fully repair from the current condition up to the given max. */
export function repairCost(
  condition: number,
  max: number = MAX_CONDITION,
  tuning: WagonTuning = DEFAULT_WAGON_TUNING,
): number {
  const missing = max - clampCondition(condition, max);
  return Math.ceil(missing * tuning.costPerPercent);
}

export interface RepairResult {
  readonly ok: boolean; // whether any repair happened
  readonly condition: number;
  readonly coins: number;
  readonly full: boolean; // whether the wagon reached full condition
}

/**
 * Manual repair at a settlement, up to the current max capacity. Repairs fully
 * if the player can afford it; otherwise repairs as many whole points as the
 * coins allow (a partial top-up for a poor courier). Never changes state when
 * already at max or out of coins.
 */
export function repair(
  condition: number,
  coins: number,
  max: number = MAX_CONDITION,
  tuning: WagonTuning = DEFAULT_WAGON_TUNING,
): RepairResult {
  const current = clampCondition(condition, max);
  const missing = max - current;
  if (missing <= 0 || coins < tuning.costPerPercent) {
    return { ok: false, condition: current, coins, full: missing <= 0 };
  }
  const affordablePoints = Math.min(missing, Math.floor(coins / tuning.costPerPercent));
  const spent = affordablePoints * tuning.costPerPercent;
  const next = current + affordablePoints;
  return { ok: true, condition: next, coins: coins - spent, full: next >= max };
}

/** Movement speed multiplier from condition: full speed until stranded at 0. */
export function limpMultiplier(
  condition: number,
  tuning: WagonTuning = DEFAULT_WAGON_TUNING,
): number {
  return clampCondition(condition) <= MIN_CONDITION ? tuning.limpSpeed : 1;
}

/** Whether the wagon is stranded (condition at or below 0). */
export function isStranded(condition: number): boolean {
  return clampCondition(condition) <= MIN_CONDITION;
}

export interface RescueResult {
  readonly ok: boolean;
  readonly coins: number;
}

/**
 * Pay to be returned to the last settlement while stranded. Charges the rescue
 * fee if affordable; does not itself repair the wagon (the player still pays to
 * repair on arrival), so it only buys back the slow limp, not the sink.
 */
export function rescue(coins: number, tuning: WagonTuning = DEFAULT_WAGON_TUNING): RescueResult {
  if (coins < tuning.rescueCost) {
    return { ok: false, coins };
  }
  return { ok: true, coins: coins - tuning.rescueCost };
}
