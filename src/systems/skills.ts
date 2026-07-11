// Pure module: player-chosen courier skills with ranks. Effects feed the
// game's existing effect pipeline (speed, fog reveal, reward multipliers).

import { skillPointsForLevel } from './experience';

export interface SkillEffect {
  readonly speedBonus?: number; // added to the speed multiplier, per rank
  readonly revealBonus?: number; // added to fog reveal radius in tiles, per rank
  readonly rewardBonus?: number; // fraction added to delivery reward, per rank
}

export interface Skill {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly maxRank: number;
  readonly perRank: SkillEffect;
}

export const SKILLS: readonly Skill[] = [
  {
    id: 'wayfinder',
    name: 'Wayfinder',
    description: 'You read the land. +1 map reveal radius per rank.',
    maxRank: 3,
    perRank: { revealBonus: 1 },
  },
  {
    id: 'off-road',
    name: 'Off-road',
    description:
      'You drive where the roads give out. +10 percent speed per rank; at rank 2 you cross the deep mire without Marsh Treads, and at rank 3 the tidal flats without Salt Runners.',
    maxRank: 3,
    perRank: { speedBonus: 0.1 },
  },
  {
    id: 'negotiator',
    name: 'Negotiator',
    description: 'Your name opens purses. +10 percent delivery reward per rank.',
    maxRank: 3,
    perRank: { rewardBonus: 0.1 },
  },
  {
    id: 'cipher',
    name: 'Cipher',
    description: 'You have learned to read what you carry. Unlocks new lines in conversation.',
    maxRank: 1,
    perRank: {},
  },
];

// A skill contributes a derived story flag ("skill_<id>") once owned, so that
// dialogue choices can gate on a social skill without the dialogue engine
// needing to know anything about skills. These flags are derived, never saved.
const SKILL_FLAG_PREFIX = 'skill_';

/** The story-flag id a skill grants while owned. */
export function skillFlag(id: string): string {
  return `${SKILL_FLAG_PREFIX}${id}`;
}

/** Story flags derived from owned skills (rank at least 1), for dialogue gating. */
export function derivedSkillFlags(ranks: SkillRanks): string[] {
  return SKILLS.filter((skill) => rankOf(ranks, skill.id) > 0).map((skill) => skillFlag(skill.id));
}

export type SkillRanks = Readonly<Record<string, number>>;

/** Look up a skill definition by id. */
export function skillById(id: string): Skill | undefined {
  return SKILLS.find((skill) => skill.id === id);
}

/**
 * Keep only known skill ids. Each rank is floored and clamped to
 * [0, maxRank]. Entries that end up at 0, or that reference an unknown or
 * invalid rank value, are dropped.
 */
export function sanitizeRanks(ranks: Record<string, unknown>): Record<string, number> {
  const sanitized: Record<string, number> = {};
  for (const [id, rawRank] of Object.entries(ranks)) {
    const skill = skillById(id);
    if (skill === undefined || typeof rawRank !== 'number' || !Number.isFinite(rawRank)) {
      continue;
    }
    const rank = Math.min(skill.maxRank, Math.max(0, Math.floor(rawRank)));
    if (rank > 0) {
      sanitized[id] = rank;
    }
  }
  return sanitized;
}

/** Current rank of a skill, or 0 if the skill has no entry. */
export function rankOf(ranks: SkillRanks, id: string): number {
  return ranks[id] ?? 0;
}

/** Total skill points spent, summed over known skills only. */
export function pointsSpent(ranks: SkillRanks): number {
  let spent = 0;
  for (const skill of SKILLS) {
    spent += rankOf(ranks, skill.id);
  }
  return spent;
}

/** Skill points available to spend, never negative. */
export function availablePoints(level: number, ranks: SkillRanks): number {
  return Math.max(0, skillPointsForLevel(level) - pointsSpent(ranks));
}

/**
 * True when the skill exists, has not reached its max rank, and the player
 * has at least one skill point available to spend.
 */
export function canRankUp(ranks: SkillRanks, id: string, level: number): boolean {
  const skill = skillById(id);
  if (skill === undefined) {
    return false;
  }
  if (rankOf(ranks, id) >= skill.maxRank) {
    return false;
  }
  return availablePoints(level, ranks) >= 1;
}

/**
 * Return a new ranks map with the skill's rank incremented by one.
 * If the id is unknown or already at maxRank, returns an equivalent
 * unchanged map. Does not check available points; callers should use
 * canRankUp first.
 */
export function rankUp(ranks: SkillRanks, id: string): Record<string, number> {
  const skill = skillById(id);
  const next: Record<string, number> = { ...ranks };
  if (skill === undefined) {
    return next;
  }
  const current = rankOf(ranks, id);
  if (current >= skill.maxRank) {
    return next;
  }
  next[id] = current + 1;
  return next;
}

/** Sum of perRank[field] * rank over all known skills present in ranks. */
function sumEffect(ranks: SkillRanks, field: keyof SkillEffect): number {
  let total = 0;
  for (const skill of SKILLS) {
    const rank = rankOf(ranks, skill.id);
    const perRank = skill.perRank[field];
    if (rank > 0 && perRank !== undefined) {
      total += perRank * rank;
    }
  }
  return total;
}

export function skillSpeedBonus(ranks: SkillRanks): number {
  return sumEffect(ranks, 'speedBonus');
}

export function skillRevealBonus(ranks: SkillRanks): number {
  return sumEffect(ranks, 'revealBonus');
}

export function skillRewardBonus(ranks: SkillRanks): number {
  return sumEffect(ranks, 'rewardBonus');
}
