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
import { computeVelocity, type MoveInput } from '../systems/movement';
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
import { loadSave, writeSave, clearSave, type GameSnapshot } from '../systems/save-system';
import {
  speedMultiplier,
  purchase,
  canAfford,
  revealRadius,
  cheapestUnpurchased,
  terrainSpeedFactor,
} from '../systems/upgrade-system';
import { computeRunSummary } from '../systems/run-summary';
import { buildMinimap } from '../systems/minimap';
import { buildJournal, statusLabel } from '../systems/journal';
import { computeWorldState, type SettlementStatus } from '../systems/world-state';
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
import { bonusFor, bonusAchieved, describeBonus } from '../systems/contract-bonus';
import {
  setFlags,
  flagsToArray,
  flagsFromArray,
  emptyFlags,
  type StoryFlags,
} from '../systems/dialogue';
import { dialogueForSettlement, FLAG_HOME_RECONNECTED } from '../data/dialogue-content';
import { DialogueController, type DialogueHost } from './dialogue-controller';
import {
  activeObjective,
  activeMission,
  missionProgress,
  stepRequirementCount,
  type MissionState,
} from '../systems/mission-system';
import { MISSIONS } from '../data/missions';
import { MapHud, STATUS_COLOR } from './map-hud';
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
import { hiddenRoadProgress, hiddenRoadJournalLines } from '../systems/story-threads';
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
  readonly fogRevealed: number;
  readonly activeContractId: string | null;
  readonly contractStatus: string | null;
  readonly atHome: boolean;
  readonly availableContractIds: readonly string[];
  readonly destination:
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

// Depth layers, from bottom to top. HUD depth lives in map-hud.ts.
const DEPTH_MARKER = 1;
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
  private currentPath: PathResult | null = null;
  private visited = new Set<string>();
  private achievements = new Set<string>();
  // Main-map settlement marker rectangles, keyed by settlement id, so their
  // fill can be recoloured when a delivery reconnects a place.
  private settlementMarkers = new Map<string, Phaser.GameObjects.Rectangle>();
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
  // Conversation subsystem: settlement talk, road encounters, and the modal
  // dialogue state machine. Constructed fresh each create(), so a scene restart
  // starts with no conversation open.
  private dialogue!: DialogueController;
  // Per-contract bonus tracking (reset when a contract is accepted).
  private tilesSinceAccept = 0;
  private usedFordThisContract = false;
  // The region-cleared summary panel blocks the centre of the screen, so the
  // player dismisses it with Esc; it then stays hidden for the session instead
  // of re-showing on every refresh (see docs/design/05_playtest_notes.md).
  private summaryDismissed = false;

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

    // The signpost only exists in regions that host the ford-unlock mechanic.
    if (
      this.region.signpost !== undefined &&
      this.region.fordUnlockId !== undefined &&
      !isUnlocked(this.state, this.region.fordUnlockId)
    ) {
      this.addSignpost(this.region.signpost, this.region.fordUnlockId);
    }
    this.addSettlementMarkers();
    this.addGatewayMarkers();
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
    this.hud.showToast(
      `${this.region.name}. Reach ${homeName} for contracts. ${this.weather.description}`,
    );
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
    this.skills = {};
    this.storyFlags = emptyFlags();
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
    this.achievements = new Set(snapshot.achievements);
    // Sanitize against the current skill list so a stale or edited save cannot
    // grant unknown skills or over-max ranks.
    this.skills = sanitizeRanks({ ...snapshot.skills });
    this.storyFlags = flagsFromArray(snapshot.storyFlags);
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
    writeSave({
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
      achievements: [...this.achievements],
      skills: { ...this.skills },
      storyFlags: flagsToArray(this.storyFlags),
    });
  }

  /** True when the game booted with `?e2e` in the URL (test-only hook). */
  private isE2E(): boolean {
    return (
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('e2e')
    );
  }

  /** Attach the read-plus-navigate test API to window, gated on `?e2e`. */
  private maybeExposeE2EApi(): void {
    if (!this.isE2E()) {
      return;
    }
    globalThis.__courier = {
      version: 8,
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
      fogRevealed: revealedIndices(this.fog).length,
      activeContractId: this.activeContract?.id ?? null,
      contractStatus: this.progress?.status ?? null,
      atHome: this.atSettlement(this.region.home),
      availableContractIds: this.boardContracts().map((c) => c.id),
      destination:
        destSettlement === undefined || destCenter === null
          ? null
          : { tileX: destSettlement.tile.x, tileY: destSettlement.tile.y, x: destCenter.x, y: destCenter.y },
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
      activeMissionId: e2eObjective?.mission.id ?? null,
      activeMissionStepId: e2eObjective?.step.id ?? null,
    };
  }

  /** World centre of the next tile on the shortest passable path to a goal. */
  private e2eNextStep(tileX: number, tileY: number): { x: number; y: number } | null {
    const path = findPath({
      width: this.map.width,
      height: this.map.height,
      isPassable: (x, y) => {
        const id = getTerrainIdAt(this.map, x, y);
        return id !== undefined && isPassableWith(id, this.state.unlocks);
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
    const path = findPath({
      width: this.map.width,
      height: this.map.height,
      isPassable: (x, y) => {
        const id = getTerrainIdAt(this.map, x, y);
        return id !== undefined && isPassableWith(id, this.state.unlocks);
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
    return id !== undefined && isPassableWith(id, this.state.unlocks);
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
    const speed = COURIER_SPEED * terrainModifier * upgradeModifier * this.weather.speedMultiplier;
    const velocity = computeVelocity(input, speed);
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

    this.trackDistance();
    this.currentPath = this.destinationPath();
    this.revealAroundCourier();
    this.updateDelivery();
    this.checkArrival();
    this.handleSkillInput();
    this.handleBoardInput();
    this.handlePurchaseInput();
    this.handleResetInput();
    this.handleSummaryInput();
    this.handleTravelInput();
    this.dialogue.handleTalk();
    this.dialogue.handleEncounters();
    this.handleToggles();
    this.refreshBoard();
    if (this.hud.isMinimapVisible()) {
      this.redrawMinimap();
    }

    const terrain = terrainId === undefined ? undefined : getTerrain(terrainId);
    this.hud.setTerrain(
      terrain === undefined
        ? 'Terrain: unknown'
        : `Terrain: ${terrain.name} (${terrain.speedModifier.toFixed(2)}x)`,
    );
    this.refreshObjective();
    this.refreshHint();
  }

  private courierTile(): { x: number; y: number } {
    return worldToTile(this.courier.sprite.x, this.courier.sprite.y, TILE_SIZE, 0, this.mapOriginY);
  }

  /** Accumulate distance driven since the previous frame, in tiles. */
  private trackDistance(): void {
    const dx = this.courier.sprite.x - this.prevX;
    const dy = this.courier.sprite.y - this.prevY;
    this.prevX = this.courier.sprite.x;
    this.prevY = this.courier.sprite.y;
    const tiles = Math.hypot(dx, dy) / TILE_SIZE;
    if (tiles > 0) {
      this.trip = addDistance(this.trip, tiles);
      if (this.progress?.status === 'carrying') {
        this.tilesSinceAccept += tiles;
      }
    }
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
    return findPath({
      width: this.map.width,
      height: this.map.height,
      isPassable: (x, y) => {
        const id = getTerrainIdAt(this.map, x, y);
        return id !== undefined && isPassableWith(id, this.state.unlocks);
      },
      start: this.courierTile(),
      goal: { x: destination.tile.x, y: destination.tile.y },
    });
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
    for (let y = 0; y < this.map.height; y++) {
      for (let x = 0; x < this.map.width; x++) {
        const terrainId = getTerrainIdAt(this.map, x, y);
        if (terrainId === undefined || isPassableWith(terrainId, this.state.unlocks)) {
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

  private addSettlementMarkers(): void {
    const status = this.worldState();
    this.settlementMarkers.clear();
    for (const settlement of Object.values(this.region.settlements)) {
      const center = this.tileCenter(settlement.tile.x, settlement.tile.y);
      const fill = STATUS_COLOR[status[settlement.id] ?? 'silent'];
      const marker = this.add
        .rectangle(center.x, center.y, TILE_SIZE * 0.5, TILE_SIZE * 0.5, fill)
        .setStrokeStyle(2, 0x1a1a1a)
        .setDepth(DEPTH_MARKER);
      this.settlementMarkers.set(settlement.id, marker);
      this.add
        .text(center.x, center.y + TILE_SIZE * 0.5, settlement.name, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#f2efe4',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH_MARKER);
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

  /** Recolour the main-map settlement markers to match current world-state. */
  private refreshSettlementMarkers(): void {
    const status = this.worldState();
    for (const [id, marker] of this.settlementMarkers) {
      marker.setFillStyle(STATUS_COLOR[status[id] ?? 'silent']);
    }
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
      this.hud.showToast(`Collected ${contract.cargo} at ${settlement.name}.`);
      this.refreshObjective();
      this.save();
    } else if (canDeliver(progress, contract, settlement.id)) {
      this.completeDelivery(contract, settlement.id, settlement.name);
    }
  }

  private completeDelivery(contract: Contract, settlementId: string, settlementName: string): void {
    // Cargo type scales the base reward before reputation is applied.
    const cargoCategory = getCargoCategory(contract.cargoType);
    const baseReward = cargoPayout(contract.reward, contract.cargoType);
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
    this.hud.showToast(
      `Delivered ${contract.cargo} to ${settlementName}. ` +
        `Reward: ${payout + skillReward} coins${perkNote}, +${contract.reputation} reputation.${skillNote}${bonusNote}${cargoNote}`,
    );
    this.refreshObjective();
    this.refreshWallet();
    this.refreshSummary();
    this.refreshAchievements(true);
    // The delivery reconnects this settlement: recolour its marker (and the
    // minimap if it is open) so the change to the world is immediately visible.
    this.refreshSettlementMarkers();
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

  /**
   * The region is "cleared" once its standing (ungated) routes are all
   * delivered. Deliberately ignores gated contracts: the derived
   * home_reconnected flag is built on this, and the arc's reveals unlock gated
   * contracts, so counting those would re-lock the reveals the moment they
   * opened new work.
   */
  private regionCleared(): boolean {
    const base = baseContracts(this.region.contracts);
    return base.length > 0 && base.every((c) => this.completed.has(c.id));
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
    this.hud.showToast(`Accepted: ${contract.title}. ${contract.note}`);
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
    const show = this.activeContract === undefined && this.atSettlement(this.region.home);
    if (!show) {
      this.hud.setBoard(null);
      return;
    }
    const reputation = totalReputation(this.state.ledger);
    const list = this.boardContracts();
    const homeName = this.region.settlements[this.region.home]?.name ?? this.region.home;
    const lines = [`${homeName.toUpperCase()} BOARD  (press number to accept)`];
    if (list.length === 0) {
      lines.push('  No contracts remain. The frontier is quiet, for now.');
    }
    list.forEach((contract, i) => {
      const locked = canAccept(contract, reputation)
        ? ''
        : `   [needs ${contract.minReputation} rep]`;
      const cargoTag = getCargoCategory(contract.cargoType).tag;
      lines.push(
        `  [${i + 1}] ${contract.title}  -  ${contract.reward}c, +${contract.reputation} rep${locked}  <${cargoTag}>`,
      );
      const bonus = bonusFor(contract.id);
      if (bonus !== undefined) {
        lines.push(`      ${describeBonus(bonus)}`);
      }
    });
    this.hud.setBoard(lines.join('\n'));
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

  /** Dismiss the region-cleared summary panel with Esc so it stops blocking play. */
  private handleSummaryInput(): void {
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
    const base = `WASD/arrows drive.  M: map  J: journal  K: skills  L: codex  N: new game.${talk}`;
    const gateway = this.gatewayAtTile(tile);
    if (gateway !== undefined && this.activeContract === undefined) {
      const other = getRegion(gateway.to).name;
      // A gateway can share a tile with a settlement (Southmill is also the road
      // south to Fenmarch); name it so the dual purpose is not confusing.
      const here = settlementAtTileIn(this.region, tile.x, tile.y);
      const where = here === undefined ? `The road ahead leads to ${other}` : `${here.name} is the road to ${other}`;
      this.hud.setHint(`${base}  ${where}: press T to travel.`);
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

  private addSignpost(tile: { x: number; y: number }, fordUnlockId: string): void {
    const center = this.tileCenter(tile.x, tile.y);
    const signpost = this.add.rectangle(center.x, center.y, TILE_SIZE * 0.5, TILE_SIZE * 0.5, 0xe8d8b0);
    this.physics.add.existing(signpost, true);
    this.add
      .text(center.x, center.y - TILE_SIZE * 0.6, 'ford key', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#e8d8b0',
      })
      .setOrigin(0.5);

    this.physics.add.overlap(this.courier.sprite, signpost, () => {
      if (this.unlockFeature(fordUnlockId)) {
        signpost.destroy();
      }
    });
  }

  private addGatewayMarkers(): void {
    for (const gateway of this.region.gateways) {
      const center = this.tileCenter(gateway.tile.x, gateway.tile.y);
      this.add
        .rectangle(center.x, center.y, TILE_SIZE * 0.6, TILE_SIZE * 0.6)
        .setStrokeStyle(2, 0x6fd0e0)
        .setDepth(DEPTH_MARKER);
      const destName = getRegion(gateway.to).name;
      this.add
        .text(center.x, center.y - TILE_SIZE * 0.55, `road to ${destName}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#6fd0e0',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH_MARKER);
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

  private setupInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      throw new Error('keyboard input is not available');
    }
    this.cursors = keyboard.createCursorKeys();
    this.wasd = keyboard.addKeys('W,A,S,D') as WasdKeys;
    this.buyKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.newGameKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
    this.mapKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.journalKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.J);
    this.legendKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L);
    this.travelKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
    this.skillKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.K);
    this.talkKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.escapeKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

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
    const points = availablePoints(prog.level, this.skills);
    const lines = [
      'COURIER SKILLS   (K to close)',
      `Level ${prog.level}   XP ${prog.xpIntoLevel} / ${prog.xpForNextLevel}`,
      `Skill points to spend: ${points}`,
      '',
      'Press the number to invest a point:',
    ];
    SKILLS.forEach((skill, i) => {
      const rank = rankOf(this.skills, skill.id);
      const maxed = rank >= skill.maxRank ? '  (max)' : '';
      lines.push(`  [${i + 1}] ${skill.name}  rank ${rank}/${skill.maxRank}${maxed}`);
      lines.push(`        ${skill.description}`);
    });
    lines.push('', 'Level up by delivering, exploring, and covering ground.');
    this.hud.setSkillText(lines.join('\n'));
  }

  /** Story-spine lines for the journal: the active mission and its step progress. */
  private missionJournalLines(): string[] {
    const state = this.missionState();
    const mission = activeMission(MISSIONS, state, this.region.id);
    if (mission === null) {
      return ['Story:', '  No mission calls just now. The borderland holds its breath.', ''];
    }
    const progress = missionProgress(mission, state);
    const lines = ['Story:', `  ${mission.title}`];
    progress.steps.forEach((entry, i) => {
      const mark = entry.done ? '[x]' : i === progress.currentStepIndex ? '[>]' : '[ ]';
      const count = stepRequirementCount(entry.step, state);
      const progressNote = !entry.done && count.total > 1 ? ` (${count.done}/${count.total})` : '';
      lines.push(`    ${mark} ${entry.step.summary}${progressNote}`);
    });
    lines.push('');
    return lines;
  }

  /**
   * Journal lines for the cross-region Hidden Road thread (the arc-gated
   * contracts), derived from delivery history. Empty until the thread starts, so
   * it never pre-announces the arc.
   */
  private hiddenRoadJournalLines(): string[] {
    const regions = Object.values(REGIONS).map((r) => ({ name: r.name, contracts: r.contracts }));
    return hiddenRoadJournalLines(hiddenRoadProgress(regions, this.completed, this.effectiveFlags()));
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

  private refreshJournal(): void {
    const status = this.worldState();
    const model = buildJournal({
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
    });
    const lines = [
      'DISCOVERIES JOURNAL   (J to close)',
      `Title: ${courierTitle(this.achievementStat())}`,
      '',
      'Current objective:',
      ...model.objectiveLines.map((l) => `  ${l}`),
      '',
      ...model.summaryLines,
      `Distance driven: ${formatDistance(this.trip.distanceTiles)}`,
      '',
      ...this.missionJournalLines(),
      ...this.hiddenRoadJournalLines(),
      'Places:',
    ];
    for (const place of model.places) {
      const label = statusLabel(place.status);
      const tag = label ? ` [${label}]` : '';
      lines.push(`  ${place.name}${tag} - ${place.note}`);
      if (place.statusNote) {
        lines.push(`      ${place.statusNote}`);
      }
    }
    lines.push('', 'Achievements:');
    for (const achievement of ACHIEVEMENTS) {
      const got = this.achievements.has(achievement.id);
      lines.push(`  ${got ? '[x]' : '[ ]'} ${achievement.name}`);
    }
    this.hud.setJournalText(lines.join('\n'));
  }

  private refreshSummary(): void {
    const summary = computeRunSummary({
      coins: this.state.ledger.coins,
      totalReputation: totalReputation(this.state.ledger),
      reputationTier: tierFor(totalReputation(this.state.ledger)).name,
      delivered: this.deliveredInRegion(),
      totalContracts: this.contractsInPlayCount(),
      fordUnlocked: this.regionFordUnlocked(),
      upgradesOwned: this.state.upgrades.size,
    });
    if (!summary.complete || this.summaryDismissed) {
      this.hud.setSummary(null);
      return;
    }
    const otherNames = this.gatewayDestinationNames();
    const lines = [
      `${this.region.name} Cleared`,
      '',
      ...summary.lines,
      `Distance driven: ${formatDistance(this.trip.distanceTiles)}`,
      '',
      `Reach the gateway and press T to travel to ${otherNames}.`,
      'Press N for a new run.  Esc to dismiss this panel.',
    ];
    this.hud.setSummary(lines.join('\n'));
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
        this.hud.showToast(`Achievement unlocked: ${def?.name ?? id}`, 140);
      }
    }
  }

  private refreshFordStatus(): void {
    const fordUnlockId = this.region.fordUnlockId;
    this.hud.setFordStatus(fordUnlockId === undefined ? null : isUnlocked(this.state, fordUnlockId));
  }

  private refreshObjective(): void {
    const contract = this.activeContract;
    const progress = this.progress;

    const homeName = this.region.settlements[this.region.home]?.name ?? this.region.home;
    if (contract === undefined || progress === undefined) {
      // With no cargo in hand, lead with the spine: the active mission step is
      // the strategic through-line. Fall back to tactical guidance when no
      // mission is active (for example after the arc resolves).
      const objective = activeObjective(MISSIONS, this.missionState(), this.region.id);
      if (objective !== null) {
        const count = stepRequirementCount(objective.step, this.missionState());
        const progressNote = count.total > 1 ? ` (${count.done}/${count.total})` : '';
        this.hud.setObjective(`Mission: ${objective.step.summary}${progressNote}`);
      } else if (this.boardContracts().length === 0) {
        const other = this.gatewayDestinationNames();
        this.hud.setObjective(`${this.region.name} cleared. Travel to ${other} (gateway, press T).`);
      } else if (this.atSettlement(this.region.home)) {
        this.hud.setObjective('Choose a contract from the board.');
      } else {
        this.hud.setObjective(`Return to ${homeName} for a new contract.`);
      }
      return;
    }

    const destination = this.region.settlements[contract.destinationId];
    const pickup = this.region.settlements[contract.pickupId];
    const destinationName = destination?.name ?? contract.destinationId;
    const pickupName = pickup?.name ?? contract.pickupId;

    switch (progress.status) {
      case 'accepted':
        // Spell out both legs: a player picking up cargo elsewhere could not tell
        // where it was ultimately bound (see docs/design/05_playtest_notes.md).
        this.hud.setObjective(
          `${contract.title}: collect ${contract.cargo} at ${pickupName}, then deliver to ${destinationName}`,
        );
        break;
      case 'carrying': {
        const path = this.currentPath;
        const via =
          path === null ? '' : path.reachable ? ` (${path.distance} tiles)` : ' (no route yet)';
        this.hud.setObjective(`${contract.title}: deliver to ${destinationName}${via}`);
        break;
      }
      case 'delivered':
        this.hud.setObjective(`${contract.title}: delivered. Well driven.`);
        break;
    }
  }

  /** On first arrival at a settlement, surface its existing lore note. */
  private checkArrival(): void {
    const tile = this.courierTile();
    const settlement = settlementAtTileIn(this.region, tile.x, tile.y);
    if (settlement === undefined || this.visited.has(settlement.id)) {
      return;
    }
    this.visited.add(settlement.id);
    this.hud.showToast(`${settlement.name}. ${settlement.note}`, 104);
    this.refreshAchievements(true);
    this.save();
  }
}
