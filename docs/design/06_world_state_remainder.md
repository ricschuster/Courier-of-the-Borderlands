# World-State Consequence: the M5.4 Remainder

Status: RESOLVED (2026-07-15). Extends
`docs/decisions/0004-rpg-and-narrative-layer.md` and the M5.4 section of
`docs/design/02_milestones.md`. Every item below is now dropped, shipped, or
closed as met; see "Build order once unblocked". Kept for the record and for the
reasoning, not as open work.

## Why this is deferred, not dropped

The shipped M5.4 slice (per-settlement world-state, visible reconnection,
arc-gated contracts, the Hidden Road thread) already tests the north star: does
reconnecting a place feel worth it? The two remaining consequences below are
about *tuning that feeling*, and tuning needs a real play signal. Building them
before the playtest risks setting numbers that feel wrong and reshaping the felt
critical path blind. So the plan is: play first (Session 2), then implement
against the observations.

## Item 1: Withdrawn contracts (DROPPED)

Dropped 2026-07-09. The mechanism was always playtest-gated (see "Open" below:
"If the playtest finds nothing that wants to disappear, this item is dropped, not
built"). The Session 5 full-arc playtest named no contract that wanted to
withdraw, and the owner judged the idea weak on its own terms: a job vanishing
off the board reads as "you missed it / it broke," not "the world moved on,"
especially under the spec's own assumption that it leaves quietly. The
"board reacts to history" goal is already carried by the shipped reward premium
(#86) and the new lateral routes that open on reconnection (#88). The proposed
shape below is kept for the record only; do not build it without a fresh design
decision and a specific contract that should disappear.

### Intent

Some work should stop making sense once the world moves on. A "get word out that
the bridge is down" job is pointless after the bridge is reconnected. Removing it
makes the board react to history, the mirror image of the arc contracts that
*appear* on reconnection.

### Proposed shape (small, mirrors the existing gate)

The board already gates *appearance* with `Contract.requires?: FlagCondition`
(`src/systems/contract-system.ts`). Withdrawal is the inverse: hide a contract
once a condition becomes true.

```ts
// src/systems/contract-system.ts
export interface Contract {
  // ...existing fields...
  readonly requires?: FlagCondition;   // appears once satisfied (built)
  readonly withdrawnWhen?: FlagCondition; // disappears once satisfied (new)
}

export function isContractAvailable(
  contract: Contract,
  completedIds: ReadonlySet<string>,
  flags: StoryFlags,
): boolean {
  return (
    !completedIds.has(contract.id) &&
    conditionMet(flags, contract.requires) &&
    !conditionMet(flags, contract.withdrawnWhen) // absent => never withdrawn
  );
}
```

`conditionMet(flags, undefined)` already returns true, so a contract with no
`withdrawnWhen` is never withdrawn. `contractsInPlay` and `baseContracts` need
the same withdrawal check so progress counts do not include a job the courier
can no longer take. This is a pure change: add the field, thread it through the
three predicates, unit test, and it is a no-op until content uses it.

### Open (Session 2 sets these)

- Which contract(s), if any, should withdraw, and on what flag. If the playtest
  finds nothing that wants to disappear, this item is dropped, not built.
- Whether a withdrawn contract needs any UI acknowledgement (a one-line journal
  note) or can just quietly leave the board. Assumption: quiet is fine for MVP.

## Item 2: Price and reward shifts on reconnection

### Intent

A reconnected place is safer and more grateful, so its standing routes should
pay differently than they did while it was silent. This keeps reconnection
paying off past the first delivery, the exact gap Session 1 flagged.

### Proposed shape (reuse the reward pipeline, do not add a new one)

Rewards already flow through a per-contract additive/bonus layer
(`applyRewardBonus`, `src/systems/contract-bonus.ts` for objective bonuses). The
cleanest addition is a pure multiplier derived from world-state, applied at the
same point rewards are computed, defaulting to `1.0` (no change):

```ts
// pure, world-state -> multiplier; 1.0 means "no shift"
export function reconnectionRewardMultiplier(
  contract: Contract,
  worldState: WorldState, // src/systems/world-state.ts
): number { /* 1.0 unless the destination is reconnected */ }
```

Applied to `contract.reward` at delivery, and reflected on the board so the
player sees the new figure. No save change (world-state is already derived).

### Resolved and built (Session 5 playtest)

Session 5 flagged that reconnecting stops paying off in the later regions and
chose "the world reacts" as the direction to invest in. Item 2 shipped with:

- **Direction: more.** A reconnected destination pays a premium, rewarding the
  arc and repeat work to a revived place.
- **Magnitude: +20 percent**, the proposed default (`RECONNECTED_REWARD_BONUS`
  in `src/systems/world-state.ts`).
- **Scope: any delivery** whose destination is already reconnected. World-state
  is read before the current contract is marked complete, so the delivery that
  first reconnects a place still pays the flat rate; only later work to it is
  boosted (this is where it fires most, since most places host one standing
  route). Surfaced on the board and in the delivery note; no save change.

## Build order once unblocked

1. ~~Withdrawn contracts (Item 1)~~: dropped 2026-07-09 (see Item 1 above).
2. Reward shift (Item 2): shipped Session 5 (#86).
3. ~~A mission step gated on an arc contract~~ (the "missions read and write
   world-state" bullet): closed as met, 2026-07-15 (#212). This step was
   conditional on the spine being confirmed in play first, and the 2026-07-15
   full-arc playtest (#211) confirmed it in the direction that removes the
   premise: the owner's read was that the world already feels reactive across a
   whole run. That is the outcome this direction existed to produce, so the
   remaining depth is scope without a problem behind it. Reopen only if a later
   playtest reports the story advancing on bare talk/deliver.

This document is closed. The north star it was written against ("does
reconnecting a place feel worth it?") now has a yes from human play.

## Non-goals

- No new save fields or migrations; all of this derives from existing
  world-state and completed-contract history.
- No new reward pipeline; extend the existing one.
- No scope beyond the two consequences above. Deeper settlement changes stay a
  milestones bullet until there is a reason and a design note.
