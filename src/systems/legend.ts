// Pure terrain codex: converts terrain data into human-readable legend entries.
// No Phaser imports. No side effects.

/** A single entry in the map legend as shown to the player. */
export interface LegendEntry {
  readonly name: string;
  readonly color: number;
  readonly passable: boolean;
  /** One of "blocked" | "fast" | "slow" | "normal". */
  readonly speedLabel: string;
}

/** Minimal terrain shape this module needs. */
export interface LegendTerrain {
  readonly name: string;
  readonly color: number;
  readonly passable: boolean;
  /** 1.0 = normal speed, > 1 = faster, < 1 = slower, 0 = impassable. */
  readonly speedModifier: number;
}

/**
 * Pick out the terrains a map actually uses, in the terrain record's own order.
 *
 * The codex is per region (#251). Listing every terrain in the game showed the
 * three region-specific fords as three identical "Ford" rows, and leaked terrain
 * from regions the player had never seen. Ordering follows the record rather
 * than the order tiles happen to appear, so the codex reads the same everywhere.
 */
export function terrainsPresent<T extends LegendTerrain>(
  tileIds: readonly string[],
  terrains: Readonly<Record<string, T>>,
): T[] {
  const present = new Set(tileIds);
  return Object.entries(terrains)
    .filter(([id]) => present.has(id))
    .map(([, terrain]) => terrain);
}

/** Derive a speed label from a terrain's modifier and passable flag. */
function deriveSpeedLabel(terrain: LegendTerrain): string {
  if (!terrain.passable) return 'blocked';
  if (terrain.speedModifier > 1) return 'fast';
  if (terrain.speedModifier < 1) return 'slow';
  return 'normal';
}

/**
 * Build a legend entry array from a list of terrain definitions.
 * Input order is preserved. name, color, and passable are copied through.
 */
export function buildLegend(terrains: readonly LegendTerrain[]): LegendEntry[] {
  return terrains.map((t) => ({
    name: t.name,
    color: t.color,
    passable: t.passable,
    speedLabel: deriveSpeedLabel(t),
  }));
}
