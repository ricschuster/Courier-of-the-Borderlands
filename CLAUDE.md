# CLAUDE.md

## Project name

Courier of the Borderlands

## Project purpose

This is a solo, learning-first game development project built with Claude Code.

The goal is to build a working 2D web game that is fun to play, easy to understand, and easy to extend. The immediate target is a playable MVP with one small region, one complete delivery loop, fog-of-war exploration, terrain-based movement, and light progression.

The project owner is relying heavily on Claude Code for implementation, scaffolding, refactoring, testing, and documentation. Prioritize clear, maintainable code over clever code.

## Game summary

Courier of the Borderlands is a 2D fantasy courier exploration game.

The player is a courier in a fractured frontier region where roads are unreliable, settlements are isolated, and information matters as much as goods. The player accepts delivery contracts, drives across difficult terrain, reveals the map, builds reputation with settlements, and unlocks safer routes, vehicle upgrades, and story threads.

Short pitch:

> A 2D fantasy courier game about delivering goods, letters, rumours, and secrets across a dangerous borderland, where every route reveals more of the map and changes the player's reputation with the people who depend on them.

## Project status

The MVP shipped and the game is live (0.4.0, deployed to GitHub Pages). The first
region is the Greybridge Region; Fenmarch and Saltreach followed. The full delivery
loop, fog-of-war, terrain movement, contracts, economy, reputation, upgrades, route
unlocks, and story text are all built.

For what has been delivered milestone by milestone, and what the original MVP scope
was, see `docs/design/02_milestones.md` (M0/M1/M2 marked DONE). Open GitHub issues
are the live roadmap from here; this file is direction and working rules, not a
task list.

## Design pillars

1. Exploration first  
   The player should always want to reveal one more stretch of road.

2. Deliveries drive progression  
   Every contract should move the world, reputation, map, vehicle, or story forward.

3. Roads are gameplay  
   Terrain, route quality, shortcuts, and hazards create the main challenge.

4. Story through places  
   Lore should emerge from settlements, route names, delivery notes, and short NPC interactions.

5. Small systems, clear feedback  
   Mechanics should be simple, visible, and testable before they become deep.

## Scope

A 2D top-down fantasy courier game for the web: map exploration, light
progression, story-flavoured route planning, built as a data-driven systems and
learning project.

It is deliberately not a 4X, a racing game, an open-world or combat-first RPG, a
heavy economy sim, multiplayer, or 3D. Do not expand scope without an explicit
design note or architecture decision record.

## Recommended stack

Use the following stack unless the project owner explicitly changes direction:

- TypeScript
- Phaser 3
- Vite
- Vitest
- Playwright for browser smoke tests (arc and region specs; now central, not "later")
- GitHub
- GitHub Pages for deployment
- Markdown documentation
- Typed TypeScript data modules for game content (see Data rules)

## Coding principles

Prioritize:

1. Simple, readable code
2. Clear data models
3. Small modules
4. Testable pure logic
5. Data-driven content
6. Fast local development
7. Low art dependency
8. Easy refactoring

Avoid:

1. Large files
2. Hidden global state
3. Premature abstraction
4. Complex inheritance chains
5. Magic numbers without names
6. Untested game rules
7. Polished UI before playable systems
8. Adding dependencies without documenting why

## TypeScript rules

Use strict TypeScript.

Rules:

1. Avoid `any`.
2. Prefer explicit types for game data.
3. Use interfaces or type aliases for contracts, terrain, settlements, upgrades, and player state.
4. Keep pure game logic outside Phaser scenes where practical.
5. Put testable systems in `src/systems/`.
6. Put Phaser-specific rendering and input logic in `src/scenes/`.
7. Keep canonical game data in typed data modules under `src/data/`.
8. Validate assumptions at module boundaries.

## Repo structure

The shape that has held up; keep to it unless there is a strong reason not to.

- `src/scenes/` Phaser scenes: rendering and input.
- `src/systems/` pure, testable game logic (movement, fog, contracts, economy,
  upgrades, storage-namespace, ...). Keep game rules here, out of scenes.
- `src/data/` canonical content as typed TS modules (terrain, settlements,
  contracts, regions, upgrades, dialogue). No JSON (see Data rules).
- `tests/unit/` Vitest for pure logic; `tests/e2e/` Playwright specs.
- `docs/design/`, `docs/decisions/` (ADRs), `docs/handoffs/`.
- `assets/`, `.github/workflows/`, `scripts/`.

The repo root also carries the player-facing site (`play.html`, `manual.html`,
`news.html`, `telemetry.html`), release tooling (`release-please-config.json`,
`CHANGELOG.md`), and `CONTRIBUTING.md` / `SECURITY.md`. Explore the tree rather
than trusting a static diagram; this list drifts.

## File naming

Use codebase conventions appropriate to each file type.

For code:

- Use lowercase kebab-case for file names.
- Example: `terrain-system.ts`, `fog-of-war-system.ts`, `contract-system.ts`

For Markdown docs:

- Use numbered prefixes for stable design docs.
- Example: `00_project_brief.md`, `01_core_loop.md`

For session handoffs:

- Use ISO date prefix.
- Example: `2026-07-04_Handoff_v01.md`

For game data:

- Use lowercase kebab-case TypeScript modules in `src/data/`.
- Example: `terrain-types.ts`, `contracts-greybridge.ts`, `settlements-greybridge.ts`

## Style rules

1. Do not use em dashes in docs, comments, commit messages, or UI text.
2. Keep writing concise and direct.
3. Use bullets and numbered lists where helpful.
4. Prefer plain language over jargon.
5. Label assumptions clearly.
6. Do not invent lore or mechanics without adding them to a design note.

## Data rules

Game content is data-driven. Canonical content lives in typed TypeScript modules
under `src/data/` (for example `terrain-types.ts`, `contracts-greybridge.ts`,
`region-fenmarch.ts`). This already covers terrain types, settlements, contracts,
routes, vehicle upgrades, reputation tiers, story snippets, and region metadata.

There is no JSON game data, and adding some is a non-goal. The early docs
recommended JSON "eventually," but the project settled on typed modules because
they get compiler checking for free and need no schema tooling. Do not report
JSON data as current state or plan against it; a tool or feature that assumes a
JSON content layer (see the closed #225 and #229) is building on something that
does not exist. Migrating to JSON would need an ADR in `docs/decisions/` first.

## Testing expectations

Use tests to protect game logic.

Unit test candidates:

- Terrain speed modifier calculations
- Fog-of-war reveal calculations
- Contract state transitions
- Delivery completion rules
- Reward calculations
- Reputation changes
- Unlock conditions

Do not over-test Phaser rendering early. Prioritize pure game logic.

Before presenting work as complete:

1. Run lint.
2. Run tests.
3. Run the game locally.
4. Confirm the first delivery loop works.
5. Update relevant docs if behaviour changed.

Note on e2e coverage for map or region changes: `npm run test:arc` runs only
the `arc` project (`full-arc`), so it does NOT cover the region-specific specs
that hardcode coordinates (for example `fenmarch-unlock.spec.ts`,
`tidal-route.spec.ts`, and the ford/tidal signpost conventions). When you touch
map layouts, region dimensions, settlement or crossing coordinates, spawn, or
gateway/signpost tiles, run the full browser suite with
`npx playwright test --project=chromium` before pushing, not just the arc.
Otherwise CI is the first place the coordinate drift shows up.

## Recurring traps

Things that have cost this project real time more than once. Each has a fuller
record in the repo; these lines exist so a session meets them before it needs
them, not after.

1. **A green suite can prove nothing.** Two shapes recur: a function with no
   caller (no unit test sees it), and a path whose broken and correct behaviour
   are identical in the default case (the production storage base). Before
   trusting a test, neutralize the fix, watch it fail, then restore. Visual work
   needs a screenshot of real play; tests cannot see it. Detail in handoff
   2026-07-15 v24.
2. **A brainstormed issue batch is not vetted work.** The 2026-07-14 batch
   (#221-#230) was written against this file and the docs rather than the code,
   so it reported aspirations (JSON data that does not exist) as current state.
   Four of ten were already built or did not apply. Check any brainstorm output
   against the code before treating it as work.
3. **Any new client-side storage must route its key through `namespacedKey`**
   (`src/systems/storage-namespace.ts`). Path is not an isolation boundary in the
   browser. Production is the one base that namespaces to nothing, and its keys
   must not change: renaming them orphans every existing save. See ADR 0008.
4. **If the full-arc guard flakes, classify before chasing.** It is one of three
   faces: a one-shot press missing `tapKey`, a harness-timing artifact (PR #137),
   or a genuine soft-lock. It never reproduces locally, so one green run proves
   nothing; take several samples. Detail in handoffs 2026-07-11 v06 and
   2026-07-12 v08.
5. **A tool with no CI job and no README entry rots silently.** `autoplay.mjs`
   drifted three ways (#284) while every test stayed green, and its log
   reproduced the false progression-flatline signal that opened the roads-gate
   thread. If you add a script, give it an npm entry and a README line, or expect
   it to be wrong the next time someone trusts it.

## Git and commit expectations

Use Git from day one.

Commit style:

- Use concise Conventional Commit style.
- Examples:
  - `feat: add terrain speed modifiers`
  - `feat: add fog-of-war reveal`
  - `test: cover contract completion rules`
  - `docs: add project brief`
  - `refactor: separate movement logic from scene`

Keep commits small and meaningful.

PR flow (owner preference): work one feature or slice per branch and PR. Land it
without stopping to ask: push, open the PR with `Closes #N`, arm auto-merge with
`gh pr merge <n> --squash --auto`, watch checks, then move on. `main` is
branch-protected, so everything goes through a PR. Verify before opening the PR
(typecheck, lint, tests, and the browser/e2e gate the change warrants).

## Issue workflow

GitHub issues are the durable, cross-session tracker. Split work by lifecycle:
anything that gets opened and later closed (features, bugs, tech debt, open
"next actions," known smells) belongs in an issue; the narrative of a session
belongs in a handoff.

Rules:

1. Open an issue when starting a feature or a slice of work. Reference it in the
   PR body with `Closes #N` so the merge auto-closes it. Open issues are the
   live roadmap: open = todo, closed = shipped.
2. Do not retroactively open and close issues for already-shipped work, and do
   not bulk-migrate old handoffs. Track from here forward.
3. Keep handoffs thinner: summary, what changed and why, decisions, and the
   current-state snapshot. Replace inline task lists with links to the relevant
   open issues rather than duplicating them.
4. Labels, kept minimal: `bug`, `enhancement` (features), `tech-debt`,
   `design-call` (needs an owner decision first), `playtest-gated` (blocked on a
   human playtest signal).

## Where durable context lives

The owner works across more than one Claude subscription and machine, so any
Claude-local personal memory (for example `~/.claude*/.../memory/`) is NOT shared
or permanent and MUST NOT be the home for durable project context. The repository
is the single source of truth, because it travels through git to every machine:

1. Trackable, open-then-closed work (features, bugs, tech debt, parked threads) ->
   GitHub issues (see Issue workflow).
2. Owner direction and working preferences -> this file (CLAUDE.md).
3. Design threads and decisions -> `docs/design/` and `docs/decisions/` (ADRs).
4. Session narrative -> `docs/handoffs/`.

Do not rely on personal memory to carry a fact from one session to the next; if
something is worth remembering, write it to one of the four homes above. Personal
memory is at most a scratch cache of what is already durable in the repo.

The personal memory store is deliberately empty as of 2026-07-15, and the aim is to
keep it that way. A cleanup found every entry duplicated the repo and some pointed
sessions at work that had already shipped: the failure mode is not the writing, it
is that nothing ever deletes, so a stale cache actively misleads. If a fact would be
recorded only in memory, that is the signal to write it to one of the four homes
above instead. The store's own guard file records the same rule.

## Command style

Run shell commands as single, atomic invocations so they can be matched against
the permission allowlist in `.claude/settings.json` and run without extra
confirmation prompts.

- Avoid compound commands: `for`/`while` loops, `if`, pipes, and command
  substitution `$(...)` cannot be statically analyzed, so they always prompt
  even when the inner command is allowlisted.
- Do not prefix commands with `source ~/.bashrc`. Node and npm are already on
  the default PATH; the prefix does nothing useful and turns every command into
  an unmatchable compound.
- To wait for CI on a pull request, use `gh pr checks <number> --watch` (one
  command that blocks until checks finish), not a hand-rolled polling loop.
- Prefer many small allowlisted commands over one bundled script.
- Pass long text through a file, never a heredoc (a heredoc is a compound and
  always prompts). Write the text with the Write tool first, then
  `git commit -F <file>` for a commit message and `gh pr create --body-file <file>`
  for a PR body.
- `gh pr edit` fails on this repo with a Projects-classic GraphQL error. To edit
  a PR body, use `gh api -X PATCH repos/:owner/:repo/pulls/N -F body=@file`
  instead. (`gh issue edit` works fine.)

## Dependency rules

Before adding a dependency:

1. Explain why it is needed.
2. Prefer built-in TypeScript, Phaser, or Vite capabilities first.
3. Add a short architecture decision record in `docs/decisions/` for major dependencies.
4. Avoid dependencies that complicate deployment to GitHub Pages.

## Documentation expectations

Maintain Markdown docs as the project evolves.

Minimum docs:

1. `README.md`: how to install, run, test, and deploy
2. `docs/design/00_project_brief.md`: project concept and MVP
3. `docs/design/01_core_loop.md`: current gameplay loop
4. `docs/design/02_milestones.md`: milestone plan
5. `assets/credits.md`: asset sources and licenses
6. `docs/handoffs/`: session handoffs when useful

When adding a major mechanic, update the relevant design doc.

## Session handoff format

When creating a handoff, use this structure:

```markdown
# Session Handoff: YYYY-MM-DD

## Summary

Brief summary of what changed.

## Completed

- Item 1
- Item 2

## Current state

- What works
- What is incomplete
- Known issues

## Next actions

1. Next action
2. Next action
3. Next action

## Risks or decisions needed

- Risk or decision
```

Land handoffs by default. After writing `docs/handoffs/<date>_Handoff_vNN.md`,
branch, commit, push, and open a PR in one flow without stopping to ask (this
repo's `main` is branch-protected, so handoffs go through a PR). The owner has
asked for this to be automatic.

## Art strategy

Do not let art block the prototype.

Phase 1:

- Use coloured tiles.
- Use simple shapes.
- Use labels and icons.
- Use placeholder UI.

Phase 2:

- Add free asset packs.
- Track asset sources in `assets/credits.md`.

Phase 3:

- Consider custom or AI-generated assets only after the core loop works.

## Current default decisions

Use these defaults unless the project owner changes them:

1. Vehicle type: small courier wagon
2. Movement style: smooth top-down movement
3. Combat: not in MVP
4. Time pressure: not in MVP
5. Tone: mysterious and slightly dangerous
6. World: medieval/fantasy borderlands
7. First region: Greybridge Region
8. First challenge type: terrain and roads
9. First progression types: map reveal, reputation, currency, route unlock, vehicle upgrade
10. First delivery types: goods, letters, rumours, and secrets

## Owner direction and working preferences

Durable context from the owner (carry across sessions):

1. Gameplay should have real teeth, not be forgiving. Gold, upgrades, and skills
   must matter from the early game, not be optional convenience. An MVP-era build
   that could be finished without spending coins or using skills was flagged as
   the core problem. When tuning difficulty, err on the harder side: the owner
   repeatedly found small nudges insufficient and prefers decisive changes. They
   like RPG-style progression (start fragile, small stats, grow with level, e.g.
   the wagon condition tank starting small). They spot exploits (like living
   stranded at 0 condition to dodge repair cost) and expect them closed, not just
   discouraged. They tune by playing and reporting concrete numbers, so give one
   clear lever per round and state the exact new values.

2. CI, test, and process work is a deliberate, wanted category, not a
   distraction. The owner invests in it partly to learn that side of software
   development. Do not steer away from it or frame a run of infra/test PRs as an
   anti-pattern. Still surface the tradeoff when game content is being deferred
   (a human playtest is usually the real unblock for tuning), but as a choice,
   not a mistake.

## Model and effort defaults

Recommended setup for this project (defaults for effort and fast mode live in
`.claude/settings.json`; model is chosen per session with `/model`):

1. Orchestrator (the main session): Opus for design, integration, refactors,
   and tradeoff calls. Drop to Sonnet for light or mechanical turns (doc edits,
   merging a dependency PR, small changes) to conserve budget.
2. Sub-agents: use Sonnet for isolated, well-specified pure-module work. It is
   cheaper and faster and has been reliable for the fan-out batches.
3. Effort: medium by default; high only for hard integration (cross-cutting
   refactors, save or data-format changes). Avoid xhigh unless stuck.
4. Run `npm run setup` to bootstrap a fresh machine (installs deps and the
   Playwright browser). Node version is pinned in `.nvmrc`.

## Session start

At the start of a session, before diving into the task, glance at open GitHub
issues with `gh issue list`. If any are relevant to what the owner is asking
about (or are newly urgent, like a tracked flake that has started firing on
`main`), surface them briefly at the top of your first substantive reply. Keep
it to a one-line mention per relevant issue; do not dump the whole list or act
on issues the owner did not ask about. Issues are the durable tracker between
sessions, so this is how stale items get resurfaced.

## Repo-local skills

This repo ships Claude Code skills in `.claude/skills/` that encode recurring,
multi-step workflows so any session runs them the same way. Reach for them
instead of re-deriving the steps:

- `region-map` when authoring or resizing a region map (reachability invariants,
  the sealed-pocket shortcut rule, the wear estimate, and the `test:arc`
  coordinate-drift trap).
- `playtest-triage` when the owner pastes a batch of playtest notes (bucket into
  issues, ship the clear fixes one PR at a time).

See `.claude/skills/README.md` for what each covers and the line between a skill
and plain `CLAUDE.md` / `docs/` guidance.

## Claude Code operating mode

Act as an autonomous coding agent, but keep the project owner in control of design direction.

When working:

1. Make the smallest useful change.
2. Keep the game runnable.
3. Prefer working gameplay over polish.
4. Write or update tests for pure logic.
5. Update docs when design or behaviour changes.
6. Do not expand scope without noting the tradeoff.
7. Flag risks clearly.
8. Avoid speculative complexity.
9. Keep outputs concise.
10. Do not use em dashes.

When uncertain, choose the simplest option that supports the MVP.
