import Phaser from 'phaser';
import {
  GAME_TITLE,
  GAME_WIDTH,
  GAME_HEIGHT,
  TILE_SIZE,
  COURIER_SPEED,
  FOG_REVEAL_RADIUS,
  FOG_COLOR,
} from '../config/game-config';
import { TERRAIN_TYPES } from '../data/terrain-types';
import { createTileMap, getTerrainIdAt, worldToTile, type TileMap } from '../systems/tile-map';
import { getTerrain, getSpeedModifier, isPassableWith } from '../systems/terrain-system';
import { computeVelocity, type MoveInput } from '../systems/movement';
import { createGameState, isUnlocked, unlock, type GameState } from '../systems/game-state';
import { createFog, revealAround, revealedIndices, isRevealed, type Fog } from '../systems/fog-of-war';
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
import { buildJournal } from '../systems/journal';
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
import { WEATHERS, weatherByIndex, type Weather } from '../systems/weather';
import { bonusFor, bonusAchieved, describeBonus } from '../systems/contract-bonus';
import { buildLegend } from '../systems/legend';
import {
  getRegion,
  settlementAtTileIn,
  totalSettlementCount,
  DEFAULT_REGION_ID,
  type Region,
} from '../systems/region-system';
import { UPGRADES_GREYBRIDGE } from '../data/upgrades-greybridge';
import {
  startContract,
  canAccept,
  canPickUp,
  canDeliver,
  pickUp,
  isDelivered,
  type Contract,
  type ContractProgress,
} from '../systems/contract-system';
import { Courier } from '../entities/courier';

// Minimap layout (pixels per tile in the corner map).
const MINIMAP_CELL = 6;

// Depth layers, from bottom to top.
const DEPTH_MARKER = 1;
const DEPTH_COURIER = 6;
const DEPTH_FOG = 5;
const DEPTH_HUD = 10;

interface WasdKeys {
  readonly W: Phaser.Input.Keyboard.Key;
  readonly A: Phaser.Input.Keyboard.Key;
  readonly S: Phaser.Input.Keyboard.Key;
  readonly D: Phaser.Input.Keyboard.Key;
}

interface MapSceneData {
  readonly regionId?: string;
}

// Renders the Greybridge tile map and lets the player drive the courier around
// it. Roads and the bridge are faster, forest is slower, and water and
// mountains are impassable. The ford starts blocked; reaching the signpost
// unlocks it as a shorter southern crossing.
export class MapScene extends Phaser.Scene {
  private state: GameState = createGameState();
  private region!: Region;
  private fogByRegion: Record<string, number[]> = {};
  private travelKey!: Phaser.Input.Keyboard.Key;
  private map!: TileMap;
  private mapOriginY = 0;
  private courier!: Courier;
  private impassable!: Phaser.Physics.Arcade.StaticGroup;
  private gatedBlocks = new Map<string, Phaser.GameObjects.Rectangle[]>();
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: WasdKeys;
  private buyKey!: Phaser.Input.Keyboard.Key;
  private terrainReadout!: Phaser.GameObjects.Text;
  private fordStatus!: Phaser.GameObjects.Text;
  private wallet!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private fog!: Fog;
  private fogRects: (Phaser.GameObjects.Rectangle | undefined)[] = [];
  private activeContract: Contract | undefined;
  private progress: ContractProgress | undefined;
  private completed = new Set<string>();
  private objective!: Phaser.GameObjects.Text;
  private board!: Phaser.GameObjects.Text;
  private numberKeys: Phaser.Input.Keyboard.Key[] = [];
  private newGameKey!: Phaser.Input.Keyboard.Key;
  private mapKey!: Phaser.Input.Keyboard.Key;
  private journalKey!: Phaser.Input.Keyboard.Key;
  private minimapGfx!: Phaser.GameObjects.Graphics;
  private minimapVisible = false;
  private journalPanel!: Phaser.GameObjects.Text;
  private summaryPanel!: Phaser.GameObjects.Text;
  private trip: TripLog = createTripLog();
  private prevX = 0;
  private prevY = 0;
  private currentPath: PathResult | null = null;
  private visited = new Set<string>();
  private achievements = new Set<string>();
  private weather: Weather = weatherByIndex(0);
  private legendKey!: Phaser.Input.Keyboard.Key;
  private legendPanel!: Phaser.GameObjects.Text;
  private weatherLine!: Phaser.GameObjects.Text;
  // Per-contract bonus tracking (reset when a contract is accepted).
  private tilesSinceAccept = 0;
  private usedFordThisContract = false;

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
    this.mapOriginY = Math.floor((GAME_HEIGHT - this.map.height * TILE_SIZE) / 2);

    this.drawTiles();
    // Colliders read the restored unlock set, so an unlocked ford stays open.
    this.addImpassableColliders();

    this.physics.world.setBounds(
      0,
      this.mapOriginY,
      this.map.width * TILE_SIZE,
      this.map.height * TILE_SIZE,
    );

    const spawnX = this.region.spawn.x * TILE_SIZE + TILE_SIZE / 2;
    const spawnY = this.mapOriginY + this.region.spawn.y * TILE_SIZE + TILE_SIZE / 2;
    this.courier = new Courier(this, spawnX, spawnY);
    this.courier.sprite.setDepth(DEPTH_COURIER);
    this.physics.add.collider(this.courier.sprite, this.impassable);
    this.prevX = spawnX;
    this.prevY = spawnY;

    // The signpost only exists in regions that host the ford-unlock mechanic.
    if (
      this.region.signpost !== undefined &&
      this.region.fordUnlockId !== undefined &&
      !isUnlocked(this.state, this.region.fordUnlockId)
    ) {
      this.addSignpost(this.region.signpost, this.region.fordUnlockId);
    }
    this.addSettlementMarkers();
    this.addGatewayMarker();
    this.addFog();
    this.restoreFog();
    this.setupInput();
    this.addHud();

    // Pick an ambient road condition for this run.
    this.weather = weatherByIndex(Math.floor(Math.random() * WEATHERS.length));
    this.weatherLine.setText(`Weather: ${this.weather.label}`);

    // Reveal the area around the spawn so the player is not fully blind.
    this.revealAroundCourier();
    this.refreshAchievements(false);

    // Autosave periodically so exploration progress persists.
    this.time.addEvent({ delay: 2000, loop: true, callback: () => this.save() });
    this.save();

    const homeName = this.region.settlements[this.region.home]?.name ?? this.region.home;
    this.showToast(
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
    this.tilesSinceAccept = 0;
    this.usedFordThisContract = false;

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
    for (const [rid, indices] of Object.entries(snapshot.fogByRegion)) {
      this.fogByRegion[rid] = [...indices];
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
    writeSave({
      coins: this.state.ledger.coins,
      reputation: { ...this.state.ledger.reputation },
      unlocks: [...this.state.unlocks],
      upgrades: [...this.state.upgrades],
      completed: [...this.completed],
      visited: [...this.visited],
      regionId: this.region.id,
      fogByRegion: this.fogByRegion,
      activeContractId: this.activeContract?.id ?? null,
      contractStatus: this.progress?.status ?? null,
      distanceTiles: this.trip.distanceTiles,
      deliveries: this.trip.deliveries,
      achievements: [...this.achievements],
    });
  }

  update(): void {
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
    const upgradeModifier = speedMultiplier(this.state.upgrades, UPGRADES_GREYBRIDGE);
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
    this.handleBoardInput();
    this.handlePurchaseInput();
    this.handleResetInput();
    this.handleTravelInput();
    this.handleToggles();
    this.refreshBoard();
    if (this.minimapVisible) {
      this.redrawMinimap();
    }

    const terrain = terrainId === undefined ? undefined : getTerrain(terrainId);
    this.terrainReadout.setText(
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
    const base = revealRadius(this.state.upgrades, UPGRADES_GREYBRIDGE, FOG_REVEAL_RADIUS);
    const radius = Math.max(1, base + this.weather.revealBonus);
    const revealed = revealAround(this.fog, tile.x, tile.y, radius);
    for (const { x, y } of revealed) {
      const index = y * this.map.width + x;
      this.fogRects[index]?.destroy();
      this.fogRects[index] = undefined;
    }
  }

  private addSettlementMarkers(): void {
    for (const settlement of Object.values(this.region.settlements)) {
      const center = this.tileCenter(settlement.tile.x, settlement.tile.y);
      this.add
        .rectangle(center.x, center.y, TILE_SIZE * 0.5, TILE_SIZE * 0.5, 0xf2efe4)
        .setStrokeStyle(2, 0x1a1a1a)
        .setDepth(DEPTH_MARKER);
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
      this.showToast(`Collected ${contract.cargo} at ${settlement.name}.`);
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
    this.state.ledger = addCoins(this.state.ledger, payout + bonusCoins);
    this.state.ledger = addReputation(this.state.ledger, settlementId, contract.reputation);
    this.trip = recordDelivery(this.trip);
    this.activeContract = undefined;
    this.progress = undefined;

    // Compare against the cargo-adjusted base so the perk note reflects a
    // reputation boost, not the cargo pay modifier.
    const perkNote = payout > baseReward ? ` (${perk.label})` : '';
    const bonusNote = bonusCoins > 0 ? ` Bonus met: +${bonusCoins} coins.` : '';
    const cargoNote =
      cargoCategory.payModifier !== 1 ? ` Carried as ${cargoCategory.tag}.` : '';
    this.showToast(
      `Delivered ${contract.cargo} to ${settlementName}. ` +
        `Reward: ${payout} coins${perkNote}, +${contract.reputation} reputation.${bonusNote}${cargoNote}`,
    );
    this.refreshObjective();
    this.refreshWallet();
    this.refreshSummary();
    this.refreshAchievements(true);
    this.save();
  }

  /** Contracts not yet delivered, in their canonical order. */
  private boardContracts(): Contract[] {
    return this.region.contracts.filter((c) => !this.completed.has(c.id));
  }

  /** How many of the active region's contracts are delivered. */
  private deliveredInRegion(): number {
    return this.region.contracts.filter((c) => this.completed.has(c.id)).length;
  }

  private regionCleared(): boolean {
    return this.region.contracts.length > 0 && this.boardContracts().length === 0;
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
    this.showToast(`Accepted: ${contract.title}. ${contract.note}`);
    this.refreshObjective();
    this.save();
  }

  private handleBoardInput(): void {
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
          this.showToast(`${contract.title} needs ${contract.minReputation} reputation.`);
        }
      }
    }
  }

  private refreshBoard(): void {
    const show = this.activeContract === undefined && this.atSettlement(this.region.home);
    this.board.setVisible(show);
    if (!show) {
      return;
    }
    const reputation = totalReputation(this.state.ledger);
    const list = this.boardContracts();
    const lines = ['GREYWATER BOARD  (press number to accept)'];
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
    this.board.setText(lines.join('\n'));
  }

  private handlePurchaseInput(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.buyKey) || !this.atSettlement(this.region.home)) {
      return;
    }
    const target = cheapestUnpurchased(this.state.upgrades, UPGRADES_GREYBRIDGE);
    if (target === null) {
      this.showToast('Every upgrade is already fitted.');
      return;
    }
    const result = purchase(this.state.upgrades, this.state.ledger.coins, target);
    if (!result.ok) {
      this.showToast(`Not enough coins for ${target.name} (${target.cost}).`);
      return;
    }
    this.state.upgrades = new Set(result.purchased);
    this.state.ledger = { ...this.state.ledger, coins: result.coins };
    this.showToast(`Fitted ${target.name}. ${target.description}`);
    this.refreshWallet();
    this.refreshAchievements(true);
    this.save();
  }

  private handleToggles(): void {
    if (Phaser.Input.Keyboard.JustDown(this.mapKey)) {
      this.minimapVisible = !this.minimapVisible;
      this.minimapGfx.setVisible(this.minimapVisible);
      if (this.minimapVisible) {
        this.redrawMinimap();
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.journalKey)) {
      const show = !this.journalPanel.visible;
      this.journalPanel.setVisible(show);
      if (show) {
        this.refreshJournal();
      }
    }
    if (Phaser.Input.Keyboard.JustDown(this.legendKey)) {
      this.legendPanel.setVisible(!this.legendPanel.visible);
    }
  }

  private handleResetInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.newGameKey)) {
      clearSave();
      this.scene.restart();
    }
  }

  private refreshWallet(): void {
    const reputation = totalReputation(this.state.ledger);
    const tier = tierFor(reputation);
    this.wallet.setText(
      `Coins: ${this.state.ledger.coins}   Reputation: ${reputation} (${tier.name})`,
    );
  }

  private refreshHint(): void {
    const base = 'WASD/arrows drive.  M: map  J: journal  L: codex  N: new game.';
    const tile = this.courierTile();
    const atGateway = tile.x === this.region.gateway.x && tile.y === this.region.gateway.y;
    if (atGateway && this.activeContract === undefined) {
      const other = getRegion(this.region.connectsTo).name;
      this.hint.setText(`${base}  Press T to travel to ${other}.`);
      return;
    }
    const target = this.atSettlement(this.region.home)
      ? cheapestUnpurchased(this.state.upgrades, UPGRADES_GREYBRIDGE)
      : null;
    if (target !== null) {
      const affordable = canAfford(this.state.ledger.coins, target);
      this.hint.setText(
        `${base}  Press B: ${target.name} (${target.cost}c)` +
          (affordable ? '' : ' - need more coins'),
      );
    } else {
      this.hint.setText(base);
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

  private addGatewayMarker(): void {
    const center = this.tileCenter(this.region.gateway.x, this.region.gateway.y);
    this.add
      .rectangle(center.x, center.y, TILE_SIZE * 0.6, TILE_SIZE * 0.6)
      .setStrokeStyle(2, 0x6fd0e0)
      .setDepth(DEPTH_MARKER);
    const destName = getRegion(this.region.connectsTo).name;
    this.add
      .text(center.x, center.y - TILE_SIZE * 0.55, `to ${destName}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#6fd0e0',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_MARKER);
  }

  private handleTravelInput(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.travelKey)) {
      return;
    }
    const tile = this.courierTile();
    if (tile.x !== this.region.gateway.x || tile.y !== this.region.gateway.y) {
      return;
    }
    if (this.activeContract !== undefined) {
      this.showToast('Deliver your cargo before leaving the region.');
      return;
    }
    this.save();
    this.scene.restart({ regionId: this.region.connectsTo } satisfies MapSceneData);
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
    this.showToast('Shortcut unlocked: the ford is open.');
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

    const numberCodes = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
      Phaser.Input.Keyboard.KeyCodes.FIVE,
      Phaser.Input.Keyboard.KeyCodes.SIX,
    ];
    this.numberKeys = numberCodes
      .slice(0, this.region.contracts.length)
      .map((code) => keyboard.addKey(code));
  }

  private addHud(): void {
    const line = (y: number, color: string): Phaser.GameObjects.Text =>
      this.add
        .text(8, y, '', { fontFamily: 'monospace', fontSize: '12px', color })
        .setDepth(DEPTH_HUD);

    this.add
      .text(8, 8, GAME_TITLE, { fontFamily: 'monospace', fontSize: '14px', color: '#e8e8e8' })
      .setDepth(DEPTH_HUD);
    this.wallet = line(28, '#e8e8e8');
    this.objective = line(46, '#f2d98f');
    this.terrainReadout = line(64, '#e8e8e8');
    this.fordStatus = line(82, '#e8e8e8');
    this.weatherLine = line(100, '#a9c7e8');
    this.hint = this.add
      .text(8, GAME_HEIGHT - 22, '', { fontFamily: 'monospace', fontSize: '12px', color: '#8a8a8a' })
      .setDepth(DEPTH_HUD);

    this.board = this.add
      .text(8, 118, '', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#f2efe4',
        backgroundColor: '#0b0b0bcc',
        padding: { x: 10, y: 8 },
        lineSpacing: 4,
      })
      .setDepth(DEPTH_HUD)
      .setVisible(false);

    // Journal panel (toggled with J), centred near the top.
    this.journalPanel = this.add
      .text(GAME_WIDTH / 2, 40, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f2efe4',
        backgroundColor: '#0b0b0bdd',
        padding: { x: 12, y: 10 },
        lineSpacing: 4,
        align: 'left',
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH_HUD)
      .setVisible(false);

    // Run summary panel, shown when the region is cleared.
    this.summaryPanel = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#f2efe4',
        backgroundColor: '#0b0b0bee',
        padding: { x: 16, y: 14 },
        lineSpacing: 6,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_HUD)
      .setVisible(false);

    // Minimap graphics (toggled with M), drawn in redrawMinimap.
    this.minimapGfx = this.add.graphics().setDepth(DEPTH_HUD).setVisible(false);

    // Terrain codex (toggled with L); static content from terrain data.
    const legend = buildLegend(Object.values(TERRAIN_TYPES));
    const legendLines = ['TERRAIN CODEX   (L to close)'];
    for (const entry of legend) {
      legendLines.push(`  ${entry.name}: ${entry.speedLabel}${entry.passable ? '' : ' (impassable)'}`);
    }
    this.legendPanel = this.add
      .text(GAME_WIDTH - 8, 40, legendLines.join('\n'), {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#f2efe4',
        backgroundColor: '#0b0b0bdd',
        padding: { x: 12, y: 10 },
        lineSpacing: 4,
        align: 'left',
      })
      .setOrigin(1, 0)
      .setDepth(DEPTH_HUD)
      .setVisible(false);

    this.refreshWallet();
    this.refreshObjective();
    this.refreshFordStatus();
    this.refreshHint();
    this.refreshBoard();
    this.refreshSummary();
  }

  private redrawMinimap(): void {
    const model = buildMinimap({
      width: this.map.width,
      height: this.map.height,
      isRevealed: (x, y) => isRevealed(this.fog, x, y),
      terrainColorAt: (x, y) => {
        const id = getTerrainIdAt(this.map, x, y);
        return id === undefined ? null : (getTerrain(id)?.color ?? null);
      },
      courier: this.courierTile(),
      settlements: Object.values(this.region.settlements).map((s) => ({ x: s.tile.x, y: s.tile.y })),
    });

    const cell = MINIMAP_CELL;
    const originX = GAME_WIDTH - model.width * cell - 12;
    const originY = GAME_HEIGHT - model.height * cell - 12;

    const g = this.minimapGfx;
    g.clear();
    g.fillStyle(0x0b0b0b, 0.85);
    g.fillRect(originX - 4, originY - 4, model.width * cell + 8, model.height * cell + 8);

    for (let i = 0; i < model.cells.length; i++) {
      const c = model.cells[i];
      if (c === undefined) {
        continue;
      }
      const x = i % model.width;
      const y = Math.floor(i / model.width);
      const px = originX + x * cell;
      const py = originY + y * cell;
      const fill = c.revealed ? (c.color ?? 0x5a8f4a) : 0x1c1c1c;
      g.fillStyle(fill, 1);
      g.fillRect(px, py, cell - 1, cell - 1);
      if (c.marker === 'settlement') {
        g.fillStyle(0xf2efe4, 1);
        g.fillRect(px + 1, py + 1, cell - 3, cell - 3);
      } else if (c.marker === 'courier') {
        g.fillStyle(0xf2c14e, 1);
        g.fillRect(px, py, cell - 1, cell - 1);
      }
    }

    // Overlay the route to the active destination on the intermediate tiles.
    const path = this.currentPath;
    if (path !== null && path.reachable && path.path.length > 2) {
      g.fillStyle(0x6fd0e0, 0.9);
      for (let k = 1; k < path.path.length - 1; k++) {
        const node = path.path[k];
        if (node === undefined) {
          continue;
        }
        g.fillRect(originX + node.x * cell + 2, originY + node.y * cell + 2, cell - 4, cell - 4);
      }
    }
  }

  private refreshJournal(): void {
    const model = buildJournal({
      settlements: Object.values(this.region.settlements).map((s) => ({ id: s.id, name: s.name, note: s.note })),
      visitedIds: [...this.visited],
      delivered: this.deliveredInRegion(),
      totalContracts: this.region.contracts.length,
      reputationTier: tierFor(totalReputation(this.state.ledger)).name,
      fordUnlocked: this.regionFordUnlocked(),
    });
    const lines = [
      'DISCOVERIES JOURNAL   (J to close)',
      `Title: ${courierTitle(this.achievementStat())}`,
      ...model.summaryLines,
      `Distance driven: ${formatDistance(this.trip.distanceTiles)}`,
      '',
      'Places:',
    ];
    for (const place of model.places) {
      lines.push(`  ${place.name} - ${place.note}`);
    }
    lines.push('', 'Achievements:');
    for (const achievement of ACHIEVEMENTS) {
      const got = this.achievements.has(achievement.id);
      lines.push(`  ${got ? '[x]' : '[ ]'} ${achievement.name}`);
    }
    this.journalPanel.setText(lines.join('\n'));
  }

  private refreshSummary(): void {
    const summary = computeRunSummary({
      coins: this.state.ledger.coins,
      totalReputation: totalReputation(this.state.ledger),
      reputationTier: tierFor(totalReputation(this.state.ledger)).name,
      delivered: this.deliveredInRegion(),
      totalContracts: this.region.contracts.length,
      fordUnlocked: this.regionFordUnlocked(),
      upgradesOwned: this.state.upgrades.size,
    });
    if (!summary.complete) {
      this.summaryPanel.setVisible(false);
      return;
    }
    const otherName = getRegion(this.region.connectsTo).name;
    const lines = [
      `${this.region.name} Cleared`,
      '',
      ...summary.lines,
      `Distance driven: ${formatDistance(this.trip.distanceTiles)}`,
      '',
      `Reach the gateway and press T to travel to ${otherName}.`,
      'Press N for a new run.',
    ];
    this.summaryPanel.setText(lines.join('\n'));
    this.summaryPanel.setVisible(true);
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
        this.showToast(`Achievement unlocked: ${def?.name ?? id}`, 140);
      }
    }
  }

  private refreshFordStatus(): void {
    const fordUnlockId = this.region.fordUnlockId;
    if (fordUnlockId === undefined) {
      this.fordStatus.setText('');
      return;
    }
    const open = isUnlocked(this.state, fordUnlockId);
    this.fordStatus.setText(`Ford: ${open ? 'OPEN' : 'locked'}`);
    this.fordStatus.setColor(open ? '#8fd18f' : '#d18f8f');
  }

  private refreshObjective(): void {
    const contract = this.activeContract;
    const progress = this.progress;

    const homeName = this.region.settlements[this.region.home]?.name ?? this.region.home;
    if (contract === undefined || progress === undefined) {
      if (this.boardContracts().length === 0) {
        const other = getRegion(this.region.connectsTo).name;
        this.objective.setText(`${this.region.name} cleared. Travel to ${other} (gateway, press T).`);
      } else if (this.atSettlement(this.region.home)) {
        this.objective.setText('Choose a contract from the board.');
      } else {
        this.objective.setText(`Return to ${homeName} for a new contract.`);
      }
      return;
    }

    const destination = this.region.settlements[contract.destinationId];
    const pickup = this.region.settlements[contract.pickupId];
    const destinationName = destination?.name ?? contract.destinationId;
    const pickupName = pickup?.name ?? contract.pickupId;

    switch (progress.status) {
      case 'accepted':
        this.objective.setText(`${contract.title}: collect ${contract.cargo} at ${pickupName}`);
        break;
      case 'carrying': {
        const path = this.currentPath;
        const via =
          path === null ? '' : path.reachable ? ` (${path.distance} tiles)` : ' (no route yet)';
        this.objective.setText(`${contract.title}: deliver to ${destinationName}${via}`);
        break;
      }
      case 'delivered':
        this.objective.setText(`${contract.title}: delivered. Well driven.`);
        break;
    }
  }

  private showToast(message: string, y = 60): void {
    const toast = this.add
      .text(GAME_WIDTH / 2, y, message, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 8, y: 4 },
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 80 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_HUD);
    this.time.delayedCall(3500, () => toast.destroy());
  }

  /** On first arrival at a settlement, surface its existing lore note. */
  private checkArrival(): void {
    const tile = this.courierTile();
    const settlement = settlementAtTileIn(this.region, tile.x, tile.y);
    if (settlement === undefined || this.visited.has(settlement.id)) {
      return;
    }
    this.visited.add(settlement.id);
    this.showToast(`${settlement.name}. ${settlement.note}`, 104);
    this.refreshAchievements(true);
    this.save();
  }
}
