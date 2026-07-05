import { defineConfig } from 'vitest/config';

// Base path is set for GitHub Pages project sites, where the app is served
// from /<repo-name>/. Override with the BASE_PATH env var if needed.
const base = process.env.BASE_PATH ?? '/Courier-of-the-Borderlands/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
  },
});
