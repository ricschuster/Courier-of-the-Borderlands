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
import { createTileMap, getTerrainIdAt, worldToTile, type TileMap } from '../systems/tile-map';
import { getTerrain, getSpeedModifier, isPassableWith } from '../systems/terrain-system';
import { traversalKeys } from '../systems/traversal';
import { computeVelocity, type MoveInput } from '../systems/movement';
import {
  objectiveText,
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
  type GameSnapshot,
} from '../systems/save-system';
import {
  speedMultiplier,
  purchase,
  canAfford,
  revealRadius,
  cheapestUnpurchased,
  terrainSpeedFactor,
  countReliefUpgrades,
} from '../systems/upgrade-system';
import {
  wearPerTile,
  applyWear,
  limpMultiplier,
  isStranded,
  repair,
  repairCost,
  rescue,
  sanitizeCondition,
  MAX_CONDITION,
  WAGON_TUNING,
  type WagonTuning,
} from '../systems/wagon-condition';
import { boardText, summaryText, skillPanelText, capstoneText } from '../systems/panel-text';
import { buildMinimap } from '../systems/minimap';
import { buildJournalText } from '../systems/journal-text';
import {
  computeWorldState,
  reconnectionRewardMultiplier,
  reconnectedFlag,
  type SettlementStatus,
} from '../systems/world-state';
import { reconnectedNoteFor } from '../data/reconnection-notes';
import { totalXp, levelForXp, levelProgress } from '../systems/experience';
import {
  SKILLS,
  sanitizeRanks,
  availablePoints,
  canRankUp,
  rankUp,
  rankOf,
  skillSpeedBonus,
  skillRevealBonus,
  skillRewardBonus,
  derivedSkillFlags,
  type SkillRanks,
} from '../systems/skills';
import { findPath, type PathResult } from '../systems/pathfinding';
import { perkFor, applyRewardBonus } from '../systems/reputation-perks';
import { getCargoCategory, cargoPayout } from '../systems/cargo-types';
import {
  createTripLog,
  addDistance,
  recordDelivery,
  formatDistance,
  type TripLog,
} from '../systems/trip-log';
import {
  ACHIEVEMENTS,
  earnedAchievements,
  courierTitle,
  type AchievementStat,
} from '../systems/achievements';
import { weatherByIndex, pickWeather, type Weather } from '../systems/weather';
import { createRng } from '../systems/rng';
import { bonusFor, bonusAchieved } from '../systems/contract-bonus';
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
import { MapHud } from './map-hud';
import { MapMarkers } from './map-markers';
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

// Read-only snapshot of live scene state, exposed to end-to-end tests so a
// headless browser can drive the courier and assert on the delivery loop.
interface E2EState {
  readonly regionId: string;
  readonly courier: { readonly x: number; readonly y: number; readonly tileX: number; readonly tileY: number };
  readonly home: { readonly tileX: number; readonly tileY: number; readonly x: number; readonly y: number };
  readonly coins: number;
  readonly reputation: number;
  readonly deliveries: number;
  readonly delivered: number;
  /** Wagon condition (0-100), the travel sink. Full until worn down. */
  readonly wagonCondition: number;
  /** Cumulative condition worn this session (tuning telemetry). */
  readonly wagonWearTotal: number;
  readonly fogRevealed: number;
  readonly activeContractId: string | null;
  readonly contractStatus: string | null;
  readonly atHome: boolean;
  readonly availableContractIds: readonly string[];
  readonly destination:
    | { readonly tileX: number; readonly tileY: number; readonly x: number; readonly y: number }
    | null;
  /**
   * Tile of the active contract's pickup settlement while the cargo is still
   * unclaimed (status 'accepted'). Null once carrying, or when there is no
   * active contract. Lets a driver navigate the two-leg (pickup then deliver)
   * contracts whose pickup is not the home town.
   */
  readonly pickup:
    | { readonly tileX: number; readonly tileY: number; readonly x: number; readonly y: number }
    | null;
  readonly fordUnlocked: boolean;
  readonly unlocks: readonly string[];
  readonly upgrades: readonly string[];
  readonly signpost: { readonly tileX: number; readonly tileY: number; readonly x: number; readonly y: number } | null;
  readonly gateways: readonly { readonly tileX: number; readonly tileY: number; readonly to: string }[];
  /** Connection status per settlement id, derived from delivery history. */
  readonly worldState: Record<string, SettlementStatus>;
  /** Courier level derived from play stats, and unspent skill points. */
  readonly level: number;
  readonly skillPoints: number;
  /** Chosen skill ranks, keyed by skill id. */
  readonly skills: Record<string, number>;
  /** Story flags set through dialogue, as a flat id list. */
  readonly storyFlags: readonly string[];
  /** Whether a conversation is currently open. */
  readonly dialogueOpen: boolean;
  /** Labels of the choices offered on the current dialogue node (empty when closed). */
  readonly dialogueChoices: readonly string[];
  /** Id of the road encounter currently playing, or null when none is open. */
  readonly activeEncounterId: string | null;
  /**
   * Whether the region's standing (ungated) contracts are all delivered. This is
   * what the derived home_reconnected flag is built on, so it must stay true even
   * after an arc-gated contract opens new work.
   */
  readonly regionCleared: boolean;
  /** Whether the skills panel is currently open. */
  readonly skillPanelOpen: boolean;
  /** Whether the region-cleared summary panel is currently shown. */
  readonly summaryVisible: boolean;
  /** Whether the end-of-arc capstone panel is currently shown. */
  readonly capstoneVisible: boolean;
  /** Active mission id for the current region, or null when none is active. */
  readonly activeMissionId: string | null;
  /** The active mission's current step id, or null. */
  readonly activeMissionStepId: string | null;
}

// The debug API attached to window when the game boots with `?e2e`. It is a
// thin, read-plus-navigate surface: tests still drive movement with real key
// presses, but read state and next-step waypoints through this so navigation
// stays deterministic. Never attached in normal play.
interface CourierE2EApi {
  readonly version: number;
  getState(): E2EState;
  nextStepToward(tileX: number, tileY: number): { x: number; y: number } | null;
  isPassableTile(tileX: number, tileY: number): boolean;
  // Full shortest passable path to a goal tile, as tile coordinates (including
  // the current tile). null if the goal is unreachable with the current
  // unlocks. Lets tests assert which route pathfinding chooses.
  pathTo(tileX: number, tileY: number): readonly { x: number; y: number }[] | null;
}

declare global {
  var __courier: CourierE2EApi | undefined;
}

// Depth layers, from bottom to top. HUD depth lives in map-hud.ts and marker
// depth in map-markers.ts.
const DEPTH_COURIER = 6;
const DEPTH_FOG = 5;

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
  /**
   * Difficulty profile for the travel sink. Fixed to standard for now; when a
   * difficulty selector lands it just chooses another WAGON_TUNING preset here.
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
  private talkKey!: Phaser.Input.Keyboard.Key;
  private escapeKey!: Phaser.Input.Keyboard.Key;
  private dismissKey!: Phaser.Input.Keyboard.Key;
  // Conversation subsystem: settlement talk, road encounters, and the modal
  // dialogue state machine. Constructed fresh each create(), so a scene restart
  // starts with no conversation open.
  private dialogue!: DialogueController;
  // Per-contract bonus tracking (reset when a contract is accepted).
  private tilesSinceAccept = 0;
  private usedFordThisContract = false;
  // True while the courier sits beside a still-locked ford, so the "ford is
  // blocked" hint fires once per approach instead of every frame. Reset when the
  // courier steps away (see docs/design/05_playtest_notes.md).
  private atLockedFordHinted = false;
  // The region-cleared summary panel blocks the centre of the screen, so the
  // player dismisses it with Esc; it then stays hidden for the session instead
  // of re-showing on every refresh (see docs/design/05_playtest_notes.md).
  private summaryDismissed = false;
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
    this.restoreState(snapshot);

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
    this.addFog();
    this.restoreFog();
    this.setupInput();
    this.hud = new MapHud(this);
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
    this.hud.setWeather(`Weather: ${this.weather.label}`);

    // Reveal the area around the spawn so the player is not fully blind.
    this.revealAroundCourier();
    this.refreshAchievements(false);

    // Autosave periodically so exploration progress persists.
    this.time.addEvent({ delay: 2000, loop: true, callback: () => this.save() });
    this.save();

    // Attach the test hook only when explicitly requested via `?e2e`.
    this.maybeExposeE2EApi();

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
    this.wagonCondition = MAX_CONDITION;
    // wagonWearTotal is intentionally not reset here: it is session telemetry
    // (ADR 0005 tuning) that must accumulate across region-travel scene restarts,
    // and its field initializer already zeroes it once per scene construction.
    this.skills = {};
    this.storyFlags = emptyFlags();
    this.blockadeBrokenAtLoad = false;
    // The dialogue controller is (re)constructed fresh later in create(), so no
    // conversation state needs resetting here.

    if (snapshot === null) {
      return;
    }

    snapshot.unlocks.forEach((id) => this.state.unlocks.add(id));
    this.state.upgrades = new Set(snapshot.upgrades);
    this.state.ledger = ledgerFrom(snapshot.coins, snapshot.reputation);
    this.completed = new Set(snapshot.completed);
    this.visited = new Set(snapshot.visited);
    this.trip = createTripLog(snapshot.distanceTiles, snapshot.deliveries);
    this.wagonCondition = sanitizeCondition(snapshot.wagonCondition);
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

  /** True when the game booted with `?e2e` in the URL (test-only hook). */
  private isE2E(): boolean {
    return (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('e2e')
    );
  }

  /**
   * Test-only wagon speed multiplier. The full-arc e2e drives ~20 deliveries at
   * real wheel speed, which is slow; `?turbo` doubles the speed so the CI arc
   * check finishes in about half the wall-clock. Kept to 2x on purpose: the
   * drive loop samples position every ~80ms, and 2x still moves the wagon less
   * than one tile per sample, so goal-tile detection stays reliable. Never set
   * in normal play. Gated behind `?e2e` so a stray URL param cannot speed up the
   * real game.
   */
  private speedFactor(): number {
    return this.isE2E() && new URLSearchParams(window.location.search).has('turbo') ? 2 : 1;
  }

  /** Attach the read-plus-navigate test API to window, gated on `?e2e`. */
  private maybeExposeE2EApi(): void {
    if (!this.isE2E()) {
      return;
    }
    globalThis.__courier = {
      version: 12,
      getState: () => this.e2eState(),
      nextStepToward: (tileX, tileY) => this.e2eNextStep(tileX, tileY),
      isPassableTile: (tileX, tileY) => this.e2eIsPassable(tileX, tileY),
      pathTo: (tileX, tileY) => this.e2ePathTo(tileX, tileY),
    };
  }

  /** Snapshot of live state for tests. Recomputed on every call. */
  private e2eState(): E2EState {
    const e2eObjective = activeObjective(MISSIONS, this.missionState(), this.region.id);
    const tile = this.courierTile();
    const home = this.region.settlements[this.region.home];
    const homeTile = home?.tile ?? this.region.spawn;
    const homeCenter = this.tileCenter(homeTile.x, homeTile.y);
    const destSettlement =
      this.activeContract === undefined
        ? undefined
        : this.region.settlements[this.activeContract.destinationId];
    const destCenter =
      destSettlement === undefined
        ? null
        : this.tileCenter(destSettlement.tile.x, destSettlement.tile.y);
    // Pickup leg: only meaningful while the cargo is still unclaimed. Once the
    // status is 'carrying' the pickup is done, so this reports null.
    const pickupSettlement =
      this.activeContract === undefined || this.progress?.status !== 'accepted'
        ? undefined
        : this.region.settlements[this.activeContract.pickupId];
    const pickupCenter =
      pickupSettlement === undefined
        ? null
        : this.tileCenter(pickupSettlement.tile.x, pickupSettlement.tile.y);
    const signpostTile = this.region.signpost;
    const signpostCenter =
      signpostTile === undefined ? null : this.tileCenter(signpostTile.x, signpostTile.y);
    return {
      regionId: this.region.id,
      courier: { x: this.courier.sprite.x, y: this.courier.sprite.y, tileX: tile.x, tileY: tile.y },
      home: { tileX: homeTile.x, tileY: homeTile.y, x: homeCenter.x, y: homeCenter.y },
      coins: this.state.ledger.coins,
      reputation: totalReputation(this.state.ledger),
      deliveries: this.trip.deliveries,
      delivered: this.deliveredInRegion(),
      wagonCondition: this.wagonCondition,
      wagonWearTotal: this.wagonWearTotal,
      fogRevealed: revealedIndices(this.fog).length,
      activeContractId: this.activeContract?.id ?? null,
      contractStatus: this.progress?.status ?? null,
      atHome: this.atSettlement(this.region.home),
      availableContractIds: this.boardContracts().map((c) => c.id),
      destination:
        destSettlement === undefined || destCenter === null
          ? null
          : { tileX: destSettlement.tile.x, tileY: destSettlement.tile.y, x: destCenter.x, y: destCenter.y },
      pickup:
        pickupSettlement === undefined || pickupCenter === null
          ? null
          : { tileX: pickupSettlement.tile.x, tileY: pickupSettlement.tile.y, x: pickupCenter.x, y: pickupCenter.y },
      fordUnlocked: this.regionFordUnlocked(),
      unlocks: [...this.state.unlocks],
      upgrades: [...this.state.upgrades],
      signpost:
        signpostTile === undefined || signpostCenter === null
          ? null
          : { tileX: signpostTile.x, tileY: signpostTile.y, x: signpostCenter.x, y: signpostCenter.y },
      gateways: this.region.gateways.map((g) => ({ tileX: g.tile.x, tileY: g.tile.y, to: g.to })),
      worldState: this.worldState(),
      level: this.courierLevel(),
      skillPoints: availablePoints(this.courierLevel(), this.skills),
      skills: { ...this.skills },
      storyFlags: flagsToArray(this.storyFlags),
      dialogueOpen: this.hud.isDialogueVisible(),
      dialogueChoices: this.dialogue.choiceLabels(),
      activeEncounterId: this.dialogue.activeEncounterId(),
      regionCleared: this.regionCleared(),
      skillPanelOpen: this.hud.isSkillPanelVisible(),
      summaryVisible: this.hud.isSummaryVisible(),
      capstoneVisible: this.hud.isCapstoneVisible(),
      activeMissionId: e2eObjective?.mission.id ?? null,
      activeMissionStepId: e2eObjective?.step.id ?? null,
    };
  }

  /** World centre of the next tile on the shortest passable path to a goal. */
  private e2eNextStep(tileX: number, tileY: number): { x: number; y: number } | null {
    // Compute the capability set once per pathfind, not per tile visited.
    const keys = this.traversalKeys();
    const path = findPath({
      width: this.map.width,
      height: this.map.height,
      isPassable: (x, y) => {
        const id = getTerrainIdAt(this.map, x, y);
        return id !== undefined && isPassableWith(id, keys);
      },
      start: this.courierTile(),
      goal: { x: tileX, y: tileY },
    });
    if (!path.reachable) {
      return null;
    }
    // path[0] is the current tile; [1] is the next step to drive toward.
    const next = path.path[1] ?? path.path[0];
    if (next === undefined) {
      return null;
    }
    return this.tileCenter(next.x, next.y);
  }

  /** Full shortest passable path to a goal tile, or null if unreachable. */
  private e2ePathTo(tileX: number, tileY: number): { x: number; y: number }[] | null {
    const keys = this.traversalKeys();
    const path = findPath({
      width: this.map.width,
      height: this.map.height,
      isPassable: (x, y) => {
        const id = getTerrainIdAt(this.map, x, y);
        return id !== undefined && isPassableWith(id, keys);
      },
      start: this.courierTile(),
      goal: { x: tileX, y: tileY },
    });
    if (!path.reachable) {
      return null;
    }
    return path.path.map((tile) => ({ x: tile.x, y: tile.y }));
  }

  /** Whether a tile is currently drivable, given the active unlock set. */
  private e2eIsPassable(tileX: number, tileY: number): boolean {
    const id = getTerrainIdAt(this.map, tileX, tileY);
    return id !== undefined && isPassableWith(id, this.traversalKeys());
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

  update(): void {
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
      this.speedFactor() *
      limpMultiplier(this.wagonCondition, this.wagonTuning);
    const velocity = computeVelocity(input, speed);

    // Wear per tile is computed off the RAW terrain roughness, so relief upgrades
    // and Off-road cut it through their own weaker floored factors (ADR 0005).
    const wearRate = wearPerTile(
      rawTerrainModifier,
      countReliefUpgrades(this.state.upgrades, UPGRADES_GREYBRIDGE),
      rankOf(this.skills, 'off-road'),
      this.wagonTuning,
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
    this.updateDelivery();
    this.checkArrival();
    this.handleFordHint();
    this.handleSkillInput();
    this.handleBoardInput();
    this.handlePurchaseInput();
    this.handleRepairInput();
    this.handleResetInput();
    this.handleDismissInput();
    this.handleCapstoneInput();
    this.handleSummaryInput();
    this.handleTravelInput();
    this.dialogue.handleTalk();
    this.dialogue.handleEncounters();
    this.handleToggles();
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
    this.hud.setTerrain(`${terrainLabel}   ${this.wagonConditionLabel()}`);
    this.refreshObjective();
    this.refreshHint();
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
      const worn = applyWear(this.wagonCondition, wearRate * tiles);
      this.wagonWearTotal += this.wagonCondition - worn;
      this.wagonCondition = worn;
      if (this.progress?.status === 'carrying') {
        this.tilesSinceAccept += tiles;
      }
    }
  }

  /** HUD label for the wagon condition, cueing repair/rescue when it matters. */
  private wagonConditionLabel(): string {
    const pct = Math.round(this.wagonCondition);
    if (isStranded(this.wagonCondition)) {
      const here = settlementAtTileIn(this.region, this.courierTile().x, this.courierTile().y);
      return here === undefined
        ? `Wagon: ${pct}% STRANDED (R: pay ${this.wagonTuning.rescueCost}c rescue, or limp to a town)`
        : `Wagon: ${pct}% STRANDED (R: repair here)`;
    }
    const atSettlement =
      settlementAtTileIn(this.region, this.courierTile().x, this.courierTile().y) !== undefined;
    const cue = atSettlement && pct < 100 ? '  (R: repair)' : '';
    return `Wagon: ${pct}%${cue}`;
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
    this.save();
  }

  /** Repair the wagon here, spending coins. Reports the outcome to the player. */
  private repairAt(placeName: string): void {
    if (this.wagonCondition >= MAX_CONDITION) {
      this.hud.showToast('The wagon is in good repair.');
      return;
    }
    const cost = repairCost(this.wagonCondition, this.wagonTuning);
    const result = repair(this.wagonCondition, this.state.ledger.coins, this.wagonTuning);
    if (!result.ok) {
      this.hud.showToast(`Not enough coins to repair the wagon (full repair ${cost}c).`);
      return;
    }
    this.wagonCondition = result.condition;
    this.state.ledger = { ...this.state.ledger, coins: result.coins };
    const note = result.full
      ? `Wagon repaired at ${placeName}.`
      : `Wagon patched to ${Math.round(result.condition)}% at ${placeName} (all your coin).`;
    this.hud.showToast(note);
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
    const beside = [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ].some((n) => {
      const id = getTerrainIdAt(this.map, n.x, n.y);
      const unlockId = id === undefined ? undefined : getTerrain(id)?.unlockId;
      return unlockId !== undefined && !isUnlocked(this.state, unlockId);
    });
    if (beside && !this.atLockedFordHinted) {
      this.atLockedFordHinted = true;
      this.hud.showToast('The ford is blocked. Reach the ford-key signpost to open this shortcut.');
    } else if (!beside) {
      this.atLockedFordHinted = false;
    }
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
    const tiles = this.add.graphics();
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
        tiles.fillStyle(terrain.color, 1);
        tiles.fillRect(x * TILE_SIZE, this.mapOriginY + y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
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
    // A delivery to an already-reconnected place pays a premium. World-state is
    // read before this contract is marked completed, so the delivery that first
    // reconnects a place pays the flat rate and only later work to it is boosted.
    const reconnectMult = reconnectionRewardMultiplier(this.worldState()[contract.destinationId]);
    // Cargo type scales the base reward before reputation is applied.
    const cargoCategory = getCargoCategory(contract.cargoType);
    const baseReward = Math.round(cargoPayout(contract.reward, contract.cargoType) * reconnectMult);
    // Higher standing pays better; the reward scales with total reputation.
    const reputation = totalReputation(this.state.ledger);
    const payout = applyRewardBonus(baseReward, reputation);
    const perk = perkFor(reputation);
    // The Negotiator skill adds a flat fraction on top of the standing bonus.
    const skillReward = Math.round(payout * skillRewardBonus(this.skills));

    // Optional bonus objective for this contract.
    const bonus = bonusFor(contract.id);
    const bonusEarned =
      bonus !== undefined &&
      bonusAchieved(bonus, {
        usedFord: this.usedFordThisContract,
        tilesDriven: this.tilesSinceAccept,
      });
    const bonusCoins = bonusEarned && bonus !== undefined ? bonus.reward : 0;

    this.completed.add(contract.id);
    this.state.ledger = addCoins(this.state.ledger, payout + skillReward + bonusCoins);
    this.state.ledger = addReputation(this.state.ledger, settlementId, contract.reputation);
    this.trip = recordDelivery(this.trip);
    this.activeContract = undefined;
    this.progress = undefined;

    // Compare against the cargo-adjusted base so the perk note reflects a
    // reputation boost, not the cargo pay modifier.
    const perkNote = payout > baseReward ? ` (${perk.label})` : '';
    const skillNote = skillReward > 0 ? ` +${skillReward} negotiated.` : '';
    const bonusNote = bonusCoins > 0 ? ` Bonus met: +${bonusCoins} coins.` : '';
    const cargoNote =
      cargoCategory.payModifier !== 1 ? ` Carried as ${cargoCategory.tag}.` : '';
    const reconnectNote = reconnectMult > 1 ? ' The reconnected road pays better.' : '';
    this.logEvent(
      `Delivered ${contract.cargo} to ${settlementName}. ` +
        `Reward: ${payout + skillReward} coins${perkNote}, +${contract.reputation} reputation.${skillNote}${bonusNote}${cargoNote}${reconnectNote}`,
    );
    this.refreshObjective();
    this.refreshWallet();
    this.refreshSummary();
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
    // The skill panel reuses the number keys to spend points; do not also
    // accept a contract with the same press.
    if (this.hud.isSkillPanelVisible()) {
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
    const show =
      this.activeContract === undefined &&
      this.atSettlement(this.region.home) &&
      !this.shouldShowCapstone();
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

  private handlePurchaseInput(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.buyKey) || !this.atSettlement(this.region.home)) {
      return;
    }
    const target = cheapestUnpurchased(this.state.upgrades, UPGRADES_GREYBRIDGE);
    if (target === null) {
      this.hud.showToast('Every upgrade is already fitted.');
      return;
    }
    const result = purchase(this.state.upgrades, this.state.ledger.coins, target);
    if (!result.ok) {
      this.hud.showToast(`Not enough coins for ${target.name} (${target.cost}).`);
      return;
    }
    this.state.upgrades = new Set(result.purchased);
    this.state.ledger = { ...this.state.ledger, coins: result.coins };
    this.hud.showToast(`Fitted ${target.name}. ${target.description}`);
    // A new upgrade may grant a terrain capability (Marsh Treads opens the deep
    // mire); open any tiles it now unlocks so the route is drivable at once.
    this.refreshGatedColliders();
    this.refreshWallet();
    this.refreshAchievements(true);
    this.save();
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
      !this.summaryDismissed &&
      this.regionCleared() &&
      Phaser.Input.Keyboard.JustDown(this.escapeKey)
    ) {
      this.summaryDismissed = true;
      this.hud.setSummary(null);
    }
  }

  private handleResetInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.newGameKey)) {
      clearSave();
      this.scene.restart();
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
    this.hud.setWallet({
      coins: this.state.ledger.coins,
      reputation,
      tierName: tierFor(reputation).name,
      level,
      skillPoints: availablePoints(level, this.skills),
    });
  }

  private refreshHint(): void {
    const tile = this.courierTile();
    const here = settlementAtTileIn(this.region, tile.x, tile.y);
    const talk =
      here !== undefined && dialogueForSettlement(here.id) !== undefined ? `  E: talk to ${here.name}` : '';
    // Only cue the dismiss key while a toast is actually up, so the help line
    // stays quiet otherwise (Session 5 playtest: messages now hold until Space).
    const dismiss = this.hud.hasToasts() ? '  Space: dismiss message.' : '';
    const base = `WASD/arrows drive.  M: map  J: journal  K: skills  L: codex  N: new game.${talk}${dismiss}`;
    const gateway = this.gatewayAtTile(tile);
    if (gateway !== undefined && this.activeContract === undefined) {
      const other = getRegion(gateway.to).name;
      // Gateways sit on open road, off any town, so the hint is unambiguous.
      this.hud.setHint(`${base}  The road ahead leads to ${other}: press T to travel.`);
      return;
    }
    const target = this.atSettlement(this.region.home)
      ? cheapestUnpurchased(this.state.upgrades, UPGRADES_GREYBRIDGE)
      : null;
    if (target !== null) {
      const affordable = canAfford(this.state.ledger.coins, target);
      this.hud.setHint(
        `${base}  Press B: ${target.name} (${target.cost}c)` +
          (affordable ? '' : ' - need more coins'),
      );
    } else {
      this.hud.setHint(base);
    }
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

    // Allocate all number keys, not just one per contract: the same keys select
    // contracts, spend skill points, and pick dialogue choices, and a region may
    // have fewer contracts than there are skills or conversation choices.
    const numberCodes = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
      Phaser.Input.Keyboard.KeyCodes.FIVE,
      Phaser.Input.Keyboard.KeyCodes.SIX,
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
      this.summaryDismissed = true;
      this.hud.setSummary(null);
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

  private refreshSummary(): void {
    if (this.summaryDismissed) {
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
