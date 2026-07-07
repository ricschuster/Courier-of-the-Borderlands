// Pure module: a generic, data-driven mission model.
//
// A mission's progress is derived from facts the game already persists
// (completed contract ids, story flags, visited settlement ids), matching
// the derived-state pattern in world-state.ts and experience.ts. No mission
// progress is stored separately, so there is no mission save state to
// migrate. Missions themselves (title, steps, requirements) are authored as
// plain data elsewhere; this module contains no story content.

/**
 * A set of world facts a step or mission requires. A step is done when every
 * id listed in every present array is satisfied. An entirely empty
 * requirement (no arrays present, or all present arrays empty) is always
 * considered met, so a step with no requirement is always done.
 */
export interface StepRequirement {
  readonly contractsCompleted?: readonly string[];
  readonly flags?: readonly string[];
  readonly visited?: readonly string[];
}

export interface MissionStep {
  readonly id: string;
  /** Player-facing objective line, for example a HUD readout. */
  readonly summary: string;
  readonly requires: StepRequirement;
}

export interface Mission {
  readonly id: string;
  readonly title: string;
  readonly regionId: string;
  /** Gates whether the mission is available at all. Omitted means always available. */
  readonly requires?: StepRequirement;
  readonly steps: readonly MissionStep[];
}

/** The world facts mission progress is derived from. */
export interface MissionState {
  readonly completedContractIds: readonly string[];
  readonly flags: ReadonlySet<string>;
  readonly visitedIds: readonly string[];
}

export interface StepProgress {
  readonly step: MissionStep;
  readonly done: boolean;
}

export interface MissionProgress {
  readonly mission: Mission;
  readonly steps: readonly StepProgress[];
  /** Index of the first not-done step, or steps.length when all steps are done. */
  readonly currentStepIndex: number;
  readonly available: boolean;
  readonly complete: boolean;
}

/** True when every id in every present array of the requirement is satisfied. */
export function requirementMet(req: StepRequirement, state: MissionState): boolean {
  const contractsCompleted = req.contractsCompleted ?? [];
  const flags = req.flags ?? [];
  const visited = req.visited ?? [];

  if (contractsCompleted.length > 0) {
    const completed = new Set(state.completedContractIds);
    if (!contractsCompleted.every((id) => completed.has(id))) {
      return false;
    }
  }

  if (flags.length > 0 && !flags.every((id) => state.flags.has(id))) {
    return false;
  }

  if (visited.length > 0) {
    const visitedSet = new Set(state.visitedIds);
    if (!visited.every((id) => visitedSet.has(id))) {
      return false;
    }
  }

  return true;
}

/** True when the step's requirement is met. */
export function stepDone(step: MissionStep, state: MissionState): boolean {
  return requirementMet(step.requires, state);
}

/** True when the mission's top-level requirement is met, or it has none. */
export function missionAvailable(mission: Mission, state: MissionState): boolean {
  if (mission.requires === undefined) {
    return true;
  }
  return requirementMet(mission.requires, state);
}

/** True when the mission is available and every one of its steps is done. */
export function missionComplete(mission: Mission, state: MissionState): boolean {
  if (!missionAvailable(mission, state)) {
    return false;
  }
  return mission.steps.every((step) => stepDone(step, state));
}

/**
 * Full derived progress for a mission: per-step done flags, the index of the
 * first not-done step (or steps.length when all are done), and whether the
 * mission is available and complete.
 */
export function missionProgress(mission: Mission, state: MissionState): MissionProgress {
  const steps: StepProgress[] = mission.steps.map((step) => ({
    step,
    done: stepDone(step, state),
  }));

  const currentStepIndex = steps.findIndex((s) => !s.done);
  const available = missionAvailable(mission, state);
  const complete = available && currentStepIndex === -1;

  return {
    mission,
    steps,
    currentStepIndex: currentStepIndex === -1 ? steps.length : currentStepIndex,
    available,
    complete,
  };
}

/**
 * The first mission that is available but not complete. When preferRegionId
 * is given, a mission whose regionId matches is preferred over others, but
 * input order is otherwise preserved within each group. Returns null when no
 * mission qualifies.
 */
export function activeMission(
  missions: readonly Mission[],
  state: MissionState,
  preferRegionId?: string,
): Mission | null {
  const eligible = missions.filter(
    (mission) => missionAvailable(mission, state) && !missionComplete(mission, state),
  );

  if (eligible.length === 0) {
    return null;
  }

  if (preferRegionId !== undefined) {
    const preferred = eligible.find((mission) => mission.regionId === preferRegionId);
    if (preferred !== undefined) {
      return preferred;
    }
  }

  return eligible[0] ?? null;
}

/** The active mission's current step, for a HUD objective line. Null when nothing is active. */
export function activeObjective(
  missions: readonly Mission[],
  state: MissionState,
  preferRegionId?: string,
): { readonly mission: Mission; readonly step: MissionStep } | null {
  const mission = activeMission(missions, state, preferRegionId);
  if (mission === null) {
    return null;
  }

  const progress = missionProgress(mission, state);
  const currentStep = progress.steps[progress.currentStepIndex]?.step;
  if (currentStep === undefined) {
    return null;
  }

  return { mission, step: currentStep };
}
