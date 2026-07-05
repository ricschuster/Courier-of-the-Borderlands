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
  {
    id: 'far-lantern',
    name: 'Far Lantern',
    description: 'A brighter lantern reveals more of the road ahead.',
    cost: 40,
    speedBonus: 0,
    revealBonus: 1.5,
  },
  {
    id: 'sprung-axle',
    name: 'Sprung Axle',
    description: 'A sprung axle smooths rough ground, easing the slog through forest.',
    cost: 60,
    speedBonus: 0,
    roughnessRelief: 0.5,
  },
];
