---
name: region-map
description: Author or resize a region map for Courier of the Borderlands. Use when adding a new region, changing an existing region's grid (rows, dimensions, terrain, settlements, spawn, gateways, fords/tidal shortcuts), or debugging why a map is unwinnable or a shortcut is not a real shortcut. Front-loads the reachability, sealed-pocket, and test-coordinate guardrails that region edits keep tripping over.
---

# Authoring or resizing a region map

Region maps are hand-authored ASCII grids in `src/data/`. Editing one is easy to
get wrong in ways unit tests alone will not catch, because several e2e specs
hardcode coordinates. Follow this order.

## 1. Read the region file's own header first

Each `src/data/region-*.ts` (and `greybridge-map.ts`) opens with a long comment
block that is the source of truth for that map: the legend, grid dimensions, the
water channel / bridge / ford columns, settlement coordinates, spawn, gateway,
and any sealed pocket. Read it before touching a single row. Do not invent lore
or a new mechanic here without a design note (see CLAUDE.md).

Legend (shared across regions, confirm against the file):
`.` plains  `f` forest  `#` road  `b` bridge  `~` water  `^` mountain
`h` hills  `m` marsh  `x` ford (gated)  `t` tidal-flat (gated)  `p` trail
(rough path: drives like a path, wears like the ground under it, so it is a
visual link, not relief).

## 2. Paint, keeping the grid rectangular

`createTileMap(rows, legend)` validates row lengths and symbols at load time, so
every row must be the same width and use only legend symbols. Keep settlements,
spawn, gateway, and shortcut tiles at the coordinates named in the header, or
update the header when you move them.

## 3. Prove reachability and that shortcuts are shortcuts

`tests/unit/region-invariants.test.ts` runs the game's own 4-directional BFS over
the same passability rule the scene uses, across every shipped region, and
fails on: an unwinnable map, a contract pointing at a missing/unreachable
settlement, or a "shortcut" (ford/tidal) that is not actually shorter than the
long way. Run `npm test` and make it green before anything else.

**Sealed-pocket rule (learned the hard way):** a gated shortcut only bites if the
pocket it serves is otherwise sealed. If the pocket is reachable another way at a
similar cost, the gate is decorative. When you carve a pocket, wall it (water /
mountain) with exactly one gated gap, and confirm the invariants test treats the
gated tile as the meaningful shortcut. Carve corners Reedgrave-style rather than
dropping a single tile.

## 4. Estimate wear / travel-sink pressure

Later regions must carry more travel-sink pressure than the Greybridge hub, and
wear comes from rough ground, not road length (roads are roughness 0 and wear
nothing). See `src/systems/wagon-condition.ts` (`wearPerTile`, `roughness`) and
`docs/design/07_roads_gate_the_wagon.md`. If a region reads too soft, the proven
lever is `Region.wearMultiplier` (region-system.ts), which scales ONLY the
roughness term so roads stay free (Fenmarch ships at 2.2x, #186).

To measure, run the opt-in sink report (it strands more than a careful human, so
trust a human playtest over the raw local strand count):

```
MEASURE_DIFF=standard npx playwright test travel-sink-measure --project=chromium
```

## 5. Update the hardcoded test coordinates

This is the step that bites. `npm run test:arc` runs ONLY the `full-arc` project,
so it does NOT cover the region-specific specs that hardcode coordinates:
`fenmarch-unlock.spec.ts`, `tidal-route.spec.ts`, `ford-route.spec.ts`, and the
per-region unit tests (`region-fenmarch.test.ts`, `region-saltreach.test.ts`).
When you change grid dimensions, settlement/crossing coordinates, spawn, or
gateway/signpost tiles, update those specs to match.

## 6. Run the full browser suite before pushing

```
npm run lint
npm test
npx playwright test --project=chromium
```

Run the full chromium e2e suite, not just `test:arc`. Coordinate drift shows up
in the region-specific specs, and if you only run the arc, CI is the first place
you will see it fail.

## 7. Land it

Follow the repo's one-PR-per-feature flow: branch, commit, push, open a PR with
`Closes #N`, arm squash auto-merge. Update the region file's header comment and
`docs/design/03_regions.md` if the layout or intent changed.
