// Pure module: which terrain-gating capabilities the courier currently holds.
//
// A "capability" is a token a gated terrain can require (reusing
// terrain.unlockId as the token). It generalizes the old single-source unlock
// gate: a capability can be granted by an unlock, an owned upgrade, or a skill
// at a rank. This is what lets the wagon build (coins -> upgrades) and skill
// investment (points -> ranks) act as alternative keys to the same route.
//
// See docs/design/07_roads_gate_the_wagon.md.

import type { SkillRanks } from './skills';
import { rankOf } from './skills';

/** A skill at or above a rank grants a capability. */
export interface SkillRequirement {
  readonly id: string;
  readonly minRank: number;
}

/** The sources that grant a capability. Any one satisfied grants it. */
export interface CapabilityGrant {
  readonly upgrades?: readonly string[];
  readonly skills?: readonly SkillRequirement[];
}

/** Capability token -> the sources that grant it. */
export type CapabilityGrants = Readonly<Record<string, CapabilityGrant>>;

// Canonical grant map. A capability is held if the player owns any listed
// upgrade or has any listed skill at its rank. This is the coins-vs-points
// choice: the same route opens for a bought upgrade or an invested skill rank.
export const CAPABILITY_GRANTS: CapabilityGrants = {
  // Deep mire is crossable with the wide webbed Marsh Treads (coins), or by
  // ranking Off-road to 2 (skill points). Either key opens the same shortcut.
  'mire-crossing': {
    upgrades: ['marsh-treads'],
    skills: [{ id: 'off-road', minRank: 2 }],
  },
};

/** True when any single source of the grant is satisfied. */
function grantMet(
  grant: CapabilityGrant,
  upgrades: ReadonlySet<string>,
  skills: SkillRanks,
): boolean {
  if (grant.upgrades?.some((id) => upgrades.has(id))) {
    return true;
  }
  if (grant.skills?.some((req) => rankOf(skills, req.id) >= req.minRank)) {
    return true;
  }
  return false;
}

/**
 * The set of capability tokens the courier can currently satisfy a terrain gate
 * with: every unlock id (unlocks are their own tokens, e.g. an opened ford),
 * plus every capability whose grant is met by an owned upgrade or a skill rank.
 *
 * Pass the result where terrain passability wants its "unlocks" set; a terrain
 * whose gate token is in this set is passable.
 */
export function traversalKeys(
  unlocks: ReadonlySet<string>,
  upgrades: ReadonlySet<string>,
  skills: SkillRanks,
  grants: CapabilityGrants = CAPABILITY_GRANTS,
): Set<string> {
  const keys = new Set<string>(unlocks);
  for (const [capability, grant] of Object.entries(grants)) {
    if (grantMet(grant, upgrades, skills)) {
      keys.add(capability);
    }
  }
  return keys;
}
