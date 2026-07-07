# 0004: RPG and Narrative Layer

## Status

Accepted

## Context

The game has met its MVP and a first depth pass (three regions, contracts,
economy, reputation, upgrades, fog, weather, achievements). The project owner
wants to add RPG and narrative depth: character progression with experience and
skills, multi-step missions, and an overarching storyline.

This materially expands scope. `CLAUDE.md` explicitly states the game is "not a
full open-world RPG" and lists combat and time pressure as out of the MVP. This
ADR records the decision to grow past that line deliberately, and fixes the
shape of the new systems so they deepen the courier fantasy rather than drifting
into a different genre.

The guiding test for any addition: does it make the player care more about
**routes, places, and information**? If yes, it fits the pillars. If it only
adds stats and fights, it does not.

## Decision

Add a progression and narrative layer, with **world-state consequence as the
north star**: settlements react to the player's delivery history, so the world
visibly changes and story emerges from play rather than from scripting alone.
Missions, skills, and story all plug into that changing world.

**1. Three distinct progression axes.** Adding experience risks a third
"number go up" track on top of coins and reputation. To avoid bloat, each axis
means something different:

- **Coins to upgrades**: what the *wagon* has. Spendable gear (`upgrade-system.ts`).
- **Reputation**: how much the *world* trusts the courier. Per-settlement social
  capital that gates contracts and scales rewards (`reputation-perks.ts`).
- **Experience to skills**: who the *courier* is. Permanent, player-chosen
  identity.

**2. Skills unlock verbs, not just percentages.** Skills reuse the existing
effect pipeline (`speedMultiplier`, `revealRadius`, `terrainSpeedFactor`,
`applyRewardBonus`) so numeric bonuses are cheap to add, but the RPG feel comes
from skills that unlock new capabilities: crossing terrain otherwise punishing,
revealing map structure, carrying more than one contract, reading the secrets
carried, or opening negotiation options in dialogue. Experience is earned from
the existing loop (deliveries, distance, tiles revealed, first-visit
discoveries), not from combat.

**3. Missions are built on the contract primitive.** Contracts remain the
economic heartbeat (standard, repeatable deliveries). Missions are authored,
multi-step, branching chains with narrative and consequences, expressed as a
sequence of contract-like steps plus dialogue and choices. Missions reuse the
delivery state machine rather than replacing it.

**4. Dialogue is the shared foundation.** A branching NPC dialogue system with
story flags underpins missions, storyline delivery, road encounters, and the
social skills. It is built once and depended on by the rest.

**5. Storyline connects the regions into an arc.** The regions are currently
parallel spokes. A light main thread per region, delivered through journal
entries, NPC dialogue, and mission chains, gives them order and a reason,
resolving through key missions plus reputation and unlocking the next thread.

**6. Tension without combat.** Non-combat road encounters (washed-out crossings,
bandit tolls resolved by paying, fleeing, or reputation, stranded travellers,
weather closing a pass) provide danger and choice. Combat stays out.

**Build sequence** (small, self-contained systems first):

1. Courier experience and skill tree. Pure logic, reuses the effect pipeline,
   testable. First skill batch is the non-social verbs that need nothing else.
2. NPC and dialogue system (branching nodes plus story flags).
3. Mission system, built on contracts and dialogue; one mission chain per region
   as the story spine.
4. World-state consequences woven through missions.

Road encounters may land any time after step 2.

## Consequences

**Positive:**

- Progression stays legible: three axes with clear, separate meaning.
- Skills are cheap to add because the effect-application layer already exists and
  is unit tested; new bonuses feed the same functions.
- Missions reuse the contract state machine, so narrative content is largely a
  data and dialogue authoring effort, not an engine rewrite.
- World-state as the north star makes "deliveries drive progression" literal and
  makes the story emergent, reinforcing all five design pillars.
- Each step is independently shippable behind CI, matching the learning-first,
  small-systems approach.

**Negative:**

- This is a real scope expansion. The game grows toward RPG territory the
  original brief excluded; future decisions must keep checking additions against
  the courier-fantasy test above.
- Dialogue and missions introduce more UI and authored content than the pure
  systems built so far, and more save state (skills, story flags, world-state)
  to serialise and migrate.
- World-state consequence is the largest and riskiest system; it is sequenced
  last so missions and skills can prove out first.

**Explicitly still out of scope:** combat, a sim-heavy economy, and hard time
pressure. A light time or season system may be reconsidered in its own ADR
later, but is not part of this decision.

These tradeoffs are accepted. The layer is sequenced so the cheapest, most
self-contained system ships first and the most ambitious one ships last, keeping
the game runnable at every step.
