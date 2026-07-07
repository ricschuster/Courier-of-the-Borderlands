// Pure module: courier experience and levels, derived from cumulative play
// stats. No stored XP value; total XP is always recomputed from stats.

export interface XpSources {
  readonly deliveries: number;
  readonly distanceTiles: number;
  readonly discoveries: number; // count of settlements first-visited
}

export const XP_PER_DELIVERY = 25;
export const XP_PER_TILE = 1;
export const XP_PER_DISCOVERY = 15;

/** Treat a possibly-invalid numeric input as 0. */
function safeCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Total experience earned from cumulative stats.
 * Negative or NaN inputs count as 0. distanceTiles is floored before scoring.
 */
export function totalXp(sources: XpSources): number {
  const deliveries = safeCount(sources.deliveries);
  const distanceTiles = Math.floor(safeCount(sources.distanceTiles));
  const discoveries = safeCount(sources.discoveries);
  return (
    deliveries * XP_PER_DELIVERY +
    distanceTiles * XP_PER_TILE +
    discoveries * XP_PER_DISCOVERY
  );
}

/**
 * Cumulative XP required to reach the given level.
 * level <= 1 returns 0. Formula: 25 * (level - 1) * level.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) {
    return 0;
  }
  return 25 * (level - 1) * level;
}

/** Highest level L >= 1 such that xpForLevel(L) <= xp. Negative xp treated as 0. */
export function levelForXp(xp: number): number {
  const safeXp = xp < 0 ? 0 : xp;
  let level = 1;
  while (xpForLevel(level + 1) <= safeXp) {
    level++;
  }
  return level;
}

/** Skill points granted at a level: one point per level after the first. */
export function skillPointsForLevel(level: number): number {
  return Math.max(0, level - 1);
}

export interface LevelProgress {
  readonly level: number;
  readonly xp: number;
  readonly xpIntoLevel: number; // xp - xpForLevel(level)
  readonly xpForNextLevel: number; // xpForLevel(level+1) - xpForLevel(level)
}

/** Convenience for a HUD readout: level, xp, and progress into the next level. */
export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  return {
    level,
    xp,
    xpIntoLevel: xp - xpForLevel(level),
    xpForNextLevel: xpForLevel(level + 1) - xpForLevel(level),
  };
}
