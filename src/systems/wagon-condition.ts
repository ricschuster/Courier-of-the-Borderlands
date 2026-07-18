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

// Structural, not difficulty-tunable: the road/bridge WEAR speed modifier, so
// roads normalise to roughness 0 (no wear). Roads now move at 1.2x but pin their
// wear modifier at 1.4x (terrain-types wearSpeedModifier), so this stays the max.
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
  // A hard crawl (a fifth of normal), so sitting at 0 condition is not a viable
  // free ride: wear floors at 0 and repair cost caps at max*rate, so without a
  // steep limp a player could just live stranded and pay a fixed price whenever
  // convenient. The steep limp makes running dry a problem you fix, not exploit.
  limpSpeed: 0.15,
  // Start at 25 of 100 (owner call after playtest: a full region cleared with no
  // repair at 40, so the early tank is smaller than a region's wear, forcing a
  // mid-journey repair). Grows ~9/level, reaching the full 100 late in the arc.
  startingMaxCondition: 25,
  maxConditionGrowthPerLevel: 9,
};

/**
 * Difficulty presets. 'standard' is the measured default; 'relaxed' and
 * 'demanding' scale the two primary knobs (wear and repair price) down and up.
 * The player picks one on the title screen when starting a fresh game (#150),
 * which stores the chosen key and passes the matching profile into the scene.
 * The off-standard profiles are illustrative starting points, not yet balanced
 * by playtest.
 */
export type Difficulty = 'relaxed' | 'standard' | 'demanding';

/** The difficulties in selector order (easiest to hardest). */
export const DIFFICULTIES: readonly Difficulty[] = ['relaxed', 'standard', 'demanding'];

/** Whether an arbitrary value is a known difficulty key. */
export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

/** Next difficulty in the cycle, wrapping hardest back to easiest. */
export function nextDifficulty(current: Difficulty): Difficulty {
  const i = DIFFICULTIES.indexOf(current);
  // indexOf returns -1 for an unknown value; (-1 + 1) % 3 = 0 lands on the first
  // entry, so an out-of-set input still cycles into a valid difficulty.
  return DIFFICULTIES[(i + 1) % DIFFICULTIES.length] ?? 'standard';
}

/** Short human label for a difficulty, used in HUD text. */
export function difficultyLabel(difficulty: Difficulty): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

export const WAGON_TUNING: Record<Difficulty, WagonTuning> = {
  relaxed: {
    ...DEFAULT_WAGON_TUNING,
    wearBase: 0.03,
    wearCoef: 0.75,
    costPerPercent: 3,
    startingMaxCondition: 40,
    limpSpeed: 0.25,
  },
  standard: DEFAULT_WAGON_TUNING,
  demanding: {
    ...DEFAULT_WAGON_TUNING,
    wearBase: 0.1,
    wearCoef: 2.5,
    costPerPercent: 7,
    startingMaxCondition: 16,
    limpSpeed: 0.1,
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
 *
 * `regionWearMultiplier` scales only the roughness-dependent term, so a rougher
 * region (Fenmarch, #186) wears the wagon harder off-road without touching the
 * flat road-wear base: roads stay at roughness 0 and wear nothing regardless.
 * This is the lever for the late-game curve inversion, where a big tank plus
 * maxed relief/off-road otherwise soak up a whole region's wear.
 */
export function wearPerTile(
  rawSpeedModifier: number,
  reliefUpgradeCount: number,
  offRoadRank: number,
  tuning: WagonTuning = DEFAULT_WAGON_TUNING,
  regionWearMultiplier = 1,
): number {
  const base =
    tuning.wearBase + tuning.wearCoef * roughness(rawSpeedModifier) * regionWearMultiplier;
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
  // Charge whole coins. A full repair costs Math.ceil(missing * costPerPercent)
  // to match the quoted repairCost; when the courier cannot afford that, top up
  // only as many whole condition points as the coins buy. Condition is a float
  // (wear accrues fractionally), so multiplying it directly would leak fractional
  // coins into the ledger (a coin balance like 957.33).
  const fullCost = Math.ceil(missing * tuning.costPerPercent);
  if (coins >= fullCost) {
    return { ok: true, condition: max, coins: coins - fullCost, full: true };
  }
  const wholePoints = Math.floor(coins / tuning.costPerPercent);
  const spent = wholePoints * tuning.costPerPercent;
  const next = current + wholePoints;
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

/** Fraction of capacity remaining, in [0, 1]. A non-positive max reads as empty. */
export function conditionFraction(condition: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return clampCondition(condition, max) / max;
}

/**
 * At or below this fraction of capacity the wagon is "low": still moving, but
 * close enough to stranding to warn the player so they can repair in time (#182).
 */
export const LOW_CONDITION_FRACTION = 0.3;

/**
 * Whether the wagon is low enough to warn about: it still moves (not stranded)
 * but has dropped to LOW_CONDITION_FRACTION or less of capacity. Stranded is its
 * own louder state (the HUD already shouts STRANDED there), so it is not "low".
 */
export function isLowCondition(condition: number, max: number): boolean {
  return !isStranded(condition) && conditionFraction(condition, max) <= LOW_CONDITION_FRACTION;
}

/**
 * What the low-condition warning state machine should do this frame (#182,
 * extracted to a pure rule in #301):
 *
 *   'warn'  first frame in the low band since the last re-arm: toast once and
 *           remember it fired
 *   'hold'  no change: either already warned while still low, or stranded
 *           (stranded is its own louder state, and staying armed through it
 *           keeps the toast from re-firing on the way down to 0)
 *   'rearm' back above the low band (a repair): forget the warning so the
 *           next low spell toasts again
 */
export type LowConditionWarning = 'warn' | 'hold' | 'rearm';

/** Decide the warning transition for the current condition and armed state. */
export function lowConditionWarning(
  condition: number,
  max: number,
  alreadyWarned: boolean,
): LowConditionWarning {
  if (isLowCondition(condition, max)) {
    return alreadyWarned ? 'hold' : 'warn';
  }
  if (isStranded(condition)) {
    return 'hold';
  }
  return alreadyWarned ? 'rearm' : 'hold';
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

export interface RepairHelpInput {
  /** True when the courier is standing on a settlement tile (repair is offered). */
  readonly atSettlement: boolean;
  readonly condition: number;
  readonly max: number;
  readonly tuning: WagonTuning;
}

/**
 * Guidance for a courier whose repair or rescue press cannot pay for itself
 * (#317). The old copy misdirected a broke, stranded player: it quoted an
 * unaffordable price at a town, or told them to "limp to a settlement" while
 * they stood in one. This names the real exit instead. The limp is the intended
 * ladder (isStranded keeps the wagon crawling at limpSpeed), so a courier with
 * no coin is pointed at earning through a delivery, not at a wall.
 *
 * Two situations reach here:
 * - at a settlement, too broke for even one repair point (coins < costPerPercent)
 * - stranded in the open, unable to afford the tow (coins < rescueCost)
 */
export function repairHelpText(input: RepairHelpInput): string {
  const { atSettlement, condition, max, tuning } = input;
  const stranded = isStranded(condition);
  if (atSettlement) {
    const cost = repairCost(condition, max, tuning);
    const lead = `Too broke to repair (${cost}c full, ${tuning.costPerPercent}c/pt).`;
    // Stranded here the wagon still crawls, so earning is reachable; merely worn
    // it moves at full speed, so there is no crawl to reassure about.
    const tail = stranded
      ? ' The wagon still crawls: take a contract and deliver to earn coin.'
      : ' Earn coin on a delivery, then repair here.';
    return lead + tail;
  }
  // Off a settlement this only fires while stranded (the caller guards it), so
  // the crawl is always available as the way out.
  return (
    `Stranded, and the ${tuning.rescueCost}c rescue is out of reach. ` +
    'The wagon still crawls: limp to a town and deliver to earn coin.'
  );
}
