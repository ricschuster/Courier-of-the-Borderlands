// Pure tile-map logic. No Phaser here so it can be unit tested directly.
// A map is a row-major grid of terrain ids, built from a compact character
// grid plus a legend that maps each symbol to a terrain id.

export interface TileMap {
  readonly width: number;
  readonly height: number;
  /** Terrain ids in row-major order, length === width * height. */
  readonly tiles: readonly string[];
}

/**
 * Build a TileMap from character rows and a symbol -> terrain-id legend.
 * Throws on empty input, ragged rows, or symbols missing from the legend so
 * that malformed map data fails loudly at load time.
 */
export function createTileMap(
  rows: readonly string[],
  legend: Readonly<Record<string, string>>,
): TileMap {
  const height = rows.length;
  if (height === 0) {
    throw new Error('tile map must have at least one row');
  }

  const firstRow = rows[0];
  if (firstRow === undefined || firstRow.length === 0) {
    throw new Error('tile map rows must not be empty');
  }
  const width = firstRow.length;

  const tiles: string[] = [];
  rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`row ${y} has length ${row.length}, expected ${width}`);
    }
    for (const symbol of row) {
      const id = legend[symbol];
      if (id === undefined) {
        throw new Error(`no terrain mapped for symbol '${symbol}'`);
      }
      tiles.push(id);
    }
  });

  return { width, height, tiles };
}

/** Terrain id at the given tile coordinate, or undefined if out of bounds. */
export function getTerrainIdAt(map: TileMap, x: number, y: number): string | undefined {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) {
    return undefined;
  }
  return map.tiles[y * map.width + x];
}
