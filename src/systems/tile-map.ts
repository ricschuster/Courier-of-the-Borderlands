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
    // The length check above counts UTF-16 code units, but the loop below walks
    // code points. A symbol outside the BMP (an emoji, say) would pass the check
    // yet push fewer tiles, silently shifting every later index. Count what was
    // actually pushed so that mismatch fails loudly too (#293).
    let symbolCount = 0;
    for (const symbol of row) {
      const id = legend[symbol];
      if (id === undefined) {
        throw new Error(`no terrain mapped for symbol '${symbol}'`);
      }
      tiles.push(id);
      symbolCount += 1;
    }
    if (symbolCount !== width) {
      throw new Error(
        `row ${y} has ${symbolCount} symbols but ${width} code units; ` +
          `legend symbols must be single UTF-16 code units`,
      );
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

/**
 * Convert a world pixel position to tile coordinates, given the tile size and
 * the pixel origin of the map's top-left corner.
 */
export function worldToTile(
  worldX: number,
  worldY: number,
  tileSize: number,
  originX: number,
  originY: number,
): { x: number; y: number } {
  return {
    x: Math.floor((worldX - originX) / tileSize),
    y: Math.floor((worldY - originY) / tileSize),
  };
}
