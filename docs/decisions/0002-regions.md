# 0002: Region Architecture

## Status

Accepted

## Context

The game is expanding beyond one region. A second region (Saltreach) needs its own map, settlements, contracts, fog grid, spawn point, and a way for the player to travel to it. The architecture must answer three questions:

1. How are regions defined and loaded?
2. How does the player move between them?
3. What state is global and what is per-region?

## Decision

**Regions as data in a registry.** Each region is a typed record (`Region`) holding its map grid, legend, settlements, contracts, spawn tile, and gateway tile. Regions are registered in a plain object keyed by string id. The scene reads the active region id from global state, looks it up in the registry, and builds everything from the result. Adding a region is a data change with no scene logic edits.

**Region switching by scene restart.** When the player travels, MapScene restarts with the new active region id stored in global state. On restart the scene loads the new region from the registry and drops the courier at that region's spawn tile. No second region is held in memory during normal play.

**Global progress, per-region fog.** Coins, reputation, purchased upgrades, completed contracts, visited settlements, distance driven, and achievements are global. Fog-of-war is tracked per region because each region has its own map. The save stores a record of explored tiles keyed by region id. Saves written before this feature are migrated on load: the active region is set to `greybridge` and the existing flat fog data moves into the per-region record under that key.

## Consequences

**Positive:**

- Region switching is simple to implement and reason about. There is no logic for managing two active regions simultaneously.
- Adding a new region requires only new data modules and a registry entry.
- Per-region fog is straightforward: each region starts fogged and reveals independently, which matches the exploration premise.
- Save migration is a small one-time transform with a clear rule.

**Negative:**

- Scene restart rebuilds all Phaser objects (tiles, sprites, HUD) on every region switch. For the current map size this is fast, but it would become a concern if regions grew large or switching became frequent.
- Per-region fog adds a layer of keying to the save format. Bugs in fog serialisation or migration could corrupt exploration progress.
- The scene restart approach means any in-flight state (e.g. a partially played sound, a transition animation) must be explicitly handled before restart or it will be lost.

These tradeoffs are accepted. The project is a learning-first prototype where simplicity and fast iteration outweigh the cost of a full region-streaming system. The save migration rule is simple and testable.
