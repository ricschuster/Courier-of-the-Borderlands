# Deep persona playtest: 10 automated players, 2026-07-16

Build: 0.4.0 (main @ 7398271), standard difficulty, wear ON, real key presses
through the `?e2e` bridge (turbo 2x; wear is distance-based so turbo does not
change economics). Harness: `tmp-personas/` (untracked; see draft issue 14).

Ten players ran: 8 scripted policy personas (completionist, miser, speedrunner,
careless, and four single-skill builds), a live exploit hunter (9 hypotheses,
7 live experiments), and a blind screenshot-only player with no oracle and no
source access. All 8 scripted personas independently completed the full
three-region arc to the capstone, 21-23 deliveries each, no crashes, no soft
locks, no runtime errors in any run.

## Headline results

1. CONFIRMED EXPLOIT (high): page reload is a free instant tow home; the save
   does not persist courier position. Found independently by the exploit
   hunter (instrumented) and the blind player (screen only), re-confirmed from
   the saved repro after the workflow. Undermines the limp/rescue economy the
   owner deliberately built. Draft issue 1.
2. CONFIRMED BUG (code level, medium): board digit input is not gated on the
   summary/capstone panels; invisible contract accepts are possible. Same
   class as fixed #292. Draft issue 2.
3. HARNESS ARTIFACT CAUGHT: the workflow's unanimous "every persona ends broke
   at ~100% repair tax with 15-22 strandings" was ~2x inflated by CPU
   starvation (6 concurrent browsers). Solo controls on an idle machine are
   the real economy (matrix below). Relative persona comparisons remain valid;
   absolute affordability/stranding claims from the loaded runs do not.
4. REAL ECONOMY (solo controls): the diligent player pays a 56% repair tax,
   affords everything, banks 889c, never strands. The no-spend miser also
   finishes, but at a 100% repair tax, 10 strandings, 46% more wear per
   delivery (no relief upgrades or Off-road), 4 coins to its name, and 2.2x
   the wall time. Teeth that bite without breaking, and spending visibly
   matters: this is the differentiation the owner asked for, working.
5. ONBOARDING CLIFF (blind run): first delivery is excellently taught by the
   contextual legend; the second contract is a wall (fog-hidden pass, flipping
   one-word compass, untaught off-road wear) that burned the whole wagon and
   purse. Draft issues 3-7, 12-13.
6. CLOSED EXPLOITS VERIFIED CLOSED (with numbers): live-at-zero (6.3x measured
   time tax), tow-as-fast-travel (strictly dominated), rescue-while-carrying
   (no desync), repair math edges (integer ledger, honest partials), encounter
   save-scum (atomic resolution save), menu cross-talk/double-buy (#292 guard
   holds), e2e switches inert without ?e2e, gateway double-T. The owner's
   past closures all held.

## Balance matrix

Loaded rows are relative-only evidence; SOLO rows are the real magnitudes.

| persona | deliv | income | repairs | rescue | upgrades | tax% | strand | wear/d | endcoins | lvl | min | status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| completionist | 22 | 3566 | 3545 | 50 | 50 | 101 | 19 | 33.4 | 0 | 12 | 20.6 | capstone |
| miser | 23 | 3183 | 3170 | 0 | 0 | 100 | 20 | 28.7 | 4 | 11 | 21.8 | capstone |
| speedrunner | 23 | 3163 | 3065 | 50 | 50 | 98 | 17 | 27.7 | 2 | 11 | 19.4 | capstone |
| careless | 23 | 3185 | 3085 | 0 | 90 | 97 | 22 | 27.9 | 1 | 11 | 22.3 | capstone |
| build-wayfinder | 23 | 3163 | 3125 | 0 | 40 | 99 | 19 | 28.3 | 4 | 11 | 22.7 | capstone |
| build-offroad | 23 | 3188 | 3128 | 0 | 60 | 98 | 15 | 28.3 | 2 | 12 | 18.5 | capstone |
| build-negotiator | 21 | 3867 | 3975 | 50 | 50 | 104 | 19 | 39.1 | 4 | 11 | 19.9 | capstone |
| build-cipher | 22 | 3124 | 3085 | 50 | 50 | 100 | 20 | 29.2 | 4 | 11 | 21.8 | capstone |
| completionist SOLO | 23 | 3416 | 1898 | 0 | 640 | 56 | 0 | 15.4 | 889 | 10 | 3.7 | capstone |
| miser SOLO | 23 | 3208 | 3215 | 0 | 0 | 100 | 10 | 28.5 | 4 | 10 | 8.1 | capstone |

tax% = (repairs+rescue)/income. wear/d = condition points worn per delivery.
min = wall minutes at turbo 2x under the run's load conditions.

## What each persona established

- **Completionist (solo control)**: reference economy. 56% repair tax, all 7
  upgrades (640c) purchased, threshold repairs work (9 repairs, 0 strandings),
  889c banked at capstone. Arc floor at turbo on an idle machine: ~3.7 min,
  so roughly 7-8 minutes of real-speed driving for a perfect player who never
  reads anything.
- **Miser (solo control)**: the arc IS completable with zero voluntary
  spending, so there is no hard spend-gate, but it is not comfortable: 100% of
  income went to forced repairs (3208c earned, 3215c spent), 10 strandings, a
  2.2x time penalty vs the spender, and 28.5 wear/delivery vs the
  completionist's 15.4 (upgrades and Off-road cut wear by 46%). Notably the
  miser stranded repeatedly while holding 500-700c: discipline, not poverty;
  a real skinflint who repairs voluntarily would sit between the two rows.
- **Speedrunner**: no gate or story flag is skippable; the postmaster talks
  and full region clears are all mandatory. The arc has no sequence breaks.
- **Careless**: 22 strandings and near-zero balance, but never a death spiral;
  the forced partial repair at a town always intercepted before the
  rescue-broke state. Rescue price point (50c) was never actually exercised.
- **Wayfinder build**: reveal investment measurably reveals more fog (+25-78%
  per region) and pays nothing else: same deliveries, same economy, 17% slower
  to capstone. Soft trap as tuned (draft issue 10).
- **Off-road build**: skill hit rank 3 by delivery 4, granting the mire+tidal
  access that Marsh Treads and Salt Runners sell, before either was
  affordable. #298's premise (all three relief upgrades owned) is hard to
  reach organically (draft issue 11).
- **Negotiator build**: reward formula verified to the coin at rank 0 and
  rank 3 (53c and 269c replays match computeDeliveryReward exactly). The +30%
  is real and visible per delivery.
- **Cipher build**: full mechanical footprint is one flagless postmaster line
  plus cipherNotes on 3 off-route discoveries the run never encountered; the
  banked-points nag worked correctly all run (draft issue 9).
- **Exploit hunter**: the reload tow (new, high) plus the board-guard gap
  (medium); everything else closed with measured margins; full #300
  characterization: under every non-dialogue overlay you can drive, wear,
  encounter, deliver, repair, and cross gateways, with no desyncs; only
  dialogue freezes the world.
- **Blind player**: first delivery discoverable from the screen alone in ~12
  minutes (the contextual legend is the hero); second contract is a
  wall-and-spiral that ended the session unrecoverable (stranded, 2c). The
  onboarding funnel is one screen deep.

## Recommended landing order (pending owner review)

1. Draft issue 1 (reload tow): small save-format PR, closes the only open
   exploit; the whole limp/rescue design depends on it.
2. Draft issue 2 (board guard): two-line guard fix, unit-testable rule.
3. Draft issues 3+4 (stranded-broke ladder, second-contract hint): the two
   design-calls that decide whether a real new player survives week one.
4. The rest are tuning/design-calls in the file, cheap in any order.

## Files

- Draft issues (nothing filed): tmp-personas/report/draft-issues.md
- Raw persona outputs: tmp-personas/out/ (loaded), tmp-personas/out-solo/
  (controls); telemetry.jsonl, chunk-*.json, log-*.txt, screenshots per persona
- Exploit repros: tmp-personas/exploit/*.mjs (repro-reload-free-tow.mjs is the
  one-command proof)
- Matrix generator: tmp-personas/aggregate.py (pass out dirs as args)
- Full agent reports: session workflow journal (wf_2a4c78f7-677)
