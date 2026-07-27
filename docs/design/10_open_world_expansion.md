# Open World Expansion: a longer arc, a web, and a soft gate

Status: DIRECTION SET (2026-07-27), owner calls in session. Opened against
playtest #428 and the 0.9.0 playtest. Extends `03_regions.md` and revises one
decision in `07_roads_gate_the_wagon.md` (see "Gate shortcuts, never access").

No map work starts until this note exists, per the scope rule in `CLAUDE.md`.

## The problem

A full critical path is about **5 minutes**. Measured, not estimated: the
`full-arc` spec drives it in 3.7 minutes, and the wear-on travel-sink run
completes 9 deliveries in 4.5 minutes.

The world today:

| Region | Grid | Tiles | Settlements | Contracts |
|---|---|---|---|---|
| Greybridge | 22x30 | 660 | 7 | 9 |
| Saltreach | 20x30 | 600 | 5 | 7 |
| Fenmarch | 22x32 | 704 | 5 | 7 |
| **Total** | | **1964** | **17** | **23** |

Three separate causes, with different fixes: few destinations, few contracts
(only 9 of 23 on the critical path), and short distances.

## The target

The owner's goal is a **2 hour or more** arc, with the shape of Gothic: a core
arc plus optional side work, in a world that rewards immersion. A flat 24x is
meaningless, so it decomposes as:

- **Core arc 40 to 50 minutes.** ~40 critical deliveries at ~65s each, against
  today's 9 at ~33s. Longer journeys as well as more of them.
- **Optional side work** roughly doubles that for a player who engages.
- **Story, exploration and getting lost** carry the rest.

In content: roughly 8 to 10 regions, each 1.5 to 2x current size, ~40 core
contracts plus ~40 optional. About 3x the regions, 3.5x the contracts, and 5 to
6x the map.

**Milestone first (owner call).** Do not build for 2 hours directly. The next
target is **25 to 30 minutes**, about 5x, treated as a test of three things:
whether a web topology makes route choice interesting rather than merely
longer; whether the soft gate reads as temptation; and whether the content
pipeline scales at all.

## Topology: a web, not a chain

The world is currently a chain: Greybridge <-> Saltreach <-> Fenmarch.
`Region.gateways` has always been a list, so a region can link to several
neighbours, and that capability has never been used.

Six regions in a chain is a longer corridor. Six in a branching web is a
different game, because route choice becomes real: two ways to reach a place,
with different terrain, length, and unlock cost. This serves pillar 3 (roads
are gameplay) and gives the fords and the Wayfinder ring something to be
chosen between.

Cheap to decide now, expensive to retrofit.

## Gating: the Gothic model

The owner's reference is Gothic, where the whole map is open from the start and
most of it simply kills you. The player sees somewhere attractive, tries it,
fails cheaply, and returns later able to survive it. The gate is a gradient, so
a bold or skilful player can slip through early, and that is the point.

**The courier equivalent already exists.** Wagon condition is the health bar,
terrain roughness is the monster, and stranding is the death. A level-1 courier
with a 25-point tank can push perhaps fifteen tiles into rough country before
it is over.

The work is not inventing a mechanic. It is removing four things that fight it.

### Gate shortcuts, never access

This is the principle, and it revises one decision in
`07_roads_gate_the_wagon.md`.

That note's thesis, that the wagon build should be a key, holds. But its
instances are not equivalent:

- **Terrain locks** (fords, mires, tidal flats) say "this crossing needs X, and
  without it you take the long way". That is a choice with a cost, and it keeps
  the Gothic shape.
- **Exit locks** say "you cannot leave". That is an invisible wall, and Gothic
  never uses one.

The Reinforced Wheels requirement to leave Greybridge (#407) is the only exit
lock in the game. **Owner call 2026-07-27: remove it.** Terrain locks stay.

The risk this carries: #407 existed because a player could otherwise finish
without spending coins, and the soft gate was not biting. Removing it only
works if the road out is genuinely punishing to an unequipped wagon. That must
be measured, not assumed, or this regresses #362.

### Failure must be cheap

The real defect in the analogy. A Gothic death costs about a minute. Stranding
costs a long crawl at 0.15x speed, so overreaching punishes curiosity instead
of teaching, and the player learns "never again" rather than "come back
stronger". Measured from the other side in #424: a profile that stranded often
turned a 4.5 minute arc into 8.4 minutes, almost entirely limping.

**The cost curve is also inverted.** The tow is a flat 50c: unaffordable
exactly when overreaching is most likely and most valuable (early), and trivial
later when nobody overreaches. **Owner call 2026-07-27: make failure cheap.**

### The far places must tempt

Gothic shows you the castle on the hill. Fog hides everything here, so there is
no "I want to go there" to act on.

The Wayfinder survey ring, which shows terrain beyond the fog, **is** that
mechanic. It is currently minimap-only and so subtle that the owner finished
the whole arc without noticing it existed (#425). At this scale that stops
being a small legibility fix and becomes load-bearing.

## What already supports this

- `region-invariants.test.ts` asserts over every authored region that spawn is
  passable, every settlement and gateway is reachable from home without
  unlocks, every contract has a real route, and each ford is strictly shorter
  than its detour. It uses the game's own BFS, so a pass means the route exists
  in play.
- The `region-map` skill front-loads the reachability and coordinate rules.
- Multi-gateway travel works and is unused.

The unguarded part is the hardcoded coordinates in the region specs, which bite
once per new region.

## Risks

- **Two hours of coloured tiles is two hours of coloured tiles.** At this scale
  the art (#427) and audio (#426) passes stop being polish and become
  load-bearing. Prove the loop is enjoyable at 30 minutes before committing.
- **Hand-authoring does not scale to 10 regions.** At 3 it is fine; at 10,
  editing string grids by hand is the bottleneck, and the answer is tooling: a
  generator or editor, and content validation beyond the invariants.
- **Removing the exit lock could regress the spend gate**, as above.

## Slices

1. Cheap failure: fix the inverted tow cost. Small, independent, unblocks the
   rest.
2. Remove the Greybridge exit lock, with a measurement showing the wilds gate
   it instead.
3. Make the survey ring legible (#425).
4. Region four as a deliberate test of the pipeline, in a web rather than a
   chain.
5. Re-tune the travel sink against the new distances.

## Open questions

- The exact web shape, and whether region four branches from Greybridge or
  Saltreach.
- Whether optional content should be contracts, discoveries, or story threads.
- Whether terrain gets generated with settlements hand-placed, once authoring
  becomes the bottleneck.
