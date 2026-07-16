// The end-to-end test bridge, extracted from map-scene.ts (#301).
//
// The debug API attached to window when the game boots with `?e2e`. It is a
// thin, read-plus-navigate surface: tests still drive movement with real key
// presses, but read state and next-step waypoints through this so navigation
// stays deterministic. Never attached in normal play.
//
// The scene hands over an E2EHost of narrow accessors (the same host-interface
// split DialogueController uses), so this module reads scene state without
// owning any of it.

import { getTerrainIdAt, type TileMap } from '../systems/tile-map';
import { isPassableWith } from '../systems/terrain-system';
import { findPath } from '../systems/pathfinding';
import { revealedIndices, type Fog } from '../systems/fog-of-war';
import { totalReputation } from '../systems/economy';
import { availablePoints, type SkillRanks } from '../systems/skills';
import { flagsToArray, type StoryFlags } from '../systems/dialogue';
import { activeObjective, type MissionState } from '../systems/mission-system';
import { MISSIONS } from '../data/missions';
import type { GameState } from '../systems/game-state';
import type { TripLog } from '../systems/trip-log';
import type { SettlementStatus } from '../systems/world-state';
import type { Contract, ContractProgress } from '../systems/contract-system';
import type { Region } from '../systems/region-system';
import type { MapHud } from './map-hud';
import type { DialogueController } from './dialogue-controller';
import type { Juice } from './juice';

// Read-only snapshot of live scene state, exposed to end-to-end tests so a
// headless browser can drive the courier and assert on the delivery loop.
export interface E2EState {
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
  /**
   * Scroll offset of the open journal/skills/upgrade overlay, or null when none
   * is open. The only observable proof a scroll input moved the panel, since the
   * panel renders to canvas and its text is unreadable from the DOM (#274).
   */
  readonly overlayScrollOffset: number | null;
  /**
   * Whether cosmetic feedback (shake, particle bursts) is playing. False when the
   * player has asked their system to reduce motion. Purely cosmetic state, but
   * unobservable from outside, and it is the accessibility contract (#227).
   */
  readonly juiceEnabled: boolean;
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
  /** Whether the wagon upgrade menu is currently open. */
  readonly upgradeMenuOpen: boolean;
  /** Whether the region-cleared summary panel is currently shown. */
  readonly summaryVisible: boolean;
  /** Whether the end-of-arc capstone panel is currently shown. */
  readonly capstoneVisible: boolean;
  /** Whether the home contract board is currently shown. */
  readonly boardVisible: boolean;
  /** Active mission id for the current region, or null when none is active. */
  readonly activeMissionId: string | null;
  /** The active mission's current step id, or null. */
  readonly activeMissionStepId: string | null;
}

export interface CourierE2EApi {
  readonly version: number;
  getState(): E2EState;
  nextStepToward(tileX: number, tileY: number): { x: number; y: number } | null;
  isPassableTile(tileX: number, tileY: number): boolean;
  // Full shortest passable path to a goal tile, as tile coordinates (including
  // the current tile). null if the goal is unreachable with the current
  // unlocks. Lets tests assert which route pathfinding chooses.
  pathTo(tileX: number, tileY: number): readonly { x: number; y: number }[] | null;
  // Monotonic update-frame counter. Tests wait on this advancing instead of on
  // wall-clock time, so key holds and settle waits span real game frames even
  // when a loaded runner starves the frame loop. Cheap on purpose: polled per
  // animation frame by waitForFunction.
  getFrame(): number;
  // Zero the wagon's velocity and snap it onto the given tile's centre. Only a
  // short settle (within 3 tiles), never a teleport: returns false when the
  // wagon is too far away, so a spec cannot use it to skip driving. Exists
  // because a drive arrives with residual velocity that one sparse frame can
  // carry a tile past the goal before update() re-reads the released keys,
  // making every exact-tile interaction gate miss under CI load.
  seat(tileX: number, tileY: number): boolean;
}

declare global {
  var __courier: CourierE2EApi | undefined;
}

/**
 * The scene state the bridge reads. Every accessor is a live read: the API
 * recomputes its snapshot on each call, so nothing here is cached.
 */
export interface E2EHost {
  getRegion(): Region;
  getMap(): TileMap;
  /** World position of the wagon sprite. */
  courierPosition(): { x: number; y: number };
  courierTile(): { x: number; y: number };
  tileCenter(tileX: number, tileY: number): { x: number; y: number };
  /**
   * Zero the wagon's velocity and snap it to a world position, syncing the
   * distance tracker so the snap books no driven miles (no wear, no trip log).
   */
  placeCourier(x: number, y: number): void;
  getGameState(): GameState;
  getTrip(): TripLog;
  deliveredInRegion(): number;
  getWagonCondition(): number;
  getWagonWearTotal(): number;
  getFog(): Fog;
  getActiveContract(): Contract | undefined;
  getProgress(): ContractProgress | undefined;
  atHome(): boolean;
  boardContracts(): readonly Contract[];
  regionFordUnlocked(): boolean;
  worldState(): Record<string, SettlementStatus>;
  courierLevel(): number;
  getSkills(): SkillRanks;
  getStoryFlags(): StoryFlags;
  getHud(): MapHud;
  getJuice(): Juice;
  getDialogue(): DialogueController;
  regionCleared(): boolean;
  missionState(): MissionState;
  traversalKeys(): ReadonlySet<string>;
  frame(): number;
}

/** True when the game booted with `?e2e` in the URL (test-only hook). */
export function isE2E(): boolean {
  return (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('e2e')
  );
}

/**
 * Test-only wagon speed multiplier. The full-arc e2e drives ~20 deliveries at
 * real wheel speed, which is slow; `?turbo` doubles the speed so the CI arc
 * check finishes in about half the wall-clock. Kept to 2x on purpose: with the
 * e2e-gated frame-delta clamp in main.ts (min fps 20, so at most 50ms of
 * physics per frame), 2x tops out under one tile per frame even on a starved
 * runner, so goal-tile detection stays reliable. Never set in normal play.
 * Gated behind `?e2e` so a stray URL param cannot speed up the real game.
 */
export function speedFactor(): number {
  return isE2E() && new URLSearchParams(window.location.search).has('turbo') ? 2 : 1;
}

/**
 * Test-only switch that disables wagon wear (ADR 0005). The full-arc e2e is a
 * reachability / soft-lock guard, not a travel-sink test: the sink is unit
 * tested and cannot soft-lock (a dry wagon still limps to a settlement and a
 * tow-home rescue is always available). On a loaded CI runner, though, a long
 * leg can drain the wagon to limp speed mid-drive, which the driver reads as a
 * stall. Gate wear off via `?nowear` so the arc measures reachability without
 * that harness-only fragility. Requires `?e2e` so a stray URL param cannot
 * disable wear in the real game.
 */
export function wearDisabled(): boolean {
  return isE2E() && new URLSearchParams(window.location.search).has('nowear');
}

/** Attach the read-plus-navigate test API to window, gated on `?e2e`. */
export function exposeE2EApi(host: E2EHost): void {
  if (!isE2E()) {
    return;
  }
  globalThis.__courier = {
    version: 13,
    getState: () => buildState(host),
    nextStepToward: (tileX, tileY) => nextStep(host, tileX, tileY),
    isPassableTile: (tileX, tileY) => isPassableTile(host, tileX, tileY),
    pathTo: (tileX, tileY) => pathTo(host, tileX, tileY),
    getFrame: () => host.frame(),
    seat: (tileX, tileY) => seat(host, tileX, tileY),
  };
}

/**
 * Test-only settle (see CourierE2EApi.seat). Snaps the wagon onto a nearby
 * tile centre with zero velocity via the host, which syncs its distance
 * tracker so the snap books no driven distance (no wear, no trip miles).
 */
function seat(host: E2EHost, tileX: number, tileY: number): boolean {
  const tile = host.courierTile();
  // Refuse long snaps so a spec cannot skip driving, but allow up to 3 tiles:
  // a drive can coast a couple of tiles past home before the keys are re-read,
  // and worst-case coast at full kit can just exceed a 2-tile radius, which
  // would hard-fail the re-seat instead of settling. 3 gives margin.
  if (Math.abs(tile.x - tileX) > 3 || Math.abs(tile.y - tileY) > 3) {
    return false;
  }
  const center = host.tileCenter(tileX, tileY);
  host.placeCourier(center.x, center.y);
  return true;
}

/** Snapshot of live state for tests. Recomputed on every call. */
function buildState(host: E2EHost): E2EState {
  const region = host.getRegion();
  const state = host.getGameState();
  const skills = host.getSkills();
  const hud = host.getHud();
  const dialogue = host.getDialogue();
  const level = host.courierLevel();
  const e2eObjective = activeObjective(MISSIONS, host.missionState(), region.id);
  const tile = host.courierTile();
  const position = host.courierPosition();
  const home = region.settlements[region.home];
  const homeTile = home?.tile ?? region.spawn;
  const homeCenter = host.tileCenter(homeTile.x, homeTile.y);
  const activeContract = host.getActiveContract();
  const destSettlement =
    activeContract === undefined ? undefined : region.settlements[activeContract.destinationId];
  const destCenter =
    destSettlement === undefined
      ? null
      : host.tileCenter(destSettlement.tile.x, destSettlement.tile.y);
  // Pickup leg: only meaningful while the cargo is still unclaimed. Once the
  // status is 'carrying' the pickup is done, so this reports null.
  const pickupSettlement =
    activeContract === undefined || host.getProgress()?.status !== 'accepted'
      ? undefined
      : region.settlements[activeContract.pickupId];
  const pickupCenter =
    pickupSettlement === undefined
      ? null
      : host.tileCenter(pickupSettlement.tile.x, pickupSettlement.tile.y);
  const signpostTile = region.signpost;
  const signpostCenter =
    signpostTile === undefined ? null : host.tileCenter(signpostTile.x, signpostTile.y);
  return {
    regionId: region.id,
    courier: { x: position.x, y: position.y, tileX: tile.x, tileY: tile.y },
    home: { tileX: homeTile.x, tileY: homeTile.y, x: homeCenter.x, y: homeCenter.y },
    coins: state.ledger.coins,
    reputation: totalReputation(state.ledger),
    deliveries: host.getTrip().deliveries,
    delivered: host.deliveredInRegion(),
    wagonCondition: host.getWagonCondition(),
    wagonWearTotal: host.getWagonWearTotal(),
    fogRevealed: revealedIndices(host.getFog()).length,
    activeContractId: activeContract?.id ?? null,
    contractStatus: host.getProgress()?.status ?? null,
    atHome: host.atHome(),
    availableContractIds: host.boardContracts().map((c) => c.id),
    destination:
      destSettlement === undefined || destCenter === null
        ? null
        : { tileX: destSettlement.tile.x, tileY: destSettlement.tile.y, x: destCenter.x, y: destCenter.y },
    pickup:
      pickupSettlement === undefined || pickupCenter === null
        ? null
        : { tileX: pickupSettlement.tile.x, tileY: pickupSettlement.tile.y, x: pickupCenter.x, y: pickupCenter.y },
    fordUnlocked: host.regionFordUnlocked(),
    unlocks: [...state.unlocks],
    upgrades: [...state.upgrades],
    signpost:
      signpostTile === undefined || signpostCenter === null
        ? null
        : { tileX: signpostTile.x, tileY: signpostTile.y, x: signpostCenter.x, y: signpostCenter.y },
    gateways: region.gateways.map((g) => ({ tileX: g.tile.x, tileY: g.tile.y, to: g.to })),
    worldState: host.worldState(),
    level,
    skillPoints: availablePoints(level, skills),
    skills: { ...skills },
    storyFlags: flagsToArray(host.getStoryFlags()),
    dialogueOpen: hud.isDialogueVisible(),
    overlayScrollOffset: hud.scrollOffset(),
    juiceEnabled: host.getJuice().isEnabled(),
    dialogueChoices: dialogue.choiceLabels(),
    activeEncounterId: dialogue.activeEncounterId(),
    regionCleared: host.regionCleared(),
    skillPanelOpen: hud.isSkillPanelVisible(),
    upgradeMenuOpen: hud.isUpgradeMenuVisible(),
    summaryVisible: hud.isSummaryVisible(),
    capstoneVisible: hud.isCapstoneVisible(),
    boardVisible: hud.isBoardVisible(),
    activeMissionId: e2eObjective?.mission.id ?? null,
    activeMissionStepId: e2eObjective?.step.id ?? null,
  };
}

/** Shortest passable path to a goal tile, or null if unreachable. */
function findHostPath(host: E2EHost, tileX: number, tileY: number) {
  // Compute the capability set once per pathfind, not per tile visited.
  const keys = host.traversalKeys();
  const map = host.getMap();
  return findPath({
    width: map.width,
    height: map.height,
    isPassable: (x, y) => {
      const id = getTerrainIdAt(map, x, y);
      return id !== undefined && isPassableWith(id, keys);
    },
    start: host.courierTile(),
    goal: { x: tileX, y: tileY },
  });
}

/** World centre of the next tile on the shortest passable path to a goal. */
function nextStep(host: E2EHost, tileX: number, tileY: number): { x: number; y: number } | null {
  const path = findHostPath(host, tileX, tileY);
  if (!path.reachable) {
    return null;
  }
  // path[0] is the current tile; [1] is the next step to drive toward.
  const next = path.path[1] ?? path.path[0];
  if (next === undefined) {
    return null;
  }
  return host.tileCenter(next.x, next.y);
}

/** Full shortest passable path to a goal tile, or null if unreachable. */
function pathTo(host: E2EHost, tileX: number, tileY: number): { x: number; y: number }[] | null {
  const path = findHostPath(host, tileX, tileY);
  if (!path.reachable) {
    return null;
  }
  return path.path.map((tile) => ({ x: tile.x, y: tile.y }));
}

/** Whether a tile is currently drivable, given the active unlock set. */
function isPassableTile(host: E2EHost, tileX: number, tileY: number): boolean {
  const id = getTerrainIdAt(host.getMap(), tileX, tileY);
  return id !== undefined && isPassableWith(id, host.traversalKeys());
}
