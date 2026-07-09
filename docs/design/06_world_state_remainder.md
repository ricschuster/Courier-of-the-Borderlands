# World-State Consequence: the M5.4 Remainder

Status: proposal, playtest-gated. Extends
`docs/decisions/0004-rpg-and-narrative-layer.md` and the M5.4 section of
`docs/design/02_milestones.md`. Nothing here is built yet; this spec exists so
the build is fast and small once Session 2 (`docs/design/05_playtest_notes.md`)
confirms the shape and supplies the numbers.

## Why this is deferred, not dropped

The shipped M5.4 slice (per-settlement world-state, visible reconnection,
arc-gated contracts, the Hidden Road thread) already tests the north star: does
reconnecting a place feel worth it? The two remaining consequences below are
about *tuning that feeling*, and tuning needs a real play signal. Building them
before the playtest risks setting numbers that feel wrong and reshaping the felt
critical path blind. So the plan is: play first (Session 2), then implement
against the observations.

## Item 1: Withdrawn contracts

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

### Open (Session 2 sets these)

- **Direction.** Does a reconnected place pay *more* (reward the arc) or *less*
  (routine work, push the player onward)? Plausibly more early to reward
  reconnecting, then the interesting content is the arc contracts, not the
  standing ones.
- **Magnitude.** Proposed default to test: **+20 percent** on standing contracts
  whose destination is reconnected. Small enough not to break the economy,
  visible enough to notice. Session 2 confirms or replaces this.
- **Scope.** All standing contracts to a reconnected place, or only some? Start
  with all; narrow only if it feels off.

## Build order once unblocked

1. Withdrawn contracts (Item 1): smallest, purely additive, no numbers needed
   beyond the content decision. Ship first if the playtest finds a withdrawal.
2. Reward shift (Item 2): implement the multiplier as a no-op, then set the
   number from the playtest, then surface it on the board.
3. Only after both feel right: consider a mission step gated on an arc contract
   (the "missions read and write world-state" bullet), since that reshapes the
   felt critical path and wants the spine confirmed in play first.

## Non-goals

- No new save fields or migrations; all of this derives from existing
  world-state and completed-contract history.
- No new reward pipeline; extend the existing one.
- No scope beyond the two consequences above. Deeper settlement changes stay a
  milestones bullet until there is a reason and a design note.
