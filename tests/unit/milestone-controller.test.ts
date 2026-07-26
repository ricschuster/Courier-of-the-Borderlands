import { describe, it, expect, beforeEach } from 'vitest';
import {
  MilestoneController,
  type MilestoneHost,
  type RunStats,
} from '../../src/scenes/milestone-controller';
import type { MapHud } from '../../src/scenes/map-hud';
import type { Audio } from '../../src/scenes/audio';
import { getRegion } from '../../src/systems/region-system';

// The milestone controller (#392) owns the session state behind the capstone,
// the region-cleared summary, achievements, and telemetry dedup. Before the
// extraction this state was scattered across MapScene fields and reachable only
// through a running Phaser scene, so the rules below had no unit coverage at
// all: neutralizing the load-time restore, and separately the new-run reset,
// each left the whole suite (1120 unit tests, 49 browser tests) green.
//
// The narrow host interface is what makes these testable without Phaser, which
// was the point of the extraction.

/** A recording stand-in for the HUD, covering only what this controller calls. */
class FakeHud {
  capstone: string | null = null;
  summary: string | null = null;
  toasts: string[] = [];
  clearedToasts = 0;

  setCapstone(text: string | null): void {
    this.capstone = text;
  }
  setSummary(text: string | null): void {
    this.summary = text;
  }
  isCapstoneVisible(): boolean {
    return this.capstone !== null;
  }
  isSummaryVisible(): boolean {
    return this.summary !== null;
  }
  showToast(message: string): void {
    this.toasts.push(message);
  }
  clearToasts(): void {
    this.clearedToasts += 1;
  }
}

/** A recording stand-in for the audio layer. */
class FakeAudio {
  played: string[] = [];
  capstone(): void {
    this.played.push('capstone');
  }
  regionCleared(): void {
    this.played.push('region-cleared');
  }
  achievementUnlocked(): void {
    this.played.push('achievement');
  }
}

const CLEARED_STATS: RunStats = {
  coins: 400,
  totalReputation: 20,
  deliveries: 5,
  distanceTiles: 200,
  placesFound: 6,
  totalPlaces: 6,
  upgradesOwned: 2,
  totalUpgrades: 7,
  fordUnlocked: true,
  regionCleared: true,
  difficulty: 'standard',
  wagonWearTotal: 40,
  wagonCondition: 60,
  strandEvents: 0,
};

describe('MilestoneController', () => {
  let hud: FakeHud;
  let audio: FakeAudio;
  let blockadeBroken: boolean;
  let stats: RunStats;
  let controller: MilestoneController;

  beforeEach(() => {
    hud = new FakeHud();
    audio = new FakeAudio();
    blockadeBroken = false;
    stats = CLEARED_STATS;
    const host: MilestoneHost = {
      getHud: () => hud as unknown as MapHud,
      getAudio: () => audio as unknown as Audio,
      getRegion: () => getRegion('greybridge'),
      runStats: () => stats,
      baseContractCounts: () => ({ delivered: 5, total: 5 }),
      gatewayDestinationNames: () => 'Saltreach and Fenmarch',
      blockadeBroken: () => blockadeBroken,
      isAutomated: () => true,
    };
    controller = new MilestoneController(host);
  });

  describe('the capstone shows once', () => {
    it('shows when the blockade breaks during this session', () => {
      controller.restore(new Set(), false);
      blockadeBroken = true;

      expect(controller.shouldShowCapstone()).toBe(true);
      controller.refreshCapstone();
      expect(hud.capstone).not.toBeNull();
      expect(audio.played).toContain('capstone');
    });

    it('stays hidden when the save already had the blockade broken', () => {
      // The regression the whole blockadeBrokenAtLoad flag exists to prevent:
      // without it, every reload of a finished save replays the finale.
      controller.restore(new Set(), true);
      blockadeBroken = true;

      expect(controller.shouldShowCapstone()).toBe(false);
      controller.refreshCapstone();
      expect(hud.capstone).toBeNull();
      expect(audio.played).not.toContain('capstone');
    });

    it('stays hidden after being dismissed', () => {
      controller.restore(new Set(), false);
      blockadeBroken = true;
      controller.refreshCapstone();

      controller.dismissCapstone();

      expect(controller.isCapstoneDismissed()).toBe(true);
      expect(controller.shouldShowCapstone()).toBe(false);
      controller.refreshCapstone();
      expect(hud.capstone).toBeNull();
    });

    it('takes the screen over wholesale on the frame it appears', () => {
      controller.restore(new Set(), false);
      blockadeBroken = true;
      controller.refreshSummary();
      expect(hud.summary).not.toBeNull();

      controller.refreshCapstone();

      // The queue is cleared so nothing crosses the panel, and the summary it
      // supersedes is retired.
      expect(hud.clearedToasts).toBe(1);
      expect(hud.summary).toBeNull();
      // Only on the rising edge: a second refresh must not re-clear or re-sound.
      controller.refreshCapstone();
      expect(hud.clearedToasts).toBe(1);
      expect(audio.played.filter((c) => c === 'capstone')).toHaveLength(1);
    });
  });

  describe('the region-cleared summary', () => {
    it('sounds its cue only when announce is set and it was not already up', () => {
      controller.restore(new Set(), false);

      controller.refreshSummary(false);
      expect(hud.summary).not.toBeNull();
      // Booting into an already-cleared region is not a fresh clear.
      expect(audio.played).not.toContain('region-cleared');
    });

    it('announces on the transition from hidden to shown', () => {
      controller.restore(new Set(), false);
      stats = { ...CLEARED_STATS, regionCleared: false };
      controller.refreshSummary(true);

      stats = CLEARED_STATS;
      controller.refreshSummary(true);

      expect(audio.played).toContain('region-cleared');
    });

    it('stays dismissed for the rest of the session', () => {
      controller.restore(new Set(), false);
      controller.refreshSummary();
      expect(controller.isSummaryDismissable()).toBe(true);

      controller.dismissSummary();

      expect(hud.summary).toBeNull();
      expect(controller.isSummaryDismissable()).toBe(false);
      controller.refreshSummary();
      expect(hud.summary).toBeNull();
    });
  });

  describe('a fresh run resets the session state (#291)', () => {
    it('re-shows a summary that a previous playthrough had dismissed', () => {
      controller.restore(new Set(), false);
      controller.refreshSummary();
      controller.dismissSummary();
      expect(controller.isSummaryDismissable()).toBe(false);

      controller.resetForNewRun();

      expect(controller.isSummaryDismissable()).toBe(true);
      controller.refreshSummary();
      expect(hud.summary).not.toBeNull();
    });

    it('re-shows a capstone that a previous playthrough had dismissed', () => {
      controller.restore(new Set(), false);
      blockadeBroken = true;
      controller.refreshCapstone();
      controller.dismissCapstone();
      expect(controller.shouldShowCapstone()).toBe(false);

      controller.resetForNewRun();

      expect(controller.isCapstoneDismissed()).toBe(false);
      expect(controller.shouldShowCapstone()).toBe(true);
    });
  });

  describe('achievements', () => {
    it('restores the held set from the save rather than starting empty', () => {
      controller.restore(new Set(['first-delivery']), false);

      expect(controller.hasAchievement('first-delivery')).toBe(true);
      expect(controller.achievementIds()).toContain('first-delivery');
    });

    it('toasts only newly earned achievements, and only when announcing', () => {
      controller.restore(new Set(), false);

      controller.refreshAchievements(true);
      const firstRun = [...hud.toasts];
      expect(firstRun.length).toBeGreaterThan(0);

      // Nothing new the second time, so nothing is announced again.
      controller.refreshAchievements(true);
      expect(hud.toasts).toEqual(firstRun);
    });

    it('earns silently when announce is false', () => {
      controller.restore(new Set(), false);

      controller.refreshAchievements(false);

      expect(hud.toasts).toEqual([]);
      expect(audio.played).not.toContain('achievement');
      expect(controller.achievementIds().length).toBeGreaterThan(0);
    });
  });
});
