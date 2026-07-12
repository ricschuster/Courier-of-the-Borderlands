# 0005: Travel Sink (Wagon Condition)

## Status

Accepted (owner review 2026-07-11). See "Decisions (resolved)" below. Starting
numbers to be derived by an instrumented full-arc measurement, not guessed.

## Context / problem

The game currently has no pressure system. There is no time limit, no fuel, no
stamina, no repair, and no failure state. Nothing the player owns is ever spent
down by play, so nothing has to be earned back.

The concrete symptoms:

1. **Gold is nearly useless.** The only gold sink is one-time upgrades totalling
   640 gold. A full playthrough earns roughly 2,300 to 2,900 gold. A playtester
   finished with 2,275 gold unspent.
2. **Upgrades and skills are pure convenience.** Nothing in the game requires
   them, so the "relief" upgrades (Sprung Axle, Marsh Treads, Salt Runners) and
   the Off-road skill only make an easy trip slightly easier.
3. **Terrain only costs real-world seconds.** Rough terrain slows the wagon on
   screen but has no in-fiction cost, so route choice carries no stake beyond
   the player's patience.

This proposal adds exactly **one** pressure source, wagon condition, that both
gold and skills relieve. It deliberately absorbs the scope of GitHub issue #110
("economy tightening"): rather than only shaving payouts, we give gold a
recurring thing to buy. Design pillar 3 ("Roads are gameplay") becomes literal:
staying on the road preserves the wagon, cutting across the mire wears it.

## Proposed mechanic

All numbers below are **starting assumptions to tune in playtest**, not final
values. They are collected in one table at the end.

### 1. Wagon condition, with a capacity that grows with level

A single scalar (current condition), persisted in the save. Its ceiling is the
wagon's **max capacity**, which is not fixed at 100 but grows with the courier's
level (owner call, RPG-style): a fragile early game that you earn your way out
of, instead of a flat wear tax that nags forever.

- `maxCondition = min(100, startingMaxCondition + (level - 1) * growthPerLevel)`.
- Starting values: 25 at level 1, +9 per level, reaching the full 100 late in
  the three-region arc. (First tried 40; a second playtest cleared a whole
  region with no repair, so the starting tank was cut below a region's wear.)
- Level is already derived from play stats (deliveries, distance, discoveries),
  so capacity needs no new save state: only current condition is persisted, and
  it is clamped to the current max on load.
- Repair fills to the current max; a bigger tank costs more to fill, so repair
  cost scales with capacity for free.

### 2. Drains per tile travelled, scaled by terrain roughness

Wear is computed from the **existing** `speedModifier` data in
`src/data/terrain-types.ts`, so terrain that is slow is also hard on the wagon,
with no new per-terrain table to maintain.

Formula, applied once per tile of travel:

```
roughness      = max(0, 1 - speedModifier / MAX_SPEED_MODIFIER)   // RAW terrain
wearPerTile    = (BASE + WEAR_COEF * roughness) * wearReliefFactor * offRoadWearFactor
```

Where:

- `MAX_SPEED_MODIFIER = 1.4` (the road/bridge value, so roads normalise to
  roughness 0).
- `speedModifier` is the terrain's **raw** value (not relief-adjusted). Per the
  owner's decision 5, wear is deliberately computed off raw roughness so that
  upgrades soften wear through their own separate, weaker `wearReliefFactor`
  (point 4) rather than the full speed-relief. This preserves the sink's teeth
  on a maxed wagon.
- `BASE = 0.02` gives roads and bridges a bare trickle of wear so the sink is
  never fully avoidable. Set `BASE = 0` if roads should be completely free.
- `WEAR_COEF = 0.5` is the wear-at-maximum-roughness knob.
- `wearReliefFactor` comes from relief upgrades and `offRoadWearFactor` from the
  Off-road skill (both in point 4); both are floored so wear never reaches zero.

Wear per tile at `BASE = 0.02`, `WEAR_COEF = 0.5`, no upgrades, no Off-road
(`wearReliefFactor = offRoadWearFactor = 1`):

| Terrain | speedModifier | roughness | wear/tile |
| --- | --- | --- | --- |
| road, bridge | 1.4 | 0.00 | 0.02 |
| plains | 1.0 | 0.29 | 0.16 |
| hills | 0.75 | 0.46 | 0.25 |
| ford | 0.7 | 0.50 | 0.27 |
| forest | 0.55 | 0.61 | 0.32 |
| marsh | 0.45 | 0.68 | 0.36 |
| deep-mire | 0.4 | 0.71 | 0.38 |
| tidal-flat | 0.4 | 0.71 | 0.38 |

Reading: about 100 tiles of forest drains roughly a third of the wagon; the same
distance on the road costs almost nothing. That is the intended route tension.

### 3. Repaired at any settlement for gold (the recurring sink)

Repair is available at any settlement. Cost scales with missing condition:

```
repairCost = ceil((100 - condition) * COST_PER_PERCENT)
```

Starting assumption: `COST_PER_PERCENT = 2` gold, so a full 0 to 100 repair is
200 gold.

Justification against the ~2,300 to 2,900 earnable: the sink has to bite the
2,275 surplus without feeling punitive. At 2 gold per percent, a player who tops
up six to eight times across a playthrough spends roughly 1,200 to 1,600 gold on
repairs. Combined with modestly higher upgrade costs (point 6), that pulls the
end-of-run surplus down from ~2,275 to a few hundred, so upgrades become real
tradeoffs rather than guaranteed purchases. `COST_PER_PERCENT` is the primary
tuning knob and should be calibrated against **measured** tile counts per run in
playtest, because the surplus soaked depends on how far players actually drive.

### 4. Relief upgrades and the Off-road skill reduce the wear rate

This is what finally makes those purchases matter mid-run.

- **Relief upgrades** (`sprung-axle`, `marsh-treads`, `salt-runners`, each with
  `roughnessRelief: 0.5`) reduce wear through a **separate, weaker** factor than
  their speed relief (owner decision 5, for lasting teeth):
  `wearReliefFactor = max(WEAR_RELIEF_FLOOR, 1 - WEAR_RELIEF_PER_UPGRADE * reliefUpgradesOwned)`.
  Starting assumption: `WEAR_RELIEF_PER_UPGRADE = 0.15`, `WEAR_RELIEF_FLOOR = 0.5`.
  So a wagon with all three relief upgrades still wears at 55 percent of base
  (0.55, above the 0.5 floor), never near zero. The speed relief remains the
  full `terrainSpeedFactor()`; only wear uses this weaker curve.
- **Off-road skill** (`speedBonus` per rank today) gains a wear effect:
  `offRoadWearFactor = max(0.6, 1 - 0.1 * offRoadRank)`. Rank 3 cuts wear by 30
  percent. A small addition to the skill's existing per-rank effect.

Net effect: a fully invested wagon (all relief upgrades + Off-road rank 3) wears
at roughly `0.55 * 0.7 = 0.39` of base, a large but not total reduction, so
repairs still cost gold on every rough mile. The investment pays back without
buying the sink away.

### 5. At zero condition: soft penalty, not game-over

The project keeps its "no hard failure state" default. At 0 condition:

- **Limp speed.** Movement speed is multiplied by `LIMP_SPEED = 0.15` (a hard
  crawl, still drivable). The player can always limp to the nearest settlement
  for free and repair there. The crawl is deliberately steep: wear floors at 0
  and repair cost caps at `max * rate`, so a gentle limp (first tried at 0.35)
  let a playtester live stranded and pay a fixed, known price at leisure. The
  steep limp closes that exploit, making a dry wagon a problem you fix.
- **Paid rescue (optional convenience).** Instead of limping, the player may pay
  `RESCUE_COST = 50` gold to be returned to the last visited settlement
  immediately. Rescue does not itself repair the wagon; the player still pays to
  repair on arrival. Rescue only buys back the tedious limp, so it is a setback,
  not a wall.

This keeps the loop forgiving in spirit (you never lose a run) while giving the
first real stakes: a badly planned route across the fen leaves you crawling.

### 6. Rebalanced payout and cost curve

Direction only, to be finalised with the numbers above rather than
over-specified here. Let the **repair sink do most of the absorbing** so
payouts stay motivating. Alongside that:

- Raise upgrade costs modestly (they are now load-bearing, not optional).
- Trim only the most inflated contract payouts if measurement shows the surplus
  is still too large after repairs.

This is the concrete resolution of issue #110.

## Why this over alternatives

- **Versus rebalance-only (just lowering payouts, issue #110 as first framed):**
  Cutting gold income makes the game slower but still gives gold nothing to do.
  A sink gives gold a purpose and makes skills and upgrades matter, which the
  rebalance alone does not.
- **Versus time pressure (a delivery clock or deadlines):** rejected because it
  changes an MVP default. `CLAUDE.md` and ADR 0004 both list hard time pressure
  as explicitly out of scope. A travel sink adds stakes without a clock and
  reuses systems already built.

## Integration points

Verified to exist in the current tree:

- **Terrain wear source:** `src/data/terrain-types.ts` (`speedModifier` per
  terrain; no data change needed, only read).
- **Travel loop and per-tile wear application:** `src/scenes/map-scene.ts` and
  `src/systems/movement.ts` (movement already produces per-tile travel; wear
  hooks in where `distanceTiles` is incremented).
- **New pure module:** `src/systems/wagon-condition.ts` for the wear, repair,
  relief, and zero-condition calculations, keeping logic out of the scene and
  unit testable (consistent with ADR 0001).
- **Gold / repair transaction:** `src/systems/economy.ts` (`addCoins` for
  repair and rescue charges).
- **Relief upgrades:** `src/systems/upgrade-system.ts` (`terrainSpeedFactor`,
  reused) plus data in `src/data/upgrades-greybridge.ts` (no new field).
- **Off-road wear relief:** `src/systems/skills.ts` (add a per-rank wear effect
  to the existing `off-road` skill).
- **Save format:** `src/systems/save-system.ts`. Add `wagonCondition: number`
  to `GameSnapshot`. This is **additive**, so the field parser defaults an
  absent value to 100 (a returning player's wagon loads full) and no
  `MIGRATIONS` step is needed. The `MIGRATIONS` ladder remains the seam if a
  future change is non-additive.
- **HUD condition bar:** `src/scenes/map-hud.ts` (a condition bar alongside the
  existing HUD elements).
- **Run state holder:** `src/systems/game-state.ts` (condition is scene-owned
  run state like `distanceTiles`; add to `GameState` only if the scene wiring
  makes that cleaner).

## New tests needed (pure logic)

- `wearPerTile` calculation across the terrain table, including road (near
  zero) and mire (high) endpoints and the `roughness` clamp.
- Relief: `effectiveMod` raising with each relief upgrade reduces wear; the
  `offRoadWearFactor` clamp at rank 0 and rank 3.
- `repairCost` calculation: full repair, partial repair, already-full (cost 0),
  and rounding.
- Zero-condition handling: limp-speed multiplier applied only at 0; rescue
  charge and destination; condition clamped to the 0 to 100 range.
- Save round-trip: `wagonCondition` serialises, and an old save with no field
  loads at 100.

## Decisions needed

The owner should approve or change each of these:

1. **Framing / name.** "Condition" (proposed) versus "supply" or "upkeep". This
   sets the fiction: mechanical wear versus consumable stores. Affects UI text
   only.
2. **Zero-condition penalty specifics.** Limp-speed value, whether rescue exists
   at all, `RESCUE_COST`, and whether rescue restores any condition.
3. **Repair trigger.** Manual at a settlement (proposed) versus automatic on
   arrival. Manual keeps the spend a visible choice; automatic is frictionless
   but hides the sink.
4. **Starting numbers.** Every value in the table below, especially
   `COST_PER_PERCENT`, which decides how hard the sink bites.
5. **How much relief upgrades cancel wear (important).** As written, wear reads
   off `effectiveMod` after relief, and the three relief upgrades already sum to
   full relief (clamped to 1.0). So a fully-treaded wagon would see near-zero
   wear on every terrain, which buys the sink away entirely and reproduces the
   "upgrades erase friction" problem, just later in the run. Options: (a) apply
   only a fraction of the speed-relief to wear (a separate, weaker `wearRelief`
   coefficient) so upgrades soften but never eliminate wear; (b) cap total wear
   relief below 100 percent; (c) accept full cancellation as an intended
   end-state reward. Recommendation: (a), so gold-for-repair still matters even
   on a maxed wagon. This is the key call that decides whether the sink has
   lasting teeth.

## Decisions (resolved)

Owner review, 2026-07-11:

1. **Framing:** condition (mechanical wear / repair). As proposed.
2. **Zero-condition penalty:** paid rescue is in; limp speed strengthened to
   0.15x after a playtest showed a gentle 0.35x limp let a player live stranded
   and exploit the capped repair cost. See point 5.
3. **Repair trigger:** manual at a settlement (a visible spend), not automatic.
4. **Starting numbers:** not set by hand. Derive `COST_PER_PERCENT` (and sanity
   check the wear constants) from an instrumented full-arc run that measures real
   tiles-by-terrain, then report the recommended values. Target: pull the
   end-of-run surplus down from ~2,275 to a few hundred gold so upgrades are real
   tradeoffs.
5. **Relief vs wear:** separate, weaker `wearReliefFactor` with a floor (see
   point 4), so a maxed wagon still pays repairs. Lasting teeth.
6. **Growing capacity (added after the first playtest):** a fixed 100-point tank
   left region 1 too forgiving (a whole region cleared without a single repair,
   ending at 41%). Instead the max capacity starts small and grows with level
   (see point 1), so the early game is genuinely fragile and progression eases it.
   Growth source: courier level (automatic), not a bought upgrade. Starting
   fragility: 25 of 100 (first tried 40, but a second playtest still cleared a
   whole region without a repair, so the tank was cut below a region's wear).
   Repair cost is now shown on the HUD whenever the wagon is damaged.

## Measurement (2026-07-11)

Derived from an instrumented full-arc run (the e2e now exposes cumulative wear
and the driver repairs at home). Findings:

- At the original constants (`BASE` 0.02, `WEAR_COEF` 0.5) a whole three-region
  arc wore only ~52 condition points, because the map is small and
  road-connected, so most travel is on wear-free road. That is far too light to
  matter: ~100 gold soaked at `COST_PER_PERCENT` 2.
- Raising wear 3x (`BASE` 0.06, `WEAR_COEF` 1.5) took arc wear to ~170 points for
  a fully upgraded driver taking efficient road routes. With repair at 5
  gold/percent that soaked ~650 gold, dropping the arc-end surplus from ~2,560 to
  ~1,910 while the driver still afforded every upgrade.
- These are the fully-upgraded, road-efficient floor. A player with fewer relief
  upgrades wears up to ~2.6x more, and one who takes the rough shortcuts wears
  more still, so the realistic soak is ~650 (maxed wagon) up to ~1,700 (early or
  unupgraded). That is the intended range: enough to make gold and upgrades
  matter, not enough to wall progress.

These are the shipped starting values. Final feel remains playtest-gated: whether
a rough leg costs the right amount, and whether repair reads as a decision rather
than a tax, needs a human run.

## Difficulty

Every difficulty-tunable knob (wear rates, relief and Off-road floors, repair
price, rescue cost, limp speed) lives in a `WagonTuning` profile rather than a
bare constant, and the pure functions take a profile argument (defaulting to
standard). `WAGON_TUNING` ships three presets (`relaxed`, `standard`,
`demanding`) that scale wear and repair price; the scene holds one profile in a
single field.

The player-facing selector (#135) is wired to that seam: the **G** key cycles
the preset, the choice persists under its own `localStorage` key (a durable
preference, not save state, so it survives a New Game), and it applies live by
swapping the scene profile and clamping current condition to the new max. No
gameplay code changes, only the choice of profile. The off-standard presets are
illustrative starting points, not yet balanced by playtest.

## Risks

- **Scope creep.** This adds a pressure axis the original brief avoided. It is
  kept to a single scalar with no new subsystems to hold the line.
- **Save-format change.** Additive and defaulted, so low risk, but it is still a
  schema touch that must be covered by a round-trip test.
- **Chore risk.** Repair could feel like a tax rather than a decision. Mitigated
  by making roads nearly free (so good routing avoids most wear) and repair a
  one-tap settlement action.
- **Tuning blind.** All numbers are guesses until we measure real per-run tile
  counts. The formula is designed so a single coefficient (`COST_PER_PERCENT`)
  moves the economy, making calibration cheap once playtest data exists. This
  work is **playtest-gated**.

## Starting assumptions (to tune)

| Name | Proposed value | Role |
| --- | --- | --- |
| `MAX_SPEED_MODIFIER` | 1.4 | Normalises roads to roughness 0 |
| `BASE` | 0.06 | Baseline wear per tile, even on roads |
| `WEAR_COEF` | 1.5 | Wear per tile at maximum roughness |
| `offRoadWearFactor` per Off-road rank | 1 - 0.10 x rank (floor 0.6) | Skill reduces wear |
| `WEAR_RELIEF_PER_UPGRADE` | 0.15 | Wear cut per relief upgrade owned |
| `WEAR_RELIEF_FLOOR` | 0.5 | Minimum wear multiplier from upgrades |
| `COST_PER_PERCENT` | 5 gold | Repair cost per missing percent (primary knob) |
| Full repair (0 to 100) | 500 gold | Derived from `COST_PER_PERCENT` |
| `LIMP_SPEED` | 0.15x | Movement multiplier at 0 condition (steep, anti-exploit) |
| `RESCUE_COST` | 50 gold | Optional teleport to last settlement |
| `startingMaxCondition` | 25 | Tank capacity at level 1 (fragile early game) |
| `maxConditionGrowthPerLevel` | 9 | Capacity added per level, capped at 100 |
| Starting condition | level-1 max (25) | New game; legacy load clamps to current max |

## Consequences (if accepted)

**Positive:**

- Gold, upgrades, and skills all gain a purpose that scales with play.
- "Roads are gameplay" becomes a real economic choice, not just a speed
  preference.
- Reuses existing systems (`terrainSpeedFactor`, the effect pipeline, the save
  ladder) rather than adding new machinery.

**Negative:**

- A new pressure axis the brief originally excluded; must be watched so it does
  not creep toward simulation.
- Introduces a save field and a tuning burden that only playtest can resolve.

These tradeoffs are put forward for the owner's call. No code will be written
until the decisions above are settled.
