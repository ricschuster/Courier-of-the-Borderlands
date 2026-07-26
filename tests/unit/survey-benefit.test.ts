import { describe, it, expect } from 'vitest';
import { simulateJourney, surveyBenefit, type JourneyInput } from '../../src/systems/survey-benefit';

// Hand-built maps with a known right answer, so the simulation is verified before
// it is pointed at the real regions (#361). A measurement tool that has never
// been shown to produce a wrong answer on a wrong input is not evidence.
//
// Legend: '.' open (speed 1), '#' impassable, '~' slow (speed 0.5),
//         '=' fast road (speed 2).

const SPEEDS: Record<string, number> = { '.': 1, '#': 0, '~': 0.5, '=': 2 };

function fromRows(rows: readonly string[]): Pick<
  JourneyInput,
  'width' | 'height' | 'speedAt' | 'passableAt'
> {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const speedAt = (x: number, y: number): number => SPEEDS[rows[y]?.[x] ?? '#'] ?? 0;
  return {
    width,
    height,
    speedAt,
    passableAt: (x, y) => speedAt(x, y) > 0,
  };
}

describe('simulateJourney', () => {
  it('walks a clear corridor at its true cost', () => {
    // Six tiles of open ground; five steps from (0,0) to (5,0).
    const result = simulateJourney({
      ...fromRows(['......']),
      start: { x: 0, y: 0 },
      goal: { x: 5, y: 0 },
      revealRadius: 1,
      surveyRadius: 0,
    });

    expect(result.reachedGoal).toBe(true);
    expect(result.steps).toBe(5);
    expect(result.cost).toBeCloseTo(5);
    expect(result.replans).toBe(0);
  });

  it('charges more for slow ground than its tile count', () => {
    const result = simulateJourney({
      ...fromRows(['~~~~~~']),
      start: { x: 0, y: 0 },
      goal: { x: 5, y: 0 },
      revealRadius: 1,
      surveyRadius: 0,
    });

    // Speed 0.5 means each tile costs 2.
    expect(result.cost).toBeCloseTo(10);
  });

  it('reports failure when the goal is walled off', () => {
    const result = simulateJourney({
      ...fromRows(['..#..']),
      start: { x: 0, y: 0 },
      goal: { x: 4, y: 0 },
      revealRadius: 1,
      surveyRadius: 0,
    });

    expect(result.reachedGoal).toBe(false);
  });
});

describe('surveyBenefit', () => {
  // The case the ring exists for: an inviting straight corridor that dead-ends,
  // beside a longer way round. A courier who cannot see the block commits to the
  // corridor, discovers the wall, backs out and pays for the detour anyway.
  const DEAD_END_TRAP = [
    '....#.....',
    '.########.',
    '..........',
  ];

  it('credits the ring when it sees a dead end the fog would not', () => {
    const benefit = surveyBenefit({
      ...fromRows(DEAD_END_TRAP),
      start: { x: 0, y: 0 },
      goal: { x: 9, y: 0 },
      // Short sight, so the block at (4,0) is invisible until almost on top of it.
      revealRadius: 1,
      // Big enough to take in the whole trap from anywhere on this small map.
      surveyRadius: 12,
    });

    expect(benefit.withoutRing.reachedGoal).toBe(true);
    expect(benefit.withRing.reachedGoal).toBe(true);
    // The fog-only courier walks into the trap and has to re-plan; the surveyed
    // one never commits to it.
    expect(benefit.withoutRing.replans).toBeGreaterThan(0);
    expect(benefit.withRing.replans).toBe(0);
    expect(benefit.replansAvoided).toBeGreaterThan(0);
    expect(benefit.costSaved).toBeGreaterThan(0);
    expect(benefit.changedRoute).toBe(true);
  });

  // A ring that sees *some* of the trap is the realistic case, and it must price
  // between the two extremes rather than at either. At radius 6 the courier can
  // see the near wall but not the far end of the detour, so it still commits to
  // one corridor that does not exist.
  it('prices a partial view between blind and omniscient', () => {
    const shared = {
      ...fromRows(DEAD_END_TRAP),
      start: { x: 0, y: 0 },
      goal: { x: 9, y: 0 },
      revealRadius: 1,
    };
    const partial = surveyBenefit({ ...shared, surveyRadius: 6 });
    const full = surveyBenefit({ ...shared, surveyRadius: 12 });

    expect(partial.withRing.replans).toBeGreaterThan(0);
    expect(partial.withRing.replans).toBeLessThanOrEqual(partial.withoutRing.replans);
    expect(partial.costSaved).toBeLessThanOrEqual(full.costSaved);
  });

  // The null result the measure has to be able to produce, or it is just a
  // machine for confirming what it was built to find.
  it('credits the ring with nothing on an open map', () => {
    const benefit = surveyBenefit({
      ...fromRows(['..........', '..........', '..........']),
      start: { x: 0, y: 0 },
      goal: { x: 9, y: 2 },
      revealRadius: 1,
      surveyRadius: 6,
    });

    expect(benefit.costSaved).toBe(0);
    expect(benefit.replansAvoided).toBe(0);
    expect(benefit.changedRoute).toBe(false);
  });

  it('credits the ring with nothing when the fog already reaches as far', () => {
    // Same trap, but the courier sees far enough without the ring, so the ring
    // adds no information and must price at zero.
    const benefit = surveyBenefit({
      ...fromRows(DEAD_END_TRAP),
      start: { x: 0, y: 0 },
      goal: { x: 9, y: 0 },
      revealRadius: 9,
      surveyRadius: 9,
    });

    expect(benefit.costSaved).toBe(0);
    expect(benefit.replansAvoided).toBe(0);
  });

  it('does not credit the ring for the reveal radius, which both runs share', () => {
    const shared = {
      ...fromRows(DEAD_END_TRAP),
      start: { x: 0, y: 0 },
      goal: { x: 9, y: 0 },
      revealRadius: 3,
      surveyRadius: 6,
    };
    const benefit = surveyBenefit(shared);

    // Both arms walked with the same sight; only the ring differs.
    expect(benefit.withoutRing.steps).toBeGreaterThan(0);
    expect(benefit.withRing.steps).toBeGreaterThan(0);
    expect(simulateJourney({ ...shared, surveyRadius: 0 }).cost).toBe(benefit.withoutRing.cost);
  });
});
