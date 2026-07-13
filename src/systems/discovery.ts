// Pure module: reveal-rewarded wayside discoveries (roads-gate slice 5b).
//
// A discovery is a coordinate-anchored scrap of lore hidden in the fog: a
// wayside cairn, a drowned waystone, a hollow milestone. It is *found* the
// moment the courier's fog reveals its tile, so investing in reveal (the
// Wayfinder skill, the far-lantern upgrade) earns a non-buff payoff instead of
// only seeing marginally further. It never touches the critical path, the
// economy, or passability: the reward is story, serving the "Story through
// places" pillar and the Hidden Road / Cipher thread (see
// docs/design/07_roads_gate_the_wagon.md, slice 5b, and issue #111).
//
// Because a discovery is found iff its tile is revealed, and revealed fog is
// already saved per region, the whole mechanic is *derived* from fog + data
// with no new save state, matching story-threads, missions, and encounters. The
// Cipher skill decodes a deeper line, giving that story skill a concrete second
// surface (#183) without gating the base find.
//
// No Phaser or DOM here, so it can be unit tested directly. The scene owns
// triggering (which tiles revealed this frame) and rendering (toast + journal).

import { isRevealed, type Fog, type TileCoord } from './fog-of-war';

export interface Discovery {
  readonly id: string;
  readonly regionId: string;
  readonly tile: TileCoord;
  /** Short name shown as the discovery's heading. */
  readonly title: string;
  /** Lore shown to any courier the moment the tile is revealed. */
  readonly note: string;
  /**
   * Extra decoded lore shown only to a courier who owns the Cipher skill. The
   * base find never depends on it, so a discovery reads whole without Cipher and
   * rewards it with a deeper line.
   */
  readonly cipherNote?: string;
}

/** True once the discovery's tile has been revealed in the fog. */
export function isDiscovered(discovery: Discovery, fog: Fog): boolean {
  return isRevealed(fog, discovery.tile.x, discovery.tile.y);
}

/** Discoveries in the region whose tile the fog has revealed, in list order. */
export function foundDiscoveries(
  discoveries: readonly Discovery[],
  regionId: string,
  fog: Fog,
): Discovery[] {
  return discoveries.filter((d) => d.regionId === regionId && isDiscovered(d, fog));
}

/**
 * Discoveries in the region sitting on one of the tiles just revealed this
 * frame. The scene passes the newly-revealed set revealAround returns, so each
 * discovery matches exactly once (the frame its tile first uncovers) and never
 * re-fires on reload, where the tile is already revealed and so not "new".
 */
export function newlyFound(
  discoveries: readonly Discovery[],
  regionId: string,
  newlyRevealed: readonly TileCoord[],
): Discovery[] {
  if (newlyRevealed.length === 0) {
    return [];
  }
  const revealedKeys = new Set(newlyRevealed.map((t) => `${t.x},${t.y}`));
  return discoveries.filter(
    (d) => d.regionId === regionId && revealedKeys.has(`${d.tile.x},${d.tile.y}`),
  );
}

/**
 * The lore lines for a discovery: the title, the base note, and the Cipher line
 * when the courier can decode it. Used for both the found-toast and the
 * re-readable journal entry, so they never drift apart.
 */
export function discoveryLines(discovery: Discovery, hasCipher: boolean): string[] {
  const lines = [discovery.title, discovery.note];
  if (hasCipher && discovery.cipherNote !== undefined) {
    lines.push(discovery.cipherNote);
  }
  return lines;
}
