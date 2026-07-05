// Pure minimap model builder. No Phaser dependency.
// Converts world state (fog, terrain colours, positions) into a flat
// row-major grid of MinimapCells ready for a renderer to consume.

export type MinimapMarker = 'courier' | 'settlement' | null;

export interface MinimapCell {
  readonly revealed: boolean;
  readonly color: number | null; // terrain fill colour when revealed, null when fogged
  readonly marker: MinimapMarker;
}

export interface MinimapInput {
  readonly width: number;
  readonly height: number;
  readonly isRevealed: (x: number, y: number) => boolean;
  readonly terrainColorAt: (x: number, y: number) => number | null; // null if out of map
  readonly courier: { readonly x: number; readonly y: number }; // tile coords
  readonly settlements: readonly { readonly x: number; readonly y: number }[];
}

export interface MinimapModel {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly MinimapCell[]; // row-major, length === width * height
}

/** Build a snapshot MinimapModel from the provided input callbacks. */
export function buildMinimap(input: MinimapInput): MinimapModel {
  const { width, height, isRevealed, terrainColorAt, courier, settlements } = input;

  // Build a fast lookup set for settlement positions.
  const settlementKeys = new Set<string>();
  for (const s of settlements) {
    settlementKeys.add(`${s.x},${s.y}`);
  }

  const courierKey = `${courier.x},${courier.y}`;

  const cells: MinimapCell[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const revealed = isRevealed(x, y);
      const color = revealed ? terrainColorAt(x, y) : null;

      const tileKey = `${x},${y}`;
      let marker: MinimapMarker = null;

      if (tileKey === courierKey) {
        // Courier always takes precedence, regardless of reveal state.
        marker = 'courier';
      } else if (revealed && settlementKeys.has(tileKey)) {
        // Settlement marker only when the tile is revealed and not the courier tile.
        marker = 'settlement';
      }

      cells.push({ revealed, color, marker });
    }
  }

  return { width, height, cells };
}
