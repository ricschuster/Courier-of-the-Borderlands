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
   * Speed modifier used for WEAR only (ADR 0005 roughness), decoupled from the
   * movement `speedModifier`. Absent means wear derives from `speedModifier` as
   * before, so every existing tile is unchanged. The trail sets this so it can
   * read as a slightly quicker path while staying as rough on the wagon as the
   * off-road ground it connects (#176).
   */
  readonly wearSpeedModifier?: number;
  /**
   * If set, the tile is passable only when this unlock id is active. Used for
   * routes that start blocked and open later (for example the ford crossing).
   */
  readonly unlockId?: string;
}

export const TERRAIN_TYPES: Readonly<Record<string, TerrainType>> = {
  // Terrain fill colours (minimap, legend, terrain readout; the main map is
  // sprite-skinned, #203). The passable wet terrains are pulled onto the blue
  // axis so the old four-greens set (plains/forest/marsh/deep-mire, separable
  // only by lightness) no longer collapses under deuteranopia/protanopia (#228):
  // plains stays light green and forest dark green, but marsh reads teal and the
  // deep mire slate-blue, distinct by hue as well as lightness.
  plains: { id: 'plains', name: 'Plains', color: 0x6fa24a, passable: true, speedModifier: 1 },
  forest: { id: 'forest', name: 'Forest', color: 0x1e6e3a, passable: true, speedModifier: 0.55 },
  // Road/bridge: the fast way to travel. Movement was 1.4x but read as too fast
  // on the open road (2026-07-12 playtest, #185), so it is eased to 1.2x. Wear is
  // pinned at 1.4x via wearSpeedModifier so roads still normalise to roughness 0
  // (no wear), keeping the felt-speed change decoupled from the travel-sink
  // economy (#110 stays as tuned). See ADR 0005 and getWearSpeedModifier.
  road: {
    id: 'road',
    name: 'Road',
    color: 0xb89a6a,
    passable: true,
    speedModifier: 1.2,
    wearSpeedModifier: 1.4,
  },
  bridge: {
    id: 'bridge',
    name: 'Bridge',
    color: 0x8a6a3a,
    passable: true,
    speedModifier: 1.2,
    wearSpeedModifier: 1.4,
  },
  water: { id: 'water', name: 'Water', color: 0x2f5fa0, passable: false, speedModifier: 0 },
  mountain: { id: 'mountain', name: 'Mountain', color: 0x6b6b6b, passable: false, speedModifier: 0 },
  // Hills: passable high ground. Slower than plains but a fair bit quicker than
  // forest, so a hill road is a sensible way to cross the northern moor.
  hills: { id: 'hills', name: 'Hills', color: 0x8a7f5a, passable: true, speedModifier: 0.75 },
  // Marsh: passable but the slowest open terrain, so the southern reeds punish
  // anyone who leaves the road for a straight line.
  marsh: { id: 'marsh', name: 'Marsh', color: 0x3f8f86, passable: true, speedModifier: 0.45 },
  // Trail: a rough dirt track that connects the off-road settlements to the road
  // network so no village looks stranded in blank wilderness (#176). It reads and
  // drives as a path (a touch quicker than trackless forest/marsh), but its wear
  // is held as high as the rough ground it crosses (wearSpeedModifier), so it is
  // a fictional/visual connection, not a difficulty relief. See ADR 0005.
  trail: {
    id: 'trail',
    name: 'Trail',
    color: 0x7a6a45,
    passable: true,
    speedModifier: 0.6,
    wearSpeedModifier: 0.45,
  },
  // Deep mire: sodden ground the base wagon cannot cross at all. It opens as a
  // shortcut only once the courier holds the "mire-crossing" capability (the
  // Marsh Treads upgrade, or Off-road rank 2). Slower than marsh once
  // open. See src/systems/traversal.ts and docs/design/07_roads_gate_the_wagon.md.
  'deep-mire': {
    id: 'deep-mire',
    name: 'Deep Mire',
    color: 0x35485c,
    passable: false,
    speedModifier: 0.4,
    unlockId: 'mire-crossing',
  },
  // Tidal flat: soft salt-marsh mud the base wagon bogs down in and cannot
  // cross. It opens as a shortcut only once the courier holds the
  // "tidal-crossing" capability (the Salt Runners upgrade, or Off-road rank 3),
  // and a longer dry route around the lagoon always exists. Slower than marsh
  // once open. Used in the wetland regions (Saltreach, Fenmarch). See
  // src/systems/traversal.ts and docs/design/07_roads_gate_the_wagon.md.
  'tidal-flat': {
    id: 'tidal-flat',
    name: 'Tidal Flat',
    color: 0x6a6f55,
    passable: false,
    speedModifier: 0.4,
    unlockId: 'tidal-crossing',
  },
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
