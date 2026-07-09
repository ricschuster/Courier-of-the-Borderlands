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
   *(Landed: HUD text now has a dark backing; three more upgrades raise the
   coin sink from 150 to 500; the gateway hint names the settlement it shares a
   tile with, e.g. "Southmill is the road to Fenmarch".)*

## Still open after the Reconnection + polish passes

- Progression still flatlines once every upgrade is bought and reputation caps.
  The coin sink helps but the real fix is a non-capping track (courier
  experience and skills, M5.1) so reconnecting keeps paying off.
- Travel and the ford still lack a strong "why" beyond reaching new contracts;
  that wants the regional story arc (missions, M5.3) to give them stakes.
- The spine is written into the journal but cannot yet be *spoken*; NPC
  dialogue (M5.2) is the next enabler.

---

## Session 2 plan (to run next)

Purpose: since Session 1, the stakes fix has actually shipped (arc-gated
contracts, road encounters, the Hidden Road journal thread, and the mission
spine spoken through NPC dialogue). This session tests the one question that
gates the rest of M5.4: **do the stakes now land?** Same rule as before: play as
a player, no fixing or reading source, note reactions in the moment.

Two outputs from this session unblock the M5.4 remainder, specced in
`docs/design/06_world_state_remainder.md`: (a) a yes/no on whether reconnecting
now feels worth it, and (b) rough numbers for how much rewards should shift.

### Suggested path (about 20 to 30 minutes)

1. Start fresh (reset save). Note the opening framing: is it still confusing, or
   does the journal now carry you?
2. In Greywater, talk to the postmaster (E). Read the Act 1 setup. Accept and
   run the three standing Greybridge contracts.
3. Reconnect Greybridge. Watch for: the map/minimap recolour, the reconnection
   note in the journal, and the new arc-gated "unsigned letters" contract
   appearing on the board.
4. Take the arc contract. Open the journal Story section and confirm the Hidden
   Road thread has begun and reads as one through-line.
5. Travel a spoke (Saltreach or Fenmarch). Hit at least one road encounter and
   make a choice. Note the coin/reputation swing and whether it felt meaningful
   or like a speed bump.
6. Reconnect that spoke; talk to its NPC (Tidewatch or Mossgate). Confirm the
   spoke's arc contract opens and the thread advances.
7. If time allows, run the second spoke and the Greywater capstone.

### Watch for (the decisions this session sets)

- **Stakes, the headline.** After reconnecting the first region, is there a
  clear reason to keep delivering? Compare directly to Session 1's disengage
  moment at Tidewatch. One sentence: fixed, better, or still flat?
- **Reward feel (sets the 06 numbers).** When a place reconnects, do standing
  contracts there feel like they should pay *more* (safer road, grateful town)
  or *less* (routine now)? By roughly how much: a little (+/-10 to 20 percent)
  or a lot (+/-50 percent)? Note any contract that felt over- or under-paid.
- **Withdrawn contracts.** Did any contract feel like it should *disappear*
  once the world moved on (for example a "get word out" job that no longer makes
  sense after reconnection)? If yes, which, and on what event?
- **Encounter intrusiveness.** The first Greybridge encounter sits on the main
  east road, so it is mandatory on the first eastbound trip. Intrusive, or good
  tension? Did any encounter outcome feel unfair?
- **Arc legibility.** Do the unsigned-letters contracts and the Hidden Road
  thread read as a deliberate arc, or as loose extra work?
- **Regressions from Session 1.** Onboarding text dump, re-readable journal,
  HUD contrast over discovered tiles, Southmill travel clarity: still fixed?

### Results (played 2026-07-08)

Headline: **the stakes now land.** The Session 1 disengage moment did not
recur. Key player moments: "Saw story in the journal for the first time. Now I
know what my mission is. I can do this!", the road encounters landed ("very
cool!", "Great story"), and "Great progress from last time." The fantasy plus
the arc now carry the player through a full region clear and into the Greywater
capstone. This confirms the north star and unblocks the M5.4 remainder.

The friction this session is UX and legibility, not stakes. Grouped:

#### The blocker (endgame becomes unplayable)

- **"Region Cleared" popup never dismisses and blocks the view.** Once the
  region cleared, the centred summary panel stayed up over everything: "The
  popup doesn't go away anymore and blocks my view", "Popup still there. This is
  making it hard to play now", and finally "No use in continuing play so I will
  stop here." A regression that ends the session. *(Fixed: Esc dismisses it and
  it stays dismissed for the session.)*

#### Text vanishes too fast (recurring, highest-frequency complaint)

- Delivery text: "started to read text. Could not get through as it disappeared
  too fast. A bit frustrating."
- Settlement arrival text: "Went to Southmill. Text vanished too quickly again."
- Contract accept text: "Accepted 'Follow the letters'. Text didn't stay long
  enough to read."
- Opening framing: wants more text, held longer, "Maybe even wait for key press."
  *(Partially fixed: toast hold time now scales with message length, roughly 4.5
  to 9 seconds. A dismiss-on-keypress panel for important story beats is a
  follow-up, tracked below.)*

#### Overlapping panels (one thing at a time)

- "Opened journal. Opens right over skills. Should not happen. One thing open at
  a time would be better." Also text overlap at the opening screen. *(Fixed:
  opening the journal, skills, or codex now closes the other blocking overlays.)*

#### Mission and objective clarity

- Completed step still shown: after connecting Southmill, "Looking at the mission
  again. I still see Southmill mentioned. A bit confusing that it's still
  mentioned there."
- Multi-step pickup confusing: "A Secret for Mirewatch: collect a sealed tube at
  Ironhollow. Am I supposed to go to Ironhollow next? Not sure." Had to guess the
  pickup-then-deliver order.
- Reconnection meaning unclear: "Ironhollow turned yellow. I think the others
  might have too, but not sure. Does that mean they are connected again? Checking
  the journal. Not sure." The recolour is noticed but its meaning is not taught.

#### Onboarding and framing

- Opening better than Session 1 but still wants more of the why: "More
  explanation of what's happening or why our courier is here might be good."
- Controls hint: wants a tooltip pointing at the bottom help text, or that text
  moved somewhere more discoverable.

#### Signposts and gateways

- Gateway marker inside a town read as strange: "road to Fenmarch. No idea what
  that is and a bit strange that the road would be in town." Later, a gateway on
  the open road read better: "this road-to sign makes more sense than the one in
  the town."
- Gateway label truncated at the map edge: saw "road to Salt", the rest of
  "Saltreach" ran off screen.

#### Encounters (loved, want more feedback)

- Both encounters landed as story highlights. Two wishes, repeated: a **visual of
  the thing on the road**, and the ability to **review the encounter text** after
  the dialogue closes ("Once the dialog was over I don't know if I can get the
  text back or review").

#### Smaller notes

- Ford key: still no felt purpose ("Not quite sure what that's good for"). Known
  from Session 1; wants a concrete payoff.
- Upgrades: "Not entirely sure what some of them are for. Can't really tell from
  the little bit of text." Descriptions too thin.
- Postmaster repeats the opening line on return before offering the new "region
  is answering again" branch: "Postmaster text same as in the beginning. That's
  weird."

### Takeaways and actions

1. **Stakes: confirmed fixed.** Do not re-open this; protect it. The remaining
   work is making the now-good arc legible and unblocked, not adding stakes.
2. **Landed this session (fix/playtest-2-ux):** the region-cleared popup is
   dismissible, only one blocking overlay opens at a time, and toasts hold longer
   for longer messages. These clear the session-ending blocker and the
   highest-frequency complaint.
3. **Next UX slice (highest value, no design calls needed):**
   - Objective clarity *(landed in fix/objective-clarity)*: a multi-part mission
     step now shows a progress count (for example "Reconnect the rest of
     Greybridge... (1/4)") so a completed part reads as counted, in both the HUD
     objective and the journal; and the accepted-contract line now spells out
     both legs ("collect X at Ironhollow, then deliver to Mirewatch"). Striking
     the connected place names from the list is a further option if the count
     alone does not read clearly next session (needs per-item labels in data).
   - Re-readable story text *(still to do)*: route delivery, contract-accept, and
     encounter text into a recall surface (the journal already exists) so nothing
     is lost after one read. This also lets encounters be re-read. This is the
     remaining half of the "text vanishes too fast" complaint.
4. **Design calls for the owner (small, flagged in 04_storyline / 06):** the
   ford's concrete payoff, richer upgrade descriptions, gateway marker placement
   out of towns and edge-label clamping, and whether the postmaster's return
   greeting should differ from the opening.
5. **M5.4 remainder (06):** reward-shift direction and magnitude did not get a
   clean read this session because the popup ended play early; the withdrawn-
   contract signal was also inconclusive. Fold a short reward-feel check into the
   next session once the UX fixes are in.
