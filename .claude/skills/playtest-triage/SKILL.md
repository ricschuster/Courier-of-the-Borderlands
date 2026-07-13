---
name: playtest-triage
description: Turn a raw playtest note dump into triaged GitHub issues and ship the clear fixes. Use when the owner pastes a batch of playtest notes (bugs, confusions, balance complaints, ideas) and wants them sorted into actionable work. Encodes this repo's triage buckets, labels, and one-PR-per-fix landing flow.
---

# Playtest triage

The owner playtests by driving the live build and pasting a batch of notes. A
fresh playtest is the real signal for tuning, so when notes arrive, they take
priority: triage them into issues and ship the clear fixes the same session.

## 1. Split each note into a bucket

Read the whole dump first, then sort each note:

- **fix-now (bug):** clearly wrong behaviour with an unambiguous correct answer
  (a false popup, an overlapping panel, a broken unlock). Label `bug`.
- **fix-now (enhancement):** a small, uncontroversial improvement the owner
  clearly wants and that has one obvious implementation. Label `enhancement`.
- **design-call:** the fix depends on a direction only the owner should pick
  (weather strength, whether a mechanic earns its complexity, tone). Label
  `design-call`. Do NOT build these autonomously; file and summarise the choice.
- **playtest-gated:** needs a human play signal to confirm before or after
  building (a tuning value, "does this even feel bad"). Label `playtest-gated`.
- **tech-debt:** an internal smell the note exposed. Label `tech-debt`.

One note can spawn more than one issue. Keep issue titles short and specific.

## 2. File the issues

`gh issue create` for each, with the label above. Reference the source playtest
date in the body. Note: `gh issue view` fails on this repo with a Projects-classic
GraphQL error, so read issues with
`gh api repos/:owner/:repo/issues/N --jq '.title, .body'` instead. `gh issue
edit` works fine.

## 3. Ship the clear ones, one PR per fix

For each fix-now issue (bug or uncontroversial enhancement):

1. Branch off fresh `main`.
2. Make the smallest useful change. Put pure logic in `src/systems/` with a unit
   test; keep Phaser rendering in `src/scenes/`.
3. `npm run lint && npm test`. If the change touches map layout, region dims, or
   coordinates, also run `npx playwright test --project=chromium` (the arc alone
   misses coordinate drift; see the `region-map` skill).
4. Open a PR with `Closes #N`, arm squash auto-merge (`--squash --auto`), move on.
   `main` is branch-protected, so everything lands through a PR.

Ship one clear fix per PR rather than batching, so each is easy to review and
revert.

## 4. Leave the gated ones for the owner

Summarise every `design-call` and `playtest-gated` issue in your reply as a
concrete choice ("keep X / strengthen X / drop X"), with a recommendation, but do
not implement them until the owner picks. Difficulty tuning in particular is best
unblocked by a human playtest, not a local autoplay measurement, which strands
more than a careful driver.
