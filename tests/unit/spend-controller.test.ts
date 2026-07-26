import { describe, it, expect, beforeEach } from 'vitest';
import { SpendController, type SpendHost } from '../../src/scenes/spend-controller';
import type { MapHud } from '../../src/scenes/map-hud';
import type { Audio } from '../../src/scenes/audio';
import type { Juice } from '../../src/scenes/juice';
import { SKILLS, rankOf, type SkillRanks } from '../../src/systems/skills';
import type { Upgrade } from '../../src/systems/upgrade-system';

// The spend rules (#356, #327), made testable by the #392 extraction. The point
// of this cluster is that a refusal renders *in the panel* rather than as a
// toast, because under the toast queue each refused key would otherwise cost the
// player a dismiss press. That distinction is invisible to a browser spec that
// only checks the purchase succeeded.

class FakeHud {
  skillPanelVisible = false;
  upgradeMenuVisible = false;
  toasts: string[] = [];
  skillText = '';
  upgradeText = '';

  isSkillPanelVisible(): boolean {
    return this.skillPanelVisible;
  }
  isUpgradeMenuVisible(): boolean {
    return this.upgradeMenuVisible;
  }
  showToast(m: string): void {
    this.toasts.push(m);
  }
  setSkillText(t: string): void {
    this.skillText = t;
  }
  setUpgradeText(t: string): void {
    this.upgradeText = t;
  }
}

class FakeAudio {
  played: string[] = [];
  skillRanked(): void {
    this.played.push('skill-ranked');
  }
  panelRefused(): void {
    this.played.push('panel-refused');
  }
  upgradeFitted(): void {
    this.played.push('upgrade-fitted');
  }
}

class FakeJuice {
  fitted = 0;
  upgradeFitted(): void {
    this.fitted += 1;
  }
}

const CHEAP: Upgrade = {
  id: 'cheap',
  name: 'Greased Axles',
  description: 'Rolls easier.',
  cost: 50,
  speedBonus: 0.1,
};

describe('SpendController', () => {
  let hud: FakeHud;
  let audio: FakeAudio;
  let juice: FakeJuice;
  let skills: SkillRanks;
  let level: number;
  let coins: number;
  let purchased: Set<string>;
  let saves: number;
  let gatedRefreshes: number;
  let pressed: number | null;
  let controller: SpendController;

  const keys = Array.from({ length: 9 }, (_, i) => ({ slot: i })) as never[];

  beforeEach(() => {
    hud = new FakeHud();
    audio = new FakeAudio();
    juice = new FakeJuice();
    skills = {};
    level = 5;
    coins = 100;
    purchased = new Set();
    saves = 0;
    gatedRefreshes = 0;
    pressed = null;

    const host: SpendHost = {
      getHud: () => hud as unknown as MapHud,
      getAudio: () => audio as unknown as Audio,
      getJuice: () => juice as unknown as Juice,
      getNumberKeys: () => keys,
      justDown: (key) => keys.indexOf(key as never) === pressed,
      upgradesForSale: () => [CHEAP],
      courierLevel: () => level,
      courierXp: () => 0,
      getSkills: () => skills,
      setSkills: (next) => {
        skills = next;
      },
      getCoins: () => coins,
      getPurchasedUpgrades: () => purchased,
      applyPurchase: (next, nextCoins) => {
        purchased = new Set(next);
        coins = nextCoins;
      },
      refreshGatedColliders: () => {
        gatedRefreshes += 1;
      },
      refreshWallet: () => {},
      refreshAchievements: () => {},
      save: () => {
        saves += 1;
      },
    };
    controller = new SpendController(host);
  });

  describe('skill ranks', () => {
    beforeEach(() => {
      hud.skillPanelVisible = true;
    });

    it('does nothing while the panel is closed', () => {
      hud.skillPanelVisible = false;
      pressed = 0;

      controller.handleSkillInput();

      expect(skills).toEqual({});
      expect(audio.played).toEqual([]);
    });

    it('ranks a skill up and reports it as real progress', () => {
      pressed = 0;
      const first = SKILLS[0]!;

      controller.handleSkillInput();

      expect(rankOf(skills, first.id)).toBe(1);
      // A rank outlives the panel and belongs in the journal, so it toasts.
      expect(hud.toasts.join(' ')).toContain(first.name);
      expect(audio.played).toContain('skill-ranked');
      expect(saves).toBe(1);
    });

    it('opens any tiles the new rank unlocks, so the route is drivable at once', () => {
      pressed = 0;

      controller.handleSkillInput();

      expect(gatedRefreshes).toBe(1);
    });

    it('refuses in the panel, not as a toast, when no point is banked', () => {
      level = 0;
      pressed = 0;

      controller.handleSkillInput();

      expect(hud.toasts).toEqual([]);
      expect(hud.skillText).toContain('No skill point banked yet');
      expect(audio.played).toContain('panel-refused');
      expect(saves).toBe(0);
    });

    it('distinguishes a maxed skill from an empty pool', () => {
      // Bank plenty of points, then max the first skill out.
      level = 99;
      const first = SKILLS[0]!;
      for (let i = 0; i < first.maxRank; i++) {
        pressed = 0;
        controller.handleSkillInput();
      }
      expect(rankOf(skills, first.id)).toBe(first.maxRank);

      pressed = 0;
      controller.handleSkillInput();

      expect(hud.skillText).toContain('already at its highest rank');
      expect(hud.skillText).not.toContain('No skill point banked');
    });

    it('clears a stale refusal once a rank succeeds', () => {
      level = 0;
      pressed = 0;
      controller.handleSkillInput();
      expect(hud.skillText).toContain('No skill point banked yet');

      level = 5;
      pressed = 0;
      controller.handleSkillInput();

      expect(controller.currentNotice()).toBeNull();
      expect(hud.skillText).not.toContain('No skill point banked yet');
    });
  });

  describe('upgrades', () => {
    beforeEach(() => {
      hud.upgradeMenuVisible = true;
    });

    it('does nothing while the menu is closed', () => {
      hud.upgradeMenuVisible = false;
      pressed = 0;

      controller.handleUpgradeInput();

      expect(purchased.size).toBe(0);
    });

    it('fits an affordable upgrade and spends the coins', () => {
      pressed = 0;

      controller.handleUpgradeInput();

      expect(purchased.has('cheap')).toBe(true);
      expect(coins).toBe(50);
      expect(hud.toasts.join(' ')).toContain('Fitted Greased Axles');
      expect(audio.played).toContain('upgrade-fitted');
      expect(juice.fitted).toBe(1);
      expect(gatedRefreshes).toBe(1);
      expect(saves).toBe(1);
    });

    it('names the shortfall in the menu rather than toasting it', () => {
      coins = 20;
      pressed = 0;

      controller.handleUpgradeInput();

      expect(purchased.size).toBe(0);
      expect(hud.toasts).toEqual([]);
      expect(hud.upgradeText).toContain('30 short');
      expect(audio.played).toContain('panel-refused');
      expect(saves).toBe(0);
    });

    it('refuses a second purchase of something already fitted', () => {
      purchased = new Set(['cheap']);
      coins = 500;
      pressed = 0;

      controller.handleUpgradeInput();

      expect(coins).toBe(500);
      expect(hud.upgradeText).toContain('already fitted');
      expect(audio.played).toContain('panel-refused');
    });
  });

  describe('the notice is shared, and cleared when a panel opens', () => {
    it('clearNotice drops a refusal so a fresh visit does not open on it', () => {
      hud.upgradeMenuVisible = true;
      coins = 0;
      pressed = 0;
      controller.handleUpgradeInput();
      expect(controller.currentNotice()).not.toBeNull();

      controller.clearNotice();

      expect(controller.currentNotice()).toBeNull();
    });
  });
});
