// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { prefersReducedMotion, REDUCED_MOTION_QUERY } from '../../src/systems/reduced-motion';

// Runs under jsdom so `window` exists. jsdom does not implement matchMedia, so
// each case installs exactly the shape it is testing, which is also how the real
// failure modes present: absent, throwing, or answering.

function setMatchMedia(impl: unknown): void {
  Object.defineProperty(window, 'matchMedia', {
    value: impl,
    writable: true,
    configurable: true,
  });
}

describe('prefersReducedMotion', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setMatchMedia(undefined);
  });

  it('is true when the player has asked their system to reduce motion', () => {
    setMatchMedia((q: string) => ({ matches: q === REDUCED_MOTION_QUERY }));
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false when the player has expressed no such preference', () => {
    setMatchMedia(() => ({ matches: false }));
    expect(prefersReducedMotion()).toBe(false);
  });

  it('queries the standard media string', () => {
    const spy = vi.fn(() => ({ matches: false }));
    setMatchMedia(spy);
    prefersReducedMotion();
    expect(spy).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  // The guards below all answer false. Claiming a preference the player never
  // expressed would silently strip feedback from everyone whose browser cannot
  // be asked, which is the worse failure.
  it('is false when matchMedia is missing, as in an embedded webview', () => {
    setMatchMedia(undefined);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false when matchMedia throws', () => {
    setMatchMedia(() => {
      throw new Error('not supported');
    });
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false when matchMedia returns a non-boolean matches', () => {
    setMatchMedia(() => ({ matches: 'yes' }));
    expect(prefersReducedMotion()).toBe(false);
  });

  it('is false when matchMedia returns nothing at all', () => {
    setMatchMedia(() => undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});
