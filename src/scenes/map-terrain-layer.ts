import Phaser from 'phaser';
import { TILE_SIZE, FOG_COLOR } from '../config/game-config';
import { TERRAIN_TYPES } from '../data/terrain-types';
import { TERRAIN_ATLAS_KEY, terrainTileArt, type TileArt } from '../data/terrain-art';
import { getTerrain, isPassableWith } from '../systems/terrain-system';
import { tileCenter } from '../systems/tile-geometry';
import { getTerrainIdAt, type TileMap } from '../systems/tile-map';

// Depth layers owned by this file. The courier (6) sits between terrain and fog,
// and is set by the scene; HUD depth lives in map-hud.ts and marker depth in
// map-markers.ts.
const DEPTH_TERRAIN = 0;
const DEPTH_FOG = 5;

/**
 * The drawn map beneath everything else: terrain tiles, the physics colliders
 * for impassable ground, and the fog rectangles that hide unexplored tiles.
 *
 * Extracted from MapScene (#365), which had grown past 2300 lines. Follows the
 * same pattern as MapHud, MapMarkers, and Juice: the scene keeps the game state
 * and decides what should happen, this class owns a slice of the Phaser objects
 * and the bookkeeping that goes with them.
 *
 * Three pieces of bookkeeping used to live loose in the scene and are now
 * internal here:
 *
 * 1. `gatedBlocks`, the colliders indexed by the traversal token that opens
 *    them, so a ford unlock or a newly bought capability can destroy exactly the
 *    blocks it frees.
 * 2. `fogRects`, one rectangle per tile in row-major order, destroyed as tiles
 *    reveal. Row-major matches the fog model's index scheme, which is what the
 *    save file stores.
 * 3. The static group of impassable blocks, which the scene needs only to hand
 *    to a physics collider.
 *
 * A fresh instance is built per scene create(), because Phaser destroys all
 * GameObjects on scene restart.
 */
export class MapTerrainLayer {
  private readonly scene: Phaser.Scene;
  private readonly map: TileMap;
  private readonly originY: number;

  /** Static bodies for impassable ground. The scene collides the courier with this. */
  readonly impassable: Phaser.Physics.Arcade.StaticGroup;

  private readonly gatedBlocks = new Map<string, Phaser.GameObjects.Rectangle[]>();
  private fogRects: (Phaser.GameObjects.Rectangle | undefined)[] = [];

  /**
   * Draws the terrain and builds the colliders. `keys` is the traversal set the
   * courier holds right now: passable ground gets no collider, and impassable
   * ground that some token would open is recorded against that token so it can
   * be freed later without a rebuild.
   */
  constructor(scene: Phaser.Scene, map: TileMap, originY: number, keys: ReadonlySet<string>) {
    this.scene = scene;
    this.map = map;
    this.originY = originY;
    this.drawTiles();
    this.impassable = this.buildColliders(keys);
  }

  /** Centre of a tile in world pixels, at this layer's vertical offset. */
  center(tileX: number, tileY: number): { x: number; y: number } {
    return tileCenter(tileX, tileY, this.originY);
  }

  /**
   * Cover every tile with fog. Called after the markers are placed so the fog
   * draws over them, and separate from the constructor for that reason.
   */
  buildFog(): void {
    this.fogRects = new Array<Phaser.GameObjects.Rectangle | undefined>(
      this.map.width * this.map.height,
    ).fill(undefined);
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const c = this.center(x, y);
        const rect = this.scene.add
          .rectangle(c.x, c.y, TILE_SIZE, TILE_SIZE, FOG_COLOR)
          .setDepth(DEPTH_FOG);
        this.fogRects[y * this.map.width + x] = rect;
      }
    }
  }

  /** Uncover tiles by row-major fog index (the scheme the save file stores). */
  clearFogAt(indices: Iterable<number>): void {
    for (const index of indices) {
      this.fogRects[index]?.destroy();
      this.fogRects[index] = undefined;
    }
  }

  /** Uncover tiles by coordinate, for a reveal around the courier. */
  clearFogAtTiles(tiles: Iterable<{ readonly x: number; readonly y: number }>): void {
    for (const { x, y } of tiles) {
      const index = y * this.map.width + x;
      this.fogRects[index]?.destroy();
      this.fogRects[index] = undefined;
    }
  }

  /**
   * Destroy the colliders gated behind any of `keys`, opening that ground.
   *
   * Idempotent: a token whose blocks are already gone is a no-op, so this is
   * safe to call on every upgrade or skill change. That matters because the
   * colliders are baked once at create() from the capabilities held then, and a
   * capability gained mid-scene would otherwise leave a stale collider: the
   * pathfinder routes through the now-passable tile while physics still blocks
   * it, soft-locking the courier at its edge.
   */
  openGates(keys: Iterable<string>): void {
    for (const token of keys) {
      const blocks = this.gatedBlocks.get(token);
      if (blocks === undefined) {
        continue;
      }
      blocks.forEach((block) => block.destroy());
      this.gatedBlocks.delete(token);
    }
  }

  private drawTiles(): void {
    // Grey-box fill remains the fallback for any terrain without an art entry,
    // so the map still renders if a skin is partial (art Phase 2, #152).
    const tiles = this.scene.add.graphics().setDepth(DEPTH_TERRAIN);
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const terrainId = getTerrainIdAt(this.map, x, y);
        if (terrainId === undefined) {
          continue;
        }
        const terrain = TERRAIN_TYPES[terrainId];
        if (terrain === undefined) {
          continue;
        }
        const art = terrainTileArt(terrainId, x, y);
        if (art === undefined) {
          tiles.fillStyle(terrain.color, 1);
          tiles.fillRect(x * TILE_SIZE, this.originY + y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          continue;
        }
        this.drawTileArt(x, y, art);
      }
    }
  }

  /**
   * Draw a terrain tile from the atlas: the ground frame, then any overlay. The
   * frames and horizontal flip carry the per-tile variety resolved in
   * terrainTileArt (#209); the overlay shares the base's flip so a tree and its
   * ground mirror together.
   */
  private drawTileArt(x: number, y: number, art: TileArt): void {
    const c = this.center(x, y);
    this.scene.add
      .image(c.x, c.y, TERRAIN_ATLAS_KEY, art.base)
      .setDisplaySize(TILE_SIZE, TILE_SIZE)
      .setFlipX(art.flipX)
      .setDepth(DEPTH_TERRAIN);
    if (art.overlay !== undefined) {
      this.scene.add
        .image(c.x, c.y, TERRAIN_ATLAS_KEY, art.overlay)
        .setDisplaySize(TILE_SIZE, TILE_SIZE)
        .setFlipX(art.flipX)
        .setDepth(DEPTH_TERRAIN);
    }
  }

  private buildColliders(keys: ReadonlySet<string>): Phaser.Physics.Arcade.StaticGroup {
    const group = this.scene.physics.add.staticGroup();
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const terrainId = getTerrainIdAt(this.map, x, y);
        if (terrainId === undefined || isPassableWith(terrainId, keys)) {
          continue;
        }
        const c = this.center(x, y);
        const block = this.scene.add.rectangle(c.x, c.y, TILE_SIZE, TILE_SIZE);
        group.add(block);

        const unlockId = getTerrain(terrainId)?.unlockId;
        if (unlockId !== undefined) {
          const gated = this.gatedBlocks.get(unlockId) ?? [];
          gated.push(block);
          this.gatedBlocks.set(unlockId, gated);
        }
      }
    }
    return group;
  }
}
