# The Wayfinder survey ring, measured

Analysis for #361, 2026-07-26. Reproduce with `npm run measure:survey`.

## The question

#341 added a minimap survey ring to the Wayfinder skill, which is what closed
#324 ("Wayfinder is a soft trap"). Two playtests then measured the same Wayfinder
economics as before: 43 percent more wear per delivery than a completionist,
an 80 percent repair tax against 59, and one stranding.

#361 recorded three possible readings and said a human playtest was needed,
because "a scripted run can measure fog and coins; it cannot measure whether the
ring helps a person plan a route."

That is true of feel. It is not true of routing, which is mechanical.

## The finding

**The survey ring is geometrically incapable of showing anything to a courier who
has bought the reveal upgrades.** It is not weak. It is inert.

| Loadout | Rank | Fog reveal radius | Survey ring | Ring reaches past the fog? |
| --- | --- | --- | --- | --- |
| All upgrades | 1 | 7 | 3 | No |
| All upgrades | 2 | 8 | 6 | No |
| All upgrades | 3 | 9 | 9 | No |
| No reveal upgrades | 1 | 3.5 | 3 | No |
| No reveal upgrades | 2 | 4.5 | 6 | Yes |
| No reveal upgrades | 3 | 5.5 | 9 | Yes |

The walked fog reveal radius is `2.5` base, plus `1.5` for the Far Lantern, plus
`2` for the Courier's Charts, plus `1` per Wayfinder rank. The ring is `3` per
Wayfinder rank. Fit both reveal upgrades and the ring never escapes the fog,
because the two reveal upgrades alone add `3.5` and the ring only gains `2` per
rank relative to the reveal the same rank grants.

**The Wayfinder persona in both playtests bought all seven upgrades.** So the
feature under test was showing it nothing, on every route, at every rank. That
fully explains "economics unchanged after #341" without any appeal to feel.

## The measurement

`src/systems/survey-benefit.ts` simulates the journey rather than comparing two
static paths, because the case that matters is not "a shorter line exists" but
"the courier committed to a corridor, hit water, and had to back out". A
fog-only courier learns the same terrain eventually by walking it; the ring's
value is learning it *before* committing.

Each run walks tile by tile, re-planning only when the committed route turns out
to be blocked. Both arms use the same fog reveal radius, so the ring is not
credited with the reveal bonus that the same Wayfinder ranks also grant.

Priced over every contract route in all three regions, at ranks 1 to 3:

| Loadout | Routes changed | Travel cost saved | Dead ends avoided |
| --- | --- | --- | --- |
| All upgrades | **0 of 69** | 0.00 of 1877.9 (0.00%) | 0 |
| No reveal upgrades | 18 of 69 | 106.72 of 2060.4 (5.18%) | 10 |

The second row is what makes the first trustworthy. A measure that only ever
reports zero is indistinguishable from a broken measure; this one scores exactly
where the geometry says it should and nowhere else.

## What this does and does not settle

Settled: **#361's reading 2 is the right one** ("#341 helped but not enough"),
and more specifically it helped by zero for the build that was measured. The
survey ring as shipped is not a balance problem, it is a dominated mechanic.

Not settled: whether a ring that *did* reach past the fog would feel worth 43
percent more wear per delivery. The 5.18 percent cost saving in the second row is
an upper bound on what the current numbers could deliver even if a player never
bought a reveal upgrade, and 5 percent of travel cost against 43 percent more
wear is still a bad trade.

## The other half of the problem

Wayfinder is also competing with an overloaded rival. Off-road grants +10 percent
speed per rank *and*, at ranks 2 and 3, crossing deep mire without Marsh Treads
(90c) and tidal flats without Salt Runners (140c). Three points of Off-road are
worth 30 percent speed plus 230 coins of upgrades that no longer need buying. No
other skill carries a second effect of that size.

So even a fixed ring is competing against a skill that pays twice. That is a
separate design call and is not settled here.

## Options, if the ring is to be fixed

Cheapest first. None is a recommendation; #361 is an owner call.

1. **Make the ring additive on the fog radius** rather than an independent
   radius: survey = reveal + `k` per rank. This guarantees it always shows
   something, at every loadout, which is what a player would assume it does.
2. **Raise `SURVEY_TILES_PER_WAYFINDER_RANK`** from 3 to clear the reveal
   upgrades. It would need roughly 6 per rank to escape a fully-fitted courier's
   fog, which is a large ring and may read as a minimap that just shows the map.
3. **Give the ring a different job** than radius, for example marking route
   hazards or crossings rather than raw terrain, so it stops competing with the
   fog on the fog's own terms.
