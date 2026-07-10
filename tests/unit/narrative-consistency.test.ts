import { describe, it, expect } from 'vitest';
import { SETTLEMENT_DIALOGUES, FLAG_HOME_RECONNECTED } from '../../src/data/dialogue-content';
import { ENCOUNTERS } from '../../src/data/encounters';
import { MISSIONS } from '../../src/data/missions';
import { REGIONS } from '../../src/systems/region-system';
import { SKILLS, skillFlag } from '../../src/systems/skills';
import { reconnectedFlag } from '../../src/systems/world-state';
import type { Dialogue, FlagCondition } from '../../src/systems/dialogue';

// Cross-module narrative consistency. These catch the class of bug that would
// silently ruin a playthrough with no error and no test failure elsewhere: a
// typo'd flag id on a contract/mission/dialogue gate, so the gated content can
// never appear; or a mission step that references a contract or settlement id
// that does not exist, so the step can never complete. The pure per-module
// validators cannot see across modules; this test can.

function flagsSetByDialogue(dialogue: Dialogue): string[] {
  const out: string[] = [];
  for (const node of Object.values(dialogue.nodes)) {
    for (const choice of node.choices) {
      out.push(...(choice.set ?? []));
    }
  }
  return out;
}

function flagsInCondition(condition: FlagCondition | undefined): string[] {
  if (condition === undefined) {
    return [];
  }
  return [...(condition.allOf ?? []), ...(condition.noneOf ?? [])];
}

// Flags a dialogue choice can actually set (persisted story flags).
const settableFlags = new Set<string>();
for (const dialogue of Object.values(SETTLEMENT_DIALOGUES)) {
  flagsSetByDialogue(dialogue).forEach((f) => settableFlags.add(f));
}
for (const encounter of ENCOUNTERS) {
  flagsSetByDialogue(encounter.dialogue).forEach((f) => settableFlags.add(f));
}

// Flags the scene provides at runtime without persisting them: the world-state
// derived flags (home reconnected, plus a per-settlement reconnected flag) and
// the per-skill flags granted while a skill is owned.
const derivedFlags = new Set<string>([
  FLAG_HOME_RECONNECTED,
  ...SKILLS.map((s) => skillFlag(s.id)),
]);
for (const region of Object.values(REGIONS)) {
  for (const id of Object.keys(region.settlements)) {
    derivedFlags.add(reconnectedFlag(id));
  }
}

const knownFlags = new Set<string>([...settableFlags, ...derivedFlags]);

// Every place that gates on a flag, tagged with where it came from.
interface FlagUse {
  readonly flag: string;
  readonly source: string;
}
const gatingFlags: FlagUse[] = [];

for (const [id, dialogue] of Object.entries(SETTLEMENT_DIALOGUES)) {
  for (const node of Object.values(dialogue.nodes)) {
    for (const choice of node.choices) {
      for (const flag of flagsInCondition(choice.requires)) {
        gatingFlags.push({ flag, source: `dialogue "${id}" node "${node.id}"` });
      }
    }
  }
}
for (const encounter of ENCOUNTERS) {
  for (const flag of flagsInCondition(encounter.requires)) {
    gatingFlags.push({ flag, source: `encounter "${encounter.id}" trigger gate` });
  }
  for (const node of Object.values(encounter.dialogue.nodes)) {
    for (const choice of node.choices) {
      for (const flag of flagsInCondition(choice.requires)) {
        gatingFlags.push({ flag, source: `encounter "${encounter.id}" node "${node.id}"` });
      }
    }
  }
}
for (const region of Object.values(REGIONS)) {
  for (const contract of region.contracts) {
    for (const flag of flagsInCondition(contract.requires)) {
      gatingFlags.push({ flag, source: `contract "${contract.id}"` });
    }
  }
}
for (const mission of MISSIONS) {
  for (const flag of mission.requires?.flags ?? []) {
    gatingFlags.push({ flag, source: `mission "${mission.id}" gate` });
  }
  for (const step of mission.steps) {
    for (const flag of step.requires.flags ?? []) {
      gatingFlags.push({ flag, source: `mission "${mission.id}" step "${step.id}"` });
    }
  }
}

// Every contract id and settlement id that actually exists, across all regions.
const allContractIds = new Set<string>();
const allSettlementIds = new Set<string>();
for (const region of Object.values(REGIONS)) {
  region.contracts.forEach((c) => allContractIds.add(c.id));
  Object.keys(region.settlements).forEach((id) => allSettlementIds.add(id));
}

describe('narrative flag consistency', () => {
  it('every gating flag can be satisfied (set by a choice, or a derived flag)', () => {
    const unsatisfiable = gatingFlags.filter((u) => !knownFlags.has(u.flag));
    expect(
      unsatisfiable,
      `these gates reference a flag nothing can set:\n${unsatisfiable
        .map((u) => `  "${u.flag}" required by ${u.source}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('every arc-gated contract gates on a persisted flag a dialogue choice sets', () => {
    // A contract gate on a purely derived flag would work, but the shipped arc
    // contracts intentionally gate on the reveal flags the NPCs set. Guard that
    // those flags are persisted-settable, not only derived, so a save reload
    // keeps the contract available. Ordinary second-wave work gates on the
    // derived reconnected flags instead, so it is excluded here.
    for (const region of Object.values(REGIONS)) {
      for (const contract of region.contracts) {
        if (contract.arc !== true) {
          continue;
        }
        for (const flag of flagsInCondition(contract.requires)) {
          expect(
            settableFlags.has(flag),
            `arc contract "${contract.id}" gates on "${flag}", which no dialogue choice sets`,
          ).toBe(true);
        }
      }
    }
  });
});

describe('mission references resolve to real content', () => {
  it('every mission step contractsCompleted id is a real contract', () => {
    for (const mission of MISSIONS) {
      for (const step of mission.steps) {
        for (const id of step.requires.contractsCompleted ?? []) {
          expect(
            allContractIds.has(id),
            `mission "${mission.id}" step "${step.id}" needs contract "${id}", which does not exist`,
          ).toBe(true);
        }
      }
    }
  });

  it('every mission step visited id is a real settlement', () => {
    for (const mission of MISSIONS) {
      for (const step of mission.steps) {
        for (const id of step.requires.visited ?? []) {
          expect(
            allSettlementIds.has(id),
            `mission "${mission.id}" step "${step.id}" needs visit to "${id}", which does not exist`,
          ).toBe(true);
        }
      }
    }
  });
});
