// Self-contained screenshot helper for visual verification of UI changes.
//
// Runs as one allowlisted command: `npm run shot -- <name> [key]`, e.g.
//   npm run shot -- toast          capture the boot screen to tmp-screenshots/toast.png
//   npm run shot -- journal j      press J after boot, then capture
//
// It builds, starts its own preview server, captures the PNG, and tears the
// server down again, so no temp scripts, cp, manual preview, or kill/pkill are
// needed (those all triggered permission prompts when done by hand). Add
// --no-build to skip the rebuild when dist/ is already current.

import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = 4174; // one off the e2e port so a running test server does not clash
const BASE = `http://localhost:${PORT}/Courier-of-the-Borderlands/`;
const ROOT = new URL('..', import.meta.url).pathname;
const OUT_DIR = `${ROOT}tmp-screenshots`;

const args = process.argv.slice(2).filter((a) => a !== '--no-build');
const skipBuild = process.argv.includes('--no-build');
const name = args[0];
const key = args[1];

if (!name) {
  console.error('usage: npm run shot -- <name> [key] [--no-build]');
  process.exit(1);
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview server did not start at ${url}`);
}

if (!skipBuild) {
  execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
}

mkdirSync(OUT_DIR, { recursive: true });

// Detached so we can kill the whole process group (vite spawns children).
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: ROOT,
  detached: true,
  stdio: 'ignore',
});

let browser;
try {
  await waitForServer(BASE);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`${BASE}?e2e`, { waitUntil: 'networkidle' });
  // Wait for the scene's e2e hook, which is installed in the same create() that
  // binds the keyboard handlers: a reliable "input is ready" signal, so a key
  // press does not race scene setup (a fixed delay was flaky).
  await page.waitForFunction(() => window.__courier !== undefined, { timeout: 15_000 });
  await page.waitForTimeout(300);
  await page.mouse.click(480, 300); // focus the game canvas for key input
  if (key) {
    await page.keyboard.press(key);
    await page.waitForTimeout(400);
  }
  const out = `${OUT_DIR}/${name}.png`;
  await page.screenshot({ path: out });
  console.log(`wrote ${out}`);
} finally {
  if (browser) await browser.close();
  if (server.pid) {
    try {
      process.kill(-server.pid); // kill the detached group
    } catch {
      // already gone
    }
  }
}
