# Courier of the Borderlands

A 2D fantasy courier exploration game for the web. Deliver goods, letters, rumours, and secrets across a dangerous borderland, reveal the map, and build reputation with the people who depend on you.

## Status

Early prototype. Building toward a playable MVP with one small region (the Greybridge Region), a single courier vehicle, fog-of-war exploration, terrain-based movement, three delivery contracts, reputation, currency, one unlockable route, and one vehicle upgrade.

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
- Playwright for later browser smoke tests
- GitHub for source control
- GitHub Actions for CI
- GitHub Pages for deployment
- Markdown for documentation
- JSON for canonical game data

## Quick start

Prerequisites:

- Node.js 20 or newer
- npm 10 or newer
- Git

Clone and install:

```bash
git clone <your-repo-url>
cd courier-of-the-borderlands
npm install
```

Run the game locally:

```bash
npm run dev
```

Then open the URL printed by Vite (typically http://localhost:5173).

Run tests:

```bash
npm test
```

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
- `docs/design/01_core_loop.md`: current gameplay loop (to be written)
- `docs/design/02_milestones.md`: milestone plan (to be written)
- `docs/decisions/`: architecture decision records for significant choices
- `docs/handoffs/`: dated session handoff notes

## Development notes

- Use lowercase kebab-case for code file names, for example `terrain-system.ts`.
- Keep pure game logic in `src/systems/` so it can be unit tested independently of Phaser.
- Keep canonical game data in JSON when practical, or in typed modules that are easy to migrate to JSON later.
- Do not use em dashes anywhere in code, comments, docs, commit messages, or UI text.
- Use Conventional Commits, for example `feat: add fog-of-war reveal`.
- Do not expand scope beyond the MVP without a short note in `docs/decisions/`.

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

- M0 Walking skeleton: repo live, Phaser boots, empty scene renders, CI green.
- M1 Playable prototype: core delivery loop works end to end with placeholder art.
- M2 MVP: one full region, three contracts, unlockable route, one upgrade, basic story text, deployed to GitHub Pages.

## Contributing

This is currently a solo project. External contributions are not being accepted at this stage. Feedback and playtesting are welcome once a public build is available.

## Licence

To be decided. Until a licence file is added, all rights are reserved by the project owner.
