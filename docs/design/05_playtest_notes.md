# Playtest Notes

Purpose: capture a real fun signal by playing as a player, not a builder. This
is the data that decides what narrative slice to build next (path A). Fill it in
while playing, not from memory.

Rule of the session: no fixing, no code, no reading source. Just play and note.

---

## Session 1 (2026-07-06)

Played Greybridge through to Tidewatch (Saltreach), completed the first
Saltreach contract. Raw observations, grouped.

### What works and should be protected

- Movement and environment are very intuitive.
- Terrain types and their effect on movement land well.
- The map is great; the minimap especially.
- Distance-to-destination readout is a nice touch (noticed unprompted).
- Reading the Greywater contract board is enjoyable.
- Weather is intriguing: unclear what it means, but exciting to want to learn.
- Moving around a new region and starting to explore is genuinely fun.
- Completing missions is fun, and the idea of connecting places is great.

### The core problem: missing stakes (the disengage moment)

- At Tidewatch, after completing the first contract, it got boring: "I don't
  see any point or reward anymore for completing missions."
- Coins and reputation are useful but max out quickly, so the reward loop
  flatlines.
- Not sure what travelling between regions is actually *for*: what do I gain?
- Not sure what the ford key buys me or why to go there; wants a higher
  incentive.
- Verdict on the open fork: "The courier framing is good, it's the missing
  stakes that's the issue." Keep the fantasy, add consequence.

### Information does not persist (recurring, cheap, high value)

- Getting dropped in with no framing is confusing.
- Arriving in Greywater is overwhelming: too much text popping up at once.
- The new-town popup should be viewable again; forgotten after the first read.
- The mission popup disappears too quickly; wants to re-open the active
  objective to remember what to do.

### Wishes

- Missions in the other towns, not just the home board.
- Choice in what to upgrade ("picking what to update would be good").
- More interactions in each place.

### Bugs / rough edges

- Bottom help text is readable over fog, but once tiles are discovered the text
  colour has poor contrast and is hard to read.
- Travel out of Southmill is confusing.

---

## Takeaways for path A

The playtest confirms the hypothesis and points at one slice.

1. **Confirmed: the fantasy is fine, stakes are missing.** The disengage moment
   is precise: rewards flatline (coins and reputation cap), so there is no
   reason to keep delivering. This is exactly the world-state north star.

2. **The cheapest slice that tests the fix:** make deliveries *visibly change
   places*, and make that change re-readable. A key delivery flips a settlement
   from silent to reconnected; the change shows on the map and in the journal.
   This directly attacks the "no point after the first mission" boredom.

3. **Prerequisite, and cheap on its own: information must persist.** Four
   separate complaints are the same bug: you cannot re-read the town lore or the
   active objective. No narrative can land if the story vanishes after one read.
   A re-openable journal / objective panel is the enabler for everything else
   and fixes the onboarding text-dump too (reveal less at once, let it be
   recalled).

4. **Travel and the ford need a "why".** Both are mechanics without a reason.
   The regional arc (the spine) is what gives travel a purpose; the ford wants a
   concrete payoff tied to a delivery.

5. **Quick wins to bank alongside:** help-text contrast over discovered tiles,
   more upgrades to buy (a coin sink), and clarifying Southmill's travel.
