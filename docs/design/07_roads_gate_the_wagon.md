# Roads Gate the Wagon: fixing the player-progression flatline

Status: proposal, owner-directed. Extends the M5.4 world-reacts work
(`docs/design/06_world_state_remainder.md`) and the progression pillars in
`CLAUDE.md`. Sliced so each step ships small and playtest-gated.

## The problem

A full autonomous playthrough reached the capstone while ignoring most of the
player-side progression:

- **Skills:** ~11 points earned by the endgame, ~10 needed to max all four. Every
  skill is a strictly-good buff (speed / reveal / reward / dialogue). No cost, no
  scarcity, so no choice.
- **Upgrades:** six upgrades, 500 coins to buy the lot. The run finished on 2563
  coins. All pure buffs, no opportunity cost.
- **Coins:** the only sink is those 500 coins of upgrades, while reward perks
  (reputation up to 1.5x, reconnection +20%, Negotiator) make coins pile up
  faster. The currency has nowhere to go.
- **Terrain slows but never stops.** `terrain.unlockId` + `isPassableWith` already
  support "impassable until you own X", but only the ford uses it.

Root cause: with no time pressure and no combat (both correctly out of MVP),
being faster / richer / seeing-further never changes whether you *succeed*. The
buffs have no constraint to relieve.

## The direction (owner calls, 2026-07-10)

1. **Roads gate the wagon (spine).** Make the wagon build a *key*. Some routes
   are locked behind a capability the build provides. This gives upgrades
   purpose, coins a real sink, and fords/routes genuine stakes. Serves the
   "Roads are gameplay" and "Exploration first" pillars.
2. **Skills as alternative keys.** A gated route is crossable by *either* an
   upgrade *or* a skill rank: coins vs skill points buying the same access. Reveal
   skills uncover shortcuts hidden in the fog. Skills join the same decision
   instead of being idle buffs.
3. **Tighten the economy** so an access upgrade is a genuine coin decision. This
   also revives the reward skill (Negotiator) and the reputation reward perks for
   free: once coins are scarce, earning more matters again.

### Non-negotiable design rule: gates open *better* routes, not the *only* route

A hard "cannot progress without upgrade X" would frustrate the player and would
soft-lock the full-arc e2e (the driver does not buy upgrades). So every gate must
leave the critical path open. A gate unlocks a **shortcut, a region corner, or a
premium contract** the base wagon cannot reach; the long way round still works.
The pull is desire ("I want that route / that contract"), not a wall.

Corollary: to keep the arc test meaningful as gates spread, the arc driver should
learn to spend coins on upgrades and points on skills (a later slice), so it
exercises the buy/rank flows a real player uses.

## The mechanic: capability keys

Generalize the single-`unlockId` terrain gate into a **capability** that more than
one source can grant.

- A gated terrain declares a required capability (reuse `terrain.unlockId` as the
  capability token to avoid churn).
- A pure `traversalKeys(unlocks, upgrades, skills)` returns the set of capability
  tokens the player currently holds: every unlock id, plus every capability
  granted by an owned upgrade or a skill at/above a rank.
- `isPassableWith(terrainId, keys)` is unchanged; callers pass `traversalKeys(...)`
  where they pass `state.unlocks` today (~6 call sites in `map-scene.ts`, all for
  pathfinding / passability).

Capability grants live in data, e.g.:

```ts
// capability -> the things that grant it
'mire-crossing': {
  upgrades: ['marsh-treads'],
  skills: [{ id: 'off-road', minRank: 2 }],
}
```

Terrain `deep-mire` requires `mire-crossing`; the base wagon is blocked, but
Marsh Treads (coins) or Off-road rank 2 (skill points) opens it, and a longer
passable route always exists.

Hidden routes reuse the existing fog + reveal radius: a shortcut tile that is only
*found* once reveal (Wayfinder skill / lantern upgrades) has uncovered it. This is
a discovery gate, separate from the passability gate above.

## Build order (slices)

1. **Capability-key passability (pure core).** SHIPPED (#95, gated shortcut and
   premium contract #97). `traversalKeys` + a capability grant map; the
   `map-scene` call sites wired; the Reedgrave deep-mire crossing that Marsh
   Treads opens, with the long route still open. Unit tests; arc e2e untouched.
2. **Skills as keys.** SHIPPED. Teamster was repurposed into Off-road: it keeps a
   per-rank speed bonus and, at rank 2, grants `mire-crossing`. The mire now opens
   for coins (Marsh Treads) or skill points (Off-road 2), the same route either
   way, so skills join the traversal decision instead of being idle buffs.
3. **Economy tightening.** Retune upgrade costs / reward flow so the first access
   upgrade is a genuine save-up decision. Numbers are playtest-gated; ship the
   levers as data, set them from a play signal.
4. **Arc driver spends.** Teach the arc e2e driver (and `autoplay.mjs`) to buy an
   affordable upgrade and rank a skill, so the buy/rank flows stay covered and
   harder gates become testable.
5. **Spread gates + hidden routes.** Once 1-4 feel right, add gated shortcuts and
   reveal-hidden routes across the other regions, and a premium contract or two
   behind a gate.

## Non-goals

- No time pressure, no combat (still out of MVP).
- No new currency; coins and skill points are the two levers.
- No hard walls on the critical path (see the design rule above).
