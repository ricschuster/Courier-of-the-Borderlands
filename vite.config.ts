import { defineConfig } from 'vitest/config';

// Base path is set for GitHub Pages project sites, where the app is served
// from /<repo-name>/. Override with the BASE_PATH env var if needed.
const base = process.env.BASE_PATH ?? '/Courier-of-the-Borderlands/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Split the Phaser engine into its own chunk, separate from app code.
        // First-load bytes are unchanged (Phaser must load to boot the game), but
        // Phaser almost never changes while the game code changes every deploy, so
        // returning players keep the large engine chunk cached across updates and
        // only re-download the small app chunk.
        manualChunks: (id: string) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
    // Phaser is ~1.3 MB minified (~340 KB gzip) and is not meaningfully
    // tree-shakeable, so its vendor chunk legitimately exceeds Vite's default
    // 500 KB warning. Raise the limit above the engine chunk so the warning still
    // fires for an unexpectedly large *app* chunk, but not for the known engine.
    chunkSizeWarningLimit: 1400,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globals: false,
  },
});
