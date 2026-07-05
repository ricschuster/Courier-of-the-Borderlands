// Pure module: categorizes contract cargo into a few types, each with a
// small pay effect. No Phaser imports.

export type CargoCategoryId = 'letters' | 'goods' | 'rumours' | 'secrets';

export interface CargoCategory {
  readonly id: CargoCategoryId;
  readonly name: string;
  /** Short board label, e.g. "letters". */
  readonly tag: string;
  readonly description: string;
  /** Scales the base reward. 1.0 is the reliable baseline. */
  readonly payModifier: number;
}

// Named pay modifiers, ascending by risk and value.
const GOODS_PAY_MODIFIER = 1.0;
const LETTERS_PAY_MODIFIER = 1.05;
const RUMOURS_PAY_MODIFIER = 1.1;
const SECRETS_PAY_MODIFIER = 1.2;

export const CARGO_CATEGORIES: Readonly<Record<CargoCategoryId, CargoCategory>> = {
  goods: {
    id: 'goods',
    name: 'Goods',
    tag: 'goods',
    description: 'Ordinary cargo. Heavy, honest, and paid at the reliable baseline.',
    payModifier: GOODS_PAY_MODIFIER,
  },
  letters: {
    id: 'letters',
    name: 'Letters',
    tag: 'letters',
    description: 'Light and quick to carry, worth a little extra for the speed.',
    payModifier: LETTERS_PAY_MODIFIER,
  },
  rumours: {
    id: 'rumours',
    name: 'Rumours',
    tag: 'rumours',
    description: 'A whispered word is worth more than its weight, if it is true.',
    payModifier: RUMOURS_PAY_MODIFIER,
  },
  secrets: {
    id: 'secrets',
    name: 'Secrets',
    tag: 'secrets',
    description: 'Dangerous to carry and dangerous to drop. It pays the most for a reason.',
    payModifier: SECRETS_PAY_MODIFIER,
  },
};

export const DEFAULT_CARGO_CATEGORY: CargoCategoryId = 'goods';

/** Return the cargo category, falling back to the default for undefined or unknown ids. */
export function getCargoCategory(id: CargoCategoryId | undefined): CargoCategory {
  if (id === undefined || !(id in CARGO_CATEGORIES)) {
    return CARGO_CATEGORIES[DEFAULT_CARGO_CATEGORY];
  }
  return CARGO_CATEGORIES[id];
}

/** Apply the cargo category's pay modifier to a base reward. */
export function cargoPayout(baseReward: number, id: CargoCategoryId | undefined): number {
  return Math.round(baseReward * getCargoCategory(id).payModifier);
}
