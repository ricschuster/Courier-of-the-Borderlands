# 0009 - Decomposing MapScene

Status: accepted (2026-07-26). Implements #392 (slices #394, #396, #399, #401,
#402). Extends the pattern `DialogueController` established informally in #310.

## Context

`src/scenes/map-scene.ts` is the file every feature touches. It reached 2372 lines
and had grown past the 2326-line peak that prompted an earlier refactor wave, with
three consecutive handoffs noting the growth and none of them tracking it.

The first attempt at a plan (in #392's original description) proposed extracting
the fifteen `refresh*` methods as a unit. That framing was wrong, and finding out
why produced the rule this ADR exists to record: **most `refresh*` methods are
already thin adapters over pure builders in `src/systems/`.** Moving them together
would have needed a host interface with an accessor per statistic and would have
bought almost nothing, because the logic was already in a testable place.

A state-ownership survey of the file (every private field, every reader, every
writer) showed the real structure. Clusters that share a *name* are not clusters.
Clusters that share *state* are.

## Decision

### 1. Choose a slice by coupling, measured

For a candidate cluster, count the methods **outside** it that touch its fields.
That number, not the line count, predicts whether the extraction stays clean. The
measured table for this file is recorded in #392; the five slices taken all scored
0 to 2, and the clusters left unextracted score 5 to 13.

Two corollaries found the hard way:

- A group that feels conceptually whole can be two clusters bolted together. The
  "contract board and delivery" group scored 13 and contained a dependency cycle
  (`boardContracts -> effectiveFlags -> regionCleared -> baseContractCounts ->
  completed`). Split at the seam and the board half scored 2.
- Fields can be misfiled. `tilesSinceAccept` and `usedFordThisContract` read like
  contract state but are written by the movement loop and read only by
  `completeDelivery`.

### 2. Three extraction shapes, in the order to prefer them

1. **A pure module in `src/systems/`** when the logic needs no scene services.
   Best outcome available: the coverage gate measures `src/systems/**` and
   deliberately excludes scenes, so the rules get gated coverage, and there is no
   host interface at all. Used for the driving cue rules (#401), which take the
   frame's facts plus a memory value and return the cues to play plus the next
   memory.

2. **A controller that owns its state**, when a cluster's fields are private to it.
   The controller becomes the only writer, and the scene loses the fields
   entirely. Used for `MilestoneController` (five fields) and
   `BoardInputController` (two).

3. **A controller that writes through host setters**, when a cluster owns
   behaviour but not data. Used for `SpendController`: it drives skill ranks, the
   coin ledger, and the fitted upgrade set, but `skills` alone has fourteen
   readers, so those stay owned by the scene and are written back via
   `setSkills` / `applyPurchase`. This mirrors the existing
   `DialogueHost.setStoryFlags`. Group related writes into one host call
   (`applyPurchase` takes the fitted set and the remaining coins together) so a
   change cannot half-apply.

### 3. Keep the Phaser runtime out of controllers

**Phaser cannot be imported under the `node` test environment.** A module that
calls `Phaser.Input.Keyboard.JustDown` directly therefore cannot be unit tested at
all, which defeats the purpose of extracting it.

Take the key check through the host instead (`justDown(key): boolean`) and keep
Phaser as a type-only import. This costs one host member and is what made
`BoardInputController` and `SpendController` testable.

### 4. Prefer one snapshot to many accessors

Where a cluster's surfaces all derive from the same numbers, have the scene pass
one snapshot rather than an accessor per value. `MilestoneHost.runStats()` holds
`MilestoneHost` to eight members where fifteen accessors were the obvious
alternative, and it removed real duplication: `achievementStat()` and the
telemetry record had been reading the same eight fields separately.

### 5. Host members must read through closures

Two of the four controllers are constructed at the top of `create()`, because
`restoreState()` writes into them and it runs before the HUD exists. This works
only because every host member is a closure (`getHud: () => this.hud`). A member
that captured `this.hud` eagerly would be `undefined` at construction and fail at
runtime, not at compile time. This is load-bearing and unobvious.

## Consequences

- `map-scene.ts` went 2372 -> 1939 lines (18%) across five slices, and the unit
  suite went 1120 -> 1170, with the new tests concentrated on rules that had no
  coverage at all.
- **`create()` grows as the file shrinks.** The pattern moves roughly 150 lines of
  logic out and puts roughly 40 lines of wiring back. `create()` is now around 250
  lines and builds four host literals. Whether that wiring wants its own module is
  an open question, deliberately left open here; it is the most likely subject of
  the next ADR in this thread.
- Extractions must be verified by neutralizing, not by a green suite. Doing this
  found four paths where the entire suite stayed green with the code disabled (see
  ADR context in #392 and CLAUDE.md, Recurring traps). The consistent shape: **the
  file's surfaces were verified on the path that creates them and not on the path
  that reloads them.**

## Alternatives considered

- **Extract by name (`refresh*`, `handle*`).** Rejected after measuring: the
  `refresh*` group has no shared state and its logic already lives in
  `src/systems/`.
- **Move widely-read state into controllers anyway.** Rejected. `skills`,
  `state.ledger`, `activeContract`, and `completed` each have double-digit readers;
  moving them converts a large file into a large web of cross-controller calls.
- **One big decomposition.** Rejected in favour of small slices, each independently
  verified. Two of the five slices surfaced coverage holes that a single large
  change would very likely have buried.
