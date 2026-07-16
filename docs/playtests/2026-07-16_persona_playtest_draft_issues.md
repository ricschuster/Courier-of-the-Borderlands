# Draft issues from the 2026-07-16 persona playtest (FOR REVIEW, none filed)

Source: 10-persona automated playtest (8 scripted policy players, 1 live exploit
hunter, 1 blind screenshot-only player), wear ON, standard difficulty, 0.4.0
build. Evidence paths are under tmp-personas/ (untracked). Balance numbers in
issues 8+ pending the solo control run; see REPORT.md.

Suggested labels in brackets. Ordering is by severity.

---

## 1. [bug] Page reload is a free instant tow: courier position is not persisted

The save (src/systems/save-system.ts) stores coins, condition, contract status,
fog, and flags, but not the courier's tile. On load, map-scene create() always
spawns at the region spawn (1 tile from home). So F5 anywhere teleports the
wagon home in ~1.5s for 0 coins, keeping cargo (carrying status survives),
coins, and condition (rollback bounded by the 2s autosave tick, ~0.3 points).

Found independently by two personas:
- Exploit hunter: measured teleport of 18-19 tiles home for 0c vs the honest
  return leg (~8.4s real, ~5c repair) and vs the 50c rescue it strictly
  dominates. Repro: `node tmp-personas/exploit/repro-reload-free-tow.mjs`
  (re-confirmed by the orchestrator post-run).
- Blind player (no oracle): hit it accidentally, twice losing a nearly-complete
  approach to Ironhollow (silent progress loss), and identified it as a free
  un-strand that skips the limp penalty.

It reopens the closed live-at-zero exploit family through a different door: the
0.15x limp tax only holds while walking home costs something.

Fix direction: persist the courier tile (and stranded state) in SaveData, or
spawn a loaded save at the last-visited settlement only when condition > 0.
Note the save-format change needs care with existing saves (ADR 0008 territory:
absent field should load as today's behaviour).

## 2. [bug] Board digit input is not gated on the summary/capstone panels

refreshBoard hides the board under shouldShowCapstone(), isSummaryVisible(),
isDialogueVisible(), and isBlockingOverlayOpen() (map-scene.ts ~1390-1403), but
handleBoardInput only bails on isBlockingOverlayOpen() (~1366). Dialogue is
separately safe (update() early-returns). So while the region-cleared summary
or the capstone panel is up at home with no active contract, number keys reach
handleBoardInput and can accept a contract the player cannot see. Same class as
the fixed #292, different pair of panels.

Code-confirmed; live window is narrow but real (e.g. the moment a region clear
puts an arc-gated contract on the board while the summary awaits Esc).
Fix: add the summary/capstone checks to handleBoardInput's guard.

## 3. [design-call] Stranded and broke is a practical dead end on Standard

Blind player, fresh Standard save, level 3: wagon 0/43, 2 coins. Rescue costs
50c (unaffordable), full repair 206c, and the stranded toast says "you cannot
afford a rescue (50c). Limp to a settlement" while standing AT a settlement.
Four limp attempts (~10 real minutes at 0.15x) never reached new income. A real
player's only visible exit is a new game. Evidence:
tmp-personas/out/blind/081-s2-1.png, 086-r-at-town.png, 088-108.

Load caveat: the blind run happened while 6 browsers shared the machine, so
wear accrued roughly twice as fast as a real player would see; reaching this
state is correspondingly rarer on an idle machine, but the STATE itself (broke
and stranded, no visible ladder) is real however a player gets there, and bad
early play can still produce it.

The teeth are wanted; the hole with no ladder is the problem. Options that keep
the punishment: partial repairs already exist (5c per point) but the player had
2c; a minimum "work off your debt" job at a town; rescue on credit against the
next delivery; or simply making the toast at a settlement say "repair" not
"limp to a settlement" (see issue 6 on repair opacity, and note partial repair
already triggers on any coins >= 5, which the toast never explains).

## 4. [design-call] The second contract is a cliff for a screen-only player

First delivery teaches a straight road east. The second cheapest contract
(Rumour for Ironhollow, rep 4) is walled behind an unrevealed rock band; the
only guidance is the one-word mission compass, which flips (S, SE, W, SW, NW)
as the player overshoots and reads as contradictory. The blind player burned a
34/34 wagon plus a 0/43 refill and 57c searching for the entrance and never
found it in ~30 minutes. Nothing before that point teaches that off-road
terrain wears the wagon several times faster than roads. Evidence:
tmp-personas/out/blind/057-082 (search), compass flips in 062/063/073/103.

Cheapest fixes preserve exploration: a board or dialogue route hint ("the pass
opens south of the ford"), or teach the wear-vs-roads lesson in the legend the
first time the wagon leaves a road (the legend is the game's best teacher; see
issue 12).

## 5. [bug] Esc does not close the skills panel, and the wagon drives blind behind full-screen panels

Dialogue teaches "Esc to step away"; the skills panel closes only with K. After
Esc fails, arrow keys still drive the wagon behind the full-screen panel (only
discovered after closing it), while R/digits are silently swallowed by the #292
guard. Evidence: tmp-personas/out/blind/044-048. This is one concrete half of
open #300: the exploit hunter's characterization (drive, wear, encounters,
delivery, repair, and gateway travel all work under every non-dialogue overlay;
nothing desyncs) is posted to that issue's decision. Whatever #300 decides,
Esc-closes-every-panel is a cheap consistency win.

## 6. [enhancement] Repair pricing is opaque and a single R press can silently spend most of the purse

The legend quote ("R: repair 57c") never explains it is a full-restore quote at
5c per missing point, fluctuates confusingly (1c at full condition from
rounding), and R executes instantly: the blind player's first repair took 57 of
59 coins, which fed directly into the issue-3 dead end. One legend line
("repair: 5c per point") or a confirm on spends above half the purse.

## 7. [enhancement] Contract board renumbers between visits; a remembered digit accepts the wrong contract instantly

After a delivery the remaining contracts shift up a slot; pressing a
remembered number accepts a different contract with no confirmation, and one
mispress commits the whole next journey (only one contract can be active).
Blind player accepted Ironhollow this way. Stable slot numbers per visit, or an
accept-confirm line.

## 8. [design-call] Wear economy at true (solo) magnitude: 56% repair tax for the diligent player

The workflow's headline ("every persona ends broke, 97-104% repair tax, 15-22
strandings") was substantially a HARNESS ARTIFACT: 6 concurrent browsers
starved the frame loop and roughly doubled wear per delivery (33.4 -> 15.4
points/delivery for the same completionist policy and seed). The solo control
run on an idle machine is the real economy: capstone with 3416c income, 1898c
repairs (56% tax), all 7 upgrades bought (640c), 889c banked, ZERO strandings,
threshold repairs working as intended. That reads as teeth that bite without
breaking. Solo miser control quantifies the no-spend path; see REPORT.md.

Two structural sub-findings that hold regardless of load (both visible solo):
- Repair cost scales with max condition, which grows with level (25 to 100),
  so a full repair costs up to 500c at high level while income grows flatter.
  Worth a look at whether late-game repair bills crowd out late-game spending.
- Relative persona comparisons under identical load stay valid (wayfinder vs
  speedrunner, negotiator reward math, cipher footprint), but any ABSOLUTE
  stranding/affordability claim from the workflow runs is inflated.

## 9. [design-call] Cipher costs a scarce point and pays one easy-to-miss dialogue line

Cipher's full mechanical footprint: one gated postmaster line (no flag, no
effect) plus a cipherNote on 3 deliberately off-route discoveries the run never
found. Against Wayfinder/Off-road/Negotiator (all with measurable effects), a
full point for missable flavour reads as a trap for the player archetype most
likely to take it. Options: make it half the point cost... not possible; give
it a small mechanical rider (e.g. secrets cargo pays +10%), or gate one real
unlock (a route hint) behind it.

## 10. [design-call] Wayfinder is a soft trap: reveal pays no measurable progression value

The wayfinder build revealed 25-78% more fog than the speed build in every
region (654 vs 522, 435 vs 285, 580 vs 325 tiles) yet finished the same 23
deliveries ~17% SLOWER in wall time with the same economy. Exploration is
design pillar 1, but as tuned, investing in it buys nothing the game measures.
Possible hooks: discoveries (already in the game) could pay coins/rep on find;
reveal radius could feed route planning by exposing the minimap earlier.

## 11. [design-call] Off-road rank 2-3 already grants the terrain access that Marsh Treads and Salt Runners sell (feeds #298)

The off-road build reached rank 3 (mire + tidal access) by delivery 4, long
before either upgrade was affordable, making the upgrades' access half
redundant for exactly the build that wants them; only their drag-relief half
remains, which is #298's question, and no persona ever afforded all three
relief upgrades to test it organically. Suggest folding this into the #298
decision: as priced, the two access upgrades compete with a skill line that is
strictly cheaper (skill points are free) and faster to obtain.

## 12. [enhancement] Lean on the contextual legend for the two missing lessons

Positive finding: the self-rewriting bottom legend, numbered dialogue choices,
and "Esc to step away" are what made the game learnable with zero instructions.
The two lessons the legend never teaches are the two that ended the blind run:
off-road wear rate (teach on first leaving a road) and blocked-compass route
hints (issue 4). Both fit the existing one-line pattern.

## 13. [enhancement] Small UX batch from the blind run

- Title screen: difficulty rows are not clickable, keyboard only (the screen
  does say "press a number"; still a papercut for a web game).
- Minimap at 960x540 is ~180x120px, unlabeled, terrain reads as noise; useless
  for route planning (its one job).
- Toasts persist forever: a stale "Wagon repaired" sat on screen for minutes;
  on arrival three toasts plus a banner stack and bury the actionable line.
  Fade after ~10s and queue stacks.
- No visible save indicator anywhere (compounds issue 1's silent position
  loss).

## 14. [tech-debt] Adopt or retire the persona harness (trap 5)

tmp-personas/ (driver, lib, aggregate.py, personas) is untracked and will rot
exactly like autoplay.mjs did (#284) if kept without an npm entry, a README
line, and a smoke check. Decide: adopt (small PR, plus fold its tapKey fix
back into scripts/autoplay.mjs, which still uses raw one-shot presses and
visibly loses inputs) or delete after this report is consumed. If adopted, the
delivery telemetry should record the computeDeliveryReward breakdown rather
than a coin delta (the negotiator persona had to re-derive the skill's cut by
hand), and the README must warn that results are load-sensitive: 6 concurrent
browsers on this 12-core machine roughly doubled wear per delivery vs a solo
run (frame starvation inflates driven distance). Cap concurrent game runs at
~2-3 per machine, or treat only relative comparisons as valid under load.
