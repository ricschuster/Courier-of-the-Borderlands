import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { needsBrowserSuite, changedPathsSince } from '../../scripts/e2e-scope.mjs';

const RELEASE_BRANCH = 'release-please--branches--main--components--courier-of-the-borderlands';
const RELEASE_FILES = [
  '.release-please-manifest.json',
  'CHANGELOG.md',
  'package-lock.json',
  'package.json',
];

describe('needsBrowserSuite', () => {
  it('skips a handoff-only change', () => {
    expect(needsBrowserSuite(['docs/handoffs/2026-07-26_Handoff_v42.md'], 'docs/handoff-v42')).toBe(
      false,
    );
  });

  it('skips markdown anywhere in the tree', () => {
    expect(needsBrowserSuite(['README.md', 'assets/credits.md', 'docs/decisions/0008-x.md'])).toBe(
      false,
    );
  });

  it('skips a change to the Claude skills and settings', () => {
    expect(needsBrowserSuite(['.claude/skills/region-map/SKILL.md', '.claude/settings.json'])).toBe(
      false,
    );
  });

  it('runs for any source change', () => {
    expect(needsBrowserSuite(['src/scenes/map-scene.ts'])).toBe(true);
  });

  it('runs when a source change is mixed in with docs', () => {
    expect(needsBrowserSuite(['docs/handoffs/x.md', 'src/systems/fog-of-war.ts'])).toBe(true);
  });

  it('runs for an asset change, which the bundle loads', () => {
    expect(needsBrowserSuite(['assets/audio/cue.mp3'])).toBe(true);
  });

  it('runs for a workflow change, including a change to this filter', () => {
    expect(needsBrowserSuite(['.github/workflows/ci.yml'])).toBe(true);
    expect(needsBrowserSuite(['scripts/e2e-scope.mjs'])).toBe(true);
  });

  it('runs for a spec change', () => {
    expect(needsBrowserSuite(['tests/e2e/travel.spec.ts'])).toBe(true);
  });

  it('runs for an unrecognised path rather than guessing', () => {
    expect(needsBrowserSuite(['some/new/thing.toml'])).toBe(true);
  });

  it('runs when the change list is empty or missing', () => {
    // "We could not tell" must never read as "nothing to do".
    expect(needsBrowserSuite([])).toBe(true);
    expect(needsBrowserSuite(undefined)).toBe(true);
  });

  describe('the release-please branch', () => {
    it('skips its version bump', () => {
      expect(needsBrowserSuite(RELEASE_FILES, RELEASE_BRANCH)).toBe(false);
    });

    it('runs for the same files on any other branch, where they mean a dependency change', () => {
      expect(needsBrowserSuite(RELEASE_FILES, 'feat/add-a-library')).toBe(true);
      expect(needsBrowserSuite(['package.json', 'package-lock.json'], 'main')).toBe(true);
    });

    it('runs for a branch that borrows the name without the manifest', () => {
      // The branch name alone is spoofable; only release-please writes the
      // manifest, so both signals are required.
      expect(needsBrowserSuite(['package.json', 'package-lock.json'], RELEASE_BRANCH)).toBe(true);
    });

    it('runs when it somehow carries a source change too', () => {
      expect(needsBrowserSuite([...RELEASE_FILES, 'src/main.ts'], RELEASE_BRANCH)).toBe(true);
    });
  });
});

describe('changedPathsSince', () => {
  it('gives up on the all-zero sha a new branch reports', () => {
    expect(changedPathsSince('0000000000000000000000000000000000000000')).toBeNull();
  });

  it('gives up on a missing base rather than diffing against nothing', () => {
    expect(changedPathsSince('')).toBeNull();
  });

  it('gives up on a ref that does not exist', () => {
    expect(changedPathsSince('no-such-ref-c0ffee')).toBeNull();
  });
});

// The filter treats every markdown file as unable to reach the browser suite.
// That is only true while the suite loads play.html and nothing else: news.html
// is built from CHANGELOG.md by the vite plugin, so a spec that visited it
// would make markdown load-bearing and hollow out the filter silently.
//
// This guard fails the build instead. If you are here because it went red, either
// the new spec belongs on play.html, or `**/*.md` has to come out of ALWAYS_SAFE.
describe('the assumption the markdown rule rests on', () => {
  it('only ever navigates the browser suite to play.html', () => {
    const dir = new URL('../e2e/', import.meta.url);
    const targets = readdirSync(dir)
      .filter((name) => name.endsWith('.ts'))
      .flatMap((name) => {
        const source = readFileSync(new URL(name, dir), 'utf8');
        return [...source.matchAll(/\.goto\(\s*([`'"])(.*?)\1/g)].map((m) => ({
          spec: name,
          url: m[2],
        }));
      });

    expect(targets.length).toBeGreaterThan(0);
    const strays = targets.filter((t) => !t.url.includes('play.html'));
    expect(strays).toEqual([]);
  });
});
