# Courier of the Borderlands

[![CI](https://github.com/ricschuster/Courier-of-the-Borderlands/actions/workflows/ci.yml/badge.svg)](https://github.com/ricschuster/Courier-of-the-Borderlands/actions/workflows/ci.yml)

A 2D fantasy courier exploration game for the web. Deliver goods, letters, rumours, and secrets across a dangerous borderland, reveal the map, and build reputation with the people who depend on you.

## Play

Play in your browser: https://ricschuster.github.io/Courier-of-the-Borderlands/

Your progress is saved locally in the browser and resumes when you return.

Balance telemetry dashboard (metrics from your own play):
https://ricschuster.github.io/Courier-of-the-Borderlands/telemetry.html

## Status

Playable and deployed, with grey-box art. Three regions are open (Greybridge, Saltreach, and Fenmarch), connected by travel. The core courier loop works end to end: accept contracts, plan routes across terrain, reveal the map, deliver, and grow.

Features so far:

- Three regions with travel between them, each with its own map, settlements, and contracts
- Smooth top-down driving with terrain-based speed (roads and bridges fast, forest slow, water and mountains impassable)
- Fog-of-war exploration, tracked per region
- Reputation-gated contract board, with optional bonus objectives for extra pay
- Currency and reputation that raise your standing (and your delivery rates) across regions
- Seven vehicle upgrades (speed, wider fog reveal, rough-terrain relief, and treads and runners that let you cross deep mire and tidal flats), bought at the home town
- Unlockable ford shortcuts in each region, plus capability-gated crossings (deep mire and tidal flats) opened by the right upgrade or skill
- Courier skills spent as you level up, plus settlement dialogue, story threads, missions, and road encounters
- Wagon condition that wears with travel and needs repair (or a paid rescue when stranded), tuned by three difficulty presets
- Route guidance (distance to destination and a route drawn on the minimap)
- Minimap, discoveries journal, terrain codex, achievements, and a courier title
- Ambient weather that nudges speed and visibility each run
- Save and resume via the browser, with a one-key new game

## Inspirations

- Civilization: map discovery and long-term progression
- Need for Speed: movement, routes, and vehicle improvement
- Gothic: sense of place, settlements, reputation, and regional mystery

This project borrows the feeling of these games, not their scope.

## Tech stack

- TypeScript (strict)
- Phaser 3
- Vite
- Vitest for unit tests
- Playwright for browser smoke tests
- GitHub for source control
- GitHub Actions for CI
- GitHub Pages for deployment
- Markdown for documentation
- JSON for canonical game data

## Quick start

Prerequisites:

- Node.js 22 or newer (the exact version is pinned in `.nvmrc`)
- npm 11 or newer
- Git

Clone and install:

```bash
git clone <your-repo-url>
cd courier-of-the-borderlands
npm install
```

To also install the Chromium build the browser tests use, run `npm run setup`
instead of `npm install`.

Run the game locally:

```bash
npm run dev
```

Then open the URL printed by Vite (typically http://localhost:5173).

## Controls

- Arrow keys or WASD: drive the courier
- Number keys: accept a contract at the board, or spend a skill point in the skills panel
- B: buy the next upgrade (at the home town)
- R: repair the wagon at a settlement, or pay for a tow when stranded on the road
- E: talk to an NPC (at a settlement with dialogue)
- T: travel to the connected region (on a gateway tile, when not carrying cargo)
- M: toggle the minimap
- J: toggle the discoveries journal
- K: toggle the skills panel
- L: toggle the terrain codex
- Space: dismiss an on-screen message
- N: start a new game (clears the save)
- G: cycle difficulty (relaxed / standard / demanding); the choice is saved and changes wagon wear and repair costs

## Testing

Run the unit tests (Vitest):

```bash
npm test
```

Run the browser tests (Playwright, builds and drives the game in Chromium):

```bash
npm run test:e2e
```

These include smoke tests (the game boots and renders without runtime errors)
and input-driven playthroughs that drive the courier with real key presses: one
completes a full delivery loop, and one unlocks the southern ford by reaching
its signpost and confirms the blocked route opens. The playthroughs boot the
game with `?e2e`, which attaches a small read-only `window.__courier` hook used
only for reading state, pathfinding waypoints, and tile passability during
tests. The hook is never attached in normal play.

Lint the codebase:

```bash
npm run lint
```

Build a production bundle:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Capture a screenshot for visual verification of a UI change:

```bash
npm run shot -- <name> [key]     # e.g. npm run shot -- journal j
```

This builds, starts its own preview server, boots the game, optionally presses a
key (for example `j` to open the journal), writes `tmp-screenshots/<name>.png`,
and tears the server down again. Add `--no-build` to reuse the current `dist/`.
Output is gitignored.

## Project structure

```text
courier-of-the-borderlands/
├── CLAUDE.md                    # Instructions for Claude Code
├── README.md                    # This file
├── docs/
│   ├── design/                  # Living design docs
│   │   ├── 00_project_brief.md
│   │   ├── 01_core_loop.md
│   │   └── 02_milestones.md
│   ├── decisions/               # Architecture decision records
│   └── handoffs/                # Session handoffs
├── src/
│   ├── main.ts                  # Entry point
│   ├── scenes/                  # Phaser scenes
│   ├── systems/                 # Pure, testable game logic
│   ├── entities/                # Game entities
│   ├── data/                    # Canonical game data (JSON or typed modules)
│   ├── ui/                      # UI components
│   └── utils/                   # Shared helpers
├── assets/
│   ├── sprites/
│   ├── audio/
│   └── credits.md               # Asset sources and licences
├── tests/
│   ├── unit/                    # Vitest unit tests
│   └── e2e/                     # Playwright smoke tests
├── .github/workflows/           # CI and deploy workflows
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Design docs

Start with the project brief, then read the core loop and milestones.

- `docs/design/00_project_brief.md`: concept, MVP scope, and definition of done
- `docs/design/01_core_loop.md`: current gameplay loop
- `docs/design/02_milestones.md`: milestone plan and status
- `docs/design/03_regions.md`: regions, travel, and per-region state
- `docs/decisions/`: architecture decision records (systems layering, regions)
- `docs/handoffs/`: dated session handoff notes

## Development notes

- Use lowercase kebab-case for code file names, for example `terrain-system.ts`.
- Keep pure game logic in `src/systems/` so it can be unit tested independently of Phaser.
- Keep canonical game data in JSON when practical, or in typed modules that are easy to migrate to JSON later.
- Do not use em dashes anywhere in code, comments, docs, commit messages, or UI text.
- Use Conventional Commits, for example `feat: add fog-of-war reveal`.
- Do not expand scope beyond the MVP without a short note in `docs/decisions/`.

### Telemetry dashboard

The game records a compact metrics snapshot at each run milestone (a region
cleared, or the arc finished) to `localStorage`, so balance can be read from
real play instead of hand-reported numbers. Open the
[telemetry dashboard](https://ricschuster.github.io/Courier-of-the-Borderlands/telemetry.html)
(`telemetry.html`) in the same browser you play in (dev server or the deployed
site) to see per-region averages
(coins, wear, condition, deliveries, strands) and the recent-milestone history,
with buttons to export the raw JSON or clear the store. The capture logic lives
in `src/systems/telemetry.ts` (pure, unit tested); the dashboard is
`src/telemetry/dashboard.ts`.

### Releases

Versioning follows [Semantic Versioning](https://semver.org), driven by the
Conventional Commit messages the repo already uses (`feat:` bumps the minor,
`fix:`/`perf:` the patch, a breaking change the major).

Releases are cut with [release-please](https://github.com/googleapis/release-please):
a GitHub Action keeps a standing "release PR" open on `main` that lists every
user-facing change queued since the last release. To publish, review and merge
that PR; it tags `vX.Y.Z`, creates the GitHub Release, and updates
`CHANGELOG.md`. Leaving the PR open is harmless and it keeps updating as more
commits land. No manual tagging or changelog editing is needed. See
`docs/decisions/0007-release-versioning.md`.

### Preview deploys

Every pull request gets a live preview of the built game so a change can be
tried in a browser before merge. A workflow deploys the PR to
`https://ricschuster.github.io/Courier-of-the-Borderlands/pr-preview/pr-<N>/` and
comments the URL; the preview updates on each push and is removed when the PR
closes. This is why the main deploy is non-destructive (it preserves the
`pr-preview/` subtree). See `docs/decisions/0008-pr-preview-deploys.md`.

Full working rules for Claude Code are in `CLAUDE.md`.

## MVP definition of done

The MVP is done when a player can:

1. Open the game in a web browser.
2. Start in the Greybridge Region.
3. Accept a delivery contract.
4. Drive to a destination.
5. Reveal map areas through fog-of-war.
6. Experience movement differences across terrain.
7. Complete a delivery.
8. Receive visible rewards.
9. Unlock at least one new route, shortcut, contract, or upgrade.
10. Understand the basic fantasy courier premise from in-game text.

Placeholder art is acceptable. A broken core loop is not.

## Roadmap (high level)

- M0 Walking skeleton: repo live, Phaser boots, empty scene renders, CI green. Done.
- M1 Playable prototype: core delivery loop end to end with placeholder art. Done.
- M2 MVP: one full region, three contracts, unlockable route, upgrades, story text, deployed to GitHub Pages. Done.
- M3 Second region: a Region abstraction and registry, the Saltreach region, travel between regions, per-region fog. Done.
- M4 Depth and hardening: a third region (Fenmarch), multi-region travel, per-region fords, and cargo types with pay modifiers. Done.
- M5 RPG and narrative layer: courier skills, settlement dialogue, story threads, missions, road encounters, and a wagon-condition travel sink. Done.
- M6 Art and polish: Phase 2 art skin (Kenney CC0 tiles behind a data layer) and a UI pass. Done.
- M7 Tooling and delivery: gameplay telemetry, release versioning, and per-PR preview deploys. Done.
- Later: more regions and content, audio and juice, and player-facing documentation.

## Contributing

This is currently a solo project. External contributions are not being accepted at this stage. Feedback and playtesting are welcome: the build is public (see Play above).

## Licence

Licensed under the GNU General Public License v3.0. See `LICENSE` for the full text.
