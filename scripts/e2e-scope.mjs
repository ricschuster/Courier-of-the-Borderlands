// Decides whether a change can possibly affect the browser suite.
//
// Why this exists: the browser suite is ~90% of a PR's blocking CI time (5m of
// a 5m30 run), and two kinds of change cannot alter what it sees. Docs-only
// PRs (this repo has 40+ handoffs) and the release-please version bump, which
// re-runs on every merge to main. See #420 for the measurement.
//
// Why it is a tested module and not four lines of YAML shell: the failure mode
// is silent. If this wrongly says "skip", nothing fails, the suite does not
// run, and the PR goes green anyway. That is trap 1's exact shape, so the rule
// gets unit tests and the CI step gets a fail-open default.
//
// Run it by hand to ask whether the current branch would skip the suite:
//   npm run ci:scope
//
// In CI it reads BASE_SHA and HEAD_REF from the environment (never from `${{ }}`
// interpolated into the shell, which would be a script-injection hole on the
// attacker-controllable branch name) and appends `run=true|false` to
// $GITHUB_OUTPUT.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

// Paths that cannot reach the built bundle the browser suite loads.
//
// `**/*.md` is safe because the suite only ever navigates to play.html. It
// never visits news.html, which is the one page a markdown file (CHANGELOG.md,
// via the vite plugin) can change. That assumption is load-bearing and is
// pinned by a test in tests/unit/e2e-scope.test.mjs, so adding a spec for
// news.html fails the build rather than silently hollowing out this filter.
const ALWAYS_SAFE = [
  /^docs\//,
  /(^|\/)[^/]+\.md$/,
  /^\.claude\//,
  /^LICENSE$/,
];

// The release-please PR's four files. package.json and package-lock.json are
// only safe on that branch: anywhere else they mean a dependency change, which
// is exactly when the browser suite matters most.
const RELEASE_SAFE = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^\.release-please-manifest\.json$/,
];

const RELEASE_BRANCH_PREFIX = 'release-please--';
const RELEASE_MANIFEST = '.release-please-manifest.json';

/**
 * True when the browser suite could see a difference and must run.
 *
 * Deny by default: a path matching no safe pattern runs the suite. An empty or
 * missing change list also runs it, because "we could not tell" must never read
 * as "nothing to do".
 *
 * @param {string[]} changedPaths repo-relative paths, as `git diff --name-only`
 * @param {string} headRef branch name, used only to recognise release-please
 * @returns {boolean}
 */
export function needsBrowserSuite(changedPaths, headRef = '') {
  if (!Array.isArray(changedPaths) || changedPaths.length === 0) return true;

  // Trusting a branch name is spoofable, so require the manifest too: only
  // release-please produces that file, and only in that commit. A hand-made
  // branch borrowing the name still has to run the suite. `check` builds and
  // typechecks either way.
  const isRelease =
    headRef.startsWith(RELEASE_BRANCH_PREFIX) && changedPaths.includes(RELEASE_MANIFEST);

  const safe = isRelease ? [...ALWAYS_SAFE, ...RELEASE_SAFE] : ALWAYS_SAFE;
  return !changedPaths.every((path) => safe.some((pattern) => pattern.test(path)));
}

/**
 * Paths changed between `base` and HEAD, or null when that cannot be answered.
 *
 * @param {string} base a commit-ish
 * @returns {string[] | null}
 */
export function changedPathsSince(base) {
  // The all-zero sha is what a push event reports for a new branch.
  if (!base || /^0+$/.test(base)) return null;
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
      encoding: 'utf8',
      // An unknown ref is an expected input here, not a problem to report: the
      // caller turns null into "run the suite".
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

function main() {
  const base = process.env.BASE_SHA || 'origin/main';
  const headRef = process.env.HEAD_REF || '';

  const changed = changedPathsSince(base);
  const run = changed === null ? true : needsBrowserSuite(changed, headRef);

  if (changed === null) {
    console.log(`Could not diff against "${base}": running the browser suite.`);
  } else if (changed.length === 0) {
    // Locally this usually means the work is not committed yet; the diff is
    // against committed HEAD, exactly as CI sees it.
    console.log(`Nothing committed differs from ${base}: running the browser suite.`);
  } else {
    console.log(`${changed.length} file(s) changed since ${base}:`);
    for (const path of changed) console.log(`  ${path}`);
    console.log(
      run
        ? 'At least one can reach the bundle: running the browser suite.'
        : 'None can reach the bundle: skipping the browser suite.',
    );
  }

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
  }
}

// Only run the CLI when invoked directly, so the test can import the module.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
