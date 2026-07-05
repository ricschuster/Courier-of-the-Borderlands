// Canonical terrain definitions for the Greybridge Region grey-box.
// Kept as a typed module for now; easy to migrate to JSON later.
// Movement effects (speed modifiers) arrive in a later build step; for now
// terrain carries colour and passability so the map can render and so future
// movement logic has a stable data model to read from.

export interface TerrainType {
  /** Stable id referenced by tile maps and other systems. */
  readonly id: string;
  /** Human-readable label for UI and debugging. */
  readonly name: string;
  /** Fill colour used for grey-box rendering (Phaser hex). */
  readonly color: number;
  /** Whether the courier can enter this tile at all. */
  readonly passable: boolean;
}

export const TERRAIN_TYPES: Readonly<Record<string, TerrainType>> = {
  plains: { id: 'plains', name: 'Plains', color: 0x5a8f4a, passable: true },
  forest: { id: 'forest', name: 'Forest', color: 0x2f5a2a, passable: true },
  road: { id: 'road', name: 'Road', color: 0xb89a6a, passable: true },
  bridge: { id: 'bridge', name: 'Bridge', color: 0x8a6a3a, passable: true },
  water: { id: 'water', name: 'Water', color: 0x2f5fa0, passable: false },
  mountain: { id: 'mountain', name: 'Mountain', color: 0x6b6b6b, passable: false },
};
