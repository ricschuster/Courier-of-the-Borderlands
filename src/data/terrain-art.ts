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
  /** Ground frame drawn first, filling the tile. */
  readonly base: number;
  /** Optional object frame drawn over the base (a tree canopy, a rock ridge). */
  readonly overlay?: number;
}

// Terrain id -> atlas frames. Frames chosen to keep the family readable: cobble
// road vs rock mountain, woods vs plains, and the wetland greens/teals distinct
// from grassland. Forest and mountain layer an object over a ground tile so they
// read as woods / rock rather than a flat colour.
export const TERRAIN_ART: Readonly<Record<string, TerrainArt>> = {
  plains: { base: 5 },
  forest: { base: 5, overlay: 585 },
  road: { base: 120 },
  bridge: { base: 179 },
  water: { base: 0 },
  mountain: { base: 7, overlay: 748 },
  hills: { base: 63 },
  marsh: { base: 638 },
  trail: { base: 6 },
  // Gated crossings reuse the murky-green / shallow-teal ground of the wetland
  // they sit in; the gate is a passability rule, not a distinct terrain look.
  'deep-mire': { base: 638 },
  'tidal-flat': { base: 467 },
  'ford-greybridge': { base: 467 },
  'ford-saltreach': { base: 467 },
  'ford-fenmarch': { base: 467 },
};

/** Atlas frames for a terrain id, or undefined to fall back to the grey-box fill. */
export function terrainArt(terrainId: string): TerrainArt | undefined {
  return TERRAIN_ART[terrainId];
}
