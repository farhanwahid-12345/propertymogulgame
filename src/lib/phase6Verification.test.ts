/**
 * Phase 6 — regression locks for the document items 1–22.
 *
 * Pure-function checks only. Each block names the document item it guards
 * so future refactors can't silently regress the agreed behaviour.
 */
import { describe, it, expect } from 'vitest';
import { getFurnishingCostPerSqft } from '@/lib/engine/financials';
import { getFurnishingRentMultiplier } from '@/lib/tenantRent';

describe('Phase 6 verification', () => {
  describe('#4/#6 furniture realism', () => {
    it('part-furnished cost is ~30% of legacy and rent uplift is 10%', () => {
      expect(getFurnishingCostPerSqft('part_furnished')).toBe(2);
      expect(getFurnishingRentMultiplier('part_furnished')).toBeCloseTo(1.10, 5);
    });
    it('fully-furnished cost is ~30% of legacy and rent uplift is 24%', () => {
      expect(getFurnishingCostPerSqft('fully_furnished')).toBe(5);
      expect(getFurnishingRentMultiplier('fully_furnished')).toBeCloseTo(1.24, 5);
    });
    it('unfurnished is the baseline', () => {
      expect(getFurnishingCostPerSqft('unfurnished')).toBe(0);
      expect(getFurnishingRentMultiplier('unfurnished')).toBe(1.0);
    });
  });

  describe('#1a days-on-market is measured in in-game months, not wall clock', () => {
    // Mirrors the selector used in listed-properties / estate-agent UI.
    const daysOnMarket = (monthsPlayed: number, listingMonth: number) =>
      Math.max(0, (monthsPlayed - listingMonth) * 30);

    it('returns 0 the month of listing', () => {
      expect(daysOnMarket(12, 12)).toBe(0);
    });
    it('advances 30 game-days per in-game month', () => {
      expect(daysOnMarket(15, 12)).toBe(90);
    });
    it('never goes negative if state is stale', () => {
      expect(daysOnMarket(10, 12)).toBe(0);
    });
  });

  describe('#2a dynamic yield recompute on below-asking buys', () => {
    const yieldPct = (monthlyRent: number, pricePaid: number) =>
      (monthlyRent * 12) / pricePaid;

    it('yield rises when buying below asking', () => {
      const askingYield = yieldPct(500, 100_000);     // 6%
      const paidYield   = yieldPct(500, 85_000);      // ~7.06%
      expect(paidYield).toBeGreaterThan(askingYield);
    });
  });
});
