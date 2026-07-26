import { defineConfig, devices } from '@playwright/test';

// The app is served from the project base path (matching GitHub Pages).
// The port is overridable so a second checkout (a git worktree, or a parallel
// agent session) can run its own suite instead of colliding on 4173 (#397).
const PORT = process.env.PREVIEW_PORT ?? '4173';
const BASE_URL = `http://localhost:${PORT}/Courier-of-the-Borderlands/`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Retry only in CI, where transient timing and the apt/browser install step
  // can flake. Locally, retries: 0 keeps flakes visible instead of masked.
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    // Fast browser specs. The full-arc playthrough runs under its own project
    // (below) so it can carry a different retry budget; keep it out of here.
    {
      name: 'chromium',
      testIgnore: /full-arc\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // The full-arc playthrough is a single ~4-minute test. At the default
    // retries: 2 a flake costs three full runs (~16 min), so it gets its own
    // lower retry budget: one retry is enough to ride out a transient hiccup
    // without paying for a third pass. A genuine soft-lock still fails.
    {
      name: 'arc',
      testMatch: /full-arc\.spec\.ts/,
      retries: process.env.CI ? 1 : 0,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Build the production bundle and serve it, so the smoke test exercises the
  // same artifact that gets deployed.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    // Never reuse a server this run did not start (#397). Reuse skips the build
    // step entirely, so the suite can silently report on another checkout's build
    // (a worktree, a parallel agent) or on a stale build left by an interrupted
    // run. That defeats the neutralize-and-watch-it-fail discipline in the worst
    // way: the neutralization appears not to matter, which reads as "this code is
    // dead" rather than "this result is wrong". A guard was cleared of being
    // useless exactly this way, and it took a fresh build to prove otherwise.
    //
    // The build costs about 3 seconds against a two-minute suite, so always
    // rebuilding is not a trade worth making. If the port is already taken,
    // --strictPort now fails loudly instead of quietly borrowing the other
    // server; set PREVIEW_PORT to run a second checkout alongside the first.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
