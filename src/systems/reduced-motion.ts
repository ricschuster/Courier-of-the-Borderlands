// Reduced-motion preference (#227, scoped in from the #228 accessibility triage).
//
// The juice pass adds screen shake, tweens, and particle bursts. Motion like that
// is a real accessibility problem: it can trigger nausea or vestibular symptoms,
// and the player has usually already told their OS so. This reads that answer.
//
// Gated at the source rather than retrofitted: the right moment to respect the
// preference is when the effect is written, not in a later pass.

/** The standard media query browsers expose the OS-level setting through. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * True when the player has asked their system to reduce motion.
 *
 * Guarded rather than assumed: `matchMedia` is absent under node and can be
 * absent or throw in embedded webviews. Every failure answers false, which is the
 * honest default. Claiming a preference the player never expressed would silently
 * strip feedback from everyone whose browser simply cannot be asked.
 */
export function prefersReducedMotion(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(REDUCED_MOTION_QUERY).matches === true;
  } catch {
    return false;
  }
}
