import { describe, it, expect } from 'vitest';
import {
  boardText,
  boardInteractable,
  summaryText,
  skillPanelText,
  capstoneText,
  upgradeMenuText,
  modalHintText,
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

describe('boardInteractable', () => {
  // At home, no active contract, nothing over the board: the only interactable case.
  const open = {
    hasActiveContract: false,
    atHome: true,
    capstoneVisible: false,
    summaryVisible: false,
    blockingOverlayOpen: false,
  };

  it('is interactable at home with no contract and no panel open', () => {
    expect(boardInteractable(open)).toBe(true);
  });

  it('yields while a contract is active', () => {
    expect(boardInteractable({ ...open, hasActiveContract: true })).toBe(false);
  });

  it('yields away from home', () => {
    expect(boardInteractable({ ...open, atHome: false })).toBe(false);
  });

  it('yields under the run summary (the #316 gap: input must match visibility)', () => {
    expect(boardInteractable({ ...open, summaryVisible: true })).toBe(false);
  });

  it('yields under the arc capstone (the #316 gap: input must match visibility)', () => {
    expect(boardInteractable({ ...open, capstoneVisible: true })).toBe(false);
  });

  it('yields under any blocking overlay (journal/skills/upgrades, #292)', () => {
    expect(boardInteractable({ ...open, blockingOverlayOpen: true })).toBe(false);
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

describe('modalHintText', () => {
  // #355: the world hint used to freeze under a modal surface and keep
  // advertising keys the freeze had made inert. Every line here must therefore
  // name only keys that actually work while that surface is up.

  it('names the close keys for a panel', () => {
    expect(modalHintText({ surface: 'journal', scrollable: true, numbersActive: false })).toContain(
      'Esc or J: close',
    );
    expect(modalHintText({ surface: 'skills', scrollable: true, numbersActive: false })).toContain(
      'Esc or K: close',
    );
    expect(modalHintText({ surface: 'codex', scrollable: false, numbersActive: false })).toContain(
      'Esc or L: close',
    );
    expect(modalHintText({ surface: 'upgrades', scrollable: true, numbersActive: false })).toContain(
      'Esc or B: close',
    );
  });

  it('never advertises driving, repair, travel, or the toast dismiss', () => {
    // The exact strings the blind player saw under an open journal while every
    // one of them was inert.
    for (const surface of ['journal', 'skills', 'codex', 'upgrades', 'dialogue'] as const) {
      const text = modalHintText({ surface, scrollable: true, numbersActive: true });
      expect(text).not.toContain('drive');
      expect(text).not.toContain('repair');
      expect(text).not.toContain('travel');
      expect(text).not.toContain('dismiss');
      expect(text).not.toContain('new game');
    }
  });

  // "scrollable" means a panel type that scrolls at all, matching what each
  // panel's own header already advertises; it is not a content-overflow check.
  it('offers the scroll cue only for the scrolling panel types', () => {
    expect(modalHintText({ surface: 'journal', scrollable: true, numbersActive: false })).toContain(
      'PgUp/PgDn: scroll',
    );
    // The codex always fits, so cueing a scroll there would be the same lie in
    // a smaller form.
    expect(
      modalHintText({ surface: 'codex', scrollable: false, numbersActive: false }),
    ).not.toContain('scroll');
  });

  it('offers the number keys only when they would do something', () => {
    expect(modalHintText({ surface: 'skills', scrollable: true, numbersActive: true })).toContain(
      'Number: rank a skill',
    );
    expect(modalHintText({ surface: 'upgrades', scrollable: true, numbersActive: true })).toContain(
      'Number: fit an upgrade',
    );
    // No banked point, or nothing left to fit: the digits are inert, so no cue.
    expect(
      modalHintText({ surface: 'skills', scrollable: true, numbersActive: false }),
    ).not.toContain('Number');
    expect(
      modalHintText({ surface: 'upgrades', scrollable: true, numbersActive: false }),
    ).not.toContain('Number');
  });

  it('keeps the conversation line terse, since the dialogue box states its own keys', () => {
    expect(modalHintText({ surface: 'dialogue', scrollable: false, numbersActive: true })).toBe(
      'Esc: step away',
    );
  });
});

describe('panel notices (#356)', () => {
  const SKILLS_FOR_NOTICE: Skill[] = [
    { id: 'teamster', name: 'Teamster', description: '', maxRank: 3, perRank: { speedBonus: 0.1 } },
  ];
  const UPGRADES_FOR_NOTICE: readonly Upgrade[] = [
    { id: 'wheels', name: 'Reinforced Wheels', description: '', cost: 50, speedBonus: 0.25 },
  ];
  const skillBase = {
    level: 1,
    xpIntoLevel: 0,
    xpForNextLevel: 50,
    points: 0,
    skills: SKILLS_FOR_NOTICE,
    ranks: {},
  };

  it('renders a notice in the skills panel when one is set', () => {
    const text = skillPanelText({ ...skillBase, notice: 'No skill point banked yet.' });
    expect(text).toContain('> No skill point banked yet.');
  });

  it('renders a notice in the upgrade menu when one is set', () => {
    const text = upgradeMenuText({
      coins: 30,
      upgrades: UPGRADES_FOR_NOTICE,
      purchased: new Set(),
      notice: 'Not enough coins for Reinforced Wheels: 50c, 20 short.',
    });
    expect(text).toContain('> Not enough coins for Reinforced Wheels: 50c, 20 short.');
  });

  it('adds no notice line when there is nothing to say', () => {
    // Null and absent must behave the same: the field is optional so existing
    // callers keep working, and neither may leave a stray marker in the panel.
    expect(skillPanelText({ ...skillBase, notice: null })).not.toContain('>');
    expect(skillPanelText(skillBase)).not.toContain('>');
    const menu = { coins: 30, upgrades: UPGRADES_FOR_NOTICE, purchased: new Set<string>() };
    expect(upgradeMenuText({ ...menu, notice: null })).not.toContain('>');
    expect(upgradeMenuText(menu)).not.toContain('>');
  });
});
