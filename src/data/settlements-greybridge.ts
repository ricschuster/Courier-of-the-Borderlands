// Settlements of the Greybridge Region. Typed module for now; easy to migrate
// to JSON later. Tile coordinates index into the Greybridge tile map.

export interface Settlement {
  /** Stable id referenced by contracts. */
  readonly id: string;
  /** Human-readable name shown in the HUD and delivery text. */
  readonly name: string;
  /** Tile coordinate of the settlement on the map. */
  readonly tile: { readonly x: number; readonly y: number };
  /** Short story flavour, surfaced on arrival. */
  readonly note: string;
}

export const SETTLEMENTS: Readonly<Record<string, Settlement>> = {
  greywater: {
    id: 'greywater',
    name: 'Greywater',
    tile: { x: 2, y: 5 },
    note: 'A tired river town where every courier road begins.',
  },
  eastwatch: {
    id: 'eastwatch',
    name: 'Eastwatch',
    tile: { x: 17, y: 5 },
    note: 'A watchtower across the bridge that is always listening.',
  },
};

/** Settlement whose tile matches the given coordinate, if any. */
export function settlementAtTile(x: number, y: number): Settlement | undefined {
  return Object.values(SETTLEMENTS).find((s) => s.tile.x === x && s.tile.y === y);
}
