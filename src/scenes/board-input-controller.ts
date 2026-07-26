// The contract board, extracted from MapScene (#392): whether the board is up,
// what it draws, and the arm/confirm state machine behind accepting a contract
// with a number key.
//
// This is the tightest cluster left in the scene. The two fields it owns,
// `armedContractId` and `boardNotice`, are a private state machine: nothing
// outside these three methods reads either one except a reset on load and a
// getter for the e2e hook. Accepting a contract itself stays in the scene,
// because it writes the active contract, the trip bonus tracking, and the save.
//
// Behaviour is unchanged from when this lived in MapScene; this is a structural
// extraction, following the DialogueController, PanelInputController, and
// MilestoneController precedents.

// Phaser is imported for types only. Nothing in this file touches the Phaser
// runtime: the one thing it needs, "was this key just pressed", arrives through
// the host. That keeps the arm/confirm rules unit-testable, since Phaser cannot
// be imported under the node test environment.
import type Phaser from 'phaser';
import { boardText, boardInteractable } from '../systems/panel-text';
import { canAccept, type Contract } from '../systems/contract-system';
import type { SettlementStatus } from '../systems/world-state';
import type { Region } from '../systems/region-system';
import type { MapHud } from './map-hud';
import type { Audio } from './audio';

/** The services the board controller needs from its host scene. */
export interface BoardInputHost {
  getHud(): MapHud;
  getAudio(): Audio;
  getRegion(): Region;
  getNumberKeys(): readonly Phaser.Input.Keyboard.Key[];
  /**
   * Whether this key was pressed on this frame. Supplied by the host rather than
   * called directly, so this module stays free of the Phaser runtime. Note the
   * underlying check consumes the press, so it must be called once per key.
   */
  justDown(key: Phaser.Input.Keyboard.Key): boolean;
  /** Contracts currently offered: unfinished, and revealed by the story flags. */
  boardContracts(): Contract[];
  /** Total reputation, which gates which contracts can be accepted. */
  reputation(): number;
  /** Per-settlement status, so the board can colour the places it names. */
  worldState(): Record<string, SettlementStatus>;
  hasActiveContract(): boolean;
  atHome(): boolean;
  /** Whether the end-of-arc finale is showing, which owns the whole screen. */
  capstoneVisible(): boolean;
  /**
   * Commit to a contract. Stays in the scene: it writes the active contract, the
   * per-contract bonus tracking, and the save.
   */
  acceptContract(contract: Contract): void;
}

export class BoardInputController {
  /**
   * The board contract a first digit-press has armed, awaiting a confirming
   * second press of the same slot (#321). The board renumbers between visits, so
   * a remembered digit would otherwise accept a different contract instantly and
   * commit the whole next journey; arming names the contract first so a mispress
   * is caught. Cleared whenever the board is not interactable.
   */
  private armedContractId: string | null = null;
  /**
   * Feedback about the last digit pressed at the board (currently only the
   * reputation refusal), rendered on the board itself for the same reason the
   * skills and upgrade panels render theirs (#356). Cleared alongside the armed
   * slot whenever the board stops being interactable.
   */
  private boardNotice: string | null = null;

  constructor(private readonly host: BoardInputHost) {}

  /**
   * Drop any armed slot and its notice. Called on load, because arming belongs to
   * the journey that was in progress rather than to the run.
   */
  reset(): void {
    this.armedContractId = null;
    this.boardNotice = null;
  }

  /** The armed slot, for the e2e hook. */
  armed(): string | null {
    return this.armedContractId;
  }

  /**
   * Whether the contract board is currently on screen and interactable. The
   * single source of truth for both drawing the board (refresh) and accepting a
   * digit (handleInput): the two drifted apart before, letting a number key
   * accept a contract hidden behind an overlay (#292 for the journal/skills case,
   * #316 for the summary/capstone case). Dialogue is not checked here because
   * update() early-returns while it is open.
   */
  interactable(): boolean {
    const hud = this.host.getHud();
    return boardInteractable({
      hasActiveContract: this.host.hasActiveContract(),
      atHome: this.host.atHome(),
      capstoneVisible: this.host.capstoneVisible(),
      summaryVisible: hud.isSummaryVisible(),
      blockingOverlayOpen: hud.isBlockingOverlayOpen(),
    });
  }

  handleInput(): void {
    if (!this.interactable()) {
      // Off the board, so drop any armed contract: a digit pressed on the next
      // visit should arm afresh, not accept a contract from a stale board. The
      // notice goes with it, so a fresh visit never opens on a stale refusal.
      this.armedContractId = null;
      this.boardNotice = null;
      return;
    }
    const list = this.host.boardContracts();
    const keys = this.host.getNumberKeys();
    const reputation = this.host.reputation();
    for (let i = 0; i < keys.length && i < list.length; i++) {
      const key = keys[i];
      const contract = list[i];
      if (key === undefined || contract === undefined) {
        continue;
      }
      if (this.host.justDown(key)) {
        if (!canAccept(contract, reputation)) {
          this.armedContractId = null;
          this.boardNotice = `${contract.title} needs ${contract.minReputation} reputation.`;
          this.host.getAudio().panelRefused();
          this.refresh();
          return;
        }
        if (this.armedContractId === contract.id) {
          // Confirmed: the same slot pressed twice in a row.
          this.armedContractId = null;
          this.boardNotice = null;
          this.host.acceptContract(contract);
        } else {
          // First press: arm this contract, so a mispressed remembered digit is
          // caught before it commits the journey (#321). The prompt is drawn on
          // the board rather than toasted: the board is already on screen naming
          // the slot, and a toast made the player dismiss a question they had
          // just answered, costing a press per accept under the #327 queue (#376).
          this.armedContractId = contract.id;
          this.boardNotice = null;
          this.host.getAudio().boardArmed();
          this.refresh();
        }
        return;
      }
    }
  }

  refresh(): void {
    const hud = this.host.getHud();
    const region = this.host.getRegion();
    // The end-of-arc finale owns the screen; keep the home board from showing
    // through it (the courier is at the home town when the blockade breaks).
    // The board also yields to any blocking overlay (journal/skills/codex) or the
    // run summary, so only one overlay shows at a time (D1 reserved region, #149).
    // It likewise yields to an open dialogue (E at a settlement), so the
    // postmaster conversation does not overlap the board (#181). interactable()
    // carries every condition but dialogue, which only refresh() needs (input is
    // already gated by update()'s early return while dialogue is open).
    const show = this.interactable() && !hud.isDialogueVisible();
    if (!show) {
      hud.setBoard(null);
      return;
    }
    hud.setBoard(
      boardText({
        homeName: region.settlements[region.home]?.name ?? region.home,
        contracts: this.host.boardContracts(),
        reputation: this.host.reputation(),
        worldStatus: this.host.worldState(),
        armedContractId: this.armedContractId,
        notice: this.boardNotice,
      }),
    );
  }
}
