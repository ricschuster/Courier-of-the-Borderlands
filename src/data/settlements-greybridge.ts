// Settlements of the Greybridge Region. Typed module for now; easy to migrate
// to JSON later. Tile coordinates index into the Greybridge tile map.

export interface Settlement {
  readonly id: string;
  readonly name: string;
  readonly tile: { readonly x: number; readonly y: number };
  readonly note: string;
}

export const SETTLEMENTS: Readonly<Record<string, Settlement>> = {
  greywater: {
    id: 'greywater',
    name: 'Greywater',
    tile: { x: 2, y: 8 },
    note: 'A tired river town where every courier road begins.',
  },
  northcairn: {
    id: 'northcairn',
    name: 'Northcairn',
    tile: { x: 5, y: 3 },
    note: 'A ring of standing stones on the high moor, where the hill clans trade in silence.',
  },
  eastwatch: {
    id: 'eastwatch',
    name: 'Eastwatch',
    tile: { x: 19, y: 8 },
    note: 'A watchtower across the bridge that is always listening.',
  },
  southmill: {
    id: 'southmill',
    name: 'Southmill',
    tile: { x: 21, y: 14 },
    note: 'A grain mill among the southern reeds, half its wheels long stopped.',
  },
  ironhollow: {
    id: 'ironhollow',
    name: 'Ironhollow',
    tile: { x: 4, y: 18 },
    note: 'A mining hollow beneath the western peaks, wary of outsiders.',
  },
  mirewatch: {
    id: 'mirewatch',
    name: 'Mirewatch',
    tile: { x: 24, y: 20 },
    note: 'A stilt-village deep in the salt marsh, reached only by those the reeds allow.',
  },
};

export function settlementAtTile(x: number, y: number): Settlement | undefined {
  return Object.values(SETTLEMENTS).find((s) => s.tile.x === x && s.tile.y === y);
}
