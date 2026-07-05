// upgrades-greybridge.ts
// Canonical upgrade data for the Greybridge Region.

import type { Upgrade } from '../systems/upgrade-system';

export const UPGRADES_GREYBRIDGE: readonly Upgrade[] = [
  {
    id: 'reinforced-wheels',
    name: 'Reinforced Wheels',
    description: 'Sturdier wheels for rough frontier roads. Increases speed by 25 percent.',
    cost: 50,
    speedBonus: 0.25,
  },
];
