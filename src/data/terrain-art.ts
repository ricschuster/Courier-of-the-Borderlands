// Data-driven mapping from terrain id to sprite frames in the Kenney
// Roguelike/RPG atlas (assets/sprites/roguelike-rpg-sheet.png, CC0). This is the
// only place that knows which art a terrain uses: the scene reads it to draw
// tiles, while the game logic (terrain-types.ts) stays entirely art-free.
//
// The indirection is deliberate (art Phase 2, #152): restyling the map, swapping
// packs, or adding tile variety later is a change here plus the PNG, never a
// change in the rendering or the game rules. A terrain with no entry falls back
// to the grey-box colour fill, so the map still renders while a skin is partial.
//
// The sheet is 16x16 tiles with 1px spacing, 57 columns; Phaser numbers frames
// left-to-right, top-to-bottom, so a frame index is row * 57 + col.

/** Loader key the atlas is registered under (see BootScene.preload). */
export const TERRAIN_ATLAS_KEY = 'roguelike-terrain';

/** Columns in the atlas; a frame index is `row * TERRAIN_ATLAS_COLUMNS + col`. */
export const TERRAIN_ATLAS_COLUMNS = 57;
export const TERRAIN_ATLAS_ROWS = 31;

/** Phaser spritesheet frame config for the atlas. */
export const TERRAIN_ATLAS_FRAME_CONFIG = {
  frameWidth: 16,
  frameHeight: 16,
  spacing: 1,
  margin: 0,
} as const;

export interface TerrainArt {
  /** Ground frame drawn first, filling the tile. Also the fallback variant. */
  readonly base: number;
  /**
   * Extra ground frames the tile may use instead of `base`, picked
   * deterministically per tile so a field of one terrain does not read as a grid
   * of identical stamps (#209). The selection pool is `[base, ...baseVariants]`.
   */
  readonly baseVariants?: readonly number[];
  /** Optional object frame drawn over the base (a tree canopy, a rock ridge). */
  readonly overlay?: number;
  /** Extra overlay frames, chosen per tile like baseVariants (varied trees). */
  readonly overlayVariants?: readonly number[];
  /**
   * When true, the tile may be drawn horizontally mirrored, chosen per tile.
   * Only set this for terrain whose art is non-directional (open ground), so the
   * mirror is invisible-but-varied; never on directional art (roads, bridges).
   */
  readonly flip?: boolean;
}

// Terrain id -> atlas frames. Frames chosen to keep the family readable: cobble
// road vs rock mountain, woods vs plains, and the wetland greens/teals distinct
// from grassland. Forest and mountain layer an object over a ground tile so they
// read as woods / rock rather than a flat colour.
//
// Variety (#209): the open-ground terrains carry a few interchangeable frames
// and/or a flip flag so the same terrain looks broken-up across a region. Frames
// are picked deterministically from the tile coordinate (see terrainTileArt), so
// the map is stable across redraws and reloads and stays unit-testable. Frames
// were picked to be same-family (a grass tile only ever swaps for another grass
// tile), so variety never changes what a tile reads as.
export const TERRAIN_ART: Readonly<Record<string, TerrainArt>> = {
  // Grass: plain (5), a second plain (62), and a lightly-speckled tuft (66).
  plains: { base: 5, baseVariants: [62, 66], flip: true },
  // Woods: grass ground under a canopy; three green tree shapes for a varied wood.
  forest: { base: 5, baseVariants: [62], overlay: 585, overlayVariants: [583, 528], flip: true },
  road: { base: 120 },
  bridge: { base: 179 },
  water: { base: 0, flip: true },
  mountain: { base: 7, overlay: 748, flip: true },
  // Hills read as dry dirt/scrub; swap plain (63) for a speckled dirt (6).
  hills: { base: 63, baseVariants: [6], flip: true },
  marsh: { base: 638, flip: true },
  trail: { base: 6, baseVariants: [63], flip: true },
  // Gated crossings reuse the murky-green / shallow-teal ground of the wetland
  // they sit in; the gate is a passability rule, not a distinct terrain look.
  'deep-mire': { base: 638, flip: true },
  'tidal-flat': { base: 467, flip: true },
  'ford-greybridge': { base: 467 },
  'ford-saltreach': { base: 467 },
  'ford-fenmarch': { base: 467 },
};

/** Atlas frames + flip for one tile, resolved from its terrain and coordinate. */
export interface TileArt {
  readonly base: number;
  readonly overlay?: number;
  readonly flipX: boolean;
}

// Small deterministic hash of a tile coordinate. Salted so independent choices
// (base frame vs overlay frame vs flip) drawn for the same tile do not correlate
// and line up into visible stripes. Returns a non-negative integer.
function tileHash(x: number, y: number, salt: number): number {
  let h = (x * 73856093) ^ (y * 19349663) ^ (salt * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Pick one frame from `[base, ...variants]` deterministically for this tile. */
function pickFrame(base: number, variants: readonly number[] | undefined, x: number, y: number, salt: number): number {
  if (variants === undefined || variants.length === 0) {
    return base;
  }
  const pool = [base, ...variants];
  return pool[tileHash(x, y, salt) % pool.length] ?? base;
}

/** Static atlas frames for a terrain id, or undefined to fall back to the fill. */
export function terrainArt(terrainId: string): TerrainArt | undefined {
  return TERRAIN_ART[terrainId];
}

/**
 * Resolve the frames and flip a specific tile should draw, applying per-tile
 * variety (#209) deterministically from its coordinate. Returns undefined for a
 * terrain with no art entry, so the caller falls back to the grey-box fill.
 */
export function terrainTileArt(terrainId: string, x: number, y: number): TileArt | undefined {
  const art = TERRAIN_ART[terrainId];
  if (art === undefined) {
    return undefined;
  }
  const base = pickFrame(art.base, art.baseVariants, x, y, 1);
  const flipX = art.flip === true && (tileHash(x, y, 3) & 1) === 1;
  if (art.overlay === undefined) {
    return { base, flipX };
  }
  return { base, overlay: pickFrame(art.overlay, art.overlayVariants, x, y, 2), flipX };
}
