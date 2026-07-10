import { describe, it, expect } from 'vitest';
import { boardText, summaryText, skillPanelText, capstoneText } from '../../src/systems/panel-text';
import type { Contract } from '../../src/systems/contract-system';
import type { Skill, SkillRanks } from '../../src/systems/skills';

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
