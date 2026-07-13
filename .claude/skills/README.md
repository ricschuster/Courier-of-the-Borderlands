# Repo-local Claude Code skills

Invocable procedures for this project's recurring, multi-step workflows. Unlike
`CLAUDE.md` (always-loaded passive guidance), a skill is pulled in on demand and
encodes an ordered process with its guardrails, so any session runs it the same
way. A skill lives in `.claude/skills/<name>/SKILL.md` with `name` and
`description` frontmatter.

## What lives here

- **region-map** - author or resize a region map. Front-loads the reachability
  invariants, the sealed-pocket shortcut rule, the wear/travel-sink estimate, and
  the coordinate-drift trap where `test:arc` misses the region-specific specs.
- **playtest-triage** - turn a raw playtest note dump into bucketed GitHub issues
  and ship the clear fixes one PR at a time.

## Recommendation (issue #167)

Verdict: **build 2** (the two above). Rationale:

- The two built skills encode process that was learned the hard way (the
  `test:arc` coordinate gap and the sealed-pocket requirement) or that turns a
  frequent, ad-hoc chore (playtest triage) into a repeatable one. Both are
  distinct enough from `CLAUDE.md` to earn their place and stable enough not to
  drift with the code (they point at the source of truth rather than copying
  coordinates).
- **Declined: a "write + land a handoff" skill.** `CLAUDE.md` already carries the
  full handoff format and the "land handoffs by default" auto-land flow. A skill
  would duplicate it with no added procedure, and a drifting duplicate is worse
  than none. If the handoff flow ever grows beyond what `CLAUDE.md` states inline,
  revisit.

Skills end and docs begin at the line between "a procedure with steps and
guardrails I want run identically each time" (skill) and "a fact or rule I want
in context by default" (`CLAUDE.md` / `docs/`). Keep a skill pointing at the code
it describes so it fails loud rather than drifting silent.
