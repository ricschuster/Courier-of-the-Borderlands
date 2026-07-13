// Data-driven sprite frames for the map markers (settlements, signposts), drawn
// from the Kenney Tiny Town atlas (assets/sprites/tiny-town-sheet.png, CC0). Like
// terrain-art.ts, this is the only place that knows which art a marker uses, so
// the presentation layer (map-markers.ts) reads it and the game logic stays
// art-free. Restyling or swapping is a change here plus the PNG.
//
// Tiny Town is used for the built things (little houses, a wooden signpost) that
// the Roguelike/RPG terrain pack lacks a compact tile for. The sheet is packed:
// 16x16 tiles, no spacing, 12 columns, so a frame index is row * 12 + col.

/** Loader key the Tiny Town atlas is registered under (see BootScene.preload). */
export const MARKER_ATLAS_KEY = 'tiny-town';

/** Columns in the packed atlas; a frame index is `row * MARKER_ATLAS_COLUMNS + col`. */
export const MARKER_ATLAS_COLUMNS = 12;
export const MARKER_ATLAS_ROWS = 11;

/** Phaser spritesheet frame config for the packed atlas (no spacing). */
export const MARKER_ATLAS_FRAME_CONFIG = {
  frameWidth: 16,
  frameHeight: 16,
} as const;

/** A little building: a pitched-roof frame stacked over a wall-with-door frame. */
export interface HouseArt {
  readonly roof: number;
  readonly wall: number;
}

const RED_HOUSE: HouseArt = { roof: 67, wall: 85 }; // red gable + timber door
const BLUE_HOUSE: HouseArt = { roof: 63, wall: 85 }; // blue gable + timber door

// A couple of roof colours so a settlement cluster reads as a hamlet of mixed
// buildings rather than identical stamps. Assigned per settlement by a stable
// index, so the same place always shows the same house.
export const HOUSE_VARIANTS: readonly HouseArt[] = [RED_HOUSE, BLUE_HOUSE];

/** The house art for a settlement at list index `i` (stable, cycles variants). */
export function houseForIndex(i: number): HouseArt {
  // The modulo keeps the index in range; the fallback satisfies the strict
  // index-access check and guards an empty variant list.
  return HOUSE_VARIANTS[i % HOUSE_VARIANTS.length] ?? RED_HOUSE;
}

/** Wooden signpost frame, used for the ford-key marker and region gateways. */
export const SIGNPOST_FRAME = 92;
