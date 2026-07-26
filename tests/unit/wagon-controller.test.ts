import { describe, it, expect, beforeEach } from 'vitest';
import { WagonController, type WagonHost } from '../../src/scenes/wagon-controller';
import { WAGON_TUNING, maxConditionForLevel } from '../../src/systems/wagon-condition';

// The wagon cluster extracted from MapScene in #392. The condition rules
// themselves were already pure and covered in wagon-condition.test.ts; what is
// new here is the state those rules read and write, and the two places where
// ordering is the whole point:
//
//   - wear has to sample stranded-ness either side of the write, or the rising
//     edge into stranded is never counted;
//   - the low-condition warning latches, so it fires once on the way down rather
//     than every frame, and re-arms only after a repair lifts the wagon clear.
//
// Both were previously inline in the scene, where no unit test could reach them.

class FakeHost implements WagonHost {
  level = 1;
  courierLevel = (): number => this.level;
}

describe('WagonController', () => {
  let host: FakeHost;
  let wagon: WagonController;

  beforeEach(() => {
    host = new FakeHost();
    wagon = new WagonController(host);
  });

  describe('difficulty and capacity', () => {
    it('starts at the level-1 tank for the active difficulty', () => {
      expect(wagon.condition()).toBe(maxConditionForLevel(1, WAGON_TUNING.standard));
    });

    it('swaps the tuning profile with the preset', () => {
      wagon.setDifficulty('demanding');

      expect(wagon.difficulty()).toBe('demanding');
      expect(wagon.tuning()).toBe(WAGON_TUNING.demanding);
      // Demanding starts with a much smaller tank (16 against standard's larger).
      expect(wagon.max()).toBe(maxConditionForLevel(1, WAGON_TUNING.demanding));
    });

    it('grows the maximum with courier level, read live through the host', () => {
      const atLevelOne = wagon.max();
      host.level = 5;

      expect(wagon.max()).toBeGreaterThan(atLevelOne);
      expect(wagon.max()).toBe(maxConditionForLevel(5, WAGON_TUNING.standard));
    });
  });

  describe('wear', () => {
    it('accumulates the session telemetry total', () => {
      const before = wagon.condition();
      wagon.wear(3);

      expect(wagon.condition()).toBe(before - 3);
      expect(wagon.wearTotal()).toBe(3);

      wagon.wear(2);
      expect(wagon.wearTotal()).toBe(5);
    });

    // The reason wear is one call rather than arithmetic at the call site.
    it('counts the rising edge into stranded exactly once', () => {
      expect(wagon.strandEvents()).toBe(0);

      wagon.wear(wagon.condition());
      expect(wagon.stranded()).toBe(true);
      expect(wagon.strandEvents()).toBe(1);

      // Already at zero: wearing further must not count a second event, or the
      // telemetry reads one stranding per frame for as long as the player sits
      // there.
      wagon.wear(10);
      expect(wagon.strandEvents()).toBe(1);
    });

    it('counts a second stranding after a repair lifted it clear', () => {
      wagon.wear(wagon.condition());
      wagon.repairWith(1000);
      wagon.wear(wagon.condition());

      expect(wagon.strandEvents()).toBe(2);
    });

    it('never wears below zero', () => {
      wagon.wear(wagon.condition() + 50);
      expect(wagon.condition()).toBe(0);
    });
  });

  describe('the low-condition latch', () => {
    it('warns once on the way down, then holds', () => {
      // Down to a sliver, which is inside the low band for any tuning.
      wagon.wear(wagon.condition() - 1);

      expect(wagon.lowConditionAction()).toBe('warn');
      expect(wagon.lowConditionAction()).toBe('hold');
      expect(wagon.lowConditionAction()).toBe('hold');
    });

    it('re-arms after a repair lifts the wagon clear, and warns again', () => {
      wagon.wear(wagon.condition() - 1);
      expect(wagon.lowConditionAction()).toBe('warn');

      wagon.repairWith(1000);
      expect(wagon.lowConditionAction()).toBe('rearm');

      wagon.wear(wagon.condition() - 1);
      expect(wagon.lowConditionAction()).toBe('warn');
    });
  });

  describe('repair', () => {
    it('reports a sound wagon rather than charging for nothing', () => {
      expect(wagon.repairWith(1000)).toEqual({ kind: 'already-full' });
    });

    it('refuses when the coins cannot pay, and hands back guidance', () => {
      wagon.wear(5);
      const result = wagon.repairWith(0);

      expect(result.kind).toBe('refused');
      expect(result.kind === 'refused' && result.help.length).toBeGreaterThan(0);
      // A refused repair must not mend the wagon.
      expect(wagon.condition()).toBe(maxConditionForLevel(1, WAGON_TUNING.standard) - 5);
    });

    it('restores the wagon and reports the remaining coins', () => {
      const max = wagon.max();
      wagon.wear(5);
      const result = wagon.repairWith(1000);

      expect(result.kind).toBe('repaired');
      if (result.kind === 'repaired') {
        expect(result.full).toBe(true);
        expect(result.max).toBe(max);
        expect(result.coins).toBeLessThan(1000);
      }
      expect(wagon.condition()).toBe(max);
    });

    it('patches partway when the coins run out mid-repair', () => {
      wagon.wear(10);
      const worn = wagon.condition();
      // One percent's worth at the standard rate: enough to buy something, not
      // enough to buy a full repair.
      const result = wagon.repairWith(WAGON_TUNING.standard.costPerPercent);

      expect(result.kind).toBe('repaired');
      if (result.kind === 'repaired') {
        expect(result.full).toBe(false);
      }
      expect(wagon.condition()).toBeGreaterThan(worn);
      expect(wagon.condition()).toBeLessThan(wagon.max());
    });
  });

  describe('rescue', () => {
    it('does nothing when the wagon is not stranded', () => {
      expect(wagon.rescueWith(1000)).toEqual({ kind: 'not-stranded' });
    });

    it('refuses when the coins cannot pay the tow', () => {
      wagon.wear(wagon.condition());
      const result = wagon.rescueWith(0);

      expect(result.kind).toBe('refused');
      expect(result.kind === 'refused' && result.help.length).toBeGreaterThan(0);
    });

    // The exploit closure (#317 and the owner's "living stranded to dodge repair
    // cost" note): a tow moves the wagon, it does not mend it. A courier who
    // pays for the tow still has to buy a repair before setting out.
    it('takes the fee without mending the wagon, so the repair is still owed', () => {
      wagon.wear(wagon.condition());
      const result = wagon.rescueWith(1000);

      expect(result.kind).toBe('towed');
      if (result.kind === 'towed') {
        expect(result.coins).toBe(1000 - WAGON_TUNING.standard.rescueCost);
      }
      expect(wagon.condition()).toBe(0);
      expect(wagon.stranded()).toBe(true);
    });
  });

  describe('presentation reads', () => {
    it('bands the condition for the HUD meter', () => {
      expect(wagon.state()).toBe('healthy');

      wagon.wear(wagon.condition() - 1);
      expect(wagon.state()).toBe('low');

      wagon.wear(1);
      expect(wagon.state()).toBe('stranded');
    });

    it('reports a fraction of the live maximum, not of the absolute cap', () => {
      expect(wagon.fraction()).toBeCloseTo(1);

      wagon.wear(wagon.condition());
      expect(wagon.fraction()).toBe(0);
    });

    it('limps once stranded and runs clean when sound', () => {
      expect(wagon.limp()).toBe(1);

      wagon.wear(wagon.condition());
      expect(wagon.limp()).toBe(WAGON_TUNING.standard.limpSpeed);
    });
  });

  describe('restore', () => {
    it('adopts a loaded condition', () => {
      wagon.restore(7);
      expect(wagon.condition()).toBe(7);
    });
  });
});
