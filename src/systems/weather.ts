// Ambient road conditions that mildly colour each run's movement and visibility.
// Pure data and deterministic logic only. No Phaser, no Math.random.

/** One ambient road condition for a run. */
export interface Weather {
  readonly id: string;
  readonly label: string;         // short HUD label, e.g. "Clear roads"
  readonly description: string;   // one short sentence of flavour
  readonly speedMultiplier: number; // global movement multiplier, in [0.85, 1.15]
  readonly revealBonus: number;     // added to fog reveal radius in tiles (may be negative)
}

/** All known road conditions. Multipliers are kept mild to preserve terrain variety. */
export const WEATHERS: readonly Weather[] = [
  {
    id: 'clear',
    label: 'Clear roads',
    description: 'The borderland air is still and the stones are dry beneath your wheels.',
    speedMultiplier: 1.0,
    revealBonus: 0,
  },
  {
    id: 'fair-winds',
    label: 'Fair winds',
    description: 'A steady tailwind pushes you forward across the open country.',
    speedMultiplier: 1.1,
    revealBonus: 0,
  },
  {
    id: 'mist',
    label: 'Low mist',
    description: 'Pale fog clings to the hollows and blurs the road ahead.',
    speedMultiplier: 1.0,
    revealBonus: -1,
  },
  {
    id: 'mud',
    label: 'Muddy roads',
    description: 'Last night\'s rain has turned the track to heavy, clinging mud.',
    speedMultiplier: 0.9,
    revealBonus: 0,
  },
];

/** Neutral fallback returned when WEATHERS is somehow empty. */
const FALLBACK_WEATHER: Weather = {
  id: 'unknown',
  label: 'Unknown skies',
  description: 'The road offers no sign of what weather lies ahead.',
  speedMultiplier: 1.0,
  revealBonus: 0,
};

/**
 * Selects a weather by wrapping index into WEATHERS.
 * Works for any integer, including negative values.
 * Returns the neutral fallback if WEATHERS is empty.
 */
export function weatherByIndex(index: number): Weather {
  const len = WEATHERS.length;
  if (len === 0) {
    return FALLBACK_WEATHER;
  }
  const wrapped = ((index % len) + len) % len;
  // noUncheckedIndexedAccess: WEATHERS[wrapped] is Weather | undefined here.
  return WEATHERS[wrapped] ?? FALLBACK_WEATHER;
}
