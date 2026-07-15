import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { parseChangelog, renderChangelogHtml } from './src/systems/changelog';

// Base path is set for GitHub Pages project sites, where the app is served
// from /<repo-name>/. Override with the BASE_PATH env var if needed.
const base = process.env.BASE_PATH ?? '/Courier-of-the-Borderlands/';

const CHANGELOG_PATH = fileURLToPath(new URL('./CHANGELOG.md', import.meta.url));
const CHANGELOG_SLOT = '<!--CHANGELOG-->';

/**
 * Render CHANGELOG.md into news.html at build time (#237).
 *
 * The alternative was fetching the Markdown in the browser, which would mean
 * shipping a Markdown parser to every visitor and leaving the page blank until
 * the fetch lands. Doing it here costs nothing at runtime and keeps the page
 * self-contained, matching how the rest of the site is built.
 *
 * The page has no other source of truth: release-please owns CHANGELOG.md, so
 * the notes update themselves whenever a release lands and there is nothing to
 * remember per release.
 */
function changelogPage(): Plugin {
  return {
    name: 'changelog-page',
    transformIndexHtml: {
      // Run before Vite rewrites asset URLs, so the injected markup is treated
      // like any other markup in the page.
      order: 'pre',
      handler(html: string, ctx: { filename: string }): string {
        if (!ctx.filename.endsWith('news.html') || !html.includes(CHANGELOG_SLOT)) {
          return html;
        }
        const markdown = readFileSync(CHANGELOG_PATH, 'utf8');
        return html.replace(CHANGELOG_SLOT, renderChangelogHtml(parseChangelog(markdown)));
      },
    },
  };
}

export default defineConfig({
  base,
  plugins: [changelogPage()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      // Multi-page. index.html is the landing page, not the game (#237): the
      // site's front door is the pitch, and the game lives at play.html one
      // click away. telemetry.html (#220) reads the same-origin localStorage the
      // game writes, so it works on the dev server and Pages alike.
      input: {
        landing: 'index.html',
        main: 'play.html',
        telemetry: 'telemetry.html',
        manual: 'manual.html',
        credits: 'credits.html',
        news: 'news.html',
      },
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
