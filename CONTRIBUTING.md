# Contributing

This is a solo, learning-first project. External code contributions are not
being accepted right now, but feedback, bug reports, and ideas are welcome
through GitHub issues. The build is public (see the README for the play link).

If you do work in a fork, the workflow is:

1. Branch from `main` (one short-lived branch per change).
2. Keep changes small and focused.
3. Run the checks locally before pushing:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run test:e2e` (if behaviour changed)
4. Open a pull request into `main`. CI (lint, typecheck, tests, build, browser
   smoke test) must pass before merge.

## Conventions

- Conventional Commits (for example `feat: add minimap`, `fix: ...`, `chore: ...`).
- No em dashes in code, comments, docs, commit messages, or UI text.
- Pure game logic lives in `src/systems/` (no Phaser imports) so it stays unit
  testable. Phaser scenes in `src/scenes/`. Canonical content in `src/data/`.
- See `CLAUDE.md` for the full working rules and `docs/` for design notes.
