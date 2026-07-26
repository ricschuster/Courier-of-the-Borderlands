// The milestone subsystem, extracted from MapScene (#392): the surfaces that
// mark what a run has achieved, and the telemetry that records it. Achievements,
// the region-cleared summary, the end-of-arc capstone, and the run milestones
// written to telemetry.
//
// These belong together for a reason the panel-input slice did not have: they
// share state as well as shape. The controller owns five pieces of session state
// that nothing outside this cluster has any business writing:
//
// - which achievements are held;
// - whether the capstone has been dismissed this session, and whether the
//   blockade was already broken when the save loaded;
// - which regions have had their cleared summary dismissed;
// - which regions have already recorded a telemetry milestone.
//
// The host stays narrow because every surface here derives from the same numbers.
// Rather than fifteen accessors, the scene hands over one RunStats snapshot that
// the achievements, both panels, and the telemetry record are all built from.
//
// Behaviour is unchanged from when this lived in MapScene; this is a structural
// extraction, following the DialogueController and PanelInputController
// precedents.

import { courierTitle, earnedAchievements, ACHIEVEMENTS } from '../systems/achievements';
import { summaryText, capstoneText } from '../systems/panel-text';
import { formatDistance } from '../systems/trip-log';
import { recordRun, type RunMilestone } from '../systems/telemetry';
import { tierFor } from '../systems/economy';
import { REGIONS, type Region } from '../systems/region-system';
import type { Difficulty } from '../systems/wagon-condition';
import type { AchievementStat } from '../systems/achievements';
import type { MapHud } from './map-hud';
import type { Audio } from './audio';

/**
 * The run numbers every milestone surface is derived from. Gathered once by the
 * scene, where the fields live, so this controller needs one host call rather
 * than one per statistic. The achievement rules, both panels, and the telemetry
 * record are all built from this same snapshot.
 */
export interface RunStats {
  readonly coins: number;
  readonly totalReputation: number;
  readonly deliveries: number;
  readonly distanceTiles: number;
  readonly placesFound: number;
  readonly totalPlaces: number;
  readonly upgradesOwned: number;
  readonly totalUpgrades: number;
  /** Whether the active region's own ford is unlocked (false if it has none). */
  readonly fordUnlocked: boolean;
  readonly regionCleared: boolean;
  readonly difficulty: Difficulty;
  readonly wagonWearTotal: number;
  readonly wagonCondition: number;
  readonly strandEvents: number;
}

/** The services the milestone controller needs from its host scene. */
export interface MilestoneHost {
  getHud(): MapHud;
  getAudio(): Audio;
  getRegion(): Region;
  /** Everything the milestone surfaces and the telemetry record are derived from. */
  runStats(): RunStats;
  /**
   * Delivered and total counts for the standing (ungated) routes. The summary is
   * based on these rather than on in-play contracts, because each spoke's
   * arc-gated contract is revealed and left undelivered as the mission climax.
   */
  baseContractCounts(): { delivered: number; total: number };
  gatewayDestinationNames(): string;
  /** Whether the story flag for breaking the blockade is set. */
  blockadeBroken(): boolean;
  /** True under the e2e hook, which separates bot runs from real play in telemetry. */
  isAutomated(): boolean;
}

export class MilestoneController {
  // Achievement ids held. Restored from the save, persisted back by the scene.
  private achievements = new Set<string>();
  /**
   * The end-of-arc capstone shows once, the session the courier breaks the
   * blockade. capstoneDismissed hides it after Esc within that session;
   * blockadeBrokenAtLoad records whether the flag was already set when the scene
   * loaded, so the panel never re-appears on a later load or after travel (the
   * save already carries the flag by then). This gives show-once with no new
   * save field. See docs/design/05_playtest_notes.md.
   */
  private capstoneDismissed = false;
  private blockadeBrokenAtLoad = false;
  /**
   * Regions whose cleared summary has been dismissed. The summary blocks the
   * centre of the screen, so the player dismisses it with Esc and it then stays
   * hidden for the session. Keyed by region id: the summary is per-region
   * content, so dismissing one region's panel must not suppress another's.
   */
  private summaryDismissedRegions = new Set<string>();
  /**
   * Region ids whose "cleared" telemetry milestone has already been captured this
   * session, so refreshing after a clear does not record the same region twice.
   */
  private telemetryRecorded = new Set<string>();

  constructor(private readonly host: MilestoneHost) {}

  /**
   * Apply a loaded save. Called from restoreState, before the HUD exists, which
   * is why this is a method rather than a constructor argument.
   */
  restore(achievements: Set<string>, blockadeBrokenAtLoad: boolean): void {
    this.achievements = achievements;
    this.blockadeBrokenAtLoad = blockadeBrokenAtLoad;
  }

  /**
   * Clear the session-scoped panel and telemetry dedup state. A fresh run (new
   * game or first boot) is not a region-travel restart: the dedup state belongs
   * to the previous playthrough, so a re-cleared region or re-broken blockade
   * shows its panel and records its milestone again (#291).
   */
  resetForNewRun(): void {
    this.summaryDismissedRegions = new Set();
    this.capstoneDismissed = false;
    this.telemetryRecorded = new Set();
  }

  /** Achievement ids held, for the save. */
  achievementIds(): readonly string[] {
    return [...this.achievements];
  }

  /** Whether a given achievement is held, for the journal's list. */
  hasAchievement(id: string): boolean {
    return this.achievements.has(id);
  }

  /** The courier's earned title, shown in the journal and on the capstone. */
  title(): string {
    return courierTitle(this.achievementStat());
  }

  /**
   * The finale shows once, the session the courier breaks the blockade, and only
   * then. blockadeBrokenAtLoad excludes a save that was already broken, so the
   * panel never re-appears on a later load or after travelling regions.
   */
  shouldShowCapstone(): boolean {
    return this.host.blockadeBroken() && !this.blockadeBrokenAtLoad && !this.capstoneDismissed;
  }

  /** Whether the capstone has been dismissed this session. */
  isCapstoneDismissed(): boolean {
    return this.capstoneDismissed;
  }

  /** Hide the capstone for the rest of the session (its Esc). */
  dismissCapstone(): void {
    this.capstoneDismissed = true;
    this.host.getHud().setCapstone(null);
  }

  /**
   * Whether this region's cleared summary is showing and can still be dismissed,
   * so Esc has something to close.
   */
  isSummaryDismissable(): boolean {
    return (
      !this.summaryDismissedRegions.has(this.host.getRegion().id) && this.host.runStats().regionCleared
    );
  }

  /** Hide this region's summary for the rest of the session (its Esc). */
  dismissSummary(): void {
    this.summaryDismissedRegions.add(this.host.getRegion().id);
    this.host.getHud().setSummary(null);
  }

  private achievementStat(): AchievementStat {
    const stats = this.host.runStats();
    return {
      deliveries: stats.deliveries,
      distanceTiles: stats.distanceTiles,
      placesFound: stats.placesFound,
      totalPlaces: stats.totalPlaces,
      upgradesOwned: stats.upgradesOwned,
      totalUpgrades: stats.totalUpgrades,
      fordUnlocked: stats.fordUnlocked,
      regionCleared: stats.regionCleared,
    };
  }

  /** Recompute earned achievements; toast newly earned ones when announce is true. */
  refreshAchievements(announce: boolean): void {
    for (const id of earnedAchievements(this.achievementStat())) {
      if (this.achievements.has(id)) {
        continue;
      }
      this.achievements.add(id);
      if (announce) {
        const def = ACHIEVEMENTS.find((a) => a.id === id);
        this.host.getHud().showToast(`Achievement unlocked: ${def?.name ?? id}`);
        this.host.getAudio().achievementUnlocked();
      }
    }
  }

  /**
   * Show or hide the region-cleared summary. `announce` sounds the cue on the
   * frame the panel first appears; create() passes false, because a save loaded
   * into an already-cleared region has not just cleared it, and the same
   * reasoning already gates refreshAchievements.
   */
  refreshSummary(announce = false): void {
    const hud = this.host.getHud();
    const region = this.host.getRegion();
    if (this.summaryDismissedRegions.has(region.id)) {
      hud.setSummary(null);
      return;
    }
    // The cleared panel fires on the standing (ungated) routes, so every region
    // shows it at the natural end of its work. Basing it on in-play contracts
    // suppressed the panel on the spokes, whose arc-gated contract is revealed
    // and left undelivered as the mission climax (Session 5 playtest).
    const base = this.host.baseContractCounts();
    const stats = this.host.runStats();
    const wasVisible = hud.isSummaryVisible();
    // summaryText returns null until the region is cleared, so setSummary(null)
    // keeps the panel hidden in that case.
    hud.setSummary(
      summaryText({
        regionName: region.name,
        coins: stats.coins,
        totalReputation: stats.totalReputation,
        reputationTier: tierFor(stats.totalReputation).name,
        delivered: base.delivered,
        totalContracts: base.total,
        fordUnlocked: stats.fordUnlocked,
        upgradesOwned: stats.upgradesOwned,
        distanceText: formatDistance(stats.distanceTiles),
        gatewayNames: this.host.gatewayDestinationNames(),
      }),
    );
    if (announce && !wasVisible && hud.isSummaryVisible()) {
      this.host.getAudio().regionCleared();
    }
  }

  refreshCapstone(): void {
    const hud = this.host.getHud();
    if (!this.shouldShowCapstone()) {
      hud.setCapstone(null);
      return;
    }
    // On the frame the finale first appears, clear the whole toast queue so no
    // message crosses the panel, and retire the region-cleared summary it
    // supersedes. Clear-all rather than one press: the finale takes the screen
    // over wholesale, and there is no run left for a queued line to inform.
    if (!hud.isCapstoneVisible()) {
      hud.clearToasts();
      // Louder than a stranding, and it cannot lose a collision to whatever was
      // mid-flight when the finale took the screen (#384).
      this.host.getAudio().capstone();
      this.summaryDismissedRegions.add(this.host.getRegion().id);
      hud.setSummary(null);
      // Rising edge of the finale: capture the arc-completion telemetry milestone.
      this.captureTelemetry('arc');
    }
    const stats = this.host.runStats();
    hud.setCapstone(
      capstoneText({
        courierTitle: this.title(),
        deliveries: stats.deliveries,
        distanceText: formatDistance(stats.distanceTiles),
        regionCount: Object.keys(REGIONS).length,
      }),
    );
  }

  /**
   * Persist a gameplay-telemetry record for a run milestone (#220). Region
   * clears are captured at most once per region per session; the arc capstone is
   * only refreshed on its rising edge, so it too records once. Best-effort: a
   * storage failure inside recordRun is swallowed and never interrupts play.
   */
  captureTelemetry(milestone: RunMilestone): void {
    const region = this.host.getRegion();
    if (milestone === 'region') {
      if (this.telemetryRecorded.has(region.id)) {
        return;
      }
      this.telemetryRecorded.add(region.id);
    }
    const stats = this.host.runStats();
    recordRun({
      milestone,
      // Every automated driver boots with `?e2e` and no human does, so this
      // separates bot runs from real play at no extra plumbing cost (#264).
      source: this.host.isAutomated() ? 'auto' : 'play',
      regionId: region.id,
      regionName: region.name,
      difficulty: stats.difficulty,
      coins: stats.coins,
      deliveries: stats.deliveries,
      distanceTiles: stats.distanceTiles,
      wagonWearTotal: stats.wagonWearTotal,
      wagonCondition: stats.wagonCondition,
      strandEvents: stats.strandEvents,
      upgradesOwned: stats.upgradesOwned,
      totalReputation: stats.totalReputation,
    });
  }
}
