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
