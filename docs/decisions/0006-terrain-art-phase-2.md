# 0006 - Terrain art (Phase 2): Kenney tiles behind a data layer

Status: accepted (2026-07-13). Implements #152. Owner call: start Phase 2 now
that the UI pass (#149) and difficulty curve (#151) shipped and the arc is
clearable.

## Context

The game had been pure grey-box: terrain rendered as flat colour `fillRect`s and
no asset pipeline existed (BootScene had a "later this will preload assets"
placeholder). CLAUDE.md's art strategy calls for Phase 2 (free asset packs
tracked in `credits.md`) once the core loop works.

Two risks had to be managed: (1) lock-in, since the first pack sets the visual
identity, and (2) deployment, since the game ships to GitHub Pages and must stay
self-contained.

## Decision

1. **Pack:** Kenney **Roguelike/RPG pack** (`kenney.nl`, CC0). CC0 means no
   attribution burden and no licensing complications for Pages; it is credited in
   `credits.md` voluntarily. It covers the full terrain vocabulary (water,
   mountains, hills, marsh, roads, grass, forest) that our 11+ terrain types
   need, so terrain is skinned in one cohesive pass rather than half-done.
   (Kenney **Tiny Town** was the owner's first pick but lacks water / mountain /
   hills / marsh; it is reserved for a later settlements pass.)

2. **Indirection (the key call):** art references live in data
   (`src/data/terrain-art.ts`: terrain id -> `{ base, overlay? }` atlas frames),
   never in the game logic (`terrain-types.ts` stays art-free) or the rules. A
   terrain with no entry falls back to the grey-box fill, so a partial skin still
   renders. Restyling, swapping packs, or adding tile variety later is a change
   to the data file plus the PNG, not to the scene or the rules. This is what
   makes "start somewhere easy with room to grow" true.

3. **Pipeline:** the atlas is preloaded once in `BootScene.preload` (Phaser
   textures are global) and drawn in `MapScene.drawTiles`: the ground frame, then
   an optional object overlay (a tree for forest, a rock ridge for mountain). The
   PNG is imported in TS so Vite resolves a hashed, base-path-aware URL that works
   in dev, the production build, and Pages.

## Consequences

- First real asset dependency; `assets/sprites/roguelike-rpg-sheet.png` (~95 KB)
  is committed and bundled by Vite. No runtime fetch, so Pages stays
  self-contained.
- The wagon and settlements are still grey-box; they follow in their own slices
  (settlements likely from Tiny Town) via the same data-driven approach.
- Room to grow: edge auto-tiling and tile variety can be added later purely in
  `terrain-art.ts` + the render layer, without touching game logic.

## Non-goals

- No animation. No edge auto-tiling: this pack is a discrete object sheet, not a
  Wang/blob set, so clean neighbour-aware transitions are not available from it.
- No change to terrain rules, speeds, wear, or passability: this is rendering
  only. The grey-box colours remain as the fallback and drive the minimap.

## Update: per-tile variety (#209)

Flat single-frame fills were the last unfinished-looking part of the skin. Each
open-ground terrain now carries a small pool of interchangeable same-family
frames and/or a flip flag in `terrain-art.ts`; `terrainTileArt(id, x, y)` picks a
frame and horizontal flip deterministically from the tile coordinate, so a field
looks broken-up while staying stable across redraws/reloads and unit-testable.
Flip is only enabled on non-directional ground (never roads/bridges/fords).
Still no edge auto-tiling, for the pack reason above.
