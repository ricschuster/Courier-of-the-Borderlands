import {
  createFog,
  fogDimsMatch,
  isRevealed,
  revealAround,
  revealIndices,
  revealedIndices,
  type Fog,
  type TileCoord,
} from '../systems/fog-of-war';

/**
 * The scene services the fog needs. Every member must read through a closure:
 * the controller is constructed at the top of `create()` so `restoreState()` can
 * write into it, which is before the map and the terrain layer exist. A member
 * that captured `this.map` eagerly would be undefined at construction and fail
 * at runtime rather than at compile time (ADR 0009).
 */
export interface FogHost {
  /** Size of the active region's map, in tiles. */
  getMapSize: () => { readonly width: number; readonly height: number };
  getRegionId: () => string;
  /** Clear the fog rectangles covering the given row-major tile indices. */
  clearFogAt: (indices: Iterable<number>) => void;
  /** Clear the fog rectangles covering the given tiles. */
  clearFogAtTiles: (tiles: Iterable<TileCoord>) => void;
}

/**
 * Owns the fog of war: the active region's revealed tiles, and the persisted
 * per-region record of what every visited region has revealed so far.
 *
 * All three fields are private to this controller, so the scene no longer holds
 * them (ADR 0009, extraction shape 2). The fog rules themselves stay pure in
 * `systems/fog-of-war.ts`; this only sequences them against the scene's
 * lifecycle and keeps the drawn rectangles in step with the model.
 */
export class FogController {
  /**
   * The active region's fog. Empty until `beginRegion()` runs, which cannot
   * happen before the map is built.
   */
  private fog: Fog = createFog(0, 0);
  private byRegion: Record<string, number[]> = {};
  /**
   * Map size each region's saved fog was recorded against, so a resized region
   * discards its stale (differently indexed) fog instead of revealing wrong
   * tiles.
   */
  private dimsByRegion: Record<string, [number, number]> = {};

  constructor(private readonly host: FogHost) {}

  /**
   * Adopt the persisted fog from a restored run. Runs before the map exists, so
   * it only takes the data; `beginRegion()` applies it.
   */
  restore(
    byRegion: Record<string, number[]>,
    dimsByRegion: Record<string, [number, number]>,
  ): void {
    this.byRegion = byRegion;
    this.dimsByRegion = dimsByRegion;
  }

  /**
   * Build the active region's fog and re-reveal whatever the save recorded for
   * it. Call once the map and terrain layer exist.
   */
  beginRegion(): void {
    const { width, height } = this.host.getMapSize();
    this.fog = createFog(width, height);

    const regionId = this.host.getRegionId();
    const indices = this.byRegion[regionId];
    if (indices === undefined) {
      return;
    }
    // Fog indices only mean the same tile on a same-sized map. If this region
    // was resized since the save (or the save predates dimension tracking),
    // drop the stale fog so exploration starts fresh rather than revealing the
    // wrong tiles. snapshot() re-records the current size on the next write.
    if (!fogDimsMatch(this.dimsByRegion[regionId], width, height)) {
      delete this.byRegion[regionId];
      delete this.dimsByRegion[regionId];
      return;
    }
    // Out-of-range indices are dropped by revealIndices, which returns exactly
    // the tiles revealed so only those get their fog rectangle cleared.
    this.host.clearFogAt(revealIndices(this.fog, indices));
  }

  /**
   * Reveal everything within `radius` of a tile and clear the rectangles over
   * it. Returns the tiles this call revealed, so the caller can react to what
   * is newly visible (a wayside discovery is found the moment its tile first
   * reveals).
   */
  revealAround(tile: TileCoord, radius: number): TileCoord[] {
    const revealed = revealAround(this.fog, tile.x, tile.y, radius);
    this.host.clearFogAtTiles(revealed);
    return revealed;
  }

  isRevealed(x: number, y: number): boolean {
    return isRevealed(this.fog, x, y);
  }

  /** The active region's fog, for callers that read it wholesale. */
  current(): Fog {
    return this.fog;
  }

  /**
   * Record the active region's revealed tiles against the current map size,
   * then hand back both maps for the save payload.
   *
   * This writes as well as reads, which is why the save path is part of this
   * cluster rather than merely a reader of it.
   */
  snapshot(): {
    fogByRegion: Record<string, number[]>;
    fogDimsByRegion: Record<string, [number, number]>;
  } {
    const { width, height } = this.host.getMapSize();
    this.byRegion[this.host.getRegionId()] = revealedIndices(this.fog);
    this.dimsByRegion[this.host.getRegionId()] = [width, height];
    return { fogByRegion: this.byRegion, fogDimsByRegion: this.dimsByRegion };
  }
}
