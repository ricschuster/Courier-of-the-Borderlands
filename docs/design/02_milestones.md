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

## M2: MVP -- DONE

One full region, three contracts, currency and reputation, one vehicle upgrade, short story text, deployed to GitHub Pages.

- [x] Three delivery contracts with story flavour notes (`src/data/contracts-greybridge.ts`)
- [x] Pure economy system: coins and per-settlement reputation, immutable ledger (`src/systems/economy.ts`)
- [x] Reputation tiers (`src/data/reputation-tiers.ts`)
- [x] Unlockable ford shortcut (done in M1, counts here)
- [x] Vehicle upgrade system: pure logic for purchase and speed calculation (`src/systems/upgrade-system.ts`)
- [x] Reinforced Wheels upgrade defined in data (`src/data/upgrades-greybridge.ts`)
- [x] Currency and reputation HUD visible during play (wallet and ford status lines in `src/scenes/map-scene.ts`)
- [x] Upgrade purchase UI at a settlement (press B in the home town to buy)
- [x] Additional NPC and delivery text to establish story tone (contract notes, settlement notes, weather flavour)
- [x] GitHub Pages deployment (live at https://ricschuster.github.io/Courier-of-the-Borderlands/)

The MVP definition of done in `CLAUDE.md` is met: the game opens in a browser,
starts in Greybridge, accepts a contract, drives across terrain and fog to a
destination, completes a delivery, shows rewards, and unlocks a route or
upgrade, with in-game text establishing the courier premise.

## M3: Second region -- DONE

Extend the game beyond the Greybridge Region with a region abstraction, a second
playable region, and persistent cross-region state. Note: the region abstraction
landed in `src/systems/region-system.ts` (not the `src/data/region-types.ts` /
`region-registry.ts` guessed here originally), and region content lives in
`src/data/region-saltreach.ts`.

- [x] Region abstraction: typed `Region` record containing map, settlements, contracts, spawn tile, and gateway list (`src/systems/region-system.ts`)
- [x] Region registry: keyed by id, looked up by MapScene on load (`REGIONS` in `src/systems/region-system.ts`)
- [x] Saltreach region: new 20x11 map with its own settlements, contracts, spawn, and gateway (`src/data/region-saltreach.ts`)
- [x] Gateway tile: road tile at map edge; pressing T while on it and not carrying cargo travels to the linked region
- [x] Scene restart on travel: MapScene restarts with the new active region id; courier spawns at the destination region's spawn tile
- [x] Travel restriction: blocked while carrying cargo; on-screen message explains why
- [x] Per-region fog persistence: save stores explored tiles keyed by region id; fog is restored per region on load
- [x] Save migration: older single-region saves promoted to greybridge-keyed fog record on load

## M4: Depth and hardening -- IN PROGRESS

Content and systems added beyond the original MVP and second-region plan.

Shipped:
- [x] Third region Fenmarch, reached through Saltreach (`src/data/region-fenmarch.ts`)
- [x] Multi-gateway travel: `Region.gateways` is a list, so a region can link to several neighbours (world is a chain: Greybridge <-> Saltreach <-> Fenmarch)
- [x] Per-region ford unlock: each region owns its own ford terrain and unlock id, now exercised in Greybridge, Saltreach, and Fenmarch (`ford-greybridge`, `ford-saltreach`, `ford-fenmarch`)
- [x] Cargo types with pay modifiers, set on every region's contracts including Fenmarch: letters, goods, rumours, secrets (`src/systems/cargo-types.ts`)
- [x] Per-region contract board header (uses each region's home settlement name)
- [x] Contract bonus objectives (`src/systems/contract-bonus.ts`)
- [x] Ambient weather affecting movement (`src/systems/weather.ts`)
- [x] Achievements and courier titles (`src/systems/achievements.ts`)
- [x] Journal, minimap, and map legend overlays (`src/systems/journal.ts`, `minimap.ts`, `legend.ts`)
- [x] Reputation perks scaling rewards (`src/systems/reputation-perks.ts`)
- [x] Pathfinding-assisted route hints (`src/systems/pathfinding.ts`)
- [x] Input-driven e2e playthrough: real key presses drive a full delivery loop and a route unlock, gated behind a `?e2e` debug hook (`tests/e2e/playthrough.spec.ts`)
- [x] Smoke tests booting each region from a save (Greybridge, Saltreach, Fenmarch) (`tests/e2e/smoke.spec.ts`)
- [x] Camera follow: maps larger than the viewport scroll to follow the courier; maps that fit stay static and centred. HUD is pinned with `setScrollFactor(0)` and the minimap cell shrinks to a bounded box on large maps. Unblocks authoring maps bigger than the screen (`setupCamera` in `src/scenes/map-scene.ts`)
- [x] Seeded PRNG (`src/systems/rng.ts`): pure deterministic generator (`next`/`nextInt`/`pick`); weather selection routed through it via `pickWeather`, removing the last `Math.random()` from `src/`
- [x] Region invariant tests (`tests/unit/region-invariants.test.ts`): assert over every authored region that the spawn is passable, every settlement and gateway is reachable from home without unlocks, every contract has real endpoints with an existing pickup -> destination route, and each ford opens a crossing strictly shorter than its detour. Uses the game's own BFS so a pass means the route exists in play

Not yet started (see `docs/handoffs/2026-07-05_Handoff_v03.md` for the live backlog):
- Vehicle upgrade purchase covered by the e2e playthrough
- Audio and juice (needs asset and licensing decisions)
- Art pass beyond grey-box

## M5: RPG and narrative layer -- PLANNED

Add character progression, missions, and storyline, with world-state
consequence as the north star. Scope and shape are recorded in
`docs/decisions/0004-rpg-and-narrative-layer.md`. Build order is smallest,
most self-contained system first. Each phase ships independently behind CI.

### M5.1: Courier experience and skills

Pure progression logic that reuses the existing effect pipeline
(`speedMultiplier`, `revealRadius`, `terrainSpeedFactor`, `applyRewardBonus`).

- [ ] Experience earned from the existing loop (deliveries, distance, tiles
      revealed, first-visit discoveries); levels are pure and unit tested
- [ ] Skill data model and a per-skill effect that feeds the shared pipeline
- [ ] First skill batch: non-social verbs that need nothing else (for example
      terrain access, map reveal, carrying more than one contract)
- [ ] Skill-point spend UI and experience/level HUD
- [ ] Skills and levels persisted in the save with a migration

### M5.2: NPC and dialogue system

Shared foundation for missions, storyline, road encounters, and social skills.

- [ ] Branching dialogue node model with story flags (pure, testable)
- [ ] Dialogue UI at settlements and events
- [ ] Story flags persisted in the save
- [ ] Social skills (for example negotiation, reading carried secrets) hook
      dialogue options

### M5.3: Missions

Authored, multi-step, branching delivery chains built on the contract primitive.

- [ ] Mission model as a sequence of contract-like steps plus dialogue and choices
- [ ] Mission state and progress persisted in the save
- [ ] One mission chain per region as the story spine, connecting the regions
      into an arc
- [ ] Non-combat road encounters (may land here or earlier, after M5.2)

### M5.4: World-state consequence (north star)

Settlements react to delivery history so the world visibly changes and story
emerges from play.

- [ ] Per-settlement world-state driven by delivery history
- [ ] Consequences: new or withdrawn contracts, price and reward shifts, visible
      settlement changes
- [ ] Missions and skills read and write world-state
- [ ] World-state persisted in the save with a migration
