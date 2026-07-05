# Milestones

## M0: Walking skeleton -- DONE

Repo live, Phaser boots, and CI is green.

- [x] Git repo created and pushed to GitHub
- [x] Vite + TypeScript + Phaser 3 scaffold
- [x] BootScene hands off to MapScene
- [x] ESLint and Vitest configured
- [x] GitHub Actions CI: lint, typecheck, test, build all pass
- [x] Basic Phaser scene renders in the browser

## M1: Playable prototype -- DONE

Core delivery loop works end to end with placeholder art.

- [x] Data-driven tile map of the Greybridge Region (20x11 tiles, `src/data/greybridge-map.ts`)
- [x] Six terrain types with colour coding (`src/data/terrain-types.ts`)
- [x] Drivable courier wagon (arcade physics, arrow keys and WASD, `src/systems/movement.ts`)
- [x] Terrain speed modifiers: road and bridge fast, forest slow
- [x] Impassable water and mountain tiles (river only crossable at the bridge)
- [x] Fog-of-war: map starts hidden, reveals in a radius as you drive (`src/systems/fog-of-war.ts`)
- [x] Settlement data for Greybridge Region (`src/data/settlements-greybridge.ts`)
- [x] Pure contract state machine: accepted -> carrying -> delivered (`src/systems/contract-system.ts`)
- [x] Pickup and delivery trigger on arrival with on-screen feedback
- [x] Active objective line shown during a run
- [x] Unlockable ford shortcut: second river crossing, blocked until the courier reaches a signpost (`src/systems/game-state.ts`)

## M2: MVP -- IN PROGRESS

One full region, three contracts, currency and reputation, one vehicle upgrade, short story text, deployed to GitHub Pages.

- [x] Three delivery contracts with story flavour notes (`src/data/contracts-greybridge.ts`)
- [x] Pure economy system: coins and per-settlement reputation, immutable ledger (`src/systems/economy.ts`)
- [x] Reputation tiers (`src/data/reputation-tiers.ts`)
- [x] Unlockable ford shortcut (done in M1, counts here)
- [x] Vehicle upgrade system: pure logic for purchase and speed calculation (`src/systems/upgrade-system.ts`)
- [x] Reinforced Wheels upgrade defined in data (`src/data/upgrades-greybridge.ts`)
- [ ] Currency and reputation HUD visible during play
- [ ] Upgrade purchase UI at a settlement
- [ ] Additional NPC and delivery text to establish story tone
- [ ] GitHub Pages deployment

## Remaining for MVP

1. Wire economy rewards into the delivery completion flow so coins and reputation update on screen.
2. Add a HUD showing current coins and settlement reputation.
3. Add an upgrade shop at a settlement so the player can spend coins on Reinforced Wheels.
4. Add one or two short NPC lines at settlements to reinforce the courier premise.
5. Set up GitHub Pages deployment via GitHub Actions.

## M3: Second region -- IN PROGRESS

Extend the game beyond the Greybridge Region with a region abstraction, a second playable region, and persistent cross-region state.

- [ ] Region abstraction: typed `Region` record containing map, settlements, contracts, spawn tile, and gateway tile (`src/data/region-types.ts`)
- [ ] Region registry: keyed by id, looked up by MapScene on load (`src/data/region-registry.ts`)
- [ ] Saltreach region: new 20x11 map with its own settlements, contracts, spawn, and gateway (`src/data/saltreach-*.ts`)
- [ ] Gateway tile: road tile at map edge; pressing T while on it and not carrying cargo travels to the linked region
- [ ] Scene restart on travel: MapScene restarts with the new active region id; courier spawns at the destination region's spawn tile
- [ ] Travel restriction: blocked while carrying cargo; on-screen message explains why
- [ ] Per-region fog persistence: save stores explored tiles keyed by region id; fog is restored per region on load
- [ ] Save migration: older single-region saves promoted to greybridge-keyed fog record on load
