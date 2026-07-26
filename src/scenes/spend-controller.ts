// Spending, extracted from MapScene (#392): the number keys that turn banked
// skill points into ranks and coins into fitted upgrades, plus the two panels
// that report the result.
//
// The pair belongs together because they share `panelNotice`. A refusal here is
// feedback about the key just pressed, not news about the world, so it renders in
// the panel the player is already reading rather than as a toast (#356), which
// under the #327 queue would cost a dismiss press per refused key.
//
// This is the first slice to write state the rest of the scene reads: skill
// ranks, the coin ledger, and the fitted upgrade set. Those go back through host
// setters rather than being owned here, in the same shape as
// DialogueHost.setStoryFlags, because half the file reads them.
//
// No Phaser: the key check arrives through the host, so the spend and refusal
// rules are unit-testable (Phaser cannot be imported under the node test env).

import type Phaser from 'phaser';
import { SKILLS, availablePoints, canRankUp, rankUp, rankOf, type SkillRanks } from '../systems/skills';
import { levelProgress } from '../systems/experience';
import { purchase, type Upgrade } from '../systems/upgrade-system';
import { skillPanelText, upgradeMenuText } from '../systems/panel-text';
import type { MapHud } from './map-hud';
import type { Audio } from './audio';
import type { Juice } from './juice';

/** The services the spend controller needs from its host scene. */
export interface SpendHost {
  getHud(): MapHud;
  getAudio(): Audio;
  getJuice(): Juice;
  getNumberKeys(): readonly Phaser.Input.Keyboard.Key[];
  /** Whether this key was just pressed. Consumes the press, so call once per key. */
  justDown(key: Phaser.Input.Keyboard.Key): boolean;

  /** The upgrades this region's shop sells, in menu order. */
  upgradesForSale(): readonly Upgrade[];

  courierLevel(): number;
  /** Total experience, for the skill panel's level progress bar. */
  courierXp(): number;
  getSkills(): SkillRanks;
  setSkills(skills: SkillRanks): void;

  getCoins(): number;
  getPurchasedUpgrades(): ReadonlySet<string>;
  /** Commit a purchase: the new fitted set and the coins left. */
  applyPurchase(purchased: ReadonlySet<string>, coins: number): void;

  /**
   * A new rank or upgrade may grant a terrain capability (Off-road 2 and Marsh
   * Treads both open the deep mire), so open any tiles it now unlocks and let the
   * route be drivable at once.
   */
  refreshGatedColliders(): void;
  refreshWallet(): void;
  refreshAchievements(): void;
  save(): void;
}

export class SpendController {
  /**
   * Feedback about the last key pressed inside the skills panel or upgrade menu
   * (#356). These refusals can only fire while their panel is open, so they render
   * in the panel the player is already reading. Cleared when a panel opens, so a
   * fresh visit never starts on a stale complaint.
   */
  private notice: string | null = null;

  constructor(private readonly host: SpendHost) {}

  /** The current in-panel notice, for the e2e hook. */
  currentNotice(): string | null {
    return this.notice;
  }

  /** Clear the notice. Called by the panel input controller when a panel opens. */
  clearNotice(): void {
    this.notice = null;
  }

  /** Spend skill points while the skill panel is open (number keys rank skills). */
  handleSkillInput(): void {
    const hud = this.host.getHud();
    if (!hud.isSkillPanelVisible()) {
      return;
    }
    const level = this.host.courierLevel();
    const keys = this.host.getNumberKeys();
    for (let i = 0; i < SKILLS.length && i < keys.length; i++) {
      const key = keys[i];
      const skill = SKILLS[i];
      if (key === undefined || skill === undefined || !this.host.justDown(key)) {
        continue;
      }
      const skills = this.host.getSkills();
      if (canRankUp(skills, skill.id, level)) {
        const ranked = rankUp(skills, skill.id);
        this.host.setSkills(ranked);
        // The rank itself is real progress, so it stays a toast: the player will
        // want it in the journal's recent log, and it outlives the panel.
        hud.showToast(`${skill.name} improved to rank ${rankOf(ranked, skill.id)}.`);
        this.host.getAudio().skillRanked();
        this.notice = null;
        this.host.refreshGatedColliders();
        this.refreshSkillPanel();
        this.host.refreshWallet();
        this.host.save();
      } else {
        // A refusal is feedback about the key just pressed, not news about the
        // world, and the panel is on screen to carry it (#356).
        this.notice =
          availablePoints(level, skills) > 0
            ? `${skill.name} is already at its highest rank.`
            : 'No skill point banked yet. Deliver, explore, and cover ground to earn one.';
        this.host.getAudio().panelRefused();
        this.refreshSkillPanel();
      }
    }
  }

  /** Buy an upgrade by number key while the upgrade menu is open. */
  handleUpgradeInput(): void {
    if (!this.host.getHud().isUpgradeMenuVisible()) {
      return;
    }
    const upgrades = this.host.upgradesForSale();
    const keys = this.host.getNumberKeys();
    for (let i = 0; i < upgrades.length && i < keys.length; i++) {
      const key = keys[i];
      const upgrade = upgrades[i];
      if (key === undefined || upgrade === undefined || !this.host.justDown(key)) {
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
  buyUpgrade(upgrade: Upgrade): void {
    const hud = this.host.getHud();
    const audio = this.host.getAudio();
    const purchased = this.host.getPurchasedUpgrades();
    const coins = this.host.getCoins();

    if (purchased.has(upgrade.id)) {
      this.notice = `${upgrade.name} is already fitted.`;
      audio.panelRefused();
      this.refreshUpgradeMenu();
      return;
    }
    const result = purchase(purchased, coins, upgrade);
    if (!result.ok) {
      const short = upgrade.cost - coins;
      this.notice = `Not enough coins for ${upgrade.name}: ${upgrade.cost}c, ${short} short.`;
      audio.panelRefused();
      this.refreshUpgradeMenu();
      return;
    }
    this.host.applyPurchase(new Set(result.purchased), result.coins);
    this.notice = null;
    hud.showToast(`Fitted ${upgrade.name}. ${upgrade.description}`);
    this.host.getJuice().upgradeFitted();
    audio.upgradeFitted();
    this.host.refreshGatedColliders();
    this.host.refreshWallet();
    this.refreshUpgradeMenu();
    this.host.refreshAchievements();
    this.host.save();
  }

  refreshSkillPanel(): void {
    const prog = levelProgress(this.host.courierXp());
    this.host.getHud().setSkillText(
      skillPanelText({
        level: prog.level,
        xpIntoLevel: prog.xpIntoLevel,
        xpForNextLevel: prog.xpForNextLevel,
        points: availablePoints(prog.level, this.host.getSkills()),
        skills: SKILLS,
        ranks: this.host.getSkills(),
        notice: this.notice,
      }),
    );
  }

  refreshUpgradeMenu(): void {
    this.host.getHud().setUpgradeText(
      upgradeMenuText({
        coins: this.host.getCoins(),
        upgrades: this.host.upgradesForSale(),
        purchased: this.host.getPurchasedUpgrades(),
        notice: this.notice,
      }),
    );
  }
}
