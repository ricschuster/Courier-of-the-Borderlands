// Pure terrain queries over the terrain data. No Phaser here so it can be
// unit tested directly.
import { TERRAIN_TYPES, type TerrainType } from '../data/terrain-types';

/** Terrain definition for an id, or undefined if the id is unknown. */
export function getTerrain(terrainId: string): TerrainType | undefined {
  return TERRAIN_TYPES[terrainId];
}

/** Whether the courier can enter the given terrain. Unknown terrain is blocked. */
export function isPassable(terrainId: string): boolean {
  return getTerrain(terrainId)?.passable ?? false;
}

/**
 * Passability accounting for unlock state. Terrain gated behind an unlock id is
 * passable only when that id is in the unlock set; otherwise its base
 * passability applies. Unknown terrain is always blocked.
 */
export function isPassableWith(terrainId: string, unlocks: ReadonlySet<string>): boolean {
  const terrain = getTerrain(terrainId);
  if (terrain === undefined) {
    return false;
  }
  if (terrain.unlockId !== undefined) {
    return unlocks.has(terrain.unlockId);
  }
  return terrain.passable;
}

/**
 * Speed multiplier for the given terrain. Unknown or impassable terrain
 * returns 0, so callers that read this without a passability check still get a
 * safe stop rather than movement onto invalid ground.
 */
export function getSpeedModifier(terrainId: string): number {
  return getTerrain(terrainId)?.speedModifier ?? 0;
}
