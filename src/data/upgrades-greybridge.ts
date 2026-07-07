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
  {
    id: 'marsh-treads',
    name: 'Marsh Treads',
    description: 'Wide-webbed treads bite into mire and reed. With a sprung axle, the worst ground barely slows you.',
    cost: 90,
    speedBonus: 0,
    roughnessRelief: 0.5,
  },
  {
    id: 'courier-charts',
    name: "Courier's Charts",
    description: 'Dog-eared charts and a keen eye reveal far more of the road ahead.',
    cost: 110,
    speedBonus: 0,
    revealBonus: 2,
  },
  {
    id: 'swift-team',
    name: 'Swift Team',
    description: 'A fresh team bred for distance. Adds another 25 percent to your speed.',
    cost: 150,
    speedBonus: 0.25,
  },
];
