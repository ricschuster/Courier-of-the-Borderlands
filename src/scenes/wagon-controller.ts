import {
  applyWear,
  conditionFraction,
  isLowCondition,
  isStranded,
  limpMultiplier,
  lowConditionWarning,
  maxConditionForLevel,
  repair,
  repairHelpText,
  rescue,
  WAGON_TUNING,
  type Difficulty,
  type LowConditionWarning,
  type WagonTuning,
} from '../systems/wagon-condition';
import type { WagonState } from './map-hud';

/**
 * The scene services the wagon needs. One member, because the condition rules
 * are already pure in `systems/wagon-condition.ts` and everything else this
 * cluster did was presentation the scene keeps.
 *
 * The maximum grows with courier level, which is derived from trip distance and
 * deliveries, so it cannot be cached here.
 */
export interface WagonHost {
  courierLevel: () => number;
}

/** What a repair press did, for the scene to narrate. */
export type RepairOutcome =
  | { readonly kind: 'already-full' }
  | { readonly kind: 'refused'; readonly help: string }
  | { readonly kind: 'repaired'; readonly condition: number; readonly max: number; readonly coins: number; readonly full: boolean };

/**
 * What a rescue press did. A tow is the scene's to perform.
 *
 * There is no refusal: the tow charges what the courier can pay (#432), so the
 * only press that does nothing is one made while not stranded.
 */
export type RescueOutcome =
  | { readonly kind: 'not-stranded' }
  | { readonly kind: 'towed'; readonly coins: number; readonly paid: number };

/**
 * Owns the wagon's condition, the difficulty profile that prices it, and the
 * session telemetry that tracks how hard the travel sink bit (ADR 0005).
 *
 * Extraction shape 2 (ADR 0009): all six fields are private here and the
 * controller is their only writer. The cluster scored 10 in the #392 survey, but
 * almost all of that coupling was *readers* rather than writers, so the scene
 * reads through accessors instead of holding the numbers.
 *
 * The decisions stay pure in `systems/wagon-condition.ts`. What lives here is
 * the state those rules read and write, plus the two places order matters:
 * wear must sample stranded-ness before and after to count the rising edge, and
 * the low-condition warning must not re-arm until a repair lifts it clear.
 */
export class WagonController {
  private condition_ = 0;
  /** Session telemetry: total condition lost to the travel sink (ADR 0005). */
  private wearTotal_ = 0;
  /** Rising edges into stranded, for balance telemetry. */
  private strands_ = 0;
  private difficulty_: Difficulty = 'standard';
  private tuning_: WagonTuning = WAGON_TUNING.standard;
  /** Latched so the low-condition toast fires once per dip, not every frame. */
  private lowWarned = false;

  constructor(private readonly host: WagonHost) {
    this.condition_ = maxConditionForLevel(1, this.tuning_);
  }

  /**
   * Apply a difficulty preset. Must run before the run is restored: a fresh game
   * derives its starting tank from this tuning, and a loaded condition is clamped
   * to the max it affords.
   */
  setDifficulty(difficulty: Difficulty): void {
    this.difficulty_ = difficulty;
    this.tuning_ = WAGON_TUNING[difficulty];
  }

  /** Adopt the condition from a restored run. */
  restore(condition: number): void {
    this.condition_ = condition;
  }

  difficulty(): Difficulty {
    return this.difficulty_;
  }

  tuning(): WagonTuning {
    return this.tuning_;
  }

  condition(): number {
    return this.condition_;
  }

  /** Current maximum, which grows with courier level. */
  max(): number {
    return maxConditionForLevel(this.host.courierLevel(), this.tuning_);
  }

  fraction(): number {
    return conditionFraction(this.condition_, this.max());
  }

  stranded(): boolean {
    return isStranded(this.condition_);
  }

  /** Speed multiplier while limping, 1 when the wagon is sound. */
  limp(): number {
    return limpMultiplier(this.condition_, this.tuning_);
  }

  /** Condition band, driving the HUD meter's fill colour (#182/#203). */
  state(): WagonState {
    if (isStranded(this.condition_)) {
      return 'stranded';
    }
    if (isLowCondition(this.condition_, this.max())) {
      return 'low';
    }
    return 'healthy';
  }

  wearTotal(): number {
    return this.wearTotal_;
  }

  strandEvents(): number {
    return this.strands_;
  }

  /**
   * Wear the wagon by `amount`, accumulating the session total and counting a
   * rising edge into stranded.
   *
   * The edge has to be sampled either side of the write, which is the reason
   * this is one call rather than the caller doing the arithmetic: a caller that
   * wrote the condition first would never see the transition.
   */
  wear(amount: number): void {
    const wasStranded = isStranded(this.condition_);
    const worn = applyWear(this.condition_, amount);
    this.wearTotal_ += this.condition_ - worn;
    this.condition_ = worn;
    if (!wasStranded && isStranded(this.condition_)) {
      this.strands_++;
    }
  }

  /**
   * Whether the low-condition toast should fire now, re-arming once a repair
   * lifts the wagon clear. Mutates the latch, so call it once per frame.
   */
  lowConditionAction(): LowConditionWarning {
    const action = lowConditionWarning(this.condition_, this.max(), this.lowWarned);
    if (action === 'warn') {
      this.lowWarned = true;
    } else if (action === 'rearm') {
      this.lowWarned = false;
    }
    return action;
  }

  /** Repair here, spending coins. Applies the new condition on success. */
  repairWith(coins: number): RepairOutcome {
    const max = this.max();
    if (this.condition_ >= max) {
      return { kind: 'already-full' };
    }
    const result = repair(this.condition_, coins, max, this.tuning_);
    if (!result.ok) {
      return { kind: 'refused', help: this.helpText(true) };
    }
    this.condition_ = result.condition;
    return {
      kind: 'repaired',
      condition: result.condition,
      max,
      coins: result.coins,
      full: result.full,
    };
  }

  /**
   * Pay to be towed home. Leaves the condition alone: the tow moves the wagon,
   * it does not mend it, so the player still has to buy a repair before setting
   * out. That is what closes the "live stranded to dodge repair cost" exploit.
   */
  rescueWith(coins: number): RescueOutcome {
    if (!isStranded(this.condition_)) {
      return { kind: 'not-stranded' };
    }
    // Never refuses: the tow takes what the courier has (#432).
    const result = rescue(coins, this.tuning_);
    return { kind: 'towed', coins: result.coins, paid: result.paid };
  }

  /** Guidance for a press that cannot pay for itself (#317). */
  helpText(atSettlement: boolean): string {
    return repairHelpText({
      atSettlement,
      condition: this.condition_,
      max: this.max(),
      tuning: this.tuning_,
    });
  }
}
