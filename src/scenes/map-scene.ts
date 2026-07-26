import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  TILE_SIZE,
  COURIER_SPEED,
  FOG_REVEAL_RADIUS,
  CAMERA_LERP,
} from '../config/game-config';
import { TERRAIN_TYPES } from '../data/terrain-types';
import { createTileMap, getTerrainIdAt, worldToTile, type TileMap } from '../systems/tile-map';
import { tileCenter } from '../systems/tile-geometry';
import { MapTerrainLayer } from './map-terrain-layer';
import {
  getTerrain,
  getSpeedModifier,
  getWearSpeedModifier,
  isPassableWith,
} from '../systems/terrain-system';
import { traversalKeys } from '../systems/traversal';
import { computeVelocity, type MoveInput } from '../systems/movement';
import {
  objectiveText,
  navRevealFor,
  type ObjectiveContractView,
  type ObjectiveView,
} from '../systems/objective';
import { createGameState, isUnlocked, unlock, type GameState } from '../systems/game-state';
import {
  createFog,
  revealAround,
  revealedIndices,
  revealIndices,
  isRevealed,
  fogDimsMatch,
  type Fog,
} from '../systems/fog-of-war';
import { addCoins, addReputation, totalReputation, tierFor } from '../systems/economy';
import {
  loadSave,
  writeSave,
  clearSave,
  hasSeenIntro,
  markIntroSeen,
  loadDifficulty,
  type GameSnapshot,
} from '../systems/save-system';
import {
  speedMultiplier,
  purchase,
  revealRadius,
  cheapestUnpurchased,
  terrainSpeedFactor,
  countReliefUpgrades,
  type Upgrade,
} from '../systems/upgrade-system';
import {
  wearPerTile,
  roughness,
  applyWear,
  limpMultiplier,
  isStranded,
  isLowCondition,
  lowConditionWarning,
  repair,
  repairHelpText,
  rescue,
  maxConditionForLevel,
  conditionFraction,
  MAX_CONDITION,
  WAGON_TUNING,
  difficultyLabel,
  type WagonTuning,
  type Difficulty,
} from '../systems/wagon-condition';
import {
  boardText,
  boardInteractable,
  summaryText,
  skillPanelText,
  capstoneText,
  upgradeMenuText,
} from '../systems/panel-text';
import { modalHintText, worldHintText } from '../systems/hint-text';
import { restoreRunState } from '../systems/run-state';
import { buildMinimap, wayfinderSurveyRadius } from '../systems/minimap';
import { terrainsPresent } from '../systems/legend';
import { buildJournalText } from '../systems/journal-text';
import { computeWorldState, reconnectedFlag, type SettlementStatus } from '../systems/world-state';
import { reconnectedNoteFor } from '../data/reconnection-notes';
import { ENCOUNTERS } from '../data/encounters';
import { activeEncounters } from '../systems/encounter-system';
import { DISCOVERIES } from '../data/discoveries';
import {
  discoveryLines,
  foundDiscoveries,
  newlyFound,
  type Discovery,
} from '../systems/discovery';
import { totalXp, levelForXp, levelProgress } from '../systems/experience';
import {
  SKILLS,
  availablePoints,
  shouldNudgeUnspentSkills,
  canRankUp,
  rankUp,
  rankOf,
  skillSpeedBonus,
  skillRevealBonus,
  derivedSkillFlags,
  type SkillRanks,
} from '../systems/skills';
import { findPath, type PathResult } from '../systems/pathfinding';
import { perkFor } from '../systems/reputation-perks';
import { getCargoCategory } from '../systems/cargo-types';
import {
  createTripLog,
  addDistance,
  recordDelivery,
  formatDistance,
  type TripLog,
} from '../systems/trip-log';
import { recordRun, type RunMilestone } from '../systems/telemetry';
import {
  ACHIEVEMENTS,
  earnedAchievements,
  courierTitle,
  type AchievementStat,
} from '../systems/achievements';
import { weatherByIndex, pickWeather, weatherEffectLabel, type Weather } from '../systems/weather';
import { createRng } from '../systems/rng';
import {
  setFlags,
  flagsToArray,
  emptyFlags,
  hasFlag,
  type StoryFlags,
} from '../systems/dialogue';
import {
  dialogueForSettlement,
  FLAG_HOME_RECONNECTED,
  FLAG_BLOCKADE_BROKEN,
} from '../data/dialogue-content';
import { DialogueController, type DialogueHost } from './dialogue-controller';
import {
  activeObjective,
  stepRequirementCount,
  type MissionState,
} from '../systems/mission-system';
import { MISSIONS } from '../data/missions';
import { MapHud, type WagonState } from './map-hud';
import { MapMarkers } from './map-markers';
import { Juice } from './juice';
import { Audio } from './audio';
import { BED_REFERENCE_MULTIPLIER } from '../systems/audio-bed';
import {
  getRegion,
  arrivalTile,
  resumeTile,
  settlementAtTileIn,
  totalSettlementCount,
  REGIONS,
  DEFAULT_REGION_ID,
  type Region,
  type RegionGateway,
} from '../systems/region-system';
import { pushEvent } from '../systems/event-log';
import { UPGRADES_GREYBRIDGE } from '../data/upgrades-greybridge';
import {
  startContract,
  canAccept,
  canPickUp,
  canDeliver,
  pickUp,
  isDelivered,
  availableContracts,
  contractsInPlay,
  baseContracts,
  type Contract,
  type ContractProgress,
} from '../systems/contract-system';
import { Courier } from '../entities/courier';
import { isE2E, speedFactor, wearDisabled, exposeE2EApi, type E2EHost } from './map-scene-e2e';
import { computeDeliveryReward } from '../systems/delivery-reward';

// The courier sits above the terrain (0) and below the fog (5), both of which
// are drawn by MapTerrainLayer. HUD depth lives in map-hud.ts and marker depth
// in map-markers.ts.
const DEPTH_COURIER = 6;

// Story-flag ids for the one-time onboarding teaches (D2, #149). Reserved
// prefix so they never collide with dialogue-authored flags; they persist in
// the save (surviving region travel) and clear on a New Game.
const ONBOARD_SKILLS = 'onboarding:skills';
const ONBOARD_UPGRADES = 'onboarding:upgrades';
const ONBOARD_OFFROAD = 'onboarding:offroad';

// Frames between bump knocks while the wagon is pressed into an impassable edge
// (#383). Driving into a mountain means holding the key, so without a rate limit
// this would be a buzz rather than a knock. Half a second at 60fps.
const BUMP_COOLDOWN_FRAMES = 30;

interface WasdKeys {
  readonly W: Phaser.Input.Keyboard.Key;
  readonly A: Phaser.Input.Keyboard.Key;
  readonly S: Phaser.Input.Keyboard.Key;
  readonly D: Phaser.Input.Keyboard.Key;
}

interface MapSceneData {
  readonly regionId?: string;
  /** Region the courier is travelling from, so it arrives at the return gateway. */
  readonly fromRegionId?: string;
}

// Renders the Greybridge tile map and lets the player drive the courier around
// it. Roads and the bridge are faster, forest is slower, and water and
// mountains are impassable. The ford starts blocked; reaching the signpost
// unlocks it as a shorter southern crossing.
export class MapScene extends Phaser.Scene {
  private state: GameState = createGameState();
  private region!: Region;
  private fogByRegion: Record<string, number[]> = {};
  // Map size each region's saved fog was recorded against, so a resized region
  // discards its stale (differently indexed) fog instead of revealing wrong tiles.
  private fogDimsByRegion: Record<string, [number, number]> = {};
  private travelKey!: Phaser.Input.Keyboard.Key;
  private map!: TileMap;
  private mapOriginY = 0;
  private courier!: Courier;
  /** Terrain, impassable colliders, and fog rectangles (#365). */
  private terrain!: MapTerrainLayer;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WasdKeys;
  private buyKey!: Phaser.Input.Keyboard.Key;
  private repairKey!: Phaser.Input.Keyboard.Key;
  // All HUD and overlay GameObjects live in the MapHud presentation layer.
  private hud!: MapHud;
  // Cosmetic feedback only (#227). Never gates or changes a rule.
  private juice!: Juice;
  private audio!: Audio;
  private fog!: Fog;
  private activeContract: Contract | undefined;
  private progress: ContractProgress | undefined;
  private completed = new Set<string>();
  private numberKeys: Phaser.Input.Keyboard.Key[] = [];
  // The board contract a first digit-press has armed, awaiting a confirming
  // second press of the same slot (#321). The board renumbers between visits, so
  // a remembered digit would otherwise accept a different contract instantly and
  // commit the whole next journey; arming names the contract first so a mispress
  // is caught. Cleared whenever the board is not interactable.
  private armedContractId: string | null = null;
  // Feedback about the last digit pressed at the board (currently only the
  // reputation refusal), rendered on the board itself for the same reason the
  // skills and upgrade panels render theirs (#356). Cleared alongside the armed
  // slot whenever the board stops being interactable.
  private boardNotice: string | null = null;
  private newGameKey!: Phaser.Input.Keyboard.Key;
  private mapKey!: Phaser.Input.Keyboard.Key;
  private muteKey!: Phaser.Input.Keyboard.Key;
  private journalKey!: Phaser.Input.Keyboard.Key;
  private trip: TripLog = createTripLog();
  private prevX = 0;
  private prevY = 0;
  /** Wagon condition (0-100), the travel sink (ADR 0005). Full until worn down. */
  private wagonCondition = MAX_CONDITION;
  /** Cumulative condition points worn away this session, for tuning telemetry. */
  private wagonWearTotal = 0;
  /** Times the wagon hit 0 condition (stranded) this session, for telemetry (#220). */
  private strandEvents = 0;
  /**
   * Region ids whose "cleared" telemetry milestone has already been captured this
   * session, so refreshing after a clear does not record the same region twice.
   */
  private telemetryRecorded = new Set<string>();
  /**
   * True once the low-condition warning has fired for the current low spell, so
   * it toasts once on the way down and re-arms only after a repair lifts the
   * wagon back above the low threshold (#182).
   */
  private lowConditionWarned = false;
  /** Chosen difficulty preset. Loaded from the persisted preference on boot. */
  private difficulty: Difficulty = 'standard';
  /**
   * Difficulty profile for the travel sink. Selected from the difficulty preset
   * on boot. The preset is picked on the title screen and locked for the run
   * (#150), so this does not change again until a new game.
   */
  private wagonTuning: WagonTuning = WAGON_TUNING.standard;
  private currentPath: PathResult | null = null;
  private visited = new Set<string>();
  private achievements = new Set<string>();
  // Presentation layer for the map markers (settlements, gateways, signpost).
  private markers!: MapMarkers;
  // Chosen courier skill ranks. Experience and level are derived from play
  // stats; only these choices are persisted.
  private skills: SkillRanks = {};
  private skillKey!: Phaser.Input.Keyboard.Key;
  private weather: Weather = weatherByIndex(0);
  private legendKey!: Phaser.Input.Keyboard.Key;
  // Story flags set through dialogue, persisted across regions. Presence means
  // set. Derived situational flags are added at dialogue time, not stored here.
  private storyFlags: StoryFlags = emptyFlags();
  // Story-flag count the encounter markers were last built at. Flags are only
  // ever added, so a size change means an encounter may have activated (a
  // `requires` gate met) or resolved: rebuild the markers then, not every frame.
  private encounterMarkerFlagCount = -1;
  private talkKey!: Phaser.Input.Keyboard.Key;
  private escapeKey!: Phaser.Input.Keyboard.Key;
  private dismissKey!: Phaser.Input.Keyboard.Key;
  private pageUpKey!: Phaser.Input.Keyboard.Key;
  private pageDownKey!: Phaser.Input.Keyboard.Key;
  // Conversation subsystem: settlement talk, road encounters, and the modal
  // dialogue state machine. Constructed fresh each create(), so a scene restart
  // starts with no conversation open.
  private dialogue!: DialogueController;
  // Per-contract bonus tracking (reset when a contract is accepted).
  private tilesSinceAccept = 0;
  // Monotonic update-frame counter for the e2e API. A plain field, so it keeps
  // counting across scene.restart (region travel) instead of resetting.
  private frameNo = 0;
  // Courier level reflected in the HUD wallet. XP is continuous (it accrues from
  // distance and discoveries every frame), but the wallet only recomputes on
  // discrete events, so a level crossed mid-drive left the HUD's level and skill
  // points stale versus the live K panel. Tracked here to refresh on the change.
  private hudLevel = 0;
  // Standing tier (by reputation) reflected to the player, so a tier-up fires a
  // one-time perk notification instead of re-firing every frame. Initialised
  // from the loaded reputation on scene create, so region travel does not
  // re-announce a tier the player already holds (D2 onboarding, #149).
  private hudTier = 0;
  private usedFordThisContract = false;
  // True while the courier sits beside a still-locked ford, so the "ford is
  // blocked" hint fires once per approach instead of every frame. Reset when the
  // courier steps away (see docs/design/05_playtest_notes.md).
  private atLockedFordHinted = false;
  // The region-cleared summary panel blocks the centre of the screen, so the
  // player dismisses it with Esc; it then stays hidden for the session instead
  // of re-showing on every refresh (see docs/design/05_playtest_notes.md).
  // Keyed by region id: the summary is per-region content, so dismissing one
  // region's panel must not suppress another's. Reset on a new game (#291).
  private summaryDismissedRegions = new Set<string>();
  // The end-of-arc capstone shows once, the session the courier breaks the
  // blockade. capstoneDismissed hides it after Esc within that session;
  // blockadeBrokenAtLoad records whether the flag was already set when the scene
  // loaded, so the panel never re-appears on a later load or after travel (the
  // save already carries the flag by then). This gives show-once with no new
  // save field. See docs/design/05_playtest_notes.md.
  private capstoneDismissed = false;
  private blockadeBrokenAtLoad = false;
  // Feedback about the last key pressed inside the skills panel or upgrade menu
  // (#356). These refusals can only fire while their panel is open, so they
  // render in the panel the player is already reading rather than as toasts,
  // which would cost a dismiss press each under the #327 queue. Cleared when a
  // panel opens, so a fresh visit never starts on a stale complaint.
  private panelNotice: string | null = null;
  // Set once per page-load session after the player has been told their progress
  // is not being saved, so a failing autosave warns at most once rather than
  // every tick. Not reset across scene restarts: one warning per visit is enough.
  private saveWarned = false;
  // The most recent story messages, mirrored from their toasts so they can be
  // re-read in the journal after the toast fades (Session 2 playtest).
  private recentEvents: readonly string[] = [];
  // Terrain under the wagon on the previous frame, so the driving cues fire on the
  // crossing rather than every frame the wagon spends on the ground (#383).
  // Undefined on the first frame of a scene, which is why the first frame fires
  // nothing: spawning on a road is not "joining" one.
  private prevTerrainId: string | undefined;
  private prevTerrainKnown = false;
  // True while the player is holding a movement key, so a bump can be told from
  // the first frame of a press (velocity is set in update() but the body does not
  // move until physics runs, so frame one always looks blocked).
  private wasDriving = false;
  // Frame the bump cue may next fire on. Driving into a mountain means holding the
  // key down, and an unrated knock every frame would be a buzz (#383).
  private bumpReadyFrame = 0;

  constructor() {
    super({ key: 'MapScene' });
  }

  create(data?: MapSceneData): void {
    // Restore a saved game if one exists; otherwise start fresh.
    const snapshot = loadSave();
    const regionId = data?.regionId ?? snapshot?.regionId ?? DEFAULT_REGION_ID;
    this.region = getRegion(regionId);
    // Apply the chosen difficulty before restoring state: a fresh game derives
    // the starting tank size from this tuning, and a loaded condition is clamped
    // to the max it affords, so the profile must be in place first.
    this.applyDifficulty(loadDifficulty());
    this.restoreState(snapshot);
    // Baseline the standing tier the player already holds, so a tier-up notice
    // only fires on a genuine increase and never on a region-travel reload.
    this.hudTier = tierFor(totalReputation(this.state.ledger)).minReputation;

    this.map = createTileMap(this.region.rows, this.region.legend);
    // The map is drawn at the world origin; the camera handles centring small
    // maps and following the courier on maps larger than the viewport.
    this.mapOriginY = 0;

    // Draws the terrain and bakes the colliders. Reads the restored unlock set,
    // so an unlocked ford stays open.
    this.terrain = new MapTerrainLayer(this, this.map, this.mapOriginY, this.traversalKeys());

    this.physics.world.setBounds(
      0,
      this.mapOriginY,
      this.map.width * TILE_SIZE,
      this.map.height * TILE_SIZE,
    );

    // Enter at the return gateway when arriving by travel, so the courier steps
    // out at the marker back to where it came from, not the region's spawn. A
    // cold boot resumes at the saved courier tile instead, so a page reload is
    // not a free instant tow home (#315).
    const arrival =
      data?.regionId !== undefined
        ? arrivalTile(this.region, data.fromRegionId)
        : resumeTile(this.region, snapshot?.courierTile ?? null, (tile) => {
            const id = getTerrainIdAt(this.map, tile.x, tile.y);
            return id !== undefined && isPassableWith(id, this.traversalKeys());
          });
    const spawn = this.tileCenter(arrival.x, arrival.y);
    this.courier = new Courier(this, spawn.x, spawn.y);
    this.courier.sprite.setDepth(DEPTH_COURIER);
    this.physics.add.collider(this.courier.sprite, this.terrain.impassable);
    this.prevX = spawn.x;
    this.prevY = spawn.y;

    this.setupCamera();
    // Before the markers: the signpost registers an overlap callback that can
    // unlock the ford, and that path reports through juice and audio.
    this.juice = new Juice(this);
    // Silent under the e2e hook: CI has no output device, and the arc has a
    // frame-starvation history (#114, #121). Cues are still recorded, so the
    // specs can prove each call site fires (#226).
    this.audio = new Audio(isE2E());
    // The rolling bed outlives the scene (it hangs off the shared AudioContext),
    // so a restart has to hand it back to rest. Without this, travelling through
    // a gateway leaves the wheels rolling at their last gain through the whole
    // rebuild, which is the one place a continuous voice can hang (#383).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.audio.settleBed());

    this.markers = new MapMarkers(this, this.mapOriginY);
    // The signpost only exists in regions that host the ford-unlock mechanic.
    if (
      this.region.signpost !== undefined &&
      this.region.fordUnlockId !== undefined &&
      !isUnlocked(this.state, this.region.fordUnlockId)
    ) {
      const fordUnlockId = this.region.fordUnlockId;
      this.markers.addSignpost(this.region.signpost, this.courier.sprite, () =>
        this.unlockFeature(fordUnlockId),
      );
    }
    this.markers.addSettlements(this.region, this.worldState());
    this.markers.addGateways(this.region, this.map.width, this.map.height);
    this.refreshEncounterMarkers();
    // Fog is built after the markers so it draws over them.
    this.fog = createFog(this.map.width, this.map.height);
    this.terrain.buildFog();
    this.restoreFog();
    this.setupInput();
    this.hud = new MapHud(this, terrainsPresent(this.map.tiles, TERRAIN_TYPES));
    // Fresh conversation subsystem per create(), so a scene restart (travel, new
    // game) opens with no dialogue in progress. The host literal is the scene's
    // narrow, explicit coupling surface to the controller.
    const host: DialogueHost = {
      getHud: () => this.hud,
      getAudio: () => this.audio,
      getRegion: () => this.region,
      courierTile: () => this.courierTile(),
      effectiveFlags: () => this.effectiveFlags(),
      getStoryFlags: () => this.storyFlags,
      setStoryFlags: (flags) => {
        this.storyFlags = flags;
      },
      getLedger: () => this.state.ledger,
      setLedger: (ledger) => {
        this.state.ledger = ledger;
      },
      save: () => this.save(),
      refreshWallet: () => this.refreshWallet(),
      logEvent: (message) => this.logEvent(message),
      getTalkKey: () => this.talkKey,
      getEscapeKey: () => this.escapeKey,
      getNumberKeys: () => this.numberKeys,
    };
    this.dialogue = new DialogueController(host);
    this.refreshWallet();
    this.refreshObjective();
    this.refreshFordStatus();
    this.refreshHint();
    this.refreshBoard();
    this.refreshCapstone();
    this.refreshSummary();

    // Pick an ambient road condition for this run via a seeded RNG. Seeding
    // from the clock keeps weather varied between runs while routing the roll
    // through the deterministic, testable generator.
    this.weather = pickWeather(createRng(Date.now()));
    this.hud.setWeather(`Weather: ${this.weather.label} (${weatherEffectLabel(this.weather)})`);

    // Reveal the area around the spawn so the player is not fully blind.
    this.revealAroundCourier();
    this.refreshAchievements(false);

    // Autosave periodically so exploration progress persists.
    this.time.addEvent({ delay: 2000, loop: true, callback: () => this.save() });
    this.save();

    // Attach the test hook only when explicitly requested via `?e2e`.
    exposeE2EApi(this.e2eHost());

    const homeName = this.region.settlements[this.region.home]?.name ?? this.region.home;
    // First-ever boot: introduce the premise and the goal. A cold player has no
    // other cue for what a courier does or where to go. Shown once ever (the flag
    // lives outside the save, so a new game does not repeat it); returning players
    // get the terse status line. The toast is non-modal and dismissed with Space,
    // like every other message.
    if (!hasSeenIntro()) {
      markIntroSeen();
      this.hud.showToast(
        `You are a courier on a fractured frontier, where the roads are unreliable and news travels only as fast as you do.\n\n` +
          `Reach ${homeName} to accept a contract at the board, then deliver it. Every run pulls back the fog and builds your name with the settlements that depend on you.`,
      );
    } else {
      this.hud.showToast(
        `${this.region.name}. Reach ${homeName} for contracts. ${this.weather.description}`,
      );
    }
  }

  /**
   * Load global state from a snapshot, or reset to a fresh game if null. The
   * snapshot-to-run mapping and all of its sanitizing rules are pure, in
   * run-state.ts; this applies the result to the scene's fields.
   */
  private restoreState(snapshot: GameSnapshot | null): void {
    const run = restoreRunState({
      snapshot,
      tuning: this.wagonTuning,
      regionContracts: this.region.contracts,
    });
    this.state = run.state;
    this.completed = run.completed;
    this.visited = run.visited;
    this.trip = run.trip;
    this.achievements = run.achievements;
    this.skills = run.skills;
    this.storyFlags = run.storyFlags;
    this.wagonCondition = run.wagonCondition;
    this.blockadeBrokenAtLoad = run.blockadeBrokenAtLoad;
    this.fogByRegion = run.fogByRegion;
    this.fogDimsByRegion = run.fogDimsByRegion;
    this.activeContract = run.activeContract;
    this.progress = run.progress;

    // Per-contract tracking never survives a load: these belong to the journey
    // that was in progress, not to the run.
    this.tilesSinceAccept = 0;
    this.usedFordThisContract = false;
    this.armedContractId = null;
    this.boardNotice = null;
    // wagonWearTotal is intentionally not reset here: it is session telemetry
    // (ADR 0005 tuning) that must accumulate across region-travel scene restarts,
    // and its field initializer already zeroes it once per scene construction.
    // The dialogue controller is (re)constructed fresh later in create(), so no
    // conversation state needs resetting here.

    if (run.freshRun) {
      // A fresh run (new game or first boot), not a region-travel restart: the
      // session-scoped panel and telemetry dedup state belongs to the previous
      // playthrough, so a re-cleared region or re-broken blockade shows its
      // panel and records its milestone again (#291).
      this.summaryDismissedRegions = new Set();
      this.capstoneDismissed = false;
      this.telemetryRecorded = new Set();
    }
  }

  /** Re-reveal the active region's previously explored tiles. */
  private restoreFog(): void {
    const indices = this.fogByRegion[this.region.id];
    if (indices === undefined) {
      return;
    }
    // Fog indices only mean the same tile on a same-sized map. If this region
    // was resized since the save (or the save predates dimension tracking),
    // drop the stale fog so exploration starts fresh rather than revealing the
    // wrong tiles. save() re-records the current size on the next write.
    if (!fogDimsMatch(this.fogDimsByRegion[this.region.id], this.map.width, this.map.height)) {
      delete this.fogByRegion[this.region.id];
      delete this.fogDimsByRegion[this.region.id];
      return;
    }
    // Out-of-range indices are dropped by revealIndices, which returns exactly
    // the tiles revealed so only those get their fog rectangle cleared.
    this.terrain.clearFogAt(revealIndices(this.fog, indices));
  }

  private save(): void {
    this.fogByRegion[this.region.id] = revealedIndices(this.fog);
    this.fogDimsByRegion[this.region.id] = [this.map.width, this.map.height];
    const result = writeSave({
      coins: this.state.ledger.coins,
      reputation: { ...this.state.ledger.reputation },
      unlocks: [...this.state.unlocks],
      upgrades: [...this.state.upgrades],
      completed: [...this.completed],
      visited: [...this.visited],
      regionId: this.region.id,
      fogByRegion: this.fogByRegion,
      fogDimsByRegion: this.fogDimsByRegion,
      activeContractId: this.activeContract?.id ?? null,
      contractStatus: this.progress?.status ?? null,
      distanceTiles: this.trip.distanceTiles,
      deliveries: this.trip.deliveries,
      wagonCondition: this.wagonCondition,
      achievements: [...this.achievements],
      skills: { ...this.skills },
      storyFlags: flagsToArray(this.storyFlags),
      courierTile: this.courierTile(),
    });
    // Keep the persistent autosave indicator in step with the real write result.
    this.hud.setSaveState(result === 'ok');
    // Autosave runs every couple of seconds; if storage is unavailable or full,
    // tell the player once rather than every tick, so they know a closed tab
    // will lose the run. Slot 1 so it stacks under, not over, the status toast.
    if (result !== 'ok' && !this.saveWarned) {
      this.saveWarned = true;
      const reason =
        result === 'unavailable'
          ? 'This browser is not saving progress (private mode or storage is disabled).'
          : 'Could not save progress (browser storage may be full).';
      this.hud.showToast(`${reason} Your run will be lost when you close the tab.`);
      this.audio.saveFailed();
    }
  }

  /**
   * The capability tokens that currently open gated terrain: unlocks plus
   * anything the wagon build or skills grant (a route may need Marsh Treads or
   * an off-road skill rank, not just an opened ford). Recomputed per query so it
   * always reflects the latest upgrades and skill ranks.
   */
  private traversalKeys(): ReadonlySet<string> {
    return traversalKeys(this.state.unlocks, this.state.upgrades, this.skills);
  }

  /**
   * The narrow read surface the e2e bridge (map-scene-e2e.ts) works through,
   * mirroring the DialogueHost split. Every accessor reads live scene state;
   * placeCourier syncs prevX/prevY like the rescue tow, so a test settle books
   * no driven distance (no wear, no trip miles).
   */
  private e2eHost(): E2EHost {
    return {
      getRegion: () => this.region,
      getMap: () => this.map,
      courierPosition: () => ({ x: this.courier.sprite.x, y: this.courier.sprite.y }),
      courierTile: () => this.courierTile(),
      tileCenter: (tileX, tileY) => this.tileCenter(tileX, tileY),
      placeCourier: (x, y) => {
        this.courier.setVelocity(0, 0);
        this.courier.sprite.setPosition(x, y);
        this.prevX = x;
        this.prevY = y;
      },
      getGameState: () => this.state,
      getTrip: () => this.trip,
      deliveredInRegion: () => this.deliveredInRegion(),
      getWagonCondition: () => this.wagonCondition,
      getWagonWearTotal: () => this.wagonWearTotal,
      getFog: () => this.fog,
      getActiveContract: () => this.activeContract,
      getProgress: () => this.progress,
      atHome: () => this.atSettlement(this.region.home),
      boardContracts: () => this.boardContracts(),
      armedContractId: () => this.armedContractId,
      panelNotice: () => this.panelNotice,
      regionFordUnlocked: () => this.regionFordUnlocked(),
      worldState: () => this.worldState(),
      courierLevel: () => this.courierLevel(),
      getSkills: () => this.skills,
      getStoryFlags: () => this.storyFlags,
      getHud: () => this.hud,
      getJuice: () => this.juice,
      getAudio: () => this.audio,
      getDialogue: () => this.dialogue,
      regionCleared: () => this.regionCleared(),
      missionState: () => this.missionState(),
      traversalKeys: () => this.traversalKeys(),
      frame: () => this.frameNo,
    };
  }

  update(): void {
    // Count every update, including dialogue-frozen ones, so e2e frame waits
    // keep advancing while a conversation is open.
    this.frameNo += 1;
    // Play the winner of the frame just ended (#383). This is the only statement
    // that provably runs on every path through update(), including both modal
    // early-returns below, which is why the flush lives at the top rather than at
    // each exit.
    this.audio.flushFrame();
    // Before every modal early-return below: a player who wants the room quiet
    // should not have to close a panel or finish a conversation first (#226).
    this.handleMuteInput();
    // A conversation is modal: freeze the wagon and take only dialogue input so
    // number keys pick choices instead of accepting contracts or spending points.
    if (this.hud.isDialogueVisible()) {
      this.courier.setVelocity(0, 0);
      // The wagon is frozen, so the wheels have to stop too. Settling rather than
      // cutting, so opening a conversation mid-drive trails off (#383).
      this.audio.settleBed();
      this.dialogue.handleInput();
      // After the input, so a conversation ended this frame hands the hint line
      // straight back to the world rather than a frame late.
      this.refreshModalHint();
      return;
    }

    // A blocking overlay (journal, skills, codex, upgrade menu) is modal too
    // (#300). It used to be a cosmetic layer over live gameplay: the blind run
    // drove twelve tiles behind a panel without knowing, wearing the wagon, and
    // a delivery could pay out, R could repair, T could cross a region gateway,
    // and a road encounter could open its dialogue on top of the open panel.
    // Only the panel's own input runs here, so the world is paused exactly as it
    // is for a conversation, and one thing is on screen at a time (#149).
    if (this.hud.isBlockingOverlayOpen()) {
      this.courier.setVelocity(0, 0);
      this.audio.settleBed();
      this.handleSkillInput();
      this.handleUpgradeInput();
      this.handleUpgradeToggle();
      this.handleToggles();
      // After the toggles, so a panel opened this frame is the one that pages.
      this.handleScrollInput();
      this.handleOverlayEscape();
      // Last, so a panel closed by the input above hands the line straight back
      // to the world hint on this same frame rather than a frame late.
      this.refreshModalHint();
      return;
    }

    const input: MoveInput = {
      up: this.cursors.up.isDown || this.wasd.W.isDown,
      down: this.cursors.down.isDown || this.wasd.S.isDown,
      left: this.cursors.left.isDown || this.wasd.A.isDown,
      right: this.cursors.right.isDown || this.wasd.D.isDown,
    };

    const terrainId = this.terrainUnderCourier();
    const rawTerrainModifier = terrainId === undefined ? 1 : getSpeedModifier(terrainId);
    const terrainModifier = terrainSpeedFactor(
      rawTerrainModifier,
      this.state.upgrades,
      UPGRADES_GREYBRIDGE,
    );
    const upgradeModifier =
      speedMultiplier(this.state.upgrades, UPGRADES_GREYBRIDGE) + skillSpeedBonus(this.skills);
    const speed =
      COURIER_SPEED *
      terrainModifier *
      upgradeModifier *
      this.weather.speedMultiplier *
      speedFactor() *
      limpMultiplier(this.wagonCondition, this.wagonTuning);
    const velocity = computeVelocity(input, speed);

    // Wear per tile is computed off the RAW terrain roughness, so relief upgrades
    // and Off-road cut it through their own weaker floored factors (ADR 0005).
    // The wear modifier is separate from movement speed so a trail can drive like
    // a path yet wear like the rough ground it crosses (#176).
    const rawWearModifier = terrainId === undefined ? 1 : getWearSpeedModifier(terrainId);
    const wearRate = wearPerTile(
      rawWearModifier,
      countReliefUpgrades(this.state.upgrades, UPGRADES_GREYBRIDGE),
      rankOf(this.skills, 'off-road'),
      this.wagonTuning,
      this.region.wearMultiplier ?? 1,
    );
    this.courier.setVelocity(velocity.x, velocity.y);

    // Track the ford crossing for the via-ford bonus. Compare unlock ids
    // rather than terrain ids so each region only matches its own ford.
    if (
      this.progress?.status === 'carrying' &&
      terrainId !== undefined &&
      this.region.fordUnlockId !== undefined &&
      getTerrain(terrainId)?.unlockId === this.region.fordUnlockId
    ) {
      this.usedFordThisContract = true;
    }

    const tilesMoved = this.trackDistance(wearRate);
    this.updateDrivingAudio(input, terrainId, velocity, tilesMoved);
    // Teach the off-road wear lesson the first time the wagon is driven onto
    // rough ground (roughness > 0; roads and bridges normalise to 0). The blind
    // run never learned that leaving the road wears the wagon, and that fed the
    // stranded dead end (#326). Keyed to driving input so it fires in the act of
    // going off-road, not on a static load parked off a road.
    const driving = input.up || input.down || input.left || input.right;
    if (driving && terrainId !== undefined && roughness(rawWearModifier) > 0) {
      this.teachOnce(
        ONBOARD_OFFROAD,
        'Off the road the ground is rough and wears the wagon; roads and bridges ' +
          'do not. Watch the Wagon meter and repair (R) in a town before it strands you.',
      );
    }
    this.currentPath = this.destinationPath();
    this.revealAroundCourier();
    // Distance and discoveries just changed, so a level (and its skill point) can
    // cross mid-drive. Resync the wallet only on the change so the HUD level and
    // skill-point count match the live K panel without refreshing every frame.
    const liveLevel = this.courierLevel();
    if (liveLevel !== this.hudLevel) {
      const leveledUp = liveLevel > this.hudLevel;
      this.refreshWallet();
      // Only on the way up: hudLevel also moves on a new game, and a reset is not
      // an achievement to congratulate.
      if (leveledUp) {
        this.audio.levelUp();
      }
      // Recurring skill nudge (#174): each level-up that leaves points banked
      // re-surfaces them, so skills stop being forgotten past the first teach.
      const points = availablePoints(liveLevel, this.skills);
      if (
        shouldNudgeUnspentSkills({
          leveledUp,
          unspentPoints: points,
          firstTeachSeen: hasFlag(this.storyFlags, ONBOARD_SKILLS),
        })
      ) {
        const s = points === 1 ? '' : 's';
        const it = points === 1 ? 'it' : 'them';
        this.hud.showToast(
          `You have ${points} unspent skill point${s}. Press K to fit ${it} to your wagon.`,
        );
      }
    }
    this.updateDelivery();
    this.checkArrival();
    this.handleFordHint();
    this.handleSkillInput();
    this.handleUpgradeInput();
    this.handleBoardInput();
    this.handleUpgradeToggle();
    this.handleRepairInput();
    this.handleResetInput();
    this.handleDismissInput();
    this.handleOverlayEscape();
    this.handleCapstoneInput();
    this.handleSummaryInput();
    this.handleTravelInput();
    this.dialogue.handleTalk();
    this.dialogue.handleEncounters();
    // An encounter just resolved, or an arc flag just activated one: rebuild its
    // markers so the "?" appears/disappears in step (#184). Keyed on flag count,
    // which only moves when flags change, so this is a cheap no-op most frames.
    if (this.storyFlags.size !== this.encounterMarkerFlagCount) {
      this.refreshEncounterMarkers();
    }
    this.handleToggles();
    // After the toggles, so a panel opened this frame is the one that pages.
    this.handleScrollInput();
    this.refreshBoard();
    // Detect the blockade breaking, which happens through a dialogue choice
    // rather than a delivery, so it is checked each frame once dialogue closes.
    this.refreshCapstone();
    if (this.hud.isMinimapVisible()) {
      this.redrawMinimap();
    }

    const terrain = terrainId === undefined ? undefined : getTerrain(terrainId);
    const terrainLabel =
      terrain === undefined
        ? 'Terrain: unknown'
        : `Terrain: ${terrain.name} (${terrain.speedModifier.toFixed(2)}x)`;
    this.hud.setTerrain(terrainLabel);
    this.hud.setWagonCondition(this.wagonCondition, this.wagonMax(), this.wagonState());
    this.warnLowConditionOnce();
    this.refreshObjective();
    this.refreshHint();
    this.refreshOnboarding();
  }

  private courierTile(): { x: number; y: number } {
    return worldToTile(this.courier.sprite.x, this.courier.sprite.y, TILE_SIZE, 0, this.mapOriginY);
  }

  /**
   * Accumulate distance driven since the previous frame, in tiles, and wear the
   * wagon by `wearRate` per tile for the terrain just crossed (ADR 0005).
   *
   * Returns the tiles covered, which the audio bed uses as its "is the wagon
   * actually rolling" signal: commanded velocity is non-zero while pressed into a
   * mountain, and a bed that hummed against a wall would be describing a drive
   * that is not happening (#383).
   */
  private trackDistance(wearRate: number): number {
    const dx = this.courier.sprite.x - this.prevX;
    const dy = this.courier.sprite.y - this.prevY;
    this.prevX = this.courier.sprite.x;
    this.prevY = this.courier.sprite.y;
    const tiles = Math.hypot(dx, dy) / TILE_SIZE;
    if (tiles > 0) {
      this.trip = addDistance(this.trip, tiles);
      // Skip only the condition-mutation when wear is disabled for the e2e arc;
      // trip distance and tilesSinceAccept still track so every other system
      // (via-ford bonus, objective progress) behaves exactly as in real play.
      if (!wearDisabled()) {
        const wasStranded = isStranded(this.wagonCondition);
        const worn = applyWear(this.wagonCondition, wearRate * tiles);
        this.wagonWearTotal += this.wagonCondition - worn;
        this.wagonCondition = worn;
        // Count the rising edge into stranded (0 condition) for balance telemetry.
        if (!wasStranded && isStranded(this.wagonCondition)) {
          this.strandEvents++;
        }
      }
      if (this.progress?.status === 'carrying') {
        this.tilesSinceAccept += tiles;
      }
    }
    return tiles;
  }

  /**
   * The rolling bed and the driving cues (#383).
   *
   * The bed says what the ground feels like right now; the cues mark the moment it
   * changed. Both are cosmetic in the design note's sense: the terrain readout
   * already names the ground, the wagon meter already shows the condition, and the
   * ford toast already explains a block.
   */
  private updateDrivingAudio(
    input: MoveInput,
    terrainId: string | undefined,
    velocity: { x: number; y: number },
    tilesMoved: number,
  ): void {
    const driving = input.up || input.down || input.left || input.right;
    // Movement that actually happened, not movement that was asked for. Pressed
    // into a mountain these disagree, and that disagreement is the bump.
    const rolling = tilesMoved > 0;
    const blocked = driving && this.wasDriving && !rolling;
    if (blocked && this.frameNo >= this.bumpReadyFrame) {
      this.audio.bumped();
      this.bumpReadyFrame = this.frameNo + BUMP_COOLDOWN_FRAMES;
    }
    this.wasDriving = driving;

    this.audio.updateBed({
      speed: rolling ? Math.hypot(velocity.x, velocity.y) : 0,
      referenceSpeed: COURIER_SPEED * speedFactor() * BED_REFERENCE_MULTIPLIER,
      terrainId,
      conditionFraction: conditionFraction(this.wagonCondition, this.wagonMax()),
      weatherId: this.weather.id,
    });

    if (this.prevTerrainKnown && terrainId !== this.prevTerrainId) {
      this.announceTerrainCrossing(this.prevTerrainId, terrainId);
    }
    this.prevTerrainId = terrainId;
    this.prevTerrainKnown = true;
  }

  /** One cue for a terrain crossing, or none when the change is unremarkable. */
  private announceTerrainCrossing(from: string | undefined, to: string | undefined): void {
    const paved = (id: string | undefined): boolean => id === 'road' || id === 'bridge';
    if (paved(to) && !paved(from)) {
      this.audio.roadJoined();
    } else if (paved(from) && !paved(to)) {
      this.audio.roadLeft();
    }
    // Gated ground is the terrain the base wagon could not enter at all, so
    // reaching it means a capability opened it. Read off the unlock id rather
    // than the terrain id so a new region's ford needs no change here.
    const unlockId = to === undefined ? undefined : getTerrain(to)?.unlockId;
    if (unlockId === 'mire-crossing' || unlockId === 'tidal-crossing') {
      this.audio.gatedGround();
    } else if (unlockId !== undefined) {
      this.audio.fordCrossed();
    }
  }

  /** The wagon's current maximum condition, which grows with courier level. */
  private wagonMax(): number {
    return maxConditionForLevel(this.courierLevel(), this.wagonTuning);
  }

  /** Apply a difficulty preset: store the key and swap in its tuning profile. */
  private applyDifficulty(difficulty: Difficulty): void {
    this.difficulty = difficulty;
    this.wagonTuning = WAGON_TUNING[difficulty];
  }

  /** Wagon-condition band, driving the HUD meter's fill colour (#182/#203). */
  private wagonState(): WagonState {
    if (isStranded(this.wagonCondition)) {
      return 'stranded';
    }
    if (isLowCondition(this.wagonCondition, this.wagonMax())) {
      return 'low';
    }
    return 'healthy';
  }

  /**
   * Toast once when the wagon first drops into the low band, so the player gets a
   * salient heads-up before stranding (#182). Re-arms only after a repair lifts
   * it back above the threshold, so it does not nag every frame while low.
   */
  private warnLowConditionOnce(): void {
    // The arm/warn/re-arm rule is pure in wagon-condition.ts (#301); the scene
    // only applies the transition and shows the toast.
    const action = lowConditionWarning(this.wagonCondition, this.wagonMax(), this.lowConditionWarned);
    if (action === 'warn') {
      this.lowConditionWarned = true;
      this.hud.showToast('Wagon condition low. Repair at a town before it strands.');
    } else if (action === 'rearm') {
      this.lowConditionWarned = false;
    }
  }

  /**
   * Repair the wagon at a settlement, or pay for a rescue when stranded in the
   * open. Manual and gold-priced (ADR 0005): the spend is a visible choice.
   */
  private handleRepairInput(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.repairKey)) {
      return;
    }
    const tile = this.courierTile();
    const here = settlementAtTileIn(this.region, tile.x, tile.y);
    if (here !== undefined) {
      this.repairAt(here.name);
      return;
    }
    // Not at a settlement. Only meaningful when stranded: pay to be towed home.
    if (!isStranded(this.wagonCondition)) {
      return;
    }
    const result = rescue(this.state.ledger.coins, this.wagonTuning);
    if (!result.ok) {
      this.hud.showToast(
        repairHelpText({
          atSettlement: false,
          condition: this.wagonCondition,
          max: this.wagonMax(),
          tuning: this.wagonTuning,
        }),
      );
      this.audio.repairRefused();
      return;
    }
    this.state.ledger = { ...this.state.ledger, coins: result.coins };
    const home = this.region.settlements[this.region.home];
    const homeTile = home?.tile ?? this.region.spawn;
    const center = this.tileCenter(homeTile.x, homeTile.y);
    this.courier.sprite.setPosition(center.x, center.y);
    this.prevX = center.x;
    this.prevY = center.y;
    this.hud.showToast('A passing carter tows you home. Pay to repair before you set out again.');
    this.refreshWallet();
    // The tow has already moved the wagon home; the shake reads as the breakdown
    // that put it there, which is the moment worth feeling.
    this.juice.stranded();
    this.audio.stranded();
    this.save();
  }

  /**
   * V toggles all audio and remembers the choice (#226). Runs before update()'s
   * modal early-returns, so it works with a panel or a conversation open.
   *
   * The confirmation is a toast, which means muting costs a dismiss press. That is
   * deliberate: it is the only feedback available for a change whose whole effect
   * is that nothing can be heard, and unmuting would otherwise be indistinguishable
   * from a game with no sound assets.
   */
  private handleMuteInput(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.muteKey)) {
      return;
    }
    const muted = this.audio.toggleMuted();
    this.hud.showToast(muted ? 'Sound off. Press V for sound.' : 'Sound on. Press V to mute.');
  }

  /** Repair the wagon here, spending coins. Reports the outcome to the player. */
  private repairAt(placeName: string): void {
    const max = this.wagonMax();
    if (this.wagonCondition >= max) {
      this.hud.showToast('The wagon is in good repair.');
      return;
    }
    const result = repair(this.wagonCondition, this.state.ledger.coins, max, this.wagonTuning);
    if (!result.ok) {
      this.hud.showToast(
        repairHelpText({
          atSettlement: true,
          condition: this.wagonCondition,
          max,
          tuning: this.wagonTuning,
        }),
      );
      this.audio.repairRefused();
      return;
    }
    this.wagonCondition = result.condition;
    this.state.ledger = { ...this.state.ledger, coins: result.coins };
    const note = result.full
      ? `Wagon repaired at ${placeName}.`
      : `Wagon patched to ${Math.round(result.condition)}/${max} at ${placeName} (all your coin).`;
    this.hud.showToast(note);
    this.juice.repaired(this.courier.sprite.x, this.courier.sprite.y);
    this.audio.repaired();
    this.refreshWallet();
    this.save();
  }

  /** Shortest passable route from the courier to the active destination. */
  private destinationPath(): PathResult | null {
    const contract = this.activeContract;
    const progress = this.progress;
    if (contract === undefined || progress === undefined || progress.status !== 'carrying') {
      return null;
    }
    const destination = this.region.settlements[contract.destinationId];
    if (destination === undefined) {
      return null;
    }
    const keys = this.traversalKeys();
    return findPath({
      width: this.map.width,
      height: this.map.height,
      isPassable: (x, y) => {
        const id = getTerrainIdAt(this.map, x, y);
        return id !== undefined && isPassableWith(id, keys);
      },
      start: this.courierTile(),
      goal: { x: destination.tile.x, y: destination.tile.y },
    });
  }

  /**
   * When the courier reaches a still-locked ford, explain the block on the spot.
   * Players hit the ford from the far bank and could not tell why it stopped them
   * (see docs/design/05_playtest_notes.md). Fires once per approach, from either
   * bank, then re-arms when the courier steps away.
   */
  private handleFordHint(): void {
    const { x, y } = this.courierTile();
    // Only hint when the courier genuinely cannot cross the gated tile. Check
    // the full traversal key set, not the raw unlock set: a capability gate like
    // tidal-crossing is satisfied by an owned upgrade or an off-road skill rank,
    // so a player who holds the capability must not be told it is "blocked"
    // (2026-07-12 playtest, #180: Saltmere with Off-road 3).
    const keys = this.traversalKeys();
    const beside = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ].some((n) => {
      const id = getTerrainIdAt(this.map, n.x, n.y);
      const unlockId = id === undefined ? undefined : getTerrain(id)?.unlockId;
      return unlockId !== undefined && !keys.has(unlockId);
    });
    if (beside && !this.atLockedFordHinted) {
      this.atLockedFordHinted = true;
      this.hud.showToast('The ford is blocked. Reach the ford-key signpost to open this shortcut.');
      this.audio.fordBlocked();
    } else if (!beside) {
      this.atLockedFordHinted = false;
    }
  }

  /**
   * Rebuild the road-encounter markers for the current region and flags, and
   * remember the flag count so update() only rebuilds when it changes (#184).
   */
  private refreshEncounterMarkers(): void {
    const tiles = activeEncounters(ENCOUNTERS, this.region.id, this.storyFlags).map((e) => e.tile);
    this.markers.setEncounters(tiles);
    this.encounterMarkerFlagCount = this.storyFlags.size;
  }

  private terrainUnderCourier(): string | undefined {
    const tile = this.courierTile();
    return getTerrainIdAt(this.map, tile.x, tile.y);
  }

  private tileCenter(tileX: number, tileY: number): { x: number; y: number } {
    return tileCenter(tileX, tileY, this.mapOriginY);
  }

  /**
   * Bound the camera to the map and follow the courier on maps larger than the
   * viewport. Bounds are set centred, so a map that fits the screen stays put
   * and centred; only a larger map scrolls, and Phaser clamps the follow at the
   * map edges so no background bleeds past the terrain.
   */
  private setupCamera(): void {
    const worldW = this.map.width * TILE_SIZE;
    const worldH = this.map.height * TILE_SIZE;
    const cam = this.cameras.main;
    cam.setBounds(0, this.mapOriginY, worldW, worldH, true);
    if (worldW > GAME_WIDTH || worldH > GAME_HEIGHT) {
      cam.startFollow(this.courier.sprite, true, CAMERA_LERP, CAMERA_LERP);
    }
  }

  private revealAroundCourier(): void {
    const tile = this.courierTile();
    const base =
      revealRadius(this.state.upgrades, UPGRADES_GREYBRIDGE, FOG_REVEAL_RADIUS) +
      skillRevealBonus(this.skills);
    const radius = Math.max(1, base + this.weather.revealBonus);
    const revealed = revealAround(this.fog, tile.x, tile.y, radius);
    this.terrain.clearFogAtTiles(revealed);
    // A wayside discovery is found the moment its tile first reveals, so a
    // courier who invests in reveal is paid in lore, not just sight (#111).
    // Derived from the newly-revealed set, so it fires once and never on reload.
    for (const discovery of newlyFound(DISCOVERIES, this.region.id, revealed)) {
      this.announceDiscovery(discovery);
    }
  }

  /** True once the courier can read the coded cipher lines (Cipher skill owned). */
  private hasCipher(): boolean {
    return rankOf(this.skills, 'cipher') > 0;
  }

  /** Toast a found discovery and keep its lore re-readable in the journal. */
  private announceDiscovery(discovery: Discovery): void {
    const [title, ...body] = discoveryLines(discovery, this.hasCipher());
    this.logEvent(`You found ${title}. ${body.join(' ')}`);
    this.audio.discoveryFound();
  }

  /** Courier experience, derived from cumulative play stats (not stored). */
  private courierXp(): number {
    return totalXp({
      deliveries: this.trip.deliveries,
      distanceTiles: this.trip.distanceTiles,
      discoveries: this.visited.size,
    });
  }

  /** Courier level from current experience. */
  private courierLevel(): number {
    return levelForXp(this.courierXp());
  }

  /** Connection status per settlement, derived from delivery history. */
  private worldState(): Record<string, SettlementStatus> {
    return computeWorldState({
      settlements: Object.values(this.region.settlements).map((s) => ({ id: s.id })),
      contracts: this.region.contracts.map((c) => ({ id: c.id, destinationId: c.destinationId })),
      homeId: this.region.home,
      completedContractIds: [...this.completed],
    });
  }

  private updateDelivery(): void {
    const contract = this.activeContract;
    const progress = this.progress;
    if (contract === undefined || progress === undefined || isDelivered(progress)) {
      return;
    }
    const tile = this.courierTile();
    const settlement = settlementAtTileIn(this.region, tile.x, tile.y);
    if (settlement === undefined) {
      return;
    }

    if (canPickUp(progress, contract, settlement.id)) {
      this.progress = pickUp(progress);
      this.logEvent(`Collected ${contract.cargo} at ${settlement.name}.`);
      this.audio.cargoCollected();
      this.refreshObjective();
      this.save();
    } else if (canDeliver(progress, contract, settlement.id)) {
      this.completeDelivery(contract, settlement.id, settlement.name);
    }
  }

  private completeDelivery(contract: Contract, settlementId: string, settlementName: string): void {
    // The whole reward composition (cargo modifier, reconnection premium,
    // standing bonus, Negotiator cut, bonus objective) is a pure rule in
    // delivery-reward.ts (#301). World-state is read before this contract is
    // marked completed, so the delivery that first reconnects a place pays the
    // flat rate and only later work to it is boosted.
    const reputation = totalReputation(this.state.ledger);
    const reward = computeDeliveryReward({
      contractId: contract.id,
      contractReward: contract.reward,
      cargoType: contract.cargoType,
      destinationStatus: this.worldState()[contract.destinationId],
      totalReputation: reputation,
      skills: this.skills,
      bonusFacts: {
        usedFord: this.usedFordThisContract,
        tilesDriven: this.tilesSinceAccept,
      },
    });
    const perk = perkFor(reputation);
    const cargoCategory = getCargoCategory(contract.cargoType);

    this.completed.add(contract.id);
    this.state.ledger = addCoins(this.state.ledger, reward.total);
    this.state.ledger = addReputation(this.state.ledger, settlementId, contract.reputation);
    this.trip = recordDelivery(this.trip);
    this.activeContract = undefined;
    this.progress = undefined;

    // Compare against the cargo-adjusted base so the perk note reflects a
    // reputation boost, not the cargo pay modifier.
    const perkNote = reward.payout > reward.baseReward ? ` (${perk.label})` : '';
    const skillNote = reward.skillReward > 0 ? ` +${reward.skillReward} negotiated.` : '';
    const cipherNote = reward.cipherReward > 0 ? ` +${reward.cipherReward} deciphered.` : '';
    const bonusNote = reward.bonusCoins > 0 ? ` Bonus met: +${reward.bonusCoins} coins.` : '';
    const cargoNote =
      cargoCategory.payModifier !== 1 ? ` Carried as ${cargoCategory.tag}.` : '';
    const reconnectNote = reward.reconnectPremium ? ' The reconnected road pays better.' : '';
    this.logEvent(
      `Delivered ${contract.cargo} to ${settlementName}. ` +
        `Reward: ${reward.payout + reward.skillReward + reward.cipherReward} coins${perkNote}, ` +
        `+${contract.reputation} reputation.${skillNote}${cipherNote}${bonusNote}${cargoNote}${reconnectNote}`,
    );
    this.juice.delivered(this.courier.sprite.x, this.courier.sprite.y);
    // The bonus is a brighter delivery rather than a second voice on top of it:
    // one cue per frame, so a flourish has to be the cue itself (#384).
    if (reward.bonusCoins > 0) {
      this.audio.deliveredWithBonus();
    } else {
      this.audio.delivered();
    }
    this.refreshObjective();
    this.refreshWallet();
    this.refreshSummary(true);
    // This delivery may have cleared the region's standing routes: capture a
    // telemetry milestone (once per region per session, ADR-free best-effort).
    if (this.regionCleared()) {
      this.captureTelemetry('region');
    }
    this.refreshAchievements(true);
    // The delivery reconnects this settlement: recolour its marker (and the
    // minimap if it is open) so the change to the world is immediately visible.
    this.markers.refreshSettlements(this.worldState());
    if (this.hud.isMinimapVisible()) {
      this.redrawMinimap();
    }
    this.save();
  }

  /** Contracts offerable now: not delivered and any story-flag gate satisfied. */
  private boardContracts(): Contract[] {
    return availableContracts(this.region.contracts, this.completed, this.effectiveFlags());
  }

  /** How many of the active region's contracts are delivered. */
  private deliveredInRegion(): number {
    return this.region.contracts.filter((c) => this.completed.has(c.id)).length;
  }

  /**
   * Contracts counting toward region progress: completed plus currently
   * available. Excludes gated contracts not yet revealed, so "N of M" never
   * counts work the courier cannot see and M grows as the arc opens new work.
   */
  private contractsInPlayCount(): number {
    return contractsInPlay(this.region.contracts, this.completed, this.effectiveFlags()).length;
  }

  /** Delivered and total counts for the region's standing (ungated) routes. */
  private baseContractCounts(): { delivered: number; total: number } {
    const base = baseContracts(this.region.contracts);
    return {
      delivered: base.filter((c) => this.completed.has(c.id)).length,
      total: base.length,
    };
  }

  /**
   * The region is "cleared" once its standing (ungated) routes are all
   * delivered. Deliberately ignores gated contracts: the derived
   * home_reconnected flag is built on this, and the arc's reveals unlock gated
   * contracts, so counting those would re-lock the reveals the moment they
   * opened new work.
   */
  private regionCleared(): boolean {
    const { delivered, total } = this.baseContractCounts();
    return total > 0 && delivered === total;
  }

  private atSettlement(id: string): boolean {
    const tile = this.courierTile();
    return settlementAtTileIn(this.region, tile.x, tile.y)?.id === id;
  }

  private acceptContract(contract: Contract): void {
    let progress = startContract(contract);
    // The board is only shown in the pickup town, so collect the cargo at once.
    const tile = this.courierTile();
    const here = settlementAtTileIn(this.region, tile.x, tile.y);
    if (here !== undefined && canPickUp(progress, contract, here.id)) {
      progress = pickUp(progress);
    }
    this.activeContract = contract;
    this.progress = progress;
    // Reset per-contract bonus tracking.
    this.tilesSinceAccept = 0;
    this.usedFordThisContract = false;
    this.logEvent(`Accepted: ${contract.title}. ${contract.note}`);
    this.audio.contractAccepted();
    this.refreshObjective();
    this.save();
  }

  /** Spend skill points while the skill panel is open (number keys rank skills). */
  private handleSkillInput(): void {
    if (!this.hud.isSkillPanelVisible()) {
      return;
    }
    const level = this.courierLevel();
    for (let i = 0; i < SKILLS.length && i < this.numberKeys.length; i++) {
      const key = this.numberKeys[i];
      const skill = SKILLS[i];
      if (key === undefined || skill === undefined || !Phaser.Input.Keyboard.JustDown(key)) {
        continue;
      }
      if (canRankUp(this.skills, skill.id, level)) {
        this.skills = rankUp(this.skills, skill.id);
        // The rank itself is real progress, so it stays a toast: the player will
        // want it in the journal's recent log, and it outlives the panel.
        this.hud.showToast(`${skill.name} improved to rank ${rankOf(this.skills, skill.id)}.`);
        this.audio.skillRanked();
        this.panelNotice = null;
        // A new rank may grant a terrain capability (Off-road 2 opens the deep
        // mire); open any tiles it now unlocks so the route is drivable at once.
        this.refreshGatedColliders();
        this.refreshSkillPanel();
        this.refreshWallet();
        this.save();
      } else {
        // A refusal is feedback about the key just pressed, not news about the
        // world, and the panel is on screen to carry it (#356).
        this.panelNotice =
          availablePoints(level, this.skills) > 0
            ? `${skill.name} is already at its highest rank.`
            : 'No skill point banked yet. Deliver, explore, and cover ground to earn one.';
        this.audio.panelRefused();
        this.refreshSkillPanel();
      }
    }
  }

  /**
   * Whether the contract board is currently on screen and interactable. The
   * single source of truth for both drawing the board (refreshBoard) and
   * accepting a digit (handleBoardInput): the two drifted apart before, letting
   * a number key accept a contract hidden behind an overlay (#292 for the
   * journal/skills case, #316 for the summary/capstone case). Dialogue is not
   * checked here because update() early-returns while it is open.
   */
  private boardInteractable(): boolean {
    return boardInteractable({
      hasActiveContract: this.activeContract !== undefined,
      atHome: this.atSettlement(this.region.home),
      capstoneVisible: this.shouldShowCapstone(),
      summaryVisible: this.hud.isSummaryVisible(),
      blockingOverlayOpen: this.hud.isBlockingOverlayOpen(),
    });
  }

  private handleBoardInput(): void {
    if (!this.boardInteractable()) {
      // Off the board, so drop any armed contract: a digit pressed on the next
      // visit should arm afresh, not accept a contract from a stale board. The
      // notice goes with it, so a fresh visit never opens on a stale refusal.
      this.armedContractId = null;
      this.boardNotice = null;
      return;
    }
    const list = this.boardContracts();
    const reputation = totalReputation(this.state.ledger);
    for (let i = 0; i < this.numberKeys.length && i < list.length; i++) {
      const key = this.numberKeys[i];
      const contract = list[i];
      if (key === undefined || contract === undefined) {
        continue;
      }
      if (Phaser.Input.Keyboard.JustDown(key)) {
        if (!canAccept(contract, reputation)) {
          this.armedContractId = null;
          this.boardNotice = `${contract.title} needs ${contract.minReputation} reputation.`;
          this.audio.panelRefused();
          this.refreshBoard();
          return;
        }
        if (this.armedContractId === contract.id) {
          // Confirmed: the same slot pressed twice in a row.
          this.armedContractId = null;
          this.boardNotice = null;
          this.acceptContract(contract);
        } else {
          // First press: arm this contract, so a mispressed remembered digit is
          // caught before it commits the journey (#321). The prompt is drawn on
          // the board rather than toasted: the board is already on screen naming
          // the slot, and a toast made the player dismiss a question they had
          // just answered, costing a press per accept under the #327 queue (#376).
          this.armedContractId = contract.id;
          this.boardNotice = null;
          this.audio.boardArmed();
          this.refreshBoard();
        }
        return;
      }
    }
  }

  private refreshBoard(): void {
    // The end-of-arc finale owns the screen; keep the home board from showing
    // through it (the courier is at the home town when the blockade breaks).
    // The board also yields to any blocking overlay (journal/skills/codex) or the
    // run summary, so only one overlay shows at a time (D1 reserved region, #149).
    // It likewise yields to an open dialogue (E at a settlement), so the
    // postmaster conversation does not overlap the board (#181). boardInteractable
    // carries every condition but dialogue, which only refreshBoard needs (input
    // is already gated by update()'s early return while dialogue is open).
    const show = this.boardInteractable() && !this.hud.isDialogueVisible();
    if (!show) {
      this.hud.setBoard(null);
      return;
    }
    this.hud.setBoard(
      boardText({
        homeName: this.region.settlements[this.region.home]?.name ?? this.region.home,
        contracts: this.boardContracts(),
        reputation: totalReputation(this.state.ledger),
        worldStatus: this.worldState(),
        armedContractId: this.armedContractId,
        notice: this.boardNotice,
      }),
    );
  }

  /**
   * B toggles the wagon upgrade menu at home (D3, #161). The old single-key "buy
   * the cheapest" hid the choice and what each upgrade did; now B opens a
   * selectable menu and the actual purchase happens by number key in
   * handleUpgradeInput. Opening is gated to the home shop; closing works anywhere
   * so a menu left open when travel restarts the scene is not sticky.
   */
  private handleUpgradeToggle(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.buyKey)) {
      return;
    }
    if (!this.hud.isUpgradeMenuVisible() && !this.atSettlement(this.region.home)) {
      return;
    }
    if (this.hud.toggleUpgrades()) {
      this.hud.closeOverlaysExcept('upgrades');
      // A fresh visit starts clean rather than on the complaint from last time.
      this.panelNotice = null;
      this.refreshUpgradeMenu();
      this.audio.panelOpened();
    } else {
      this.audio.panelClosed();
    }
  }

  /** Buy an upgrade by number key while the upgrade menu is open. */
  private handleUpgradeInput(): void {
    if (!this.hud.isUpgradeMenuVisible()) {
      return;
    }
    for (let i = 0; i < UPGRADES_GREYBRIDGE.length && i < this.numberKeys.length; i++) {
      const key = this.numberKeys[i];
      const upgrade = UPGRADES_GREYBRIDGE[i];
      if (key === undefined || upgrade === undefined || !Phaser.Input.Keyboard.JustDown(key)) {
        continue;
      }
      this.buyUpgrade(upgrade);
    }
  }

  /**
   * Attempt to fit one upgrade. Refusals render in the menu the player is
   * reading rather than as toasts (#356): the menu is the only way to reach this
   * code, and under the #327 queue each refused key would otherwise cost its own
   * dismiss press. The purchase itself stays a toast, because it is real
   * progress that outlives the menu.
   */
  private buyUpgrade(upgrade: Upgrade): void {
    if (this.state.upgrades.has(upgrade.id)) {
      this.panelNotice = `${upgrade.name} is already fitted.`;
      this.audio.panelRefused();
      this.refreshUpgradeMenu();
      return;
    }
    const result = purchase(this.state.upgrades, this.state.ledger.coins, upgrade);
    if (!result.ok) {
      const short = upgrade.cost - this.state.ledger.coins;
      this.panelNotice = `Not enough coins for ${upgrade.name}: ${upgrade.cost}c, ${short} short.`;
      this.audio.panelRefused();
      this.refreshUpgradeMenu();
      return;
    }
    this.state.upgrades = new Set(result.purchased);
    this.state.ledger = { ...this.state.ledger, coins: result.coins };
    this.panelNotice = null;
    this.hud.showToast(`Fitted ${upgrade.name}. ${upgrade.description}`);
    this.juice.upgradeFitted();
    this.audio.upgradeFitted();
    // A new upgrade may grant a terrain capability (Marsh Treads opens the deep
    // mire); open any tiles it now unlocks so the route is drivable at once.
    this.refreshGatedColliders();
    this.refreshWallet();
    this.refreshUpgradeMenu();
    this.refreshAchievements(true);
    this.save();
  }

  private refreshUpgradeMenu(): void {
    this.hud.setUpgradeText(
      upgradeMenuText({
        coins: this.state.ledger.coins,
        upgrades: UPGRADES_GREYBRIDGE,
        purchased: this.state.upgrades,
        notice: this.panelNotice,
      }),
    );
  }

  private handleToggles(): void {
    // Each toggle is written as a nested if rather than an && so that closing is
    // reachable too: the old form ran the toggle inside the condition and only
    // had a branch for "opened", which left the close half of the pair with
    // nowhere to fire from (#385).
    if (Phaser.Input.Keyboard.JustDown(this.mapKey)) {
      if (this.hud.toggleMinimap()) {
        this.redrawMinimap();
        this.audio.panelOpened();
      } else {
        this.audio.panelClosed();
      }
    }
    // Opening a blocking overlay closes the others, so only one is up at a time.
    if (Phaser.Input.Keyboard.JustDown(this.journalKey)) {
      if (this.hud.toggleJournal()) {
        this.hud.closeOverlaysExcept('journal');
        this.refreshJournal();
        this.audio.panelOpened();
      } else {
        this.audio.panelClosed();
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.legendKey)) {
      if (this.hud.toggleLegend()) {
        this.hud.closeOverlaysExcept('legend');
        this.audio.panelOpened();
      } else {
        this.audio.panelClosed();
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.skillKey)) {
      if (this.hud.toggleSkills()) {
        this.hud.closeOverlaysExcept('skills');
        // A fresh visit starts clean rather than on the complaint from last time.
        this.panelNotice = null;
        this.refreshSkillPanel();
        this.audio.panelOpened();
      } else {
        this.audio.panelClosed();
      }
    }
  }

  /**
   * Close an open blocking overlay (journal, skills, codex, upgrade menu) with
   * Esc, so every panel closes the way the dialogue's "Esc to step away" already
   * teaches, not just with its own toggle key (#319). Runs before the capstone
   * and summary handlers and consumes the key only when a panel was open, so a
   * later Esc still falls through to those end-of-region panels.
   */
  private handleOverlayEscape(): void {
    if (this.hud.isBlockingOverlayOpen() && Phaser.Input.Keyboard.JustDown(this.escapeKey)) {
      this.hud.closeBlockingOverlays();
      this.audio.panelClosed();
    }
  }

  /** Dismiss the end-of-arc capstone panel with Esc. Takes precedence over the summary. */
  private handleCapstoneInput(): void {
    if (
      !this.capstoneDismissed &&
      this.hud.isCapstoneVisible() &&
      Phaser.Input.Keyboard.JustDown(this.escapeKey)
    ) {
      this.capstoneDismissed = true;
      this.hud.setCapstone(null);
    }
  }

  /** Dismiss the region-cleared summary panel with Esc so it stops blocking play. */
  private handleSummaryInput(): void {
    // Do not also dismiss the summary on the same Esc that closed the capstone;
    // the capstone already suppresses the summary while it is up.
    if (this.hud.isCapstoneVisible()) {
      return;
    }
    if (
      !this.summaryDismissedRegions.has(this.region.id) &&
      this.regionCleared() &&
      Phaser.Input.Keyboard.JustDown(this.escapeKey)
    ) {
      this.summaryDismissedRegions.add(this.region.id);
      this.hud.setSummary(null);
    }
  }

  private handleResetInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.newGameKey)) {
      clearSave();
      // Flushed here rather than on the next frame, for the same reason region
      // travel is: the scene is about to be replaced and there is no next frame
      // for this Audio to flush on.
      this.audio.newGame();
      this.audio.flushFrame();
      // Route back through BootScene so a new game re-picks difficulty at the
      // title screen (#150). BootScene sends real players to the picker and, under
      // the e2e hook, straight back into a fresh map.
      this.scene.start('BootScene');
    }
  }

  /**
   * Page the open journal, skills, or upgrade overlay with PgUp/PgDn, the keyboard
   * equivalent of the mouse wheel (#274). The arrow keys cannot serve here because
   * movement consumes them.
   */
  private handleScrollInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.pageDownKey)) {
      this.hud.handleScrollPage(1);
    }
    if (Phaser.Input.Keyboard.JustDown(this.pageUpKey)) {
      this.hud.handleScrollPage(-1);
    }
  }

  /**
   * Advance the toast queue when the player presses the dismiss key (Space).
   * One press clears one message and reveals the next, so a message queued
   * behind another is never dismissed unread (#327).
   */
  private handleDismissInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.dismissKey) && this.hud.hasToasts()) {
      this.hud.dismissToast();
      // Muting is confirmed by a toast, and dismissing that toast makes no sound
      // for the obvious reason: the game is muted. Unmuting's toast does tick,
      // which is not a contradiction, it is the sound coming back on.
      this.audio.toastDismissed();
    }
  }

  /**
   * Flags handed to the dialogue engine: the persisted story flags plus flags
   * derived from the live world. Derived flags let a choice gate on a real fact
   * (the home region being reconnected) without persisting a redundant flag.
   */
  private effectiveFlags(): StoryFlags {
    const derived: string[] = [...derivedSkillFlags(this.skills)];
    if (this.regionCleared()) {
      derived.push(FLAG_HOME_RECONNECTED);
    }
    // A reconnected place emits its own flag, so second-wave work can open on the
    // board the moment a region starts reviving (M5.4, Session 5).
    for (const [id, status] of Object.entries(this.worldState())) {
      if (status === 'reconnected') {
        derived.push(reconnectedFlag(id));
      }
    }
    return setFlags(this.storyFlags, derived);
  }

  /** Facts mission progress is derived from: completed contracts, flags, visits. */
  private missionState(): MissionState {
    return {
      completedContractIds: [...this.completed],
      flags: this.effectiveFlags(),
      visitedIds: [...this.visited],
    };
  }

  private refreshWallet(): void {
    const reputation = totalReputation(this.state.ledger);
    const level = this.courierLevel();
    this.hudLevel = level;
    this.hud.setWallet({
      coins: this.state.ledger.coins,
      reputation,
      tierName: tierFor(reputation).name,
      level,
      skillPoints: availablePoints(level, this.skills),
      difficulty: difficultyLabel(this.difficulty),
    });
  }

  /**
   * Hint line for whatever modal surface is up (#355). The world hint cannot
   * stand in: both modal branches return early, so the line used to freeze
   * mid-sentence and keep advertising keys the freeze had made inert. Falls back
   * to the world hint when the surface closed during this same frame.
   */
  private refreshModalHint(): void {
    const surface = this.hud.openModal();
    if (surface === null) {
      this.refreshHint();
      return;
    }
    this.hud.setHint(
      modalHintText({
        surface,
        scrollable: this.hud.isScrollablePanelOpen(),
        // Digits only do something on the two panels that spend: skills need a
        // banked point, upgrades need something still unfitted.
        numbersActive:
          surface === 'skills'
            ? availablePoints(this.courierLevel(), this.skills) > 0
            : surface === 'upgrades' &&
              cheapestUnpurchased(this.state.upgrades, UPGRADES_GREYBRIDGE) !== null,
      }),
    );
  }

  /**
   * Gather where the courier is standing and hand it to the pure world-hint
   * builder (hint-text.ts), which decides which keys the line names.
   */
  private refreshHint(): void {
    const tile = this.courierTile();
    const here = settlementAtTileIn(this.region, tile.x, tile.y);
    const gateway = this.gatewayAtTile(tile);
    this.hud.setHint(
      worldHintText({
        talkTarget:
          here !== undefined && dialogueForSettlement(here.id) !== undefined ? here.name : null,
        wagon: {
          atSettlement: here !== undefined,
          condition: this.wagonCondition,
          max: this.wagonMax(),
          tuning: this.wagonTuning,
        },
        travelTarget:
          gateway !== undefined && this.activeContract === undefined
            ? getRegion(gateway.to).name
            : null,
        atHome: here?.id === this.region.home,
        upgradesAvailable: cheapestUnpurchased(this.state.upgrades, UPGRADES_GREYBRIDGE) !== null,
        skillPointsAvailable: availablePoints(this.courierLevel(), this.skills) > 0,
        toastHint: this.hud.toastHint(),
        audioMuted: this.audio.isMuted(),
      }),
    );
  }

  /**
   * Just-in-time onboarding (D2, docs/design/08_ui_and_onboarding.md). The
   * systems were never explained; a first-time player finished unsure what
   * skills, upgrades, and standing did. Each teach fires the moment its system
   * first becomes relevant, once per run:
   *
   * - the first skill point earned explains skills and points at K;
   * - the first upgrade affordable-to-see at home explains the upgrade key;
   * - a standing tier-up names the reward perk it unlocked.
   *
   * The two one-time teaches persist as story flags, so they survive region
   * travel and reset on a New Game (fresh state). The tier-up uses the hudTier
   * baseline instead, since it is an event, not a one-time card.
   */
  private refreshOnboarding(): void {
    if (availablePoints(this.courierLevel(), this.skills) > 0) {
      this.teachOnce(
        ONBOARD_SKILLS,
        'You earned a skill point. Skills sharpen your wagon: faster terrain, ' +
          'tougher axles, warmer welcomes. Press K to spend points.',
      );
    }

    if (
      this.atSettlement(this.region.home) &&
      cheapestUnpurchased(this.state.upgrades, UPGRADES_GREYBRIDGE) !== null
    ) {
      this.teachOnce(
        ONBOARD_UPGRADES,
        'Upgrades are for sale here. Each fits a lasting improvement to the ' +
          'wagon (more speed, range, or resilience). Press B to open the upgrade menu.',
      );
    }

    const reputation = totalReputation(this.state.ledger);
    const tier = tierFor(reputation);
    if (tier.minReputation > this.hudTier) {
      this.hudTier = tier.minReputation;
      const perk = perkFor(reputation);
      const bonus = Math.round((perk.rewardMultiplier - 1) * 100);
      const gain =
        bonus > 0 ? `Deliveries now pay ${perk.label} (+${bonus}%).` : `You now hold ${perk.label}.`;
      this.hud.showToast(`Standing risen to ${tier.name}. ${gain}`);
      this.audio.standingRisen();
    }
  }

  /**
   * Show a one-time teaching toast the first time it is relevant, keyed by a
   * story flag so it never repeats within a run. The flag is persisted so a
   * region-travel reload does not re-teach.
   */
  private teachOnce(flagId: string, message: string): void {
    if (hasFlag(this.storyFlags, flagId)) {
      return;
    }
    this.storyFlags = setFlags(this.storyFlags, [flagId]);
    this.hud.showToast(message);
    this.save();
  }

  /** Gateway at the given tile, if the courier is standing on one. */
  private gatewayAtTile(tile: { x: number; y: number }): RegionGateway | undefined {
    return this.region.gateways.find((g) => g.tile.x === tile.x && g.tile.y === tile.y);
  }

  /** Names of every region reachable from this one, for hint and summary text. */
  private gatewayDestinationNames(): string {
    return this.region.gateways.map((g) => getRegion(g.to).name).join(' or ');
  }

  private handleTravelInput(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.travelKey)) {
      return;
    }
    const tile = this.courierTile();
    const gateway = this.gatewayAtTile(tile);
    if (gateway === undefined) {
      return;
    }
    if (this.activeContract !== undefined) {
      this.hud.showToast('Deliver your cargo before leaving the region.');
      return;
    }
    this.save();
    // Requested and flushed in the same breath, which no other call site does.
    // The restart replaces this Audio, so the frame that would normally play the
    // cue never arrives: without the flush the one moment of travel stays the
    // silent hard cut #384 set out to fix. The output graph is document-lifetime,
    // so the cue survives the rebuild that follows it.
    this.audio.regionTravel();
    this.audio.flushFrame();
    this.scene.restart({
      regionId: gateway.to,
      fromRegionId: this.region.id,
    } satisfies MapSceneData);
  }

  /** Unlock a feature and open any tiles it gated. Returns true if newly unlocked. */
  private unlockFeature(id: string): boolean {
    if (!unlock(this.state, id)) {
      return false;
    }
    this.terrain.openGates([id]);
    this.refreshFordStatus();
    this.juice.routeUnlocked(this.courier.sprite.x, this.courier.sprite.y);
    this.audio.routeUnlocked();
    this.hud.showToast('Shortcut unlocked: the ford is open.');
    this.refreshAchievements(true);
    this.save();
    return true;
  }

  /**
   * Open any gated terrain whose capability the courier now holds. Fords open via
   * unlockFeature, but capability gates (the deep mire) are granted by buying an
   * upgrade or ranking a skill, which fire no unlock event, so this has to be
   * called after any upgrade or skill change. See MapTerrainLayer.openGates for
   * why a stale collider soft-locks the courier.
   */
  private refreshGatedColliders(): void {
    this.terrain.openGates(this.traversalKeys());
  }

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      throw new Error('keyboard input is not available');
    }
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys('W,A,S,D') as WasdKeys;
    this.buyKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.repairKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.newGameKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
    this.mapKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    // V for volume: M is the minimap, and B/E/J/K/L/N/R/T are all taken (#226).
    this.muteKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V);
    this.journalKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.legendKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);
    this.travelKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.skillKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.talkKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.escapeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.dismissKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.pageUpKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PAGE_UP);
    this.pageDownKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.PAGE_DOWN);

    // Allocate all number keys, not just one per contract: the same keys select
    // contracts, spend skill points, pick dialogue choices, and fit upgrades, and
    // a region may have fewer contracts than there are skills or conversation
    // choices. This list must cover the longest number-selectable menu; the
    // upgrade shop currently has 7 entries (Salt Runners is [7]), so stopping at
    // SIX left the last upgrade impossible to buy.
    const numberCodes = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
      Phaser.Input.Keyboard.KeyCodes.FIVE,
      Phaser.Input.Keyboard.KeyCodes.SIX,
      Phaser.Input.Keyboard.KeyCodes.SEVEN,
      Phaser.Input.Keyboard.KeyCodes.EIGHT,
      Phaser.Input.Keyboard.KeyCodes.NINE,
    ];
    this.numberKeys = numberCodes.map((code) => keyboard.addKey(code));

    // Autoplay policy blocks audio until a user gesture, and a player with a save
    // boots straight into the map with no title click, so the first drive key may
    // be the first gesture of the visit. These fire synchronously inside the DOM
    // event, which is the only place a resume() is honoured: calling it from
    // update() would run in a requestAnimationFrame callback, which is not a
    // gesture context, and the browser would refuse (#226).
    keyboard.once('keydown', () => this.audio.unlock());
    this.input.once('pointerdown', () => this.audio.unlock());

    // Mouse wheel scrolls the open journal or skills panel, whose content is
    // taller than the screen. Harmless when no scrollable overlay is open.
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
        this.hud.handleScroll(dy);
      },
    );
  }

  private redrawMinimap(): void {
    const status = this.worldState();
    const model = buildMinimap({
      width: this.map.width,
      height: this.map.height,
      isRevealed: (x, y) => isRevealed(this.fog, x, y),
      terrainColorAt: (x, y) => {
        const id = getTerrainIdAt(this.map, x, y);
        return id === undefined ? null : (getTerrain(id)?.color ?? null);
      },
      courier: this.courierTile(),
      settlements: Object.values(this.region.settlements).map((s) => ({
        x: s.tile.x,
        y: s.tile.y,
        status: status[s.id] ?? 'silent',
      })),
      // Wayfinder surveys terrain beyond the walked fog on the minimap only, a
      // route-planning payoff for the reveal build (#324). Recomputed from the
      // current position each redraw, so it is transient and never saved.
      surveyRadius: wayfinderSurveyRadius(rankOf(this.skills, 'wayfinder')),
    });
    this.hud.drawMinimap(model, this.currentPath);
  }

  private refreshSkillPanel(): void {
    const prog = levelProgress(this.courierXp());
    this.hud.setSkillText(
      skillPanelText({
        level: prog.level,
        xpIntoLevel: prog.xpIntoLevel,
        xpForNextLevel: prog.xpForNextLevel,
        points: availablePoints(prog.level, this.skills),
        skills: SKILLS,
        ranks: this.skills,
        notice: this.panelNotice,
      }),
    );
  }

  /** The active objective as re-readable text for the journal, or null. */
  private journalObjective(): { title: string; detail: string } | null {
    const contract = this.activeContract;
    const progress = this.progress;
    if (contract === undefined || progress === undefined) {
      return null;
    }
    const destName = this.region.settlements[contract.destinationId]?.name ?? contract.destinationId;
    const pickupName = this.region.settlements[contract.pickupId]?.name ?? contract.pickupId;
    const detail =
      progress.status === 'carrying'
        ? `Deliver ${contract.cargo} to ${destName}.`
        : `Collect ${contract.cargo} at ${pickupName}, then deliver to ${destName}.`;
    return { title: contract.title, detail };
  }

  /** Toast a story message and keep it in the journal's re-readable recent log. */
  private logEvent(message: string): void {
    this.recentEvents = pushEvent(this.recentEvents, message);
    this.hud.showToast(message);
  }

  private refreshJournal(): void {
    const status = this.worldState();
    this.hud.setJournalText(
      buildJournalText({
        journal: {
          settlements: Object.values(this.region.settlements).map((s) => ({
            id: s.id,
            name: s.name,
            note: s.note,
            status: status[s.id] ?? 'silent',
            reconnectedNote: reconnectedNoteFor(s.id),
          })),
          visitedIds: [...this.visited],
          delivered: this.deliveredInRegion(),
          totalContracts: this.contractsInPlayCount(),
          reputationTier: tierFor(totalReputation(this.state.ledger)).name,
          fordUnlocked: this.regionFordUnlocked(),
          activeObjective: this.journalObjective(),
        },
        title: courierTitle(this.achievementStat()),
        distanceText: formatDistance(this.trip.distanceTiles),
        mission: { missions: MISSIONS, state: this.missionState(), regionId: this.region.id },
        threads: {
          regions: Object.values(REGIONS).map((r) => ({ name: r.name, contracts: r.contracts })),
          completedIds: this.completed,
          flags: this.effectiveFlags(),
        },
        discoveries: {
          found: foundDiscoveries(DISCOVERIES, this.region.id, this.fog),
          hasCipher: this.hasCipher(),
        },
        recentEvents: this.recentEvents,
        achievements: ACHIEVEMENTS.map((a) => ({
          name: a.name,
          earned: this.achievements.has(a.id),
        })),
      }),
    );
  }

  /**
   * The finale shows once, the session the courier breaks the blockade, and only
   * then. blockadeBrokenAtLoad excludes a save that was already broken, so the
   * panel never re-appears on a later load or after travelling regions.
   */
  private shouldShowCapstone(): boolean {
    return (
      hasFlag(this.storyFlags, FLAG_BLOCKADE_BROKEN) &&
      !this.blockadeBrokenAtLoad &&
      !this.capstoneDismissed
    );
  }

  private refreshCapstone(): void {
    if (!this.shouldShowCapstone()) {
      this.hud.setCapstone(null);
      return;
    }
    // On the frame the finale first appears, clear the whole toast queue so no
    // message crosses the panel, and retire the region-cleared summary it
    // supersedes. Clear-all rather than one press: the finale takes the screen
    // over wholesale, and there is no run left for a queued line to inform.
    if (!this.hud.isCapstoneVisible()) {
      this.hud.clearToasts();
      // Louder than a stranding, and it cannot lose a collision to whatever was
      // mid-flight when the finale took the screen (#384).
      this.audio.capstone();
      this.summaryDismissedRegions.add(this.region.id);
      this.hud.setSummary(null);
      // Rising edge of the finale: capture the arc-completion telemetry milestone.
      this.captureTelemetry('arc');
    }
    this.hud.setCapstone(
      capstoneText({
        courierTitle: courierTitle(this.achievementStat()),
        deliveries: this.trip.deliveries,
        distanceText: formatDistance(this.trip.distanceTiles),
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
  private captureTelemetry(milestone: RunMilestone): void {
    if (milestone === 'region') {
      if (this.telemetryRecorded.has(this.region.id)) {
        return;
      }
      this.telemetryRecorded.add(this.region.id);
    }
    recordRun({
      milestone,
      // Every automated driver boots with `?e2e` and no human does, so this
      // separates bot runs from real play at no extra plumbing cost (#264).
      source: isE2E() ? 'auto' : 'play',
      regionId: this.region.id,
      regionName: this.region.name,
      difficulty: this.difficulty,
      coins: this.state.ledger.coins,
      deliveries: this.trip.deliveries,
      distanceTiles: this.trip.distanceTiles,
      wagonWearTotal: this.wagonWearTotal,
      wagonCondition: this.wagonCondition,
      strandEvents: this.strandEvents,
      upgradesOwned: this.state.upgrades.size,
      totalReputation: totalReputation(this.state.ledger),
    });
  }

  /**
   * Show or hide the region-cleared summary. `announce` sounds the cue on the
   * frame the panel first appears; create() passes false, because a save loaded
   * into an already-cleared region has not just cleared it, and the same
   * reasoning already gates refreshAchievements.
   */
  private refreshSummary(announce = false): void {
    if (this.summaryDismissedRegions.has(this.region.id)) {
      this.hud.setSummary(null);
      return;
    }
    // The cleared panel fires on the standing (ungated) routes, so every region
    // shows it at the natural end of its work. Basing it on in-play contracts
    // suppressed the panel on the spokes, whose arc-gated contract is revealed
    // and left undelivered as the mission climax (Session 5 playtest).
    const base = this.baseContractCounts();
    const wasVisible = this.hud.isSummaryVisible();
    // summaryText returns null until the region is cleared, so setSummary(null)
    // keeps the panel hidden in that case.
    this.hud.setSummary(
      summaryText({
        regionName: this.region.name,
        coins: this.state.ledger.coins,
        totalReputation: totalReputation(this.state.ledger),
        reputationTier: tierFor(totalReputation(this.state.ledger)).name,
        delivered: base.delivered,
        totalContracts: base.total,
        fordUnlocked: this.regionFordUnlocked(),
        upgradesOwned: this.state.upgrades.size,
        distanceText: formatDistance(this.trip.distanceTiles),
        gatewayNames: this.gatewayDestinationNames(),
      }),
    );
    if (announce && !wasVisible && this.hud.isSummaryVisible()) {
      this.audio.regionCleared();
    }
  }

  private achievementStat(): AchievementStat {
    return {
      deliveries: this.trip.deliveries,
      distanceTiles: this.trip.distanceTiles,
      placesFound: this.visited.size,
      totalPlaces: totalSettlementCount(),
      upgradesOwned: this.state.upgrades.size,
      totalUpgrades: UPGRADES_GREYBRIDGE.length,
      fordUnlocked: this.regionFordUnlocked(),
      regionCleared: this.regionCleared(),
    };
  }

  /** Whether the active region's own ford is unlocked (false if it has none). */
  private regionFordUnlocked(): boolean {
    return this.region.fordUnlockId !== undefined && isUnlocked(this.state, this.region.fordUnlockId);
  }

  /** Recompute earned achievements; toast newly earned ones when announce is true. */
  private refreshAchievements(announce: boolean): void {
    for (const id of earnedAchievements(this.achievementStat())) {
      if (this.achievements.has(id)) {
        continue;
      }
      this.achievements.add(id);
      if (announce) {
        const def = ACHIEVEMENTS.find((a) => a.id === id);
        this.hud.showToast(`Achievement unlocked: ${def?.name ?? id}`);
        this.audio.achievementUnlocked();
      }
    }
  }

  private refreshFordStatus(): void {
    const fordUnlockId = this.region.fordUnlockId;
    this.hud.setFordStatus(fordUnlockId === undefined ? null : isUnlocked(this.state, fordUnlockId));
  }

  private refreshObjective(): void {
    this.hud.setObjective(objectiveText(this.objectiveView()));
  }

  /** Gathers the plain inputs the pure objective logic needs from scene state. */
  private objectiveView(): ObjectiveView {
    const contract = this.activeContract;
    const progress = this.progress;

    let contractView: ObjectiveContractView | null = null;
    if (contract !== undefined && progress !== undefined) {
      const destination = this.region.settlements[contract.destinationId];
      const pickup = this.region.settlements[contract.pickupId];
      const path = this.currentPath;
      const pathNote =
        path === null ? '' : path.reachable ? ` (${path.distance} tiles)` : ' (no route yet)';
      contractView = {
        title: contract.title,
        cargo: contract.cargo,
        status: progress.status,
        pickupName: pickup?.name ?? contract.pickupId,
        pickupTile: pickup?.tile ?? null,
        destinationName: destination?.name ?? contract.destinationId,
        destinationTile: destination?.tile ?? null,
        pathNote,
      };
    }

    // The active mission step is the strategic spine shown when empty-handed.
    const objective = activeObjective(MISSIONS, this.missionState(), this.region.id);
    let missionSummary: string | null = null;
    if (objective !== null) {
      const count = stepRequirementCount(objective.step, this.missionState());
      const progressNote = count.total > 1 ? ` (${count.done}/${count.total})` : '';
      missionSummary = `${objective.step.summary}${progressNote}`;
    }

    return {
      courierTile: this.courierTile(),
      contract: contractView,
      regionName: this.region.name,
      homeName: this.region.settlements[this.region.home]?.name ?? this.region.home,
      missionSummary,
      boardEmpty: this.boardContracts().length === 0,
      atHome: this.atSettlement(this.region.home),
      gatewayNames: this.gatewayDestinationNames(),
      gatewayTiles: this.region.gateways.map((g) => g.tile),
      navReveal: navRevealFor(this.difficulty),
    };
  }

  /** On first arrival at a settlement, surface its existing lore note. */
  private checkArrival(): void {
    const tile = this.courierTile();
    const settlement = settlementAtTileIn(this.region, tile.x, tile.y);
    if (settlement === undefined || this.visited.has(settlement.id)) {
      return;
    }
    this.visited.add(settlement.id);
    this.logEvent(`${settlement.name}. ${settlement.note}`);
    this.audio.settlementFound();
    this.refreshAchievements(true);
    this.save();
  }
}
