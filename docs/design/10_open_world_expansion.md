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
5. Re-tune the travel sink against the new distances. DONE 2026-07-28, below.

## Slice 5: the calls (owner, 2026-07-28)

Slice 5 settled #436 and #412 together, because they are one question asked
twice: what a coin is worth against a skill point in the travel sink. Doing them
separately would have meant tuning twice.

Measured first, three ways. The arc run (`travel-sink-measure`, standard) reached
the capstone with **0 strands, 1319 coins in hand after buying every upgrade in
the game (640c)**, and a full wagon. A new static report
(`npm run measure:wear`) priced every home-to-settlement leg per build, which is
what the arc run cannot do: it plays one build.

### Early spend pressure lives in the hub (#436)

At `wearMultiplier` 1, a bare level-1 wagon could clear the whole Greybridge
region on its 25-point tank, worst leg 40 percent of it one way. Nothing had to
be bought, which is the hole #362 was opened against and #434 knowingly reopened.

**Greybridge goes to 1.8x.** Roads are roughness 0 and wear nothing at any
multiplier, so both roads out of the hub cost exactly what they did and this is
not the exit lock #434 removed wearing a different hat. The two off-road spurs
carry the pressure instead: Reedgrave 64 percent of the level-1 tank one way,
Mirewatch 23 percent. The courier who drives into the reeds on a bare wagon
cannot get back without repairing, and the Sprung Axle is what fixes that. The
wilds ask; no signpost refuses.

### The two currencies stop overlapping (#412)

Off-road's wear cut meant three skill points bought about 290 coins of relief
upgrades on top of 30 percent speed and both terrain crossings. **The wear cut is
gone; the crossings stay.** Relief upgrades get steeper to fill the gap (0.15 ->
0.25 per upgrade, floor 0.5 -> 0.35).

So points buy speed and access, coins buy durability. Total wear over every leg
in the world: all relief (290c) -75 percent, Off-road rank 3 (3 points) -32
percent, and Off-road rank 1 now exactly 0. Nothing shipped was removed: the
skill's own description never mentioned wear, `tidal-route.spec` and
`mire-route.spec` still pass unchanged, and no save needs migrating.

This was chosen over pricing ranks 2 and 3 at two points each, which would have
touched the skill panel and every save's point maths, and over taking the
crossings away, which would have closed a route for players who bought into it.

### What is not settled

The faucet. Ending an arc 1319 coins up is a reward-side question, not a sink-side
one, and repair price stays at 5c/pt so a playtest can attribute the change above.
If coins are still not scarce, that is the next single lever.

## Region four: the calls (owner, 2026-07-27)

Slice 4 above. Three questions were open; two are now answered and the third
stands.

### It closes a ring, it does not add a spoke

The world today is not the chain this note first described. Both Saltreach and
Fenmarch gateway only back to Greybridge (`region-system.ts`), so it is a hub
with two dead-end spokes, and every journey has exactly one route.

Region four attaches to **both spokes at once**, and to neither hub edge:

```
  Greybridge ------- Saltreach
      |                  |
      |                  |
   Fenmarch ------- Region 4
```

That is the smallest change that makes route choice real, because it is the
first time two ways to reach a place exist at all. The two ways are
deliberately unlike each other: the Saltreach approach is coastal and crosses
that region's tidal country, the Fenmarch approach is the rough one and carries
Fenmarch's 2.2x wear multiplier. Same destination, different cost, which is the
thing pillar 3 has been asking for.

A third spoke off Greybridge was the cheaper option and was rejected: it makes
the world wider without making a single decision harder, and it leaves the
multi-gateway capability unused for another region.

**Consequence to keep in view:** the two entrances are far apart on region
four's map, so which door the courier comes in by changes the journey inside it
as well as the journey to it. Placing both gateways on one edge would have
thrown that away.

### It is optional content inside the existing arc

The Blockade spine is closed: Greybridge sets it up, the two spokes reveal
method and cost, and a Greywater capstone resolves it (`missions.ts`). Region
four does **not** enter that spine. Nothing in `missions.ts` changes, so no
shipped, tested story can regress.

It is reachable during the arc and required by none of it. This makes it the
honest test the milestone wants: if optional content is not worth authoring,
that shows up here cheaply, before it is a decision applied to six regions.

### Its side content is all four kinds

Contracts, discoveries, story threads, and encounters, rather than picking one.
The point of slice 4 is to measure the authoring pipeline, and the pipeline is
four content systems, not one. Doing a thin version of each says more about
what scales than doing a thick version of one.

## Open questions

- Whether terrain gets generated with settlements hand-placed, once authoring
  becomes the bottleneck.
