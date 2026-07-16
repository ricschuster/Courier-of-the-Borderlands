import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  TILE_SIZE,
  COURIER_SPEED,
  FOG_REVEAL_RADIUS,
  FOG_COLOR,
  CAMERA_LERP,
} from '../config/game-config';
import { TERRAIN_TYPES } from '../data/terrain-types';
import { terrainTileArt, TERRAIN_ATLAS_KEY, type TileArt } from '../data/terrain-art';
import { createTileMap, getTerrainIdAt, worldToTile, type TileMap } from '../systems/tile-map';
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
  isRevealed,
  fogDimsMatch,
  type Fog,
} from '../systems/fog-of-war';
import { addCoins, addReputation, ledgerFrom, totalReputation, tierFor } from '../systems/economy';
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
  applyWear,
  limpMultiplier,
  isStranded,
  isLowCondition,
  lowConditionWarning,
  repair,
  repairCost,
  rescue,
  sanitizeCondition,
  maxConditionForLevel,
  clampCondition,
  MAX_CONDITION,
  WAGON_TUNING,
  difficultyLabel,
  type WagonTuning,
  type Difficulty,
} from '../systems/wagon-condition';
import {
  boardText,
  summaryText,
  skillPanelText,
  capstoneText,
  upgradeMenuText,
} from '../systems/panel-text';
import { buildMinimap } from '../systems/minimap';
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
  sanitizeRanks,
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
  flagsFromArray,
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
import {
  getRegion,
  arrivalTile,
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

// Depth layers, from bottom to top. HUD depth lives in map-hud.ts and marker
// depth in map-markers.ts.
const DEPTH_TERRAIN = 0;
const DEPTH_COURIER = 6;
const DEPTH_FOG = 5;

// Story-flag ids for the one-time onboarding teaches (D2, #149). Reserved
// prefix so they never collide with dialogue-authored flags; they persist in
// the save (surviving region travel) and clear on a New Game.
const ONBOARD_SKILLS = 'onboarding:skills';
const ONBOARD_UPGRADES = 'onboarding:upgrades';

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
  private impassable!: Phaser.Physics.Arcade.StaticGroup;
  private gatedBlocks = new Map<string, Phaser.GameObjects.Rectangle[]>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WasdKeys;
  private buyKey!: Phaser.Input.Keyboard.Key;
  private repairKey!: Phaser.Input.Keyboard.Key;
  // All HUD and overlay GameObjects live in the MapHud presentation layer.
  private hud!: MapHud;
  // Cosmetic feedback only (#227). Never gates or changes a rule.
  private juice!: Juice;
  private fog!: Fog;
  private fogRects: (Phaser.GameObjects.Rectangle | undefined)[] = [];
  private activeContract: Contract | undefined;
  private progress: ContractProgress | undefined;
  private completed = new Set<string>();
  private numberKeys: Phaser.Input.Keyboard.Key[] = [];
  private newGameKey!: Phaser.Input.Keyboard.Key;
  private mapKey!: Phaser.Input.Keyboard.Key;
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
  // Set once per page-load session after the player has been told their progress
  // is not being saved, so a failing autosave warns at most once rather than
  // every tick. Not reset across scene restarts: one warning per visit is enough.
  private saveWarned = false;
  // The most recent story messages, mirrored from their toasts so they can be
  // re-read in the journal after the toast fades (Session 2 playtest).
  private recentEvents: readonly string[] = [];

  constructor() {
    super({ key: 'MapScene' });
  }

  create(data?: MapSceneData): void {
    this.gatedBlocks = new Map();

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

    this.drawTiles();
    // Colliders read the restored unlock set, so an unlocked ford stays open.
    this.addImpassableColliders();

    this.physics.world.setBounds(
      0,
      this.mapOriginY,
      this.map.width * TILE_SIZE,
      this.map.height * TILE_SIZE,
    );

    // Enter at the return gateway when arriving by travel, so the courier steps
    // out at the marker back to where it came from, not the region's spawn.
    const arrival = arrivalTile(this.region, data?.fromRegionId);
    const spawnX = arrival.x * TILE_SIZE + TILE_SIZE / 2;
    const spawnY = this.mapOriginY + arrival.y * TILE_SIZE + TILE_SIZE / 2;
    this.courier = new Courier(this, spawnX, spawnY);
    this.courier.sprite.setDepth(DEPTH_COURIER);
    this.physics.add.collider(this.courier.sprite, this.impassable);
    this.prevX = spawnX;
    this.prevY = spawnY;

    this.setupCamera();
    // Before the markers: the signpost registers an overlap callback that can
    // unlock the ford, and that path reports through juice.
    this.juice = new Juice(this);

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
    this.addFog();
    this.restoreFog();
    this.setupInput();
    this.hud = new MapHud(this, terrainsPresent(this.map.tiles, TERRAIN_TYPES));
    // Fresh conversation subsystem per create(), so a scene restart (travel, new
    // game) opens with no dialogue in progress. The host literal is the scene's
    // narrow, explicit coupling surface to the controller.
    const host: DialogueHost = {
      getHud: () => this.hud,
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

  /** Load global state from a snapshot, or reset to a fresh game if null. */
  private restoreState(snapshot: GameSnapshot | null): void {
    this.state = createGameState();
    this.completed = new Set();
    this.visited = new Set();
    this.activeContract = undefined;
    this.progress = undefined;
    this.trip = createTripLog();
    this.achievements = new Set();
    this.fogByRegion = {};
    this.fogDimsByRegion = {};
    this.tilesSinceAccept = 0;
    this.usedFordThisContract = false;
    // A new game starts with the small level-1 tank; capacity grows with level.
    this.wagonCondition = maxConditionForLevel(1, this.wagonTuning);
    // wagonWearTotal is intentionally not reset here: it is session telemetry
    // (ADR 0005 tuning) that must accumulate across region-travel scene restarts,
    // and its field initializer already zeroes it once per scene construction.
    this.skills = {};
    this.storyFlags = emptyFlags();
    this.blockadeBrokenAtLoad = false;
    // The dialogue controller is (re)constructed fresh later in create(), so no
    // conversation state needs resetting here.

    if (snapshot === null) {
      // A fresh run (new game or first boot), not a region-travel restart: the
      // session-scoped panel and telemetry dedup state belongs to the previous
      // playthrough, so a re-cleared region or re-broken blockade shows its
      // panel and records its milestone again (#291).
      this.summaryDismissedRegions = new Set();
      this.capstoneDismissed = false;
      this.telemetryRecorded = new Set();
      return;
    }

    snapshot.unlocks.forEach((id) => this.state.unlocks.add(id));
    this.state.upgrades = new Set(snapshot.upgrades);
    this.state.ledger = ledgerFrom(snapshot.coins, snapshot.reputation);
    this.completed = new Set(snapshot.completed);
    this.visited = new Set(snapshot.visited);
    this.trip = createTripLog(snapshot.distanceTiles, snapshot.deliveries);
    // Clamp a loaded condition to the tank size the courier's current level
    // affords, so an edited or pre-capacity save cannot exceed it.
    this.wagonCondition = clampCondition(sanitizeCondition(snapshot.wagonCondition), this.wagonMax());
    this.achievements = new Set(snapshot.achievements);
    // Sanitize against the current skill list so a stale or edited save cannot
    // grant unknown skills or over-max ranks.
    this.skills = sanitizeRanks({ ...snapshot.skills });
    this.storyFlags = flagsFromArray(snapshot.storyFlags);
    // Recorded per load: if the blockade is already broken in the save, the
    // capstone was earned in an earlier session and must not re-appear now.
    this.blockadeBrokenAtLoad = hasFlag(this.storyFlags, FLAG_BLOCKADE_BROKEN);
    for (const [rid, indices] of Object.entries(snapshot.fogByRegion)) {
      this.fogByRegion[rid] = [...indices];
    }
    for (const [rid, dims] of Object.entries(snapshot.fogDimsByRegion)) {
      this.fogDimsByRegion[rid] = [dims[0], dims[1]];
    }

    // Restore the active contract only if it belongs to the current region.
    if (snapshot.activeContractId !== null && snapshot.contractStatus !== null) {
      const contract = this.region.contracts.find((c) => c.id === snapshot.activeContractId);
      if (contract !== undefined && !this.completed.has(contract.id)) {
        this.activeContract = contract;
        this.progress = { contractId: contract.id, status: snapshot.contractStatus };
      }
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
    for (const index of indices) {
      if (index < 0 || index >= this.fog.revealed.length) {
        continue;
      }
      this.fog.revealed[index] = true;
      this.fogRects[index]?.destroy();
      this.fogRects[index] = undefined;
    }
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
    });
    // Autosave runs every couple of seconds; if storage is unavailable or full,
    // tell the player once rather than every tick, so they know a closed tab
    // will lose the run. Slot 1 so it stacks under, not over, the status toast.
    if (result !== 'ok' && !this.saveWarned) {
      this.saveWarned = true;
      const reason =
        result === 'unavailable'
          ? 'This browser is not saving progress (private mode or storage is disabled).'
          : 'Could not save progress (browser storage may be full).';
      this.hud.showToast(`${reason} Your run will be lost when you close the tab.`, 1);
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
      regionFordUnlocked: () => this.regionFordUnlocked(),
      worldState: () => this.worldState(),
      courierLevel: () => this.courierLevel(),
      getSkills: () => this.skills,
      getStoryFlags: () => this.storyFlags,
      getHud: () => this.hud,
      getJuice: () => this.juice,
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
    // A conversation is modal: freeze the wagon and take only dialogue input so
    // number keys pick choices instead of accepting contracts or spending points.
    if (this.hud.isDialogueVisible()) {
      this.courier.setVelocity(0, 0);
      this.dialogue.handleInput();
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

    this.trackDistance(wearRate);
    this.currentPath = this.destinationPath();
    this.revealAroundCourier();
    // Distance and discoveries just changed, so a level (and its skill point) can
    // cross mid-drive. Resync the wallet only on the change so the HUD level and
    // skill-point count match the live K panel without refreshing every frame.
    const liveLevel = this.courierLevel();
    if (liveLevel !== this.hudLevel) {
      const leveledUp = liveLevel > this.hudLevel;
      this.refreshWallet();
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
   */
  private trackDistance(wearRate: number): void {
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
   * The wagon repair/rescue prompt for the bottom hint line, or null when the
   * wagon is in full repair. Condition itself is shown by the HUD meter (#203);
   * this carries only the actionable cost/key, kept next to the other key cues.
   */
  private wagonHintSegment(): string | null {
    const max = this.wagonMax();
    const here = settlementAtTileIn(this.region, this.courierTile().x, this.courierTile().y);
    const cost = repairCost(this.wagonCondition, max, this.wagonTuning);
    if (isStranded(this.wagonCondition)) {
      return here === undefined
        ? `R: pay ${this.wagonTuning.rescueCost}c rescue (or limp to a town)`
        : `R: repair ${cost}c`;
    }
    if (this.wagonCondition >= max) {
      return null;
    }
    // Damaged: always show what a full repair would cost, so the player can plan
    // before reaching a town; press R to do it once on a settlement.
    return here === undefined ? `repair ${cost}c at a town` : `R: repair ${cost}c`;
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
        `The wagon is stranded, but you cannot afford a rescue (${this.wagonTuning.rescueCost}c). Limp to a settlement.`,
      );
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
    this.save();
  }

  /** Repair the wagon here, spending coins. Reports the outcome to the player. */
  private repairAt(placeName: string): void {
    const max = this.wagonMax();
    if (this.wagonCondition >= max) {
      this.hud.showToast('The wagon is in good repair.');
      return;
    }
    const cost = repairCost(this.wagonCondition, max, this.wagonTuning);
    const result = repair(this.wagonCondition, this.state.ledger.coins, max, this.wagonTuning);
    if (!result.ok) {
      this.hud.showToast(`Not enough coins to repair the wagon (full repair ${cost}c).`);
      return;
    }
    this.wagonCondition = result.condition;
    this.state.ledger = { ...this.state.ledger, coins: result.coins };
    const note = result.full
      ? `Wagon repaired at ${placeName}.`
      : `Wagon patched to ${Math.round(result.condition)}/${max} at ${placeName} (all your coin).`;
    this.hud.showToast(note);
    this.juice.repaired(this.courier.sprite.x, this.courier.sprite.y);
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
    return {
      x: tileX * TILE_SIZE + TILE_SIZE / 2,
      y: this.mapOriginY + tileY * TILE_SIZE + TILE_SIZE / 2,
    };
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

  private drawTiles(): void {
    // Grey-box fill remains the fallback for any terrain without an art entry,
    // so the map still renders if a skin is partial (art Phase 2, #152).
    const tiles = this.add.graphics().setDepth(DEPTH_TERRAIN);
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const terrainId = getTerrainIdAt(this.map, x, y);
        if (terrainId === undefined) {
          continue;
        }
        const terrain = TERRAIN_TYPES[terrainId];
        if (terrain === undefined) {
          continue;
        }
        const art = terrainTileArt(terrainId, x, y);
        if (art === undefined) {
          tiles.fillStyle(terrain.color, 1);
          tiles.fillRect(x * TILE_SIZE, this.mapOriginY + y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          continue;
        }
        this.drawTileArt(x, y, art);
      }
    }
  }

  /**
   * Draw a terrain tile from the atlas: the ground frame, then any overlay. The
   * frames and horizontal flip carry the per-tile variety resolved in
   * terrainTileArt (#209); the overlay shares the base's flip so a tree and its
   * ground mirror together.
   */
  private drawTileArt(x: number, y: number, art: TileArt): void {
    const center = this.tileCenter(x, y);
    this.add
      .image(center.x, center.y, TERRAIN_ATLAS_KEY, art.base)
      .setDisplaySize(TILE_SIZE, TILE_SIZE)
      .setFlipX(art.flipX)
      .setDepth(DEPTH_TERRAIN);
    if (art.overlay !== undefined) {
      this.add
        .image(center.x, center.y, TERRAIN_ATLAS_KEY, art.overlay)
        .setDisplaySize(TILE_SIZE, TILE_SIZE)
        .setFlipX(art.flipX)
        .setDepth(DEPTH_TERRAIN);
    }
  }

  private addImpassableColliders(): void {
    this.impassable = this.physics.add.staticGroup();
    const keys = this.traversalKeys();
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const terrainId = getTerrainIdAt(this.map, x, y);
        if (terrainId === undefined || isPassableWith(terrainId, keys)) {
          continue;
        }
        const center = this.tileCenter(x, y);
        const block = this.add.rectangle(center.x, center.y, TILE_SIZE, TILE_SIZE);
        this.impassable.add(block);

        const unlockId = getTerrain(terrainId)?.unlockId;
        if (unlockId !== undefined) {
          const group = this.gatedBlocks.get(unlockId) ?? [];
          group.push(block);
          this.gatedBlocks.set(unlockId, group);
        }
      }
    }
  }

  private addFog(): void {
    this.fog = createFog(this.map.width, this.map.height);
    this.fogRects = new Array<Phaser.GameObjects.Rectangle | undefined>(
      this.map.width * this.map.height,
    ).fill(undefined);
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const center = this.tileCenter(x, y);
        const rect = this.add
          .rectangle(center.x, center.y, TILE_SIZE, TILE_SIZE, FOG_COLOR)
          .setDepth(DEPTH_FOG);
        this.fogRects[y * this.map.width + x] = rect;
      }
    }
  }

  private revealAroundCourier(): void {
    const tile = this.courierTile();
    const base =
      revealRadius(this.state.upgrades, UPGRADES_GREYBRIDGE, FOG_REVEAL_RADIUS) +
      skillRevealBonus(this.skills);
    const radius = Math.max(1, base + this.weather.revealBonus);
    const revealed = revealAround(this.fog, tile.x, tile.y, radius);
    for (const { x, y } of revealed) {
      const index = y * this.map.width + x;
      this.fogRects[index]?.destroy();
      this.fogRects[index] = undefined;
    }
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
    const bonusNote = reward.bonusCoins > 0 ? ` Bonus met: +${reward.bonusCoins} coins.` : '';
    const cargoNote =
      cargoCategory.payModifier !== 1 ? ` Carried as ${cargoCategory.tag}.` : '';
    const reconnectNote = reward.reconnectPremium ? ' The reconnected road pays better.' : '';
    this.logEvent(
      `Delivered ${contract.cargo} to ${settlementName}. ` +
        `Reward: ${reward.payout + reward.skillReward} coins${perkNote}, +${contract.reputation} reputation.${skillNote}${bonusNote}${cargoNote}${reconnectNote}`,
    );
    this.juice.delivered(this.courier.sprite.x, this.courier.sprite.y);
    this.refreshObjective();
    this.refreshWallet();
    this.refreshSummary();
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
        this.hud.showToast(`${skill.name} improved to rank ${rankOf(this.skills, skill.id)}.`);
        // A new rank may grant a terrain capability (Off-road 2 opens the deep
        // mire); open any tiles it now unlocks so the route is drivable at once.
        this.refreshGatedColliders();
        this.refreshSkillPanel();
        this.refreshWallet();
        this.save();
      } else {
        this.hud.showToast(`Cannot improve ${skill.name} yet.`);
      }
    }
  }

  private handleBoardInput(): void {
    // The skill panel and upgrade menu reuse the number keys (spend points / buy
    // upgrades), and refreshBoard hides the board under ANY blocking overlay
    // (journal and legend included), so take no board input while one is open:
    // otherwise a digit accepts a contract the player cannot see (#292).
    // Dialogue needs no guard here; update() returns early while it is open.
    if (this.hud.isBlockingOverlayOpen()) {
      return;
    }
    if (this.activeContract !== undefined || !this.atSettlement(this.region.home)) {
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
        if (canAccept(contract, reputation)) {
          this.acceptContract(contract);
        } else {
          this.hud.showToast(`${contract.title} needs ${contract.minReputation} reputation.`);
        }
      }
    }
  }

  private refreshBoard(): void {
    // The end-of-arc finale owns the screen; keep the home board from showing
    // through it (the courier is at the home town when the blockade breaks).
    // The board also yields to any blocking overlay (journal/skills/codex) or the
    // run summary, so only one overlay shows at a time (D1 reserved region, #149).
    // It likewise yields to an open dialogue (E at a settlement), so the
    // postmaster conversation does not overlap the board (#181).
    const show =
      this.activeContract === undefined &&
      this.atSettlement(this.region.home) &&
      !this.shouldShowCapstone() &&
      !this.hud.isSummaryVisible() &&
      !this.hud.isDialogueVisible() &&
      !this.hud.isBlockingOverlayOpen();
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
      this.refreshUpgradeMenu();
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

  /** Attempt to fit one upgrade, with feedback for already-owned and unaffordable. */
  private buyUpgrade(upgrade: Upgrade): void {
    if (this.state.upgrades.has(upgrade.id)) {
      this.hud.showToast(`${upgrade.name} is already fitted.`);
      return;
    }
    const result = purchase(this.state.upgrades, this.state.ledger.coins, upgrade);
    if (!result.ok) {
      this.hud.showToast(`Not enough coins for ${upgrade.name} (${upgrade.cost}).`);
      return;
    }
    this.state.upgrades = new Set(result.purchased);
    this.state.ledger = { ...this.state.ledger, coins: result.coins };
    this.hud.showToast(`Fitted ${upgrade.name}. ${upgrade.description}`);
    this.juice.upgradeFitted();
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
      }),
    );
  }

  private handleToggles(): void {
    if (Phaser.Input.Keyboard.JustDown(this.mapKey) && this.hud.toggleMinimap()) {
      this.redrawMinimap();
    }
    // Opening a blocking overlay closes the others, so only one is up at a time.
    if (Phaser.Input.Keyboard.JustDown(this.journalKey) && this.hud.toggleJournal()) {
      this.hud.closeOverlaysExcept('journal');
      this.refreshJournal();
    }
    if (Phaser.Input.Keyboard.JustDown(this.legendKey) && this.hud.toggleLegend()) {
      this.hud.closeOverlaysExcept('legend');
    }
    if (Phaser.Input.Keyboard.JustDown(this.skillKey) && this.hud.toggleSkills()) {
      this.hud.closeOverlaysExcept('skills');
      this.refreshSkillPanel();
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

  /** Clear any on-screen toasts when the player presses the dismiss key (Space). */
  private handleDismissInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.dismissKey) && this.hud.hasToasts()) {
      this.hud.dismissToasts();
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
   * Build the control-hint line from where the player is standing, rather than
   * printing every key every frame. The dense concatenated string read as noise
   * (2026-07-12 playtest, docs/design/08_ui_and_onboarding.md): now driving is
   * always shown, and only the keys relevant to the current context appear
   * (upgrades at home, exploration on the road, travel at a gateway, dismiss
   * while a message is up).
   */
  private refreshHint(): void {
    const tile = this.courierTile();
    const segments: string[] = ['WASD/arrows drive.'];

    const here = settlementAtTileIn(this.region, tile.x, tile.y);
    if (here !== undefined && dialogueForSettlement(here.id) !== undefined) {
      segments.push(`E: talk to ${here.name}`);
    }

    // Wagon repair/rescue prompt: only when there is something to do (worn or
    // stranded). The condition itself is on the HUD meter (#203); this is the
    // actionable cost/key, sitting with the other contextual cues.
    const wagonSegment = this.wagonHintSegment();
    if (wagonSegment !== null) {
      segments.push(wagonSegment);
    }

    const gateway = this.gatewayAtTile(tile);
    if (gateway !== undefined && this.activeContract === undefined) {
      // Gateways sit on open road, off any town, so the travel cue is unambiguous.
      segments.push(`T: travel to ${getRegion(gateway.to).name}`);
    }

    if (this.atSettlement(this.region.home)) {
      // At home the board is open: point at the upgrade menu while any upgrade
      // is still unfitted.
      if (cheapestUnpurchased(this.state.upgrades, UPGRADES_GREYBRIDGE) !== null) {
        segments.push('B: upgrades');
      }
    } else {
      // On the road the useful keys are the exploration references.
      segments.push('M: map', 'J: journal', 'L: codex');
    }

    // Skills are only actionable once a point is banked; show K only then.
    if (availablePoints(this.courierLevel(), this.skills) > 0) {
      segments.push('K: skills');
    }

    // Only cue the dismiss key while a toast is actually up (Session 5 playtest:
    // messages now hold until Space).
    if (this.hud.hasToasts()) {
      segments.push('Space: dismiss');
    }

    segments.push('N: new game');
    this.hud.setHint(segments.join('   '));
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
    const blocks = this.gatedBlocks.get(id);
    blocks?.forEach((block) => block.destroy());
    this.gatedBlocks.delete(id);
    this.refreshFordStatus();
    this.juice.routeUnlocked(this.courier.sprite.x, this.courier.sprite.y);
    this.hud.showToast('Shortcut unlocked: the ford is open.');
    this.refreshAchievements(true);
    this.save();
    return true;
  }

  /**
   * Open any gated terrain whose capability the courier now holds. Fords open via
   * unlockFeature, but capability gates (the deep mire) are granted by buying an
   * upgrade or ranking a skill, which fire no unlock event. The impassable
   * colliders are baked once at create() from the capabilities held then, so a
   * capability gained mid-scene leaves a stale collider: the pathfinder routes
   * through the now-passable tile while physics still blocks it, soft-locking the
   * courier at its edge. Call this after any upgrade or skill change to destroy
   * the colliders for every token now in the live traversal set. Idempotent: a
   * token whose blocks are already gone is a no-op.
   */
  private refreshGatedColliders(): void {
    for (const token of this.traversalKeys()) {
      const blocks = this.gatedBlocks.get(token);
      if (blocks === undefined) {
        continue;
      }
      blocks.forEach((block) => block.destroy());
      this.gatedBlocks.delete(token);
    }
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
  private logEvent(message: string, slot = 0): void {
    this.recentEvents = pushEvent(this.recentEvents, message);
    this.hud.showToast(message, slot);
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
    // On the frame the finale first appears, clear any lingering toast so it does
    // not cross the panel, and retire the region-cleared summary it supersedes.
    if (!this.hud.isCapstoneVisible()) {
      this.hud.dismissToasts();
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

  private refreshSummary(): void {
    if (this.summaryDismissedRegions.has(this.region.id)) {
      this.hud.setSummary(null);
      return;
    }
    // The cleared panel fires on the standing (ungated) routes, so every region
    // shows it at the natural end of its work. Basing it on in-play contracts
    // suppressed the panel on the spokes, whose arc-gated contract is revealed
    // and left undelivered as the mission climax (Session 5 playtest).
    const base = this.baseContractCounts();
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
        this.hud.showToast(`Achievement unlocked: ${def?.name ?? id}`, 2);
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
    this.logEvent(`${settlement.name}. ${settlement.note}`, 1);
    this.refreshAchievements(true);
    this.save();
  }
}
