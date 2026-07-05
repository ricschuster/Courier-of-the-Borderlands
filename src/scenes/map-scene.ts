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
import { GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND } from '../data/greybridge-map';
import { TERRAIN_TYPES } from '../data/terrain-types';
import { createTileMap, getTerrainIdAt, worldToTile, type TileMap } from '../systems/tile-map';
import { getTerrain, getSpeedModifier, isPassableWith } from '../systems/terrain-system';
import { computeVelocity, type MoveInput } from '../systems/movement';
import { createGameState, isUnlocked, unlock, type GameState } from '../systems/game-state';
import { createFog, revealAround, type Fog } from '../systems/fog-of-war';
import { addCoins, addReputation, totalReputation, tierFor } from '../systems/economy';
import { speedMultiplier, purchase, isPurchased, canAfford } from '../systems/upgrade-system';
import { SETTLEMENTS, settlementAtTile } from '../data/settlements-greybridge';
import { CONTRACTS_GREYBRIDGE } from '../data/contracts-greybridge';
import { UPGRADES_GREYBRIDGE } from '../data/upgrades-greybridge';
import {
  startContract,
  canPickUp,
  canDeliver,
  pickUp,
  deliver,
  isDelivered,
  type Contract,
  type ContractProgress,
} from '../systems/contract-system';
import { Courier } from '../entities/courier';

// The single starter upgrade lives in Greywater; buying is a one-key action.
const STARTER_UPGRADE = UPGRADES_GREYBRIDGE[0];
const UPGRADE_TOWN = 'greywater';

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

const FORD_UNLOCK = 'ford-crossing';
// Signpost tile on the west bank; driving onto it opens the ford.
const SIGNPOST_TILE = { x: 8, y: 8 } as const;

// Renders the Greybridge tile map and lets the player drive the courier around
// it. Roads and the bridge are faster, forest is slower, and water and
// mountains are impassable. The ford starts blocked; reaching the signpost
// unlocks it as a shorter southern crossing.
export class MapScene extends Phaser.Scene {
  private state: GameState = createGameState();
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
  private contractIndex = 0;
  private contract!: Contract;
  private progress!: ContractProgress;
  private objective!: Phaser.GameObjects.Text;
  private visited = new Set<string>();

  constructor() {
    super({ key: 'MapScene' });
  }

  create(): void {
    this.state = createGameState();
    this.gatedBlocks = new Map();
    this.visited = new Set();

    const firstContract = CONTRACTS_GREYBRIDGE[0];
    if (firstContract === undefined) {
      throw new Error('no contracts defined for Greybridge');
    }
    this.contractIndex = 0;
    this.contract = firstContract;
    this.progress = startContract(firstContract);

    this.map = createTileMap(GREYBRIDGE_ROWS, GREYBRIDGE_LEGEND);
    this.mapOriginY = Math.floor((GAME_HEIGHT - this.map.height * TILE_SIZE) / 2);

    this.drawTiles();
    this.addImpassableColliders();

    this.physics.world.setBounds(
      0,
      this.mapOriginY,
      this.map.width * TILE_SIZE,
      this.map.height * TILE_SIZE,
    );

    // Spawn on the road at the left edge of the bridge row (y = 5).
    const spawnX = TILE_SIZE * 1.5;
    const spawnY = this.mapOriginY + 5 * TILE_SIZE + TILE_SIZE / 2;
    this.courier = new Courier(this, spawnX, spawnY);
    this.courier.sprite.setDepth(DEPTH_COURIER);
    this.physics.add.collider(this.courier.sprite, this.impassable);

    this.addSignpost();
    this.addSettlementMarkers();
    this.addFog();
    this.setupInput();
    this.addHud();

    // Reveal the area around the spawn so the player is not fully blind.
    this.revealAroundCourier();

    this.showToast(this.contract.note);
  }

  update(): void {
    const input: MoveInput = {
      up: this.cursors.up.isDown || this.wasd.W.isDown,
      down: this.cursors.down.isDown || this.wasd.S.isDown,
      left: this.cursors.left.isDown || this.wasd.A.isDown,
      right: this.cursors.right.isDown || this.wasd.D.isDown,
    };

    const terrainId = this.terrainUnderCourier();
    const terrainModifier = terrainId === undefined ? 1 : getSpeedModifier(terrainId);
    const upgradeModifier = speedMultiplier(this.state.upgrades, UPGRADES_GREYBRIDGE);
    const velocity = computeVelocity(input, COURIER_SPEED * terrainModifier * upgradeModifier);
    this.courier.setVelocity(velocity.x, velocity.y);

    this.revealAroundCourier();
    this.updateDelivery();
    this.checkArrival();
    this.handlePurchaseInput();

    const terrain = terrainId === undefined ? undefined : getTerrain(terrainId);
    this.terrainReadout.setText(
      terrain === undefined
        ? 'Terrain: unknown'
        : `Terrain: ${terrain.name} (${terrain.speedModifier.toFixed(2)}x)`,
    );
    this.refreshHint();
  }

  private courierTile(): { x: number; y: number } {
    return worldToTile(this.courier.sprite.x, this.courier.sprite.y, TILE_SIZE, 0, this.mapOriginY);
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
    const revealed = revealAround(this.fog, tile.x, tile.y, FOG_REVEAL_RADIUS);
    for (const { x, y } of revealed) {
      const index = y * this.map.width + x;
      this.fogRects[index]?.destroy();
      this.fogRects[index] = undefined;
    }
  }

  private addSettlementMarkers(): void {
    for (const settlement of Object.values(SETTLEMENTS)) {
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
    if (isDelivered(this.progress)) {
      return;
    }
    const tile = this.courierTile();
    const settlement = settlementAtTile(tile.x, tile.y);
    if (settlement === undefined) {
      return;
    }

    if (canPickUp(this.progress, this.contract, settlement.id)) {
      this.progress = pickUp(this.progress);
      this.showToast(`Collected ${this.contract.cargo} at ${settlement.name}.`);
      this.refreshObjective();
    } else if (canDeliver(this.progress, this.contract, settlement.id)) {
      this.progress = deliver(this.progress);
      this.grantReward(settlement.id);
      this.showToast(
        `Delivered ${this.contract.cargo} to ${settlement.name}. ` +
          `Reward: ${this.contract.reward} coins, +${this.contract.reputation} reputation.`,
      );
      this.advanceContract();
      this.refreshObjective();
      this.refreshWallet();
    }
  }

  private grantReward(settlementId: string): void {
    this.state.ledger = addCoins(this.state.ledger, this.contract.reward);
    this.state.ledger = addReputation(this.state.ledger, settlementId, this.contract.reputation);
  }

  /** Move to the next contract, if any, and re-accept it (pickup at its town). */
  private advanceContract(): void {
    const next = CONTRACTS_GREYBRIDGE[this.contractIndex + 1];
    if (next === undefined) {
      return;
    }
    this.contractIndex += 1;
    this.contract = next;
    this.progress = startContract(next);
  }

  private handlePurchaseInput(): void {
    if (STARTER_UPGRADE === undefined || !Phaser.Input.Keyboard.JustDown(this.buyKey)) {
      return;
    }
    const tile = this.courierTile();
    if (settlementAtTile(tile.x, tile.y)?.id !== UPGRADE_TOWN) {
      return;
    }
    if (isPurchased(this.state.upgrades, STARTER_UPGRADE.id)) {
      this.showToast(`The ${STARTER_UPGRADE.name} are already fitted.`);
      return;
    }
    const result = purchase(this.state.upgrades, this.state.ledger.coins, STARTER_UPGRADE);
    if (!result.ok) {
      this.showToast(`Not enough coins for ${STARTER_UPGRADE.name} (${STARTER_UPGRADE.cost}).`);
      return;
    }
    this.state.upgrades = new Set(result.purchased);
    this.state.ledger = { ...this.state.ledger, coins: result.coins };
    this.showToast(`Fitted ${STARTER_UPGRADE.name}. The wagon feels quicker.`);
    this.refreshWallet();
  }

  private refreshWallet(): void {
    const reputation = totalReputation(this.state.ledger);
    const tier = tierFor(reputation);
    this.wallet.setText(
      `Coins: ${this.state.ledger.coins}   Reputation: ${reputation} (${tier.name})`,
    );
  }

  private refreshHint(): void {
    const base = 'Arrow keys or WASD to drive.';
    if (STARTER_UPGRADE === undefined) {
      this.hint.setText(base);
      return;
    }
    const tile = this.courierTile();
    const atTown = settlementAtTile(tile.x, tile.y)?.id === UPGRADE_TOWN;
    if (atTown && !isPurchased(this.state.upgrades, STARTER_UPGRADE.id)) {
      const affordable = canAfford(this.state.ledger.coins, STARTER_UPGRADE);
      this.hint.setText(
        `${base}  Press B to buy ${STARTER_UPGRADE.name} (${STARTER_UPGRADE.cost} coins)` +
          (affordable ? '' : ' - need more coins'),
      );
    } else {
      this.hint.setText(base);
    }
  }

  private addSignpost(): void {
    const center = this.tileCenter(SIGNPOST_TILE.x, SIGNPOST_TILE.y);
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
      if (this.unlockFeature(FORD_UNLOCK)) {
        signpost.destroy();
      }
    });
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
    this.hint = this.add
      .text(8, GAME_HEIGHT - 22, '', { fontFamily: 'monospace', fontSize: '12px', color: '#8a8a8a' })
      .setDepth(DEPTH_HUD);

    this.refreshWallet();
    this.refreshObjective();
    this.refreshFordStatus();
    this.refreshHint();
  }

  private refreshFordStatus(): void {
    const open = isUnlocked(this.state, FORD_UNLOCK);
    this.fordStatus.setText(`Ford: ${open ? 'OPEN' : 'locked'}`);
    this.fordStatus.setColor(open ? '#8fd18f' : '#d18f8f');
  }

  private refreshObjective(): void {
    const pickup = SETTLEMENTS[this.contract.pickupId];
    const destination = SETTLEMENTS[this.contract.destinationId];
    const pickupName = pickup?.name ?? this.contract.pickupId;
    const destinationName = destination?.name ?? this.contract.destinationId;

    let text: string;
    switch (this.progress.status) {
      case 'accepted':
        text = `${this.contract.title}: collect ${this.contract.cargo} at ${pickupName}`;
        break;
      case 'carrying':
        text = `${this.contract.title}: deliver to ${destinationName}`;
        break;
      case 'delivered':
        text = `${this.contract.title}: delivered. Well driven.`;
        break;
    }
    this.objective.setText(text);
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
    const settlement = settlementAtTile(tile.x, tile.y);
    if (settlement === undefined || this.visited.has(settlement.id)) {
      return;
    }
    this.visited.add(settlement.id);
    this.showToast(`${settlement.name}. ${settlement.note}`, 104);
  }
}
