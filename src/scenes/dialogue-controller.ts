// The conversation subsystem, extracted from MapScene: settlement talk, road
// encounters, the modal dialogue state machine, and encounter outcomes. It owns
// the conversation state (which dialogue, which node, the offered choices, the
// active encounter, and the last tile checked for encounters) and talks back to
// the scene through the narrow DialogueHost interface, so the scene no longer
// carries this whole subsystem inline.
//
// Behaviour is unchanged from when this lived in MapScene; this is a structural
// extraction. The scene delegates: update() calls handleTalk(), handleEncounters(),
// and (while a conversation is open) handleInput(); e2e state reads choiceLabels()
// and activeEncounterId().

import { dialogueForSettlement } from '../data/dialogue-content';
import { ENCOUNTERS } from '../data/encounters';
import { addCoins, addReputation, type Ledger } from '../systems/economy';
import {
  startDialogue,
  availableChoices,
  chooseOption,
  getNode,
  END_DIALOGUE,
  type Dialogue,
  type DialogueChoice,
  type StoryFlags,
} from '../systems/dialogue';
import {
  pickEncounter,
  outcomeForFlag,
  type RoadEncounter,
  type EncounterOutcome,
} from '../systems/encounter-system';
import { settlementAtTileIn, type Region } from '../systems/region-system';
import type { MapHud } from './map-hud';

/** The services the dialogue controller needs from its host scene. */
export interface DialogueHost {
  getHud(): MapHud;
  getRegion(): Region;
  courierTile(): { readonly x: number; readonly y: number };
  /** Persisted story flags plus flags derived from the live world. */
  effectiveFlags(): StoryFlags;
  /** The persisted story flags only (what a choice mutates). */
  getStoryFlags(): StoryFlags;
  setStoryFlags(flags: StoryFlags): void;
  getLedger(): Ledger;
  setLedger(ledger: Ledger): void;
  save(): void;
  refreshWallet(): void;
  /** Toast a story message and keep it in the journal's re-readable recent log. */
  logEvent(message: string): void;
  getTalkKey(): Phaser.Input.Keyboard.Key;
  getEscapeKey(): Phaser.Input.Keyboard.Key;
  getNumberKeys(): readonly Phaser.Input.Keyboard.Key[];
}

export class DialogueController {
  // The active conversation and where we are in it, or undefined when closed.
  private activeDialogue: Dialogue | undefined;
  private dialogueNodeId: string | undefined;
  // The choices currently offered, so a number key maps straight to a choice.
  private dialogueChoices: readonly DialogueChoice[] = [];
  // The road encounter currently playing, if the open conversation is one, so a
  // resolving choice can apply its coin or reputation outcome.
  private activeEncounter: RoadEncounter | undefined;
  // The tile the courier already occupied when encounters were last checked, so
  // an encounter fires once on entry and does not re-open every frame while the
  // wagon sits on the trigger (or immediately after the player steps away).
  private lastEncounterTile: { x: number; y: number } | undefined;

  constructor(private readonly host: DialogueHost) {}

  /** Labels of the choices offered on the current node (empty when closed). */
  choiceLabels(): readonly string[] {
    return this.dialogueChoices.map((c) => c.label);
  }

  /** Id of the road encounter currently playing, or null when none is open. */
  activeEncounterId(): string | null {
    return this.activeEncounter?.id ?? null;
  }

  /** Open the settlement NPC conversation on the E key when standing on one. */
  handleTalk(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.host.getTalkKey())) {
      return;
    }
    const tile = this.host.courierTile();
    const region = this.host.getRegion();
    const here = settlementAtTileIn(region, tile.x, tile.y);
    if (here === undefined) {
      return;
    }
    const dialogue = dialogueForSettlement(here.id);
    if (dialogue === undefined) {
      this.host.getHud().showToast(`No one in ${here.name} has much to say just now.`);
      return;
    }
    this.openDialogue(dialogue);
  }

  /**
   * Fire a road encounter when the courier reaches its trigger tile. Runs each
   * frame from update(). An encounter is checked once per tile the courier
   * enters (lastEncounterTile), so it opens on arrival and does not re-open
   * while the wagon sits on the tile or the instant the player steps away
   * without resolving it. Settlement tiles are skipped: those host NPC talk on
   * E, not drive-through events. The open conversation is modal, so the update
   * early-return suppresses further checks until it closes.
   */
  handleEncounters(): void {
    const tile = this.host.courierTile();
    if (this.lastEncounterTile?.x === tile.x && this.lastEncounterTile?.y === tile.y) {
      return;
    }
    this.lastEncounterTile = { x: tile.x, y: tile.y };
    const region = this.host.getRegion();
    if (settlementAtTileIn(region, tile.x, tile.y) !== undefined) {
      return;
    }
    const encounter = pickEncounter(ENCOUNTERS, {
      regionId: region.id,
      tile,
      flags: this.host.effectiveFlags(),
    });
    if (encounter === undefined) {
      return;
    }
    // Only mark the encounter active if its dialogue actually opened, so a
    // malformed dialogue cannot leave a stale activeEncounter that would then
    // apply outcomes to the next (settlement) conversation.
    if (this.openDialogue(encounter.dialogue)) {
      this.activeEncounter = encounter;
    }
  }

  /** While a conversation is open, take a numbered choice or step away with Esc. */
  handleInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.host.getEscapeKey())) {
      this.closeDialogue();
      return;
    }
    const numberKeys = this.host.getNumberKeys();
    for (let i = 0; i < numberKeys.length && i < this.dialogueChoices.length; i++) {
      const key = numberKeys[i];
      if (key !== undefined && Phaser.Input.Keyboard.JustDown(key)) {
        this.chooseDialogueOption(i);
        return;
      }
    }
  }

  /** Open a conversation. Returns false (without opening) if its start is dangling. */
  private openDialogue(dialogue: Dialogue): boolean {
    const start = startDialogue(dialogue);
    if (start === undefined) {
      return false;
    }
    this.activeDialogue = dialogue;
    this.dialogueNodeId = start.id;
    this.showDialogueNode();
    return true;
  }

  /** Render the current conversation node and remember its available choices. */
  private showDialogueNode(): void {
    const dialogue = this.activeDialogue;
    if (dialogue === undefined || this.dialogueNodeId === undefined) {
      this.closeDialogue();
      return;
    }
    const node = getNode(dialogue, this.dialogueNodeId);
    if (node === undefined) {
      this.closeDialogue();
      return;
    }
    this.dialogueChoices = availableChoices(node, this.host.effectiveFlags());
    this.host.getHud().setDialogue({
      speaker: node.speaker,
      text: node.text,
      choices: this.dialogueChoices.map((c) => c.label),
    });
  }

  private chooseDialogueOption(index: number): void {
    const choice = this.dialogueChoices[index];
    if (choice === undefined) {
      return;
    }
    // Apply set-flags to the persisted flags only, then persist immediately so
    // story progress survives a reload mid-conversation.
    const result = chooseOption(this.host.getStoryFlags(), choice);
    this.host.setStoryFlags(result.flags);
    // Apply any encounter outcome (coins, reputation) before persisting, so the
    // ledger change is saved in the same write as the resolution flag.
    this.applyEncounterOutcomes(choice);
    this.host.save();
    if (result.next === END_DIALOGUE) {
      this.closeDialogue();
      return;
    }
    this.dialogueNodeId = result.next;
    this.showDialogueNode();
  }

  private closeDialogue(): void {
    this.activeDialogue = undefined;
    this.dialogueNodeId = undefined;
    this.dialogueChoices = [];
    this.activeEncounter = undefined;
    this.host.getHud().setDialogue(null);
  }

  /**
   * Apply the coin and reputation outcomes of a choice that resolves the active
   * encounter. A choice may set several flags; only those that are outcome keys
   * of the active encounter take effect. The ledger clamps coins and reputation
   * at zero, so a toll never drives the wallet negative.
   */
  private applyEncounterOutcomes(choice: DialogueChoice): void {
    const encounter = this.activeEncounter;
    if (encounter === undefined || choice.set === undefined) {
      return;
    }
    for (const flag of choice.set) {
      const outcome = outcomeForFlag(encounter, flag);
      if (outcome !== undefined) {
        this.applyEncounterOutcome(outcome);
      }
    }
  }

  private applyEncounterOutcome(outcome: EncounterOutcome): void {
    const parts: string[] = [];
    if (outcome.coins !== undefined && outcome.coins !== 0) {
      // Report the coins actually moved, not the nominal amount: addCoins clamps
      // at zero, so a broke courier who pays a toll loses only what they have,
      // and the toast should say so rather than overstate the cost.
      const before = this.host.getLedger().coins;
      this.host.setLedger(addCoins(this.host.getLedger(), outcome.coins));
      const delta = this.host.getLedger().coins - before;
      if (delta !== 0) {
        parts.push(delta > 0 ? `+${delta} coins` : `${delta} coins`);
      }
    }
    if (
      outcome.reputationId !== undefined &&
      outcome.reputation !== undefined &&
      outcome.reputation !== 0
    ) {
      this.host.setLedger(
        addReputation(this.host.getLedger(), outcome.reputationId, outcome.reputation),
      );
      const name = this.host.getRegion().settlements[outcome.reputationId]?.name ?? outcome.reputationId;
      parts.push(`+${outcome.reputation} reputation with ${name}`);
    }
    this.host.refreshWallet();
    if (parts.length > 0) {
      const title = this.activeEncounter?.title;
      this.host.logEvent(title === undefined ? parts.join(', ') : `${title}: ${parts.join(', ')}`);
    }
  }
}
