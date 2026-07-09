import { describe, it, expect } from 'vitest';
import {
  requirementMet,
  stepDone,
  stepRequirementCount,
  missionAvailable,
  missionComplete,
  missionProgress,
  activeMission,
  activeObjective,
  type Mission,
  type MissionState,
  type StepRequirement,
} from '../../src/systems/mission-system';

function makeState(overrides: Partial<MissionState> = {}): MissionState {
  return {
    completedContractIds: [],
    flags: new Set<string>(),
    visitedIds: [],
    ...overrides,
  };
}

// Fixture mission mirroring the spine's shape: a flag-gated intro step, a
// single-contract step, a multi-contract step, and a flag-gated final step.
const SPINE_MISSION: Mission = {
  id: 'greybridge-spine',
  title: 'The Greybridge Line',
  regionId: 'greybridge',
  requires: { flags: ['met_postmaster'] },
  steps: [
    {
      id: 'talk-to-postmaster',
      summary: 'Speak with the postmaster.',
      requires: { flags: ['met_postmaster'] },
    },
    {
      id: 'deliver-letters',
      summary: 'Deliver the letters to Eastwatch.',
      requires: { contractsCompleted: ['letters-to-eastwatch'] },
    },
    {
      id: 'deliver-supplies',
      summary: 'Deliver supplies to the outlying farms.',
      requires: { contractsCompleted: ['supplies-north', 'supplies-south'] },
    },
    {
      id: 'reveal-greybridge',
      summary: 'Learn what happened at Greybridge.',
      requires: { flags: ['greybridge_reveal'] },
    },
  ],
};

const OTHER_REGION_MISSION: Mission = {
  id: 'eastwatch-errand',
  title: 'An Eastwatch Errand',
  regionId: 'eastwatch',
  steps: [
    {
      id: 'visit-eastwatch',
      summary: 'Visit Eastwatch.',
      requires: { visited: ['eastwatch'] },
    },
  ],
};

describe('requirementMet', () => {
  it('is true for an entirely empty requirement (always-done)', () => {
    expect(requirementMet({}, makeState())).toBe(true);
  });

  it('checks contractsCompleted against the completed set', () => {
    const req: StepRequirement = { contractsCompleted: ['a', 'b'] };
    expect(requirementMet(req, makeState({ completedContractIds: ['a'] }))).toBe(false);
    expect(requirementMet(req, makeState({ completedContractIds: ['a', 'b'] }))).toBe(true);
    expect(
      requirementMet(req, makeState({ completedContractIds: ['a', 'b', 'c'] })),
    ).toBe(true);
  });

  it('checks flags against the flag set', () => {
    const req: StepRequirement = { flags: ['x', 'y'] };
    expect(requirementMet(req, makeState({ flags: new Set(['x']) }))).toBe(false);
    expect(requirementMet(req, makeState({ flags: new Set(['x', 'y']) }))).toBe(true);
  });

  it('checks visited against the visited list', () => {
    const req: StepRequirement = { visited: ['north', 'south'] };
    expect(requirementMet(req, makeState({ visitedIds: ['north'] }))).toBe(false);
    expect(requirementMet(req, makeState({ visitedIds: ['north', 'south'] }))).toBe(true);
  });

  it('requires every array present to be satisfied at once', () => {
    const req: StepRequirement = {
      contractsCompleted: ['a'],
      flags: ['x'],
      visited: ['north'],
    };
    expect(
      requirementMet(
        req,
        makeState({ completedContractIds: ['a'], flags: new Set(['x']), visitedIds: [] }),
      ),
    ).toBe(false);
    expect(
      requirementMet(
        req,
        makeState({
          completedContractIds: ['a'],
          flags: new Set(['x']),
          visitedIds: ['north'],
        }),
      ),
    ).toBe(true);
  });
});

describe('stepDone', () => {
  it('mirrors requirementMet for the step requirement', () => {
    const step = SPINE_MISSION.steps[1]!;
    expect(stepDone(step, makeState())).toBe(false);
    expect(
      stepDone(step, makeState({ completedContractIds: ['letters-to-eastwatch'] })),
    ).toBe(true);
  });
});

describe('stepRequirementCount', () => {
  it('counts satisfied vs total ids for a multi-contract step', () => {
    const step = SPINE_MISSION.steps[2]!; // requires supplies-north and supplies-south
    expect(stepRequirementCount(step, makeState())).toEqual({ done: 0, total: 2 });
    expect(
      stepRequirementCount(step, makeState({ completedContractIds: ['supplies-north'] })),
    ).toEqual({ done: 1, total: 2 });
    expect(
      stepRequirementCount(
        step,
        makeState({ completedContractIds: ['supplies-north', 'supplies-south'] }),
      ),
    ).toEqual({ done: 2, total: 2 });
  });

  it('reports total 1 for a single-id step, across facets', () => {
    expect(stepRequirementCount(SPINE_MISSION.steps[0]!, makeState())).toEqual({
      done: 0,
      total: 1,
    });
    expect(
      stepRequirementCount(OTHER_REGION_MISSION.steps[0]!, makeState({ visitedIds: ['eastwatch'] })),
    ).toEqual({ done: 1, total: 1 });
  });
});

describe('missionAvailable', () => {
  it('is true when there is no top-level requires', () => {
    expect(missionAvailable(OTHER_REGION_MISSION, makeState())).toBe(true);
  });

  it('gates on the top-level requires flag', () => {
    expect(missionAvailable(SPINE_MISSION, makeState())).toBe(false);
    expect(
      missionAvailable(SPINE_MISSION, makeState({ flags: new Set(['met_postmaster']) })),
    ).toBe(true);
  });
});

describe('missionComplete', () => {
  it('is false when not yet available', () => {
    expect(missionComplete(SPINE_MISSION, makeState())).toBe(false);
  });

  it('is false when available but steps remain', () => {
    const state = makeState({ flags: new Set(['met_postmaster']) });
    expect(missionComplete(SPINE_MISSION, state)).toBe(false);
  });

  it('is true only once every step is done', () => {
    const state = makeState({
      flags: new Set(['met_postmaster', 'greybridge_reveal']),
      completedContractIds: ['letters-to-eastwatch', 'supplies-north', 'supplies-south'],
    });
    expect(missionComplete(SPINE_MISSION, state)).toBe(true);
  });
});

describe('missionProgress', () => {
  it('reports currentStepIndex 0 and available false before the mission starts', () => {
    const progress = missionProgress(SPINE_MISSION, makeState());
    expect(progress.available).toBe(false);
    expect(progress.complete).toBe(false);
    expect(progress.currentStepIndex).toBe(0);
    expect(progress.steps.every((s) => !s.done)).toBe(true);
  });

  it('advances currentStepIndex as facts accumulate', () => {
    let state = makeState({ flags: new Set(['met_postmaster']) });
    let progress = missionProgress(SPINE_MISSION, state);
    expect(progress.available).toBe(true);
    expect(progress.currentStepIndex).toBe(1);

    state = makeState({
      flags: new Set(['met_postmaster']),
      completedContractIds: ['letters-to-eastwatch'],
    });
    progress = missionProgress(SPINE_MISSION, state);
    expect(progress.currentStepIndex).toBe(2);

    state = makeState({
      flags: new Set(['met_postmaster']),
      completedContractIds: ['letters-to-eastwatch', 'supplies-north', 'supplies-south'],
    });
    progress = missionProgress(SPINE_MISSION, state);
    expect(progress.currentStepIndex).toBe(3);

    state = makeState({
      flags: new Set(['met_postmaster', 'greybridge_reveal']),
      completedContractIds: ['letters-to-eastwatch', 'supplies-north', 'supplies-south'],
    });
    progress = missionProgress(SPINE_MISSION, state);
    expect(progress.currentStepIndex).toBe(4);
    expect(progress.complete).toBe(true);
  });
});

describe('activeMission', () => {
  const missions = [SPINE_MISSION, OTHER_REGION_MISSION];

  it('returns null when nothing is available', () => {
    // SPINE_MISSION gated off, OTHER_REGION_MISSION available but not complete
    // so this case instead checks null when all missions are complete.
    const state = makeState({
      flags: new Set(['met_postmaster', 'greybridge_reveal']),
      completedContractIds: ['letters-to-eastwatch', 'supplies-north', 'supplies-south'],
      visitedIds: ['eastwatch'],
    });
    expect(activeMission(missions, state)).toBe(null);
  });

  it('preserves input order when no preference is given', () => {
    const state = makeState({ flags: new Set(['met_postmaster']) });
    expect(activeMission(missions, state)?.id).toBe('greybridge-spine');
  });

  it('skips a gated-off mission and falls back to the next available one', () => {
    const state = makeState();
    expect(activeMission(missions, state)?.id).toBe('eastwatch-errand');
  });

  it('prefers a mission matching preferRegionId over input order', () => {
    const state = makeState({ flags: new Set(['met_postmaster']) });
    expect(activeMission(missions, state, 'eastwatch')?.id).toBe('eastwatch-errand');
  });

  it('falls back to another region when the preferred region has no eligible mission', () => {
    const state = makeState({ flags: new Set(['met_postmaster']) });
    expect(activeMission(missions, state, 'nowhere')?.id).toBe('greybridge-spine');
  });
});

describe('activeObjective', () => {
  it('returns the active mission and its current step', () => {
    const state = makeState({ flags: new Set(['met_postmaster']) });
    const objective = activeObjective([SPINE_MISSION], state);
    expect(objective?.mission.id).toBe('greybridge-spine');
    expect(objective?.step.id).toBe('deliver-letters');
  });

  it('returns null when all missions are complete', () => {
    const state = makeState({
      flags: new Set(['met_postmaster', 'greybridge_reveal']),
      completedContractIds: ['letters-to-eastwatch', 'supplies-north', 'supplies-south'],
    });
    expect(activeObjective([SPINE_MISSION], state)).toBe(null);
  });

  it('returns null for an empty mission list', () => {
    expect(activeObjective([], makeState())).toBe(null);
  });
});
