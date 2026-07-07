# Storyline: The Blockade

## Status

Locked (2026-07-07). This is the canonical narrative spine for the three current
regions. It fixes the central conceit, the arc order, and how much resolves, so
that dialogue (M5.2) and missions (M5.3) can be authored against a fixed target.
It extends, and does not replace, the narrative decision in
`docs/decisions/0004-rpg-and-narrative-layer.md`.

The spine was not invented from a blank page. A consistent through-line already
existed in fragments across `src/data/reconnection-notes.ts`, the settlement
notes, and the contract text. This doc commits to what those fragments were
pointing at.

## The one-line pitch

The borderland is not going silent by accident. Someone is cutting the roads and
silencing the settlements on purpose, and the couriers who notice stop coming
back. You are an ordinary courier who becomes the one thread the blockade cannot
cut, and every delivery you complete is the network answering back.

## Guardrails

Every beat below is checked against the pillars and against ADR 0004's test:
does it make the player care more about **routes, places, and information**?

- **No combat.** The player wins by reconnecting and exposing, never by
  fighting. Tension comes from road encounters already sanctioned in ADR 0004
  (washed-out crossings, bandit tolls resolved by paying or fleeing or
  reputation, cargo you are told not to read), not from violence.
- **No hard time pressure.** The blockade is a slow strangulation, not a clock.
- **Story through places.** The spine is delivered through settlements, cargo
  notes, journal entries, and NPC dialogue, not cutscenes.
- **Information is the currency.** The conceit is literally about who controls
  the flow of news. This is the courier fantasy, not a bolt-on.

## The conceit: the Blockade

The silence is engineered. A rival information power, working name **the
Cormorant Line**, is quietly replacing the courier roads with a bird-borne news
service that it alone controls. Isolated settlements that lose the road become
dependent on the Line for word of the outside world, and dependence is
profitable. So the Line lets the roads rot, buys the silence of those who ask
questions, and the couriers who piece it together are the ones who vanish.

Anchors already in the data:

- Cormorant Rock (Saltreach): "the birds here carry news faster than any
  courier." This is the Line's method, hidden in plain sight.
- Saltreach's missing-courier contract: "No one will say why the last courier
  did not return." This is the cost of noticing.
- The unsigned, unsealed letters (Saltreach and Fenmarch contracts): a covert
  correspondence routed around intercepted mail. This is the resistance, and the
  player is unknowingly carrying it.
- Eastwatch, "a watchtower that is always listening": a listening post, and
  (revealed) a node of the resistance, not the enemy.
- The forbidden-to-read cargo (Ironhollow rumour, Mirewatch sealed tube): the
  player is already carrying more than goods.

### The two networks

- **The road (the player's side).** Couriers and settlement postmasters and
  keepers: an old, honest, slow tradition. Its symbols are the relit signal-fire
  and the open road. The player belongs to it.
- **The Cormorant Line (the antagonist).** Fast, centralised, deniable. Not a
  villain with an army; an economic and informational rival with a human face
  (a "factor" who sells news and offers to buy the player off). Beatable by
  being out-connected and exposed, not defeated in a fight.

### Deliberately left open

Per the "resolve the region, leave the world open" decision:

- Who ultimately commands the Cormorant Line, and how far its reach extends
  beyond the borderland, stays unanswered. Room for future regions.
- The Fenmarch dread ("the dark turns before dusk actually falls") is left
  genuinely ambiguous. It may be a real thing that isolation invites, or a
  superstition the Line encourages to keep people indoors and off the roads.
  The region-level cause (the blockade) resolves; this larger question does not.

## The arc

Structure follows the chosen ordering: the hub sets it up, the two spokes are
played in either order and each reveals one half, and the hub resolves once both
spokes are done. This respects the hub-and-spoke map (spokes do not connect, so
travel always passes through Greybridge) and the player's freedom to choose a
spoke first.

### Act 1 -- Greybridge (the hub): "Something is wrong with the roads."

The player is an ordinary courier out of Greywater, "where every courier road
begins." The five existing Greybridge contracts reconnect the region's
settlements (the built world-state slice: silent to reconnected).

- Setup beat: the Greywater postmaster, voice of the old courier tradition,
  gives the first letters and voices the unease ("Eastwatch has gone quiet, and
  quiet is rarely good").
- Rising thread: across the Greybridge deliveries the player notices the
  silences are not random. A courier who worked these roads before is gone. The
  cargo gets stranger (a rumour you are told not to read; a sealed tube).
- Act 1 reveal (fires when Greybridge's spine settlements are reconnected): the
  roads were cut on purpose, and the cause lies outside Greybridge. This gives
  travel to the spokes its **why**, which the playtest found missing. The
  unsigned letters and the magistrate's writ point outward.

### Act 2 -- Saltreach and Fenmarch (either order): two faces of the blockade

Each spoke stands alone and delivers one half of the picture. A shared token (a
matching seal, or a name that recurs in the unsigned letters) appears in both so
that whichever the player does second cross-references the first.

- **Saltreach -- the method (how the roads are being cut).** Couriers vanish; a
  bird-borne rival network operates out of Cormorant Rock. Following the missing
  courier's route (working name for the lost courier: **Wrenn**), the player
  recovers what Wrenn was carrying: proof of the Cormorant Line's hand.
  Reconnecting Saltreach restores a link the Line deliberately cut. The Line's
  factor appears here and offers to buy the player's silence.
- **Fenmarch -- the cost (what isolation does to a place).** The furthest-gone
  region: Duskmere's early dark, Thornwick's barred gate, Hollowfen "waiting
  longer than you have been a courier." These are places that lost the road
  first. The dread is the emotional stakes. Reconnecting Fenmarch proves even
  the furthest-gone can be brought back; Hollowfen's long wait finally has an
  answer.

### Act 3 -- back at Greywater: "The road answers."

When both spokes are reconnected, a final short chain opens at Greywater. The
player, now the node stitching three regions back together, delivers the thing
that breaks the blockade's grip: the recovered proof plus the living, restored
network itself. Resolution: the courier roads are alive again and visibly
outrun the birds; the immediate blockade over the borderland is broken. The
larger questions above stay open.

## Minimal cast

Keep the cast small and place-driven. Each is an anchor for dialogue authoring,
not a fully written character.

- **The Greywater postmaster** -- mentor and first quest-giver; the voice of the
  road tradition; suspects the roads are being cut.
- **Wrenn, the vanished courier** -- never seen. Their route and their last cargo
  are the mystery thread the player retraces through Saltreach.
- **The unsigned correspondent** -- writer of the unsigned letters; revealed over
  the arc to be organising the resistance, plausibly from Eastwatch's listening
  post.
- **The Cormorant factor** -- the antagonist's human face; sells news by bird,
  offers to buy the player off. An informational and economic rival, never a
  combatant.

## How the spine maps to systems

This is what makes the spine buildable on what already exists.

- **World-state (built, `src/systems/world-state.ts`).** Silent to reconnected
  is the literal mechanic of the spine. Reconnecting a region's spine
  settlements is that region's act beat and the trigger for its reveal.
- **Reconnection notes (built, `src/data/reconnection-notes.ts`).** Already the
  felt payoff per settlement; consistent with this conceit and reusable as-is.
- **Dialogue (M5.2).** Branching nodes plus **story flags** carry the reveals and
  gate the act transitions (for example `greybridge_reveal`,
  `saltreach_method`, `fenmarch_cost`, `blockade_broken`). Story flags are the
  only genuinely new save state the spine needs: a small, optional field,
  consistent with the derived-state approach used for world-state and
  experience.
- **Missions (M5.3).** One authored mission chain per region built on the
  contract primitive: the Greybridge chain sets up, each spoke chain delivers
  its half, and a short capstone chain at Greywater resolves. Missions reuse the
  delivery state machine.
- **Reputation (built).** Spine steps gate on `minReputation` (as the existing
  contracts already do), so the story paces with the trust the player has
  earned.
- **Skills (built) and road encounters (ADR 0004).** Social skills open
  dialogue options (for example refusing or negotiating with the factor);
  road encounters supply non-combat tension along spine routes.

## What to author now vs later

- **Now (unblocks M5.2):** the story flags listed above and the act-transition
  triggers; the four cast anchors as dialogue-giver stubs; the Act 1 reveal
  text. These are needed to build the dialogue system against a real spine.
- **With M5.3:** the three region mission chains and the Greywater capstone,
  plus the shared cross-reference token between the spokes.
- **Deferred, explicitly:** any content that reaches beyond the three current
  regions (the Line's command, the truth of the Fenmarch dark). Left open by
  the resolution decision.

## Open questions for the owner

These are safe to defer until authoring, but flag them here so they are not lost:

1. Name and tone of the antagonist network. "Cormorant Line" is a working name
   tied to Cormorant Rock; confirm or replace before dialogue is written.
2. Does the player ever get a real choice about the factor's offer (take the
   bribe, refuse, expose), or is refusal the only path? A branch here is cheap
   with the dialogue system and adds agency, but forks the ending slightly.
3. How explicit to be about Wrenn's fate. Confirmed dead, or left as an unproven
   disappearance the player can still hope about.
