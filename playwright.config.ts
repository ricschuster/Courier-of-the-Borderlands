import { defineConfig, devices } from '@playwright/test';

// The app is served from the project base path (matching GitHub Pages).
const BASE_URL = 'http://localhost:4173/Courier-of-the-Borderlands/';

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
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
