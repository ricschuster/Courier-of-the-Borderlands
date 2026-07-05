# Regions

## What a Region contains

Each region is a typed data record with these fields:

- `id` -- unique string key used in the registry and in save data (e.g. `greybridge`, `saltreach`)
- `name` -- display name shown in the HUD
- `map` -- tile grid (rows of terrain-type keys) and the tile legend mapping keys to terrain definitions
- `settlements` -- array of settlement definitions for this region
- `contracts` -- array of contract definitions tied to this region
- `spawnTile` -- `{ col, row }` where the courier appears when entering this region
- `gatewayTile` -- `{ col, row }` of the road tile at the map edge that links to another region

All current maps are 20 columns by 11 rows. All regions reuse the shared terrain types defined in `src/data/terrain-types.ts`. Region-specific content (settlements, contracts, map layout) lives in separate data modules under `src/data/`.

## Region registry

Regions are stored in a registry keyed by id:

```
greybridge -> GreybridgeRegion
saltreach  -> SaltreachRegion
```

The registry is a plain typed object. The active scene reads the current region id from global game state, looks it up in the registry, and uses the result to build the map, spawn the courier, and load settlements and contracts. Adding a new region means adding a data module and registering it; no scene logic changes are required.

## How travel works

A gateway tile sits at the edge of each region's map (on a road tile). When the courier drives onto a gateway tile, a prompt appears: press T to travel.

Travel is only allowed when the courier is not carrying cargo. Accepting a contract and then attempting to travel is blocked with an on-screen message. The player must deliver or abandon the active contract first.

When the player confirms travel:

1. The active region id in global state is updated to the destination region.
2. MapScene restarts.
3. On restart, the scene reads the new active region id, loads that region from the registry, and spawns the courier at the new region's `spawnTile`.

The scene restart approach is intentional: it keeps region switching simple and avoids managing two full region states simultaneously. See `docs/decisions/0002-regions.md` for the rationale.

## Global vs per-region state

**Global (persists across regions):**

- Coins
- Per-settlement reputation
- Purchased upgrades
- Completed contract ids
- Visited settlement ids
- Distance driven
- Achievements

**Per-region (tracked separately for each region):**

- Fog-of-war explored tiles

Each region has its own map, so its own fog grid. The save file stores a record keyed by region id mapping to that region's explored tile set.

## Save migration

Saves created before multi-region support contain a single flat fog record. On load, if no active region id is present, the save is migrated: the active region is set to `greybridge` and the existing fog data is moved into the per-region record under the `greybridge` key. No other save data is affected.
