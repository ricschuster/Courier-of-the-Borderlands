// Pure fog-of-war logic. No Phaser here so it can be unit tested directly.
// The fog tracks which tiles have been revealed. Revealing is permanent: once
// explored, a tile stays revealed (the player is building up a map).

export interface Fog {
  readonly width: number;
  readonly height: number;
  /** Row-major revealed flags, length === width * height. */
  readonly revealed: boolean[];
}

export interface TileCoord {
  readonly x: number;
  readonly y: number;
}

export function createFog(width: number, height: number): Fog {
  return { width, height, revealed: new Array<boolean>(width * height).fill(false) };
}

export function isRevealed(fog: Fog, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= fog.width || y >= fog.height) {
    return false;
  }
  return fog.revealed[y * fog.width + x] === true;
}

/** Row-major indices of every revealed tile. Compact form for saving. */
export function revealedIndices(fog: Fog): number[] {
  const indices: number[] = [];
  for (let i = 0; i < fog.revealed.length; i++) {
    if (fog.revealed[i] === true) {
      indices.push(i);
    }
  }
  return indices;
}

/**
 * True when a saved fog's stored [width, height] matches the current map size.
 *
 * Revealed tiles are saved as row-major indices, which only mean the same tile
 * on a map of the same dimensions. If a shipped region is resized, its old
 * indices point at different (or out-of-range) tiles, so the saved fog is
 * stale and must be discarded. A save from before dimensions were recorded has
 * no stored size (`undefined`) and is treated as stale for the same reason.
 */
export function fogDimsMatch(
  stored: readonly [number, number] | undefined,
  width: number,
  height: number,
): boolean {
  return stored !== undefined && stored[0] === width && stored[1] === height;
}

/** Rebuild a fog of the given size with the listed indices already revealed. */
export function fogFromRevealed(width: number, height: number, indices: readonly number[]): Fog {
  const fog = createFog(width, height);
  for (const index of indices) {
    if (index >= 0 && index < fog.revealed.length) {
      fog.revealed[index] = true;
    }
  }
  return fog;
}

/**
 * Reveal every tile within `radius` (Euclidean, in tiles) of the centre.
 * Mutates the fog and returns the tiles revealed by this call, so callers can
 * update only what changed. Tiles already revealed are not returned.
 */
export function revealAround(fog: Fog, centerX: number, centerY: number, radius: number): TileCoord[] {
  const newlyRevealed: TileCoord[] = [];
  const reach = Math.ceil(radius);
  for (let y = centerY - reach; y <= centerY + reach; y++) {
    for (let x = centerX - reach; x <= centerX + reach; x++) {
      if (x < 0 || y < 0 || x >= fog.width || y >= fog.height) {
        continue;
      }
      if (Math.hypot(x - centerX, y - centerY) > radius) {
        continue;
      }
      const index = y * fog.width + x;
      if (fog.revealed[index] !== true) {
        fog.revealed[index] = true;
        newlyRevealed.push({ x, y });
      }
    }
  }
  return newlyRevealed;
}
