import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  storageNamespace,
  applyNamespace,
  PRODUCTION_BASE,
} from '../../src/systems/storage-namespace';

// #278: the live game, every PR preview, and the dashboard share one origin, so
// they shared one localStorage bucket and a preview could overwrite a real save.
//
// The base path is what separates them. These take the base as an argument rather
// than reading import.meta.env, so each case is explicit about which deploy it
// describes.

const PREVIEW_BASE = '/Courier-of-the-Borderlands/pr-preview/pr-42/';

describe('storageNamespace', () => {
  // The load-bearing case. Renaming production's keys would orphan every existing
  // save, which is exactly the #123 failure mode the migration ladder exists to
  // prevent. Production is the one base that must namespace to nothing.
  it('is empty for production, so production keys never change', () => {
    expect(storageNamespace(PRODUCTION_BASE)).toBe('');
  });

  it('is the base itself for a PR preview', () => {
    expect(storageNamespace(PREVIEW_BASE)).toBe(PREVIEW_BASE);
  });

  it('separates two previews from each other', () => {
    const a = storageNamespace('/Courier-of-the-Borderlands/pr-preview/pr-1/');
    const b = storageNamespace('/Courier-of-the-Borderlands/pr-preview/pr-2/');
    expect(a).not.toBe(b);
  });

  // A missing trailing slash must not fork production away from itself: that
  // would strand every save behind a key nobody reads.
  it('treats production without its trailing slash as production', () => {
    expect(storageNamespace('/Courier-of-the-Borderlands')).toBe('');
  });

  it('normalizes a preview base without a trailing slash to the same namespace', () => {
    expect(storageNamespace('/Courier-of-the-Borderlands/pr-preview/pr-42')).toBe(PREVIEW_BASE);
  });

  it('treats an empty base as a root deploy, not as production', () => {
    expect(storageNamespace('')).toBe('/');
  });
});

describe('applyNamespace', () => {
  it('leaves a key untouched for production', () => {
    expect(applyNamespace('courier-of-the-borderlands/save', '')).toBe(
      'courier-of-the-borderlands/save',
    );
  });

  it('suffixes a key with the namespace', () => {
    expect(applyNamespace('courier-of-the-borderlands/save', PREVIEW_BASE)).toBe(
      `courier-of-the-borderlands/save@${PREVIEW_BASE}`,
    );
  });

  it('keeps two previews on distinct keys', () => {
    const a = applyNamespace('k', storageNamespace('/Courier-of-the-Borderlands/pr-preview/pr-1/'));
    const b = applyNamespace('k', storageNamespace('/Courier-of-the-Borderlands/pr-preview/pr-2/'));
    expect(a).not.toBe(b);
  });

  it('keeps a preview key distinct from the production key it shadows', () => {
    const prod = applyNamespace('save', storageNamespace(PRODUCTION_BASE));
    const preview = applyNamespace('save', storageNamespace(PREVIEW_BASE));
    expect(preview).not.toBe(prod);
    // And the production one is still the bare key a live player's save sits under.
    expect(prod).toBe('save');
  });
});

// The pieces above are pure and tested with explicit bases, but nothing pinned
// what the shipped modules actually compose through namespacedKey() under the
// production base. Vitest runs with BASE_URL '/' (the preview branch: every
// key comes out '@/'-suffixed), so writing this test exposed that no test had
// ever executed the production composition at all: recurring trap 1's shape,
// where the broken and correct paths look identical in the default case. The
// env is stubbed to the production base and the modules re-imported so their
// key constants recompute; the literals below are the exact keys live players'
// data sits under. If an assertion here fails, the change orphans every
// existing save (ADR 0008): fix the code, never the expected strings (#294).
describe('production storage keys', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('are the exact literals shipped saves sit under', async () => {
    vi.stubEnv('BASE_URL', PRODUCTION_BASE);
    vi.resetModules();
    const save = await import('../../src/systems/save-system');
    const telemetry = await import('../../src/systems/telemetry');
    const errorLog = await import('../../src/systems/error-log');
    expect(save.SAVE_KEY).toBe('courier-of-the-borderlands/save');
    expect(save.INTRO_SEEN_KEY).toBe('courier-of-the-borderlands/intro-seen');
    expect(save.DIFFICULTY_KEY).toBe('courier-of-the-borderlands/difficulty');
    expect(telemetry.TELEMETRY_KEY).toBe('courier-of-the-borderlands/telemetry');
    expect(errorLog.ERROR_LOG_KEY).toBe('courier-of-the-borderlands/errors');
  });
});
