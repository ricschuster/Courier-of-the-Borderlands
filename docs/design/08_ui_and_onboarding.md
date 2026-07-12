# 08 UI, Onboarding, and Look-and-Feel

Status: proposal for owner review. Nothing here is built yet. This doc exists so
the owner can approve a direction before implementation.

Source: full-arc playtest on 2026-07-12 (standard difficulty, whole arc cleared,
1852 coins, 2 repairs). The systems mostly work; the batch is dominated by one
theme: the systems are not legible, and the way text and boxes are placed on
screen actively hurts the fun. This is now the highest-leverage area for "feel".

Related: issues #109 (playtest), #110 (economy), #111 (routes). ADR 0005
(travel sink), ADR 0004 (RPG/narrative layer).

## Problem statement

A first-time player finishes the game unsure what the core systems do:

- Skills (K) are never introduced, and their link to the wagon is unclear.
- Upgrades (B) are never explained; the player does not know what a purchase buys.
- Reputation / standing benefits are invisible.
- Weather's effect is never surfaced; the player suspected it did nothing.
- There is no intro or story framing at the start.

Layered on top: the screen is a scatter of text lines and pop-up boxes. The
"Entering Greywater" banner is intrusive and overlaps the Greywater dialogue.
The owner: "Many diminish the fun of the game considerably."

## Current UI (as built)

- Top-left stack of always-on text lines: wallet, objective, terrain, ford,
  weather (map-hud.ts).
- A control-hint line that concatenates every key (WASD, M, J, K, L, N, G, B,
  talk, dismiss) into one dense string.
- Center-screen overlay panels that appear on demand: board, journal, skills,
  summary, capstone, dialogue, plus a toast and a minimap.
- A region-entry banner.

The panels and banners are independently positioned and can overlap (confirmed
by the Greywater banner-over-dialogue report).

## Feedback inventory

Grouped from the raw playtest notes.

### A. Onboarding / legibility (the core of this doc)

1. Intro / story opener at game start. Establish the courier premise. Possibly a
   short story beat, not just a premise line.
2. Skills (K): explain what skills are and how they relate to the wagon, at the
   point the player first earns a point.
3. Upgrades (B): explain what each upgrade does. The single-key "buy the
   cheapest" interaction hides the choice. Owner suggests a proper upgrade menu
   where the player picks an upgrade and reads what it does.
4. Reputation / standing: show what a standing tier buys (perks exist in
   reputation-perks.ts but are never surfaced).
5. Weather: surface its effect, or remove the ambiguity.

### B. In-your-face / overlap bugs (small, can ship independently)

6. "Entering <settlement>" banner is too intrusive and overlaps dialogue text.
   Reposition, shrink, and auto-dismiss when a conversation opens.

### C. Numbers and polish (shipped separately, listed for completeness)

7. Fractional coins rounded to integers. (Shipped: PR #145.)
8. HUD skill-point count matches the skills panel. (Shipped: PR #146.)

### D. Structural design calls (need an owner decision, below)

9. Lock difficulty at game start instead of allowing mid-run changes.
10. Difficulty curve inverts: the large first map has real wagon degradation; the
    two later, smaller maps wear the wagon less, so the game gets easier as it
    goes.

### E. Look-and-feel and art (discussion, below)

11. Overall UI layout and placement of text/boxes.
12. Whether it is time to move on the art question (CLAUDE.md art strategy Phase
    2/3).

## Proposed direction (for approval)

The onboarding and layout items are one problem, not several, so treat them as a
single UI pass rather than piecemeal edits.

### D1. A consistent HUD frame

Replace the free-floating stack and independently placed panels with a defined
layout:

- A persistent, compact status strip (coins, standing + tier, level, wagon
  condition) in one corner, with fixed slots so nothing jumps.
- One reserved panel region for on-demand overlays (board, skills, journal,
  upgrades), so only one opens at a time and they never collide with dialogue.
- Dialogue and banners get their own reserved band; the region-entry banner
  yields to (or suppresses during) dialogue.
- The control hint becomes contextual: show only the keys relevant where the
  player is standing (at home: board/upgrades; on the road: map/journal), rather
  than the full dense string every frame.

### D2. Just-in-time explanation

Explain each system the first time it becomes relevant, not in a manual:

- First skill point earned: a one-time prompt explaining skills and the wagon
  link, pointing at K.
- First time at a settlement with upgrades: introduce the upgrade menu.
- First standing-tier increase: a line naming the perk gained.
- Weather: a short readout of its current effect (already have a weather line;
  make it say what it does, e.g. "Rain: slower off-road").
- Game start: a short intro card with the premise and the first objective.

### D3. Upgrade menu (from feedback item 3)

Turn the "press B to buy the cheapest" interaction into a small selectable menu:
list upgrades, cost, owned/locked state, and a one-line effect for each. This is
a real UI change and probably its own issue once the frame (D1) exists.

## Decisions needed from the owner

These block or steer the pass. Recommend deciding before implementation starts.

1. Difficulty lock (item 9). Should difficulty be chosen once at new-game and
   then locked for the run? The current selector applies live mid-run by design
   (v09). Locking it is a deliberate reversal. If yes, the G-key selector moves
   to a start screen / new-game choice.

2. Difficulty curve (item 10). The later maps are smaller and wear the wagon
   less, so difficulty falls off after the first region. Options: denser sinks or
   longer routes on later maps, scale wear by region, or accept the front-loaded
   curve as intentional (the first region is the teacher). Feeds #110.

3. Scope of the first UI pass. Ship the HUD frame (D1) and the overlap fix (item
   6) first as the foundation, then layer explanations (D2) and the upgrade menu
   (D3) on top? Or bundle.

## Art (discussion, not yet a decision)

The owner asked whether it is time to visit the artwork question. CLAUDE.md's art
strategy: Phase 1 grey-box (current), Phase 2 free asset packs tracked in
credits.md, Phase 3 custom/AI art after the loop works. The core loop works and
the whole arc is clearable, so Phase 2 is now defensible. Suggested framing for
the discussion:

- Decide look-and-feel target first (readable/clean vs atmospheric), because it
  constrains asset choices and the HUD frame above.
- A Phase 2 asset pass (tiles, wagon, settlement markers, UI panel skin) is
  lower risk than commissioning custom art and directly serves the "feel"
  complaint.
- Keep art behind the UI-frame work: a clean layout makes any art read better,
  and art on top of the current scatter would not fix the core complaint.

## Not doing (yet)

- No implementation until the owner approves a direction and answers the three
  decisions above.
- No scope expansion beyond MVP systems (CLAUDE.md). This pass is presentation
  and teaching of existing systems, not new mechanics.
