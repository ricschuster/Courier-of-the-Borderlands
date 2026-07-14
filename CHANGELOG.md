# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

From 0.1.0 onward this file is maintained automatically by
[release-please](https://github.com/googleapis/release-please) from Conventional
Commit messages. Do not edit released sections by hand; write good commit
messages instead. See `docs/decisions/0007-release-versioning.md`.

## [0.1.0] - 2026-07-14

Baseline release. This entry summarizes the state of the game at the point the
release process was introduced; earlier per-change history lives in the git log
and the session handoffs under `docs/handoffs/`.

### Features

- Three-region arc (Greybridge, Saltreach, Fenmarch) with per-region fog of war,
  terrain-based movement, and gateway travel between regions.
- Full delivery loop: contract board, cargo types with pay modifiers, delivery
  rewards, reputation tiers, and currency.
- Progression: courier skills and experience, wagon upgrades, and a wagon
  condition travel sink (ADR 0005) with repair and rescue.
- Narrative layer: settlement dialogue, story threads, missions, road
  encounters, reveal-rewarded wayside lore, and an end-of-arc capstone.
- Unlockable routes: per-region fords and the Off-road mire shortcut.
- Gameplay telemetry captured to localStorage with a standalone dashboard
  (`telemetry.html`).

### Art

- Kenney CC0 art skin behind data-driven layers (terrain, settlements,
  signposts, wagon, UI panels), deterministic per-tile terrain variety, and a
  wagon-condition meter.

### Build and tooling

- TypeScript + Phaser 3 + Vite, deployed to GitHub Pages.
- Unit tests (Vitest) for pure systems, a browser smoke suite and a full-arc
  playthrough guard (Playwright), and CI on every push and PR.
- Phaser split into its own cached bundle chunk.
