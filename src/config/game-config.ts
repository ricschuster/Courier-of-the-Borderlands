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

// Courier wagon. COURIER_SIZE is the on-map display size (and drives the physics
// body); COURIER_COLOR is the gold used for the wagon's minimap/HUD identity and
// remains the fallback tint. WAGON_TEXTURE_KEY names the loaded wagon sprite.
export const COURIER_SIZE = 20;
export const COURIER_COLOR = 0xf2c14e;
export const WAGON_TEXTURE_KEY = 'courier-wagon';

// Kenney UI panel (RPG Expansion, CC0) used as a 9-slice frame behind overlay
// panels. The source is 100x100; UI_PANEL_CORNER is the slice inset that keeps
// the decorative border and corner bolts undistorted while the centre stretches.
export const UI_PANEL_TEXTURE_KEY = 'ui-panel';
export const UI_PANEL_CORNER = 24;

// Kenney UI bar (RPG Expansion, CC0) used as the HUD wagon-condition meter
// (#203). The source is a 36x72 vertical strip of four 36x18 frames: 0 = empty
// track, 1 = green fill, 2 = amber fill, 3 = red fill. Rendered as a horizontal
// 3-slice, so UI_BAR_CAP is the left/right cap that stays undistorted while the
// middle stretches to the bar's width.
export const UI_BAR_TEXTURE_KEY = 'ui-bar';
export const UI_BAR_FRAME = { frameWidth: 36, frameHeight: 18 } as const;
export const UI_BAR_CAP = 9;
export const UI_BAR_FRAME_TRACK = 0;
export const UI_BAR_FRAME_GREEN = 1;
export const UI_BAR_FRAME_AMBER = 2;
export const UI_BAR_FRAME_RED = 3;
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
