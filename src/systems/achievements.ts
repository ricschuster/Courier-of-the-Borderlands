// Pure achievement logic for the Greybridge Region.
// No Phaser imports. No mutable state. All derived from AchievementStat.

export interface AchievementStat {
  readonly deliveries: number;
  readonly distanceTiles: number;
  readonly placesFound: number;
  readonly totalPlaces: number;
  readonly upgradesOwned: number;
  readonly totalUpgrades: number;
  readonly fordUnlocked: boolean;
  readonly regionCleared: boolean;
}

export interface Achievement {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

// Internal definition pairing display data with its unlock predicate.
interface AchievementDef {
  readonly achievement: Achievement;
  readonly predicate: (s: AchievementStat) => boolean;
}

// All achievement definitions. Add new entries here to extend the system.
const DEFS: readonly AchievementDef[] = [
  {
    achievement: {
      id: 'first-delivery',
      name: 'First Run',
      description: 'You carried your first load across uncertain roads.',
    },
    predicate: (s) => s.deliveries >= 1,
  },
  {
    achievement: {
      id: 'ford-finder',
      name: 'Ford Finder',
      description: 'You discovered the hidden ford and opened a faster crossing.',
    },
    predicate: (s) => s.fordUnlocked,
  },
  {
    achievement: {
      id: 'cartographer',
      name: 'Cartographer',
      description: 'Every named place in the region has been found and recorded.',
    },
    predicate: (s) => s.totalPlaces > 0 && s.placesFound >= s.totalPlaces,
  },
  {
    achievement: {
      id: 'well-equipped',
      name: 'Well Equipped',
      description: 'Your wagon carries every upgrade the region has to offer.',
    },
    predicate: (s) => s.totalUpgrades > 0 && s.upgradesOwned >= s.totalUpgrades,
  },
  {
    achievement: {
      id: 'long-hauler',
      name: 'Long Hauler',
      description: 'One hundred tiles of borderland road behind you.',
    },
    predicate: (s) => s.distanceTiles >= 100,
  },
  {
    achievement: {
      id: 'borderland-courier',
      name: 'Borderland Courier',
      description: 'The Greybridge Region holds no more secrets from you.',
    },
    predicate: (s) => s.regionCleared,
  },
];

/** Public display list. Stripped of predicates. */
export const ACHIEVEMENTS: readonly Achievement[] = DEFS.map((d) => d.achievement);

/** Returns the ids of every achievement whose predicate passes for the given stat. */
export function earnedAchievements(stat: AchievementStat): string[] {
  return DEFS.filter((d) => d.predicate(stat)).map((d) => d.achievement.id);
}

/**
 * Returns a courier rank title based on overall progress.
 * Titles reflect the frontier's slow trust in outsiders.
 */
export function courierTitle(stat: AchievementStat): string {
  if (stat.regionCleared) {
    return 'Master of the Greybridge';
  }
  if (stat.deliveries >= 3) {
    return 'Trusted Courier';
  }
  if (stat.deliveries >= 1) {
    return 'Courier';
  }
  return 'Wayfarer';
}
