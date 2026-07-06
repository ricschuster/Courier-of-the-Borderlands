// Canonical terrain definitions for the Greybridge Region grey-box.
// Kept as a typed module for now; easy to migrate to JSON later.

export interface TerrainType {
  /** Stable id referenced by tile maps and other systems. */
  readonly id: string;
  /** Human-readable label for UI and debugging. */
  readonly name: string;
  /** Fill colour used for grey-box rendering (Phaser hex). */
  readonly color: number;
  /** Whether the courier can enter this tile at all. */
  readonly passable: boolean;
  /**
   * Movement speed multiplier relative to base courier speed. 1 is normal,
   * above 1 is faster (roads), below 1 is slower (forest). Impassable terrain
   * is 0; movement onto it is blocked by collision rather than by speed.
   */
  readonly speedModifier: number;
  /**
   * If set, the tile is passable only when this unlock id is active. Used for
   * routes that start blocked and open later (for example the ford crossing).
   */
  readonly unlockId?: string;
}

export const TERRAIN_TYPES: Readonly<Record<string, TerrainType>> = {
  plains: { id: 'plains', name: 'Plains', color: 0x5a8f4a, passable: true, speedModifier: 1 },
  forest: { id: 'forest', name: 'Forest', color: 0x2f5a2a, passable: true, speedModifier: 0.55 },
  road: { id: 'road', name: 'Road', color: 0xb89a6a, passable: true, speedModifier: 1.4 },
  bridge: { id: 'bridge', name: 'Bridge', color: 0x8a6a3a, passable: true, speedModifier: 1.4 },
  water: { id: 'water', name: 'Water', color: 0x2f5fa0, passable: false, speedModifier: 0 },
  mountain: { id: 'mountain', name: 'Mountain', color: 0x6b6b6b, passable: false, speedModifier: 0 },
  // Hills: passable high ground. Slower than plains but a fair bit quicker than
  // forest, so a hill road is a sensible way to cross the northern moor.
  hills: { id: 'hills', name: 'Hills', color: 0x8a7f5a, passable: true, speedModifier: 0.75 },
  // Marsh: passable but the slowest open terrain, so the southern reeds punish
  // anyone who leaves the road for a straight line.
  marsh: { id: 'marsh', name: 'Marsh', color: 0x4a6a4a, passable: true, speedModifier: 0.45 },
  // Ford: a shallow crossing that starts blocked and opens as an unlockable
  // shortcut. Slower than the bridge, but a shorter route across the south.
  // Each region has its own ford terrain and unlock id so opening one
  // region's ford does not open another region's ford.
  'ford-greybridge': {
    id: 'ford-greybridge',
    name: 'Ford',
    color: 0x3a6a8a,
    passable: false,
    speedModifier: 0.7,
    unlockId: 'ford-crossing-greybridge',
  },
  'ford-saltreach': {
    id: 'ford-saltreach',
    name: 'Ford',
    color: 0x3a6a8a,
    passable: false,
    speedModifier: 0.7,
    unlockId: 'ford-crossing-saltreach',
  },
  'ford-fenmarch': {
    id: 'ford-fenmarch',
    name: 'Ford',
    color: 0x3a6a8a,
    passable: false,
    speedModifier: 0.7,
    unlockId: 'ford-crossing-fenmarch',
  },
};
