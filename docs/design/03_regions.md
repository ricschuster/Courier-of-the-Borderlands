# Regions

## What a Region contains

Each region is a typed data record with these fields:

- `id` -- unique string key used in the registry and in save data (e.g. `greybridge`, `saltreach`)
- `name` -- display name shown in the HUD
- `map` -- tile grid (rows of terrain-type keys) and the tile legend mapping keys to terrain definitions
- `settlements` -- array of settlement definitions for this region
- `contracts` -- array of contract definitions tied to this region
- `spawnTile` -- `{ col, row }` where the courier appears when entering this region
- `gateways` -- a list of gateway tiles, each pairing a tile at the map edge with the region id it leads to. A region may link to more than one neighbor.
- `fordUnlockId` (optional) -- the unlock id for this region's own ford crossing, if it has one. Each ford is a separate unlock, so opening one region's ford does not open another's.

Greybridge is 30 columns by 22 rows (about three viewport-screens); Saltreach is 30x20, Fenmarch 32x22, and Ashmoor 38x28 (1064 tiles, about 1.5x Fenmarch, the size step `docs/design/10_open_world_expansion.md` asks of a new region). The spokes were originally 20x11 (a third the hub's area), which inverted the difficulty curve because their shorter routes wore the wagon less; #151 enlarged them and spread the settlements off-road across rough terrain so later routes carry real travel-sink pressure. Maps larger than the viewport scroll with a following camera (see the camera notes in the handoffs). All regions reuse the shared terrain types defined in `src/data/terrain-types.ts`. Region-specific content (settlements, contracts, map layout) lives in separate data modules under `src/data/`.

Greybridge holds six settlements (Greywater the home town, Northcairn on the northern moor, Eastwatch across the river, Southmill and Mirewatch in the south-east, and Ironhollow in the south-west mountains) and five contracts. A river splits the region top to bottom, crossed by an open northern bridge, the main central bridge, and a southern ford that starts locked and opens as an unlockable shortcut toward the south-east. Terrain variety was added for the larger map: `hills` (northern moor, slower than plains) and `marsh` (south-east reeds, the slowest passable terrain).

Ashmoor holds five settlements (Emberfast the home town on the old Ember Road, Cairnwatch and Windfall in the northern hills and burnt wood, Blackreed in the southern bog, and Sallowmere behind the tarn) and six contracts, none of them arc-gated. A water channel splits it down column 16, crossed by two open bridges and a locked ford between them; the ford is a shortcut between the region's halves, never the only way across, so both entrances stay open to a bare wagon. Its `wearMultiplier` is 2.0: arriving costs about 9% of a level-1 tank from either direction, but the southern bog will strand an unprepared courier, which is the Gothic gradient the expansion note asks for.

## Region registry

Regions are stored in a registry keyed by id:

```
greybridge -> GreybridgeRegion
saltreach  -> SaltreachRegion
fenmarch   -> FenmarchRegion
ashmoor    -> AshmoorRegion
```

The regions form a **ring**, and used to form a hub with two dead-end spokes:

```
  Greybridge ------- Saltreach
      |                  |
      |                  |
   Fenmarch --------- Ashmoor
```

Every region has exactly two gateways. Greybridge still reaches both of the old spokes, but Saltreach and Fenmarch each now carry a second gateway onward to Ashmoor, which links back to both. The point of the shape is that Ashmoor can be reached two ways (via either spoke), so route choice is a real decision rather than a single forced path; the two approaches differ in terrain and cost, not just length. Ashmoor's own two gateways sit 19 rows apart and open into different halves of its map, so which neighbour you arrive from changes the journey inside it as well. See `docs/design/10_open_world_expansion.md`.

Ashmoor is optional content: it sits outside the Blockade mission spine in `src/data/missions.ts`, and nothing in the core arc requires entering it.

The registry is a plain typed object. The active scene reads the current region id from global game state, looks it up in the registry, and uses the result to build the map, spawn the courier, and load settlements and contracts. Adding a new region means adding a data module and registering it; no scene logic changes are required.

## How travel works

Gateway tiles sit at the edges of each region's map. A region can have several, each leading to a different neighbor. When the courier drives onto a gateway tile, a prompt appears: press T to travel. When a region has more than one gateway, the prompt names each destination, and travelling uses whichever gateway tile the courier is standing on.

Travel is only allowed when the courier is not carrying cargo. Accepting a contract and then attempting to travel is blocked with an on-screen message. The player must deliver or abandon the active contract first.

When the player confirms travel:

1. The active region id in global state is updated to the destination region, and the origin region id is passed to the restart.
2. MapScene restarts.
3. On restart, the scene reads the new active region id, loads that region from the registry, and places the courier at the **arrival tile**: the gateway that leads back to the region it just came from. So the courier steps out at the travel marker it would use to return, not at the region's generic spawn. A fresh load or new game (no origin) uses the region's `spawnTile` instead.

The arrival tile is computed by the pure `arrivalTile(region, fromRegionId?)` helper in `region-system.ts`, so the rule is unit tested independently of the scene.

The scene restart approach is intentional: it keeps region switching simple and avoids managing two full region states simultaneously. See `docs/decisions/0002-regions.md` and `docs/decisions/0003-hub-layout-and-arrival-markers.md` for the rationale.

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

Saves created before multi-region support contain a single flat fog record. On load, if no active region id is present, the save is migrated: the active region is set to `greybridge` and the existing fog data is moved into the per-region record under the `greybridge` key.

A second migration handles the ford unlock. Older saves used a single global `ford-crossing` unlock id. On load, that id is mapped to `ford-crossing-greybridge`, so an existing player keeps Greybridge's ford open. The save format version is unchanged because the snapshot shape is the same; both migrations run inside `deserialize`.

A third mechanism handles map resizes. Fog is saved as row-major revealed tile indices, which only mean the same tile on a same-sized map, so the save also records each region's map dimensions (`fogDimsByRegion`). On load, a region whose stored dimensions do not match its current map (or a save made before dimensions were tracked) has its fog discarded, and exploration starts fresh there; the rest of the save (coins, reputation, unlocks, upgrades) is preserved. This is what lets Greybridge grow from 20x11 to 30x22 without an existing save revealing the wrong tiles. `fogDimsByRegion` is an optional field, so the save format version is unchanged.
