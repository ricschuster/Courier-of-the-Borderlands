// Canonical game constants. Keep magic numbers named and in one place so
// scenes and systems share the same values.

export const GAME_TITLE = 'Courier of the Borderlands';

// Base render resolution. The Scale manager fits this to the window.
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

// Size of one map tile in pixels. The Greybridge map is 20x11 tiles, which
// fills the render width (20 * 48 = 960) with a small vertical margin.
export const TILE_SIZE = 48;

// Background colour for empty scenes (dark slate, matches the page).
export const BACKGROUND_COLOR = '#1a1a1a';

// Courier wagon grey-box: a small square that drives around the map.
export const COURIER_SIZE = 20;
export const COURIER_COLOR = 0xf2c14e;
// Base movement speed in pixels per second (before terrain effects).
export const COURIER_SPEED = 160;

// Fog-of-war: how many tiles around the courier are revealed, and the colour
// of the fog covering unexplored tiles.
export const FOG_REVEAL_RADIUS = 2.5;
export const FOG_COLOR = 0x0d0d0d;

// Camera follow smoothing. Only used when the map is larger than the viewport;
// maps that fit are shown static and centred. 1 = snap to the courier, lower is
// a softer, laggier follow. 0.12 reads as smooth without feeling floaty.
export const CAMERA_LERP = 0.12;
