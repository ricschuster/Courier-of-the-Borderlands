// Does the Wayfinder survey ring (#341) actually buy a better route?
//
// #361 records that two playtests measured the same Wayfinder economics and that
// a scripted run "cannot measure whether the ring helps a person plan a route".
// That is true of *feel*, but it is not true of the routing itself, which is
// mechanical: either the surveyed terrain changes the cheapest route the courier
// can see, or it does not.
//
// This simulates the journey rather than comparing two static paths, because the
// interesting case is not "a shorter line exists" but "the courier committed to a
// corridor, hit water, and had to back out". Walking reveals fog as you go, so a
// fog-only courier learns the same terrain eventually; the ring's value is
// learning it *before* committing. Only a step-by-step walk with re-planning
// shows that difference.
//
// Pure module: no Phaser, no scene, so it runs under vitest and in a script.

export interface TileCoord {
  readonly x: number;
  readonly y: number;
}

export interface JourneyInput {
  readonly width: number;
  readonly height: number;
  /** True terrain speed modifier at a tile. 0 or less means impassable. */
  readonly speedAt: (x: number, y: number) => number;
  /** Whether the courier could enter this tile, with capabilities baked in. */
  readonly passableAt: (x: number, y: number) => boolean;
  readonly start: TileCoord;
  readonly goal: TileCoord;
  /** Fog reveal radius while driving, in tiles. */
  readonly revealRadius: number;
  /** Minimap survey radius in tiles. 0 models a courier with no Wayfinder ring. */
  readonly surveyRadius: number;
  /**
   * Cost the courier assumes for ground they know nothing about. The default
   * models an optimist who expects open plains: it is what makes an unscouted
   * corridor look attractive, which is the behaviour the ring is supposed to
   * correct.
   */
  readonly unknownCost?: number;
  /** Safety cap so a pathological map cannot spin forever. */
  readonly maxSteps?: number;
}

export interface JourneyResult {
  readonly reachedGoal: boolean;
  /** Tiles actually walked. */
  readonly steps: number;
  /**
   * Realised travel cost: the sum of 1/speed over every tile entered, so slow
   * ground costs more than its tile count suggests. This is the number a route
   * planner is trying to minimise.
   */
  readonly cost: number;
  /**
   * Times the courier's committed plan became invalid mid-journey and had to be
   * recomputed against terrain it had just discovered. This is the count the
   * survey ring is meant to reduce.
   */
  readonly replans: number;
}

/** Cost of entering a tile. Impassable ground is infinite. */
function tileCost(speed: number): number {
  return speed > 0 ? 1 / speed : Number.POSITIVE_INFINITY;
}

function indexOf(x: number, y: number, width: number): number {
  return y * width + x;
}

const NEIGHBOURS: readonly [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/**
 * Cheapest route from start to goal under the courier's current beliefs.
 *
 * `estimatedCost` returns what the courier *thinks* a tile costs, which is the
 * real cost for ground it has seen and `unknownCost` for ground it has not. That
 * asymmetry is the whole experiment: a fog-only courier routes confidently
 * through terrain it has never laid eyes on.
 */
function planRoute(
  width: number,
  height: number,
  estimatedCost: (x: number, y: number) => number,
  start: TileCoord,
  goal: TileCoord,
): TileCoord[] {
  const size = width * height;
  const dist = new Float64Array(size).fill(Number.POSITIVE_INFINITY);
  const prev = new Int32Array(size).fill(-1);
  const settled = new Uint8Array(size);

  const startIndex = indexOf(start.x, start.y, width);
  dist[startIndex] = 0;

  // Dense scan rather than a heap: these maps are a few hundred tiles, and a
  // scan keeps the module dependency-free and easy to read.
  for (;;) {
    let current = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < size; i++) {
      const d = dist[i] ?? Number.POSITIVE_INFINITY;
      if (settled[i] === 0 && d < best) {
        best = d;
        current = i;
      }
    }
    if (current === -1) {
      break;
    }
    if (current === indexOf(goal.x, goal.y, width)) {
      break;
    }
    settled[current] = 1;

    const cx = current % width;
    const cy = Math.floor(current / width);
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const step = estimatedCost(nx, ny);
      if (!Number.isFinite(step)) {
        continue;
      }
      const next = indexOf(nx, ny, width);
      const through = (dist[current] ?? Number.POSITIVE_INFINITY) + step;
      if (through < (dist[next] ?? Number.POSITIVE_INFINITY)) {
        dist[next] = through;
        prev[next] = current;
      }
    }
  }

  const goalIndex = indexOf(goal.x, goal.y, width);
  if (!Number.isFinite(dist[goalIndex])) {
    return [];
  }
  const route: TileCoord[] = [];
  for (let at = goalIndex; at !== -1; at = prev[at] ?? -1) {
    route.push({ x: at % width, y: Math.floor(at / width) });
    if (at === startIndex) {
      break;
    }
  }
  return route.reverse();
}

/**
 * Walk from start to goal, re-planning whenever newly revealed terrain
 * invalidates the committed route, and report what the trip actually cost.
 *
 * Run it twice with the same inputs and different `surveyRadius` values to price
 * the ring: the difference in realised cost is what the ring bought.
 */
export function simulateJourney(input: JourneyInput): JourneyResult {
  const {
    width,
    height,
    speedAt,
    passableAt,
    start,
    goal,
    revealRadius,
    surveyRadius,
    unknownCost = 1,
    maxSteps = 4000,
  } = input;

  const known = new Uint8Array(width * height);

  /** Reveal everything within `radius` of a tile, permanently. */
  const reveal = (centre: TileCoord, radius: number): void => {
    const reach = Math.ceil(radius);
    for (let y = centre.y - reach; y <= centre.y + reach; y++) {
      for (let x = centre.x - reach; x <= centre.x + reach; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) {
          continue;
        }
        if (Math.hypot(x - centre.x, y - centre.y) <= radius) {
          known[indexOf(x, y, width)] = 1;
        }
      }
    }
  };

  let at: TileCoord = { x: start.x, y: start.y };
  let cost = 0;
  let steps = 0;
  let replans = 0;

  reveal(at, revealRadius);

  while (!(at.x === goal.x && at.y === goal.y) && steps < maxSteps) {
    // The survey ring is transient and recomputed from the current position each
    // redraw, so it informs the plan without being remembered as walked fog.
    const surveyed = new Uint8Array(width * height);
    if (surveyRadius > 0) {
      const reach = Math.ceil(surveyRadius);
      for (let y = at.y - reach; y <= at.y + reach; y++) {
        for (let x = at.x - reach; x <= at.x + reach; x++) {
          if (x < 0 || y < 0 || x >= width || y >= height) {
            continue;
          }
          if (Math.hypot(x - at.x, y - at.y) <= surveyRadius) {
            surveyed[indexOf(x, y, width)] = 1;
          }
        }
      }
    }

    const estimatedCost = (x: number, y: number): number => {
      const i = indexOf(x, y, width);
      if (known[i] === 1 || surveyed[i] === 1) {
        return passableAt(x, y) ? tileCost(speedAt(x, y)) : Number.POSITIVE_INFINITY;
      }
      // Never seen: the courier assumes ordinary open ground.
      return unknownCost;
    };

    const route = planRoute(width, height, estimatedCost, at, goal);
    if (route.length < 2) {
      // Nowhere left to go even optimistically: the goal is unreachable from
      // here under current knowledge.
      break;
    }

    // Walk the plan until it stops matching reality, then re-plan. Committing to
    // more than one step is the point: a courier who re-planned every tile would
    // never be caught out, and the ring would price at zero by construction.
    let followed = 0;
    for (let i = 1; i < route.length; i++) {
      const next = route[i];
      if (next === undefined) {
        break;
      }
      if (!passableAt(next.x, next.y)) {
        // The corridor is blocked. Learn it and re-plan from where we stand.
        known[indexOf(next.x, next.y, width)] = 1;
        replans++;
        break;
      }
      at = next;
      cost += tileCost(speedAt(next.x, next.y));
      steps++;
      followed++;
      reveal(at, revealRadius);
      if (at.x === goal.x && at.y === goal.y) {
        break;
      }
      if (steps >= maxSteps) {
        break;
      }
    }

    if (followed === 0 && replans === 0) {
      // Made no progress and learned nothing: stop rather than spin.
      break;
    }
  }

  return {
    reachedGoal: at.x === goal.x && at.y === goal.y,
    steps,
    cost,
    replans,
  };
}

export interface SurveyBenefit {
  readonly withoutRing: JourneyResult;
  readonly withRing: JourneyResult;
  /** Realised cost saved by the ring. Positive means the ring helped. */
  readonly costSaved: number;
  /** Re-plans avoided: dead ends the ring saw coming. */
  readonly replansAvoided: number;
  readonly changedRoute: boolean;
}

/**
 * Price the survey ring on one journey by running it twice, identical but for
 * the ring.
 *
 * Both runs use the same reveal radius on purpose. Wayfinder grants reveal
 * radius *and* the ring, so comparing rank 0 against rank 3 would credit the
 * ring with the reveal bonus too. #361 asks specifically what #341's ring buys.
 */
export function surveyBenefit(input: JourneyInput): SurveyBenefit {
  const withoutRing = simulateJourney({ ...input, surveyRadius: 0 });
  const withRing = simulateJourney(input);
  return {
    withoutRing,
    withRing,
    costSaved: withoutRing.cost - withRing.cost,
    replansAvoided: withoutRing.replans - withRing.replans,
    changedRoute: withoutRing.cost !== withRing.cost || withoutRing.steps !== withRing.steps,
  };
}
