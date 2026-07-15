import { describe, it, expect } from 'vitest';
import {
  boardText,
  summaryText,
  skillPanelText,
  capstoneText,
  upgradeMenuText,
} from '../../src/systems/panel-text';
import type { Contract } from '../../src/systems/contract-system';
import type { Skill, SkillRanks } from '../../src/systems/skills';
import type { Upgrade } from '../../src/systems/upgrade-system';

function contract(id: string, overrides: Partial<Contract> = {}): Contract {
  return {
    id,
    title: id,
    cargo: 'a letter',
    pickupId: 'home',
    destinationId: 'there',
    reward: 50,
    reputation: 2,
    minReputation: 0,
    note: '',
    ...overrides,
  };
}

describe('boardText', () => {
  it('renders an uppercase header and a line per contract', () => {
    const text = boardText({
      homeName: 'Greybridge',
      contracts: [contract('c1', { title: 'Letters to Ashford', reward: 40, reputation: 3 })],
      reputation: 0,
      worldStatus: {},
    });
    expect(text).toContain('GREYBRIDGE BOARD  (press number to accept)');
    expect(text).toContain('[1] Letters to Ashford  -  40c, +3 rep');
    expect(text).toContain('<goods>'); // default cargo tag
  });

  it('shows a quiet-frontier line when there are no contracts', () => {
    const text = boardText({ homeName: 'Greybridge', contracts: [], reputation: 0, worldStatus: {} });
    expect(text).toContain('No contracts remain');
  });

  it('marks a contract locked when reputation is below its minimum', () => {
    const text = boardText({
      homeName: 'Greybridge',
      contracts: [contract('c1', { minReputation: 10 })],
      reputation: 0,
      worldStatus: {},
    });
    expect(text).toContain('[needs 10 rep]');
  });

  it('shows the reconnection premium and boosted reward for a reconnected destination', () => {
    const text = boardText({
      homeName: 'Greybridge',
      contracts: [contract('c1', { title: 'Back to Reedford', reward: 100, destinationId: 'reedford' })],
      reputation: 0,
      worldStatus: { reedford: 'reconnected' },
    });
    // 100 base + 20% reconnection premium.
    expect(text).toContain('120c');
    expect(text).toContain('(+20% reconnected)');
  });

  it('leaves the reward flat for a silent destination', () => {
    const text = boardText({
      homeName: 'Greybridge',
      contracts: [contract('c1', { reward: 100, destinationId: 'reedford' })],
      reputation: 0,
      worldStatus: { reedford: 'silent' },
    });
    expect(text).toContain('100c');
    expect(text).not.toContain('reconnected');
  });
});

describe('summaryText', () => {
  const base = {
    regionName: 'Greybridge Region',
    coins: 120,
    totalReputation: 6,
    reputationTier: 'Trusted',
    fordUnlocked: true,
    upgradesOwned: 1,
    distanceText: '30 tiles',
    gatewayNames: 'Saltreach',
  };

  it('returns null until the region is cleared', () => {
    expect(summaryText({ ...base, delivered: 1, totalContracts: 3 })).toBeNull();
  });

  it('renders the cleared panel once all contracts are delivered', () => {
    const text = summaryText({ ...base, delivered: 3, totalContracts: 3 });
    expect(text).not.toBeNull();
    expect(text).toContain('Greybridge Region Cleared');
    expect(text).toContain('Distance driven: 30 tiles');
    expect(text).toContain('press T to travel to Saltreach');
  });
});

describe('skillPanelText', () => {
  const SKILLS: Skill[] = [
    { id: 'teamster', name: 'Teamster', description: 'Faster on roads.', maxRank: 3, perRank: { speedBonus: 0.1 } },
    { id: 'wayfinder', name: 'Wayfinder', description: 'Sees further.', maxRank: 2, perRank: { revealBonus: 1 } },
  ];

  it('shows the level, points, and each skill rank', () => {
    const ranks: SkillRanks = { teamster: 1 };
    const text = skillPanelText({
      level: 4,
      xpIntoLevel: 20,
      xpForNextLevel: 60,
      points: 2,
      skills: SKILLS,
      ranks,
    });
    expect(text).toContain('Level 4   XP 20 / 60');
    expect(text).toContain('Skill points to spend: 2');
    expect(text).toContain('[1] Teamster  rank 1/3');
    expect(text).toContain('[2] Wayfinder  rank 0/2');
  });

  it('tags a maxed skill', () => {
    const text = skillPanelText({
      level: 9,
      xpIntoLevel: 0,
      xpForNextLevel: 100,
      points: 0,
      skills: SKILLS,
      ranks: { wayfinder: 2 },
    });
    expect(text).toContain('[2] Wayfinder  rank 2/2  (max)');
  });

  // The panel is keyboard-scrollable (#274). The header used to name only the
  // mouse wheel, which told a keyboard-only player there was more to read and no
  // way to reach it.
  it('names a keyboard scroll route, not just the wheel', () => {
    const text = skillPanelText({
      level: 1,
      xpIntoLevel: 0,
      xpForNextLevel: 50,
      points: 0,
      skills: SKILLS,
      ranks: {},
    });
    expect(text).toContain('PgUp/PgDn');
    expect(text).not.toContain('mouse wheel to scroll');
  });
});

describe('capstoneText', () => {
  it('renders the finale title, journey numbers, and dismiss hint', () => {
    const text = capstoneText({
      courierTitle: 'Roadwarden',
      deliveries: 18,
      distanceText: '240 tiles',
      regionCount: 3,
    });
    expect(text).toContain('THE BLOCKADE BROKEN');
    expect(text).toContain('Regions reconnected: 3 of 3');
    expect(text).toContain('Deliveries made: 18');
    expect(text).toContain('Distance driven: 240 tiles');
    expect(text).toContain('Courier title: Roadwarden');
    expect(text).toContain('Esc to close');
  });
});

describe('upgradeMenuText', () => {
  const UPGRADES: readonly Upgrade[] = [
    { id: 'wheels', name: 'Reinforced Wheels', description: '', cost: 50, speedBonus: 0.25 },
    { id: 'lantern', name: 'Far Lantern', description: '', cost: 40, speedBonus: 0, revealBonus: 1.5 },
  ];

  it('lists each upgrade with a number, cost, and effect', () => {
    const text = upgradeMenuText({ coins: 100, upgrades: UPGRADES, purchased: new Set() });
    expect(text).toContain('[1] Reinforced Wheels  -  50c');
    expect(text).toContain('+25% speed');
    expect(text).toContain('[2] Far Lantern  -  40c');
    expect(text).toContain('+1.5 tiles sight');
  });

  it('marks a fitted upgrade', () => {
    const text = upgradeMenuText({ coins: 100, upgrades: UPGRADES, purchased: new Set(['wheels']) });
    expect(text).toContain('Reinforced Wheels  -  50c   (fitted)');
  });

  // See the matching skillPanelText case (#274).
  it('names a keyboard scroll route, not just the wheel', () => {
    const text = upgradeMenuText({ coins: 100, upgrades: UPGRADES, purchased: new Set() });
    expect(text).toContain('PgUp/PgDn');
    expect(text).not.toContain('mouse wheel to scroll');
  });

  it('marks affordable and unaffordable upgrades', () => {
    const text = upgradeMenuText({ coins: 45, upgrades: UPGRADES, purchased: new Set() });
    expect(text).toContain('Reinforced Wheels  -  50c   need 5 more coins');
    expect(text).toContain('Far Lantern  -  40c   affordable');
  });

  it('shows the current coin total', () => {
    const text = upgradeMenuText({ coins: 123, upgrades: UPGRADES, purchased: new Set() });
    expect(text).toContain('Coins: 123');
  });
});
