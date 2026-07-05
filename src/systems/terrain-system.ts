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
 * Speed multiplier for the given terrain. Unknown or impassable terrain
 * returns 0, so callers that read this without a passability check still get a
 * safe stop rather than movement onto invalid ground.
 */
export function getSpeedModifier(terrainId: string): number {
  return getTerrain(terrainId)?.speedModifier ?? 0;
}
