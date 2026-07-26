# Human playtest: 2026-07-26

Build: `main` @ a06cc82 (0.8.0 game behaviour plus the #392 refactors), played on
the live GitHub Pages site. Player: the project owner. First human pass on this
game; every previous playtest in this directory was scripted personas.

Session shape: informal free play. Drove around, triggered a range of sounds,
ran deliveries, bought upgrades and ranks. Not a full three-region arc.

Verdict: **no defects found, and the audio was judged good.** This report exists
to record what that does and does not settle, because a clean pass is easy to
over-read.

## What this establishes

1. **The audio works at volume, and the rolling bed is not too quiet.** This is
   the headline and the reason the pass mattered. The bed peaks at 0.021 to 0.030
   against a commanded ceiling of 0.08, because bandpass-filtered noise carries
   far less peak energy than its envelope allows. Three consecutive handoffs
   flagged this as the most likely thing to be wrong in the game and the single
   cheapest thing to fix before #226 Phase 2 swaps in real samples. A human ear
   reports it sits fine. **No retune needed; the commanded numbers stay as the
   tests pin them.**
2. **Nothing grates on repeat.** The UI ticks and the refused press were the
   named candidates, since they fire most often. No complaint raised.
3. **The big moments land.** Delivery, level-up and the other tiered cues were
   heard in normal play and drew no objection. The capstone is a separate case,
   see below.
4. **No visual defects.** "All looks and sounds good" covers the surfaces a
   free-play session touches: the driving view, the panels, and the toasts.
5. **The #392 refactors are behaviour-preserving in play, not just in CI.** Five
   slices landed unreleased above 0.8.0 with no behavioural test changes. A human
   session over the refactored build noticed nothing, which is the first
   non-automated evidence for that claim.

## What this does NOT establish

Recorded plainly so a later session does not read this as a clean sweep.

1. **Item 5, whether Wayfinder's survey ring earns its cost, was not reached.**
   This is the one item in #363 that gates other work, specifically #361. It
   needs a route actually planned around the ring, which free play does not
   produce. **#361 stays `playtest-gated`.**
2. **Item 6, whether the full arc is fun, was not reached.** That needs the
   three-region run to the capstone, roughly an hour at normal speed.
3. **The capstone cue was not heard**, since it fires when the blockade breaks at
   the end of the arc. It is the deliberate exception to "loudest cue on the
   moment that hurt", and whether it earns that is still unjudged.
4. **Cue collisions were not specifically probed.** One voice plays per frame, so
   several moments routinely lose their frame: the first delivery of a run, a
   delivery that clears a region, and arriving somewhere new to collect cargo.
   Each was decided by two numbers in a table. Absence of complaint is weak
   evidence here, because the losing cue is silent rather than wrong, and you
   would have to know it was meant to fire to miss it.
5. **The reload path was not deliberately probed.** Suggested before the session
   and not confirmed as done. This remains the least-verified surface in
   `map-scene.ts`: #392 turned up four coverage holes and all four sat on the
   reload path rather than the creation path.
6. **The #353 pocket reconnection notes** sit behind premium contracts with
   reputation gates, and no persona has ever reached them either.

## Consequences

- #363 closed by this report, per the owner's call that the pass is complete.
- #361 stays open and stays gated. The blocking question is untouched.
- The audio retuning window can close. #226 Phase 2 can proceed on its own
  schedule without the pending-judgement caveat that has ridden along with it.
- The remaining unjudged audio items (capstone, cue collisions) are cheap
  add-ons to any future full-arc run rather than reasons to schedule one.
