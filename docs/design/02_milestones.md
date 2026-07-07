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
`docs/decisions/0004-rpg-and-narrative-layer.md`; the narrative spine that
M5.2 and M5.3 deliver is locked in `docs/design/04_storyline.md` (the
Blockade). Build order is smallest, most self-contained system first. Each
phase ships independently behind CI.

### M5.1: Courier experience and skills -- DONE

Pure progression logic that reuses the existing effect pipeline
(`speedMultiplier`, `revealRadius`, `applyRewardBonus`). Built to fix the
playtest's flatline finding: coins and reputation cap, so a non-capping
identity track keeps play rewarding.

- [x] Experience earned from the existing loop (deliveries, distance,
      first-visit discoveries); levels are pure and unit tested
      (`src/systems/experience.ts`). XP is *derived* from already-persisted
      stats, so no new XP save field is needed, mirroring the world-state slice.
- [x] Skill data model with ranks and per-skill effects feeding the shared
      pipeline (`src/systems/skills.ts`)
- [x] First skill batch (numeric effects, no new engine surface): Wayfinder
      (map reveal), Teamster (speed), Negotiator (delivery reward), each up to
      rank 3
- [x] Skill-point spend UI (K panel, number keys invest) and a level / skill
      point readout in the HUD
- [x] Chosen skill ranks persisted in the save (optional field, no version
      bump); level and points verified end to end in the browser playthrough

Deferred to a later batch: true "verb" skills that need engine work (crossing
otherwise-impassable terrain, carrying more than one contract, reading carried
secrets, and the social skills that depend on dialogue, M5.2).

### M5.2: NPC and dialogue system

Shared foundation for missions, storyline, road encounters, and social skills.
Authored against the locked spine in `docs/design/04_storyline.md`: the act
transitions there define the first story flags to model.

- [x] Branching dialogue node model with story flags (pure, testable)
      (`src/systems/dialogue.ts`): nodes, choices gated by flag conditions
      (allOf / noneOf), immutable flag application, and validation.
- [x] Dialogue UI at settlements: a bottom-centre dialogue box in MapHud,
      opened with E at a settlement that has an NPC, choices taken with number
      keys, Esc to step away; movement freezes while a conversation is open.
- [x] Story flags persisted in the save (optional `storyFlags` field, no
      version bump). The scene hands the engine the persisted flags plus flags
      derived from live world-state (for example the home region being
      reconnected), so a choice can gate on a real fact without storing it.
- [x] First conversation authored: the Greywater postmaster Act 1 setup
      (`src/data/dialogue-content.ts`), whose reveal unlocks only once the
      region is reconnected. Covered by unit tests plus a browser e2e
      (`tests/e2e/dialogue.spec.ts`).
- [x] Social skills hook dialogue options: a skill grants a derived
      `skill_<id>` flag while owned (`derivedSkillFlags`), and the scene folds
      those into the flags handed to dialogue, so a choice can gate on a skill.
      First social skill: Cipher (reading carried secrets), which unlocks a
      postmaster line about the unsigned letters (`tests/e2e/social-skill.spec.ts`).
- [x] More conversations across the regions and the spoke reveals: Tidewatch
      (Saltreach, the method) and Mossgate (Fenmarch, the cost), each gated on
      its region being reconnected (`src/data/dialogue-content.ts`).

### M5.3: Missions

Authored, multi-step, branching delivery chains built on the contract primitive.

- [x] Mission model as a sequence of steps whose completion is derived from
      contract completions, story flags, and visits (`src/systems/mission-system.ts`,
      pure and unit tested). No persisted mission state, matching world-state
      and experience.
- [x] Mission progress persisted: nothing new to persist. It is derived from
      the already-saved completed contracts, story flags, and visited ids.
- [x] One mission chain per region as the story spine, connecting the regions
      into an arc (`src/data/missions.ts`): Greybridge sets up, each spoke
      delivers one half (Saltreach the method, Fenmarch the cost, gated on the
      hub reveal), and a Greywater capstone resolves. The active mission step
      shows in the HUD objective and the journal Story section. See
      `docs/design/04_storyline.md`.
- [x] Non-combat road encounters: pure, data-driven encounters built on the
      dialogue engine (`src/systems/encounter-system.ts`, `src/data/encounters.ts`).
      An encounter fires when the courier reaches a trigger tile, opens the
      existing modal dialogue, and a choice applies a coin or reputation outcome.
      One-shot via resolution flags (the keys of its `outcomes` map), which are
      ordinary persisted story flags, so no new save field. First three: a
      stranded courier (Greybridge), a coast-road toll (Saltreach), and a
      washed-out causeway (Fenmarch). Unit tested plus a browser e2e
      (`tests/e2e/encounter.spec.ts`), with map-placement invariants
      (`tests/unit/encounter-invariants.test.ts`). A second batch adds one
      side-route encounter per region covering the remaining hazard types: a
      rockfall on the mine road (Greybridge), sea-fog on the cliff road
      (Saltreach), and a bogged fen-guide (Fenmarch).

### M5.4: World-state consequence (north star)

Settlements react to delivery history so the world visibly changes and story
emerges from play.

A first "Reconnection" slice shipped ahead of the ADR sequence, driven by the
playtest (`docs/design/05_playtest_notes.md`): the disengage moment was that
rewards flatline and deliveries stop mattering, which is exactly the stakes gap
world-state fills. This slice was the cheapest test of the fix.

Shipped:
- [x] Per-settlement world-state (`silent` / `reconnected` / `home`) derived
      purely from delivery history, no new save field or migration
      (`src/systems/world-state.ts`, unit tested)
- [x] Visible settlement change: main-map markers and minimap cells recolour
      when a delivery reconnects a place; verified end to end in the browser
      playthrough (`tests/e2e/playthrough.spec.ts`)
- [x] Spine payoff text per settlement, shown in the journal on reconnection
      (`src/data/reconnection-notes.ts`)
- [x] Journal upgraded to re-openable status board: re-readable active
      objective and per-settlement status, fixing the "popup vanished" and
      "forgot the lore" playtest complaints (`src/systems/journal.ts`)

Shipped (cont.):
- [x] Arc-driven contract availability: contracts can carry an optional
      `requires` story-flag gate (`src/systems/contract-system.ts`,
      `isContractAvailable` / `availableContracts` / `contractsInPlay`), so the
      board opens new work as the world reconnects. One gated contract per region
      appears after that region's reveal (`greybridge_reveal` /
      `saltreach_method` / `fenmarch_cost`), each carrying the hidden network's
      unsigned letters. Progress counts count only revealed contracts, so the
      board never shows one the courier cannot see, and `regionCleared` is
      decoupled to the standing (ungated) contracts so a new gated contract does
      not re-lock the arc's reveals. Unit tested plus a save-seeded browser e2e
      (`tests/e2e/gated-contract.spec.ts`).

- [x] Hidden Road journal thread: a cross-region story thread derived from the
      arc-gated contracts (`src/systems/story-threads.ts`, pure and unit tested),
      shown in the journal Story section once the courier has begun it (revealed
      or delivered one), so the arc contracts read as one through-line rather
      than loose extra work. Reads world-state (delivery history + flags); no HUD
      objective or balance impact; no save change.

Still to do:
- [ ] Further consequences: withdrawn contracts, price and reward shifts,
      deeper settlement changes (reward tuning is best set from a playtest)
- [ ] Missions proper read and write world-state (a mission step gated on an
      arc-gated contract, once the spine shape is confirmed by a playtest)
- [x] Progression that does not flatline: coin sink (more upgrades) plus the
      M5.1 experience and skill track
