// upgrades-greybridge.ts
// Canonical upgrade data for the Greybridge Region.

import type { Upgrade } from '../systems/upgrade-system';

export const UPGRADES_GREYBRIDGE: readonly Upgrade[] = [
  {
    id: 'reinforced-wheels',
    name: 'Reinforced Wheels',
    description: 'Iron-shod wheels built for rutted frontier tracks. Adds a quarter to your speed on every kind of ground.',
    cost: 50,
    speedBonus: 0.25,
  },
  {
    id: 'far-lantern',
    name: 'Far Lantern',
    description: 'A tall oil lantern throws light well past the verge. Pulls the fog back about a tile and a half further as you travel.',
    cost: 40,
    speedBonus: 0,
    revealBonus: 1.5,
  },
  {
    id: 'sprung-axle',
    name: 'Sprung Axle',
    description: 'Leaf-sprung suspension soaks up broken ground. Cuts the drag of slow terrain like forest and scrub by half.',
    cost: 60,
    speedBonus: 0,
    roughnessRelief: 0.5,
  },
  {
    id: 'marsh-treads',
    name: 'Marsh Treads',
    description: 'Wide webbed treads that bite into mire and reed. Cuts rough-ground drag by another half; fitted with the Sprung Axle, the worst mud barely slows you.',
    cost: 90,
    speedBonus: 0,
    roughnessRelief: 0.5,
  },
  {
    id: 'courier-charts',
    name: "Courier's Charts",
    description: "Dog-eared survey charts and a courier's eye for the land. Pulls the fog back some two tiles further with every mile.",
    cost: 110,
    speedBonus: 0,
    revealBonus: 2,
  },
  {
    id: 'swift-team',
    name: 'Swift Team',
    description: 'A fresh team bred for the long haul. Adds another quarter to your speed, stacking with the Reinforced Wheels.',
    cost: 150,
    speedBonus: 0.25,
  },
];
