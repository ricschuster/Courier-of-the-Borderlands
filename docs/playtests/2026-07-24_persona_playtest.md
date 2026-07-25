# Persona playtest: 2026-07-24

Build: 0.6.0 + today's three merges (main @ 6cadff2), Standard difficulty, wear
ON, turbo 2x, real key presses through the `?e2e` bridge. Driver: throwaway
specs under `tests/e2e/persona-*.ts`, deleted after the run (per #328, which
retired the previous untracked harness; nothing new was left behind).

Seven players: four scripted arc personas (completionist, miser, wayfinder,
panel-hopper), four instrumented exploit probes, and a blind screenshot-only
session. Every scripted persona completed the full three-region arc to the
capstone. No crashes, no soft locks, no runtime errors in any run.

The subject was the three changes that landed today: the toast queue (#351), the
modal overlay freeze (#352), and the pocket reconnection notes (#353).

## Headline results

1. **The modal freeze is airtight and free.** The panel-hopper opened and closed
   a blocking overlay every third macro-step for a whole arc, roughly 100 times,
   checking after each that neither wear nor position moved. Zero leaks. Its
   economy came out identical to the completionist's (710 vs 709 coins, 14.0 vs
   13.8 wear per delivery, both 23 deliveries, both 0 strandings). #352 costs
   nothing and holds.
2. **NEW BUG (medium): the control hint lies while anything modal is open.**
   Both modal branches return before `refreshHint()`, so the hint line freezes
   with whatever it said before the panel or conversation opened. With the
   journal open it still reads "WASD/arrows drive", "R: full repair 2c", "Space:
   dismiss (1 more)", and "N: new game", and today's freeze made every one of
   those inert. For overlays this is a regression introduced by #352: before
   today those keys genuinely worked. Filed.
3. **NEW DESIGN CALL (low): rejection messages queue like narrative.** Every
   refused purchase ("Not enough coins for Reinforced Wheels (50).") and refused
   rank ("Cannot improve Wayfinder yet.") is a distinct string, so each queues
   and each costs its own press. A shop visit can raise seven. This is the one
   place the #351 queue's press-per-message cost bites. Filed.
4. **The queue costs ~2.4 presses per delivery in normal play.** Measured on
   every persona: 54 to 58 presses across 23 to 29 deliveries. Max observed
   queue depth after a delivery was 6, typical 2 to 3. The handoff's stated
   worry (three toasts on arrival) is real but small. The 8-deep maximum and the
   525-press totals on two personas are a **driver artifact**: the scripted
   player mashes all seven upgrade keys and four skill keys at every home visit,
   which no human does. The miser, which never opens the shop, needed 169
   presses for a longer arc.
5. **The economy still has teeth, and reproduces the 2026-07-16 solo controls.**
   Completionist repair tax 59% (was 56%), miser 100% (was 100%). The miser
   finishes the arc with zero voluntary spending, but pays 2.2x wall time (10.5
   vs 4.7 min, the same 2.2x the last run measured), 7 strandings, 550c in
   rescues, 30% more wear per delivery, and ends with 3 coins against the
   completionist's 709.
6. **Wayfinder is still economically dominated.** A build that puts every point
   into Wayfinder while buying every upgrade pays 43% more wear per delivery
   than the completionist (19.7 vs 13.8), strands once, and ends with 1 coin.
   #341's survey ring adds a visibility payoff this run cannot measure, but the
   economic verdict behind #324 is unchanged: Off-road is what pays.
7. **Every probed exploit stayed closed.** The reload tow is dead (the wagon
   resumes where it was left, backed by a 2s periodic autosave). Gateway travel
   with T is inert behind a panel and works again once closed. A queued toast
   now survives a conversation instead of being discarded. Ten presses of a
   repeated message still cost one press.

## Balance matrix

All rows: Standard, wear ON, turbo 2x, one browser at a time except where noted.

| persona | deliv | income* | repairs | rescue | upgrades | tax% | strand | wear/del | endcoins | lvl | min | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| completionist | 23 | 3304 | 1955 | 0 | 640 | 59 | 0 | 13.8 | 709 | 9 | 4.7 | capstone |
| panel-hopper | 23 | 3305 | 1955 | 0 | 640 | 59 | 0 | 14.0 | 710 | 9 | 4.5 | capstone |
| wayfinder | 24 | 3148 | 2407 | 100 | 640 | 80 | 1 | 19.7 | 1 | 9 | 5.8 | capstone |
| miser | 29 | 3148 | 2595 | 550 | 0 | 100 | 7 | 17.9 | 3 | 9 | 10.5 | capstone |

\* income is derived (spend + end coins), not measured. See "Instrumentation
faults" below.

## What each player established

- **Completionist**: the reference economy on the current build. All 7 upgrades
  (640c), Off-road/Wayfinder to 3, 0 strandings, min condition 15.8, 709c
  banked. The threshold-repair loop works.
- **Panel-hopper**: #352 holds under sustained abuse, at no economic cost. This
  is the strongest evidence in the run.
- **Wayfinder**: skipping Off-road for Wayfinder costs 43% more wear per
  delivery and the whole purse, even while buying every upgrade.
- **Miser**: no hard spend-gate exists (the arc completes with zero voluntary
  spending), but the penalty is severe and visible. Matches the owner's stated
  intent that spending must matter.
- **Exploit probes**: reload tow closed; travel gated correctly by the freeze;
  toast queue survives dialogue; duplicate suppression works in play.
- **Blind player**: the opening is legible. The premise toast explains the goal,
  one press clears it and the dismiss cue disappears with it, and the off-road
  wear lesson (#334) fires on the very first step off the road, which is exactly
  when it is wanted. The stale-hint bug (finding 2) was found here, from the
  screen alone.

## Instrumentation faults (declared)

Two of the driver's own counters were wrong, and are excluded from the matrix:

- `deliveries` counted `state.delivered`, which is per-region and resets on
  region change. The true count is the number of per-delivery samples (23 to
  29), which is what the matrix uses.
- `income` was only credited when a coin increase was observed in the same
  macro-step as a delivery, so it undercounted badly. The matrix derives income
  from spend plus end coins instead, and marks it.

Load conditions: the completionist ran with brief overlap from short probe runs;
miser and wayfinder ran two-up; panel-hopper ran alone. The 2026-07-16 run showed
concurrency inflates measured wear, so treat cross-persona wear differences as
directional. The repair-tax percentages landing within 3 points of that run's
solo controls suggests the distortion here was small.

## Not established

- Whether any of this **feels** right. These are scripted players and my reading
  of screenshots. The press-per-message cost, in particular, is the kind of
  thing only a human can judge as tedious or fine.
- Whether #341's survey ring makes Wayfinder worth taking. The run can measure
  fog and coins, not whether the ring helps a person plan a route.
- The three new pocket reconnection notes (#353) were not reached: they sit
  behind premium contracts with reputation gates that these personas did not
  prioritise.
