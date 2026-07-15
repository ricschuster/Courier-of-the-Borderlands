# Roads Gate the Wagon: fixing the player-progression flatline

Status: DELIVERED (2026-07-15), owner-directed. Extends the M5.4 world-reacts work
(`docs/design/06_world_state_remainder.md`) and the progression pillars in
`CLAUDE.md`. Sliced so each step ships small and playtest-gated.

Every slice has shipped, and the 2026-07-15 full-arc playtest (#211) confirmed
the direction worked: the owner's read was that player-side progression now has
teeth mid-to-late, finishing the capstone on **576 coins**. Compare the problem
statement below, which this document was opened against: that run finished on
**2563 idle coins** with zero upgrades fitted and unspent skill points. Two
independent human runs now land in the same place (576c here, ~601c on
2026-07-12, #109), so this is the economy holding rather than drifting.

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

A discovery gate reuses the existing fog + reveal radius: content that is only
*found* once reveal (Wayfinder skill / lantern upgrades) has uncovered it,
separate from the passability gate above. The pre-build pass (#111) reframed the
payoff from a hidden *shortcut* (rejected) to hidden *lore* (see slice 5b): the
same reveal-reward mechanic, but the reward is story rather than a route.

## Build order (slices)

1. **Capability-key passability (pure core).** SHIPPED (#95, gated shortcut and
   premium contract #97). `traversalKeys` + a capability grant map; the
   `map-scene` call sites wired; the Reedgrave deep-mire crossing that Marsh
   Treads opens, with the long route still open. Unit tests; arc e2e untouched.
2. **Skills as keys.** SHIPPED. Teamster was repurposed into Off-road: it keeps a
   per-rank speed bonus and, at rank 2, grants `mire-crossing`. The mire now opens
   for coins (Marsh Treads) or skill points (Off-road 2), the same route either
   way, so skills join the traversal decision instead of being idle buffs.
3. **Economy tightening.** SHIPPED, and the numbers are now VALIDATED rather than
   pending (#213, closed 2026-07-15). The levers shipped as data and the plan was
   to set them from a play signal. The signal arrived and said the current values
   are right: "decent balance", 576 coins at the capstone. The standing rule
   holds for any future change here: do not set a number blind, and reopen one
   only with a concrete wrong value from play, one clear lever per round with
   exact values.
4. **Arc driver spends.** SHIPPED. The full-arc e2e driver and `autoplay.mjs`
   now buy the cheapest affordable upgrade (B) and spend skill points at home
   (Off-road first, which opens the mire), so the buy/rank input flows are
   covered by the arc guard and gated content is reachable. The arc asserts it
   finished with an upgrade owned and Off-road ranked.
5. **Spread gates + hidden routes.** SHIPPED (both spokes). Add gated shortcuts and
   premium contracts across the other regions. Owner calls (2026-07-11): both
   Saltreach and Fenmarch get a gate, using a **new** capability rather than
   reusing `mire-crossing`.

   - New mechanic: capability `tidal-crossing`, granted by the **Salt Runners**
     upgrade (140 coins) OR **Off-road rank 3** (skill points), gating a new
     `tidal-flat` terrain. This escalates from the mire (Off-road 2 → tidal 3):
     the courier who caps Off-road crosses both, and Salt Runners is the coin
     path. One new coin sink that pays off in both wetland regions.
   - Level-design note: unlike Greybridge (Reedgrave sat behind a real mire
     wall), Saltreach and Fenmarch had no gate-able detour (verified with the
     pathfinder: a channel crossing saved zero tiles). So each gate is built as
     a **Reedgrave-style corner pocket**: a new premium locale walled by a
     lagoon, reached by the tidal shortcut OR a longer dry route, with a premium
     standing contract to it. The long way is always open, so the arc never
     soft-locks.
   - **Saltreach: SHIPPED.** Saltmere, a lagoon-ringed hamlet at (19,9), walled
     by a salt lagoon down column 18 with a single tidal-flat crossing at
     (18,9). Premium standing contract `saltreach-cipher-to-saltmere` (118
     coins). The tidal crossing saves ~6 tiles from Tidewatch and ~10 from
     Saltkeep; the dry way round (up to row 3, down column 19) stays open.
   - **Fenmarch: SHIPPED.** Fenholt, a drowned holt at (17,7), ringed by a fen
     mere that walls it north (row 6) and south (row 8) across columns 16-18,
     with a single tidal-flat crossing at (16,7). Premium standing contract
     `fenmarch-cipher-for-fenholt` (115 coins). The crossing saves ~4 tiles from
     Mossgate; the dry way round the east verge (column 19) stays open.

5b. **Reveal-rewarded discoveries (not hidden routes).** SHIPPED. Slice 5
   originally paired the passability gates with a *hidden shortcut* found only by
   a reveal upgrade. The pre-build design pass (#111) rejected that: an invisible
   shortcut fights the "desire a visible route" pull the whole roads-gate
   direction is built on, and reveal is a soft, path- and radius-dependent
   property that is far harder to keep the arc honest about than a passability
   `true`/`false`. Owner call (2026-07-13): reframe the discovery gate as
   **lore, not a route**.

   - A **wayside discovery** is a coordinate-anchored scrap of lore hidden in the
     fog (`src/systems/discovery.ts`, content in `src/data/discoveries.ts`). It is
     *found* the moment the courier's fog reveals its tile, so investing in reveal
     (Wayfinder skill, far-lantern upgrade) earns a non-buff payoff. It never
     touches the critical path, the economy, or passability, so it dodges both the
     arc-soft-lock and testability problems: the reward is story, serving the
     "Story through places" pillar and the Hidden Road / Cipher thread.
   - Fully **derived from fog**: a discovery is found iff its tile is revealed, and
     revealed fog is already saved per region, so there is no new save state
     (matching story-threads, missions, encounters). Found once via the
     newly-revealed set (no re-toast on reload); re-readable in the journal's
     "Wayside discoveries" section.
   - **Cipher** decodes a deeper `cipherNote` line per discovery, giving that story
     skill (#183) a concrete second surface without gating the base find.
   - Placement is off the direct routes in a quiet corner of each region
     (Greybridge NE forest 25,1; Saltreach north wood 16,1; Fenmarch west hills
     2,8), guarded by `discovery-invariants.test.ts` (base-passable, off any
     settlement, unique) the same way encounter tiles are.
   - Playtest-gated: whether reveal now feels worth investing in is the #109-class
     play signal this slice exists to answer.

## Non-goals

- No time pressure, no combat (still out of MVP).
- No new currency; coins and skill points are the two levers.
- No hard walls on the critical path (see the design rule above).
