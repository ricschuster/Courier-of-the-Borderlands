# 0008 - Per-PR preview deploys on GitHub Pages

Status: accepted (2026-07-14). Implements #219. Follows #218 (release
versioning) as the second slice of the release and delivery thread.

## Context

The game deploys to GitHub Pages on every merge to `main`, but there was no way
to try a change in a real browser before merge: reviewers (currently the owner)
either trust the automated checks or build locally. A per-PR preview URL closes
that gap and is especially valuable for a game, where "does it feel right" is not
something unit tests answer.

The hard constraint is that GitHub Pages serves exactly one branch (`gh-pages`).
A preview therefore has to live as a subfolder of that same branch, which
collides with how the main site was published: the old deploy did
`git init` in `dist/` and force-pushed a fresh `gh-pages`, so it would erase any
preview folders on every merge.

## Decision

1. **Previews live at `gh-pages/pr-preview/pr-<N>/`**, deployed by
   [`rossjrw/pr-preview-action`](https://github.com/rossjrw/pr-preview-action)
   from a new `preview.yml` workflow on `pull_request` events. It deploys on
   open/reopen/synchronize, removes the folder on close, and comments the preview
   URL on the PR. The URL is
   `https://ricschuster.github.io/Courier-of-the-Borderlands/pr-preview/pr-<N>/`.

2. **The main deploy is now non-destructive.** `deploy.yml` was switched from the
   hand-rolled force-push to
   [`JamesIves/github-pages-deploy-action`](https://github.com/JamesIves/github-pages-deploy-action)
   with `clean-exclude: pr-preview`, so a main deploy refreshes the live game at
   the root while preserving the `pr-preview/` subtree. This coexistence is the
   crux of the whole feature.

3. **Preview builds use their own base path.** Vite's `base` already reads a
   `BASE_PATH` override; the preview job sets
   `BASE_PATH=/Courier-of-the-Borderlands/pr-preview/pr-<N>/` so hashed asset
   URLs resolve under the subfolder.

4. **Both gh-pages writers share one concurrency group** (`gh-pages-write`,
   `cancel-in-progress: false`) so the main deploy and a preview deploy serialize
   their commits to the branch instead of racing.

5. **Fork PRs are skipped**, not failed: they get a read-only token and cannot
   push. Solo work runs from same-repo branches, which have write access.

## Consequences

- Adds two marketplace GitHub Actions (CI-only, no npm/runtime dependency), so
  the deployed bundle and Pages hosting are unchanged.
- Rewrites the production deploy step. It uses a standard, widely used action,
  but the `workflow_run`-triggered `deploy.yml` only runs on `main`, so this
  change is first exercised in production after merge, not on its own PR. The
  preview workflow itself does run on this PR, so the preview path is validated
  pre-merge; the non-destructive main deploy is the part to watch on the first
  post-merge deploy.
- Every PR now costs one extra build and a small, self-cleaning slice of the
  gh-pages branch.
- **A preview shares an origin with the live game, and therefore its
  localStorage** (found 2026-07-15, #278). This consequence was missed when the
  decision was taken. `localStorage` is scoped to scheme plus host, not path, so
  a preview at `/pr-preview/pr-N/` read and wrote the same save, difficulty,
  telemetry, and error keys as the live game at `/`: opening a preview resumed
  the player's real save and then autosaved over it.

  Fixed by namespacing every storage key with the build's base path
  (`src/systems/storage-namespace.ts`), which already differs per deploy and
  reaches the bundle as `import.meta.env.BASE_URL`. The production base is the
  one base that namespaces to nothing, so live keys are byte-for-byte unchanged;
  renaming them would have orphaned every existing save, which is the #123
  failure mode. Previews are also isolated from each other.

  The general lesson for anything else hosted on this origin: path is not a
  security or isolation boundary in the browser. Any new client-side storage must
  route its key through `namespacedKey`.

## Alternatives considered

- **External preview host (Netlify, Vercel, surge):** first-class preview
  support, but adds an external service and secrets, against the self-contained
  Pages constraint in CLAUDE.md.
- **A second Pages branch for previews:** not possible; Pages serves only one
  branch, which is why previews must be a subfolder and the main deploy had to
  become non-destructive.
