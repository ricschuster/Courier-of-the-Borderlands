# 0001: Core Systems Architecture

## Status

Accepted

## Context

Phaser 3 scenes are the natural home for all game code, but mixing pure logic with Phaser's rendering and input APIs creates two problems:

1. Game rules become hard to unit test without spinning up a browser or a Phaser instance.
2. Game data becomes coupled to renderer internals, making content changes slower and riskier.

This project is a learning-first build where quick iteration and testable rules matter more than reducing indirection.

## Decision

Split the codebase into three layers with clear rules about what belongs in each.

**`src/systems/` -- pure game logic**

No Phaser imports. No side effects beyond returning new values. Every module in here can be imported directly by Vitest and tested without a DOM or a running game.

Examples: `contract-system.ts`, `terrain-system.ts`, `fog-of-war.ts`, `economy.ts`, `upgrade-system.ts`, `movement.ts`, `game-state.ts`.

**`src/scenes/` -- Phaser rendering and input**

Scenes own the Phaser lifecycle (create, update, destroy) and all rendering calls. They import from `src/systems/` and `src/data/` to drive display. They do not contain game rules.

Currently: `BootScene` and `MapScene`. MapScene owns integration and wiring: it reads input, calls pure systems, and updates the display based on the results.

**`src/data/` -- canonical content**

Typed TypeScript modules holding terrain definitions, settlement data, contract definitions, upgrade data, and region maps. No logic. Structure is kept flat and JSON-migratable so content can move to JSON files later without changing the systems that consume it.

Examples: `terrain-types.ts`, `settlements-greybridge.ts`, `contracts-greybridge.ts`, `upgrades-greybridge.ts`, `greybridge-map.ts`.

## Consequences

**Positive:**

- Pure systems are easy to unit test. Coverage of contract rules, terrain queries, economy calculations, and upgrade logic does not require a Phaser instance.
- Scenes stay thin and readable. Rendering and input logic is easier to reason about when it is not mixed with business rules.
- Content is easy to change. Adding a contract, terrain type, or upgrade is a data edit with no logic changes required.
- The architecture scales to more systems without increasing coupling.

**Negative:**

- There is a small extra layer of indirection. Scenes must import and call systems explicitly rather than computing things inline.
- MapScene still owns the integration layer and must wire systems together correctly. A bug in how the scene calls a system will not be caught by unit tests alone.
- TypeScript data modules require a small migration step if content eventually moves to JSON at runtime. The structure is designed to make that migration straightforward, but it is not free.

The tradeoff is accepted. Testability and fast iteration outweigh the indirection cost for this project.
