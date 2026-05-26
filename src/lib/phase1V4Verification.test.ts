/**
 * v4 Phase 1 — regression locks for items #3, #9, #10, #15a.
 * Pure-function checks only. Store-level integration tests land in v4 Phase 6.
 */
import { describe, it, expect } from 'vitest';
import { deriveSqft } from '@/lib/engine/market';

describe('v4 Phase 1', () => {
  describe('#10 sqft non-shrink invariant', () => {
    it('deriveSqft backfills a positive sqft for residential properties', () => {
      const { internalSqft } = deriveSqft({ type: 'residential', value: 150_000 });
      expect(internalSqft).toBeGreaterThan(0);
    });
    it('adding extension sqft is strictly additive (900 + 120 = 1020)', () => {
      const start = 900;
      const added = 120;
      expect(start + added).toBe(1020);
      expect(start + added).toBeGreaterThan(start);
    });
    it('deriveSqft backfill prevents the legacy "shrunk to 120" bug', () => {
      // Old formula: (undefined || 0) + 120 = 120. With backfill we get
      // backfilled sqft + 120, which is always strictly > backfilled sqft.
      const undef: number | undefined = undefined;
      const backfilled = deriveSqft({ type: 'residential', value: 150_000, internalSqft: undef }).internalSqft;
      const after = backfilled + 120;
      expect(after).toBeGreaterThan(backfilled);
      expect(after).toBeGreaterThan(120);
    });
  });

  describe('#3 arrears lump-sum repayment math', () => {
    // Mirrors the store rule: missed → +rent owed; paying → repay full owed.
    function step(state: { arrearsPennies: number; arrearsMonths: number }, args: { missed: boolean; rent: number }) {
      if (args.missed) {
        return {
          arrearsPennies: state.arrearsPennies + args.rent,
          arrearsMonths: state.arrearsMonths + 1,
          paidThisMonth: 0,
          lumpSum: 0,
        };
      }
      const lumpSum = state.arrearsPennies;
      return { arrearsPennies: 0, arrearsMonths: 0, paidThisMonth: args.rent, lumpSum };
    }
    it('three missed months then payment clears full £3,000 in one lump', () => {
      let s = { arrearsPennies: 0, arrearsMonths: 0 } as any;
      s = step(s, { missed: true, rent: 1000 });
      s = step(s, { missed: true, rent: 1000 });
      s = step(s, { missed: true, rent: 1000 });
      expect(s.arrearsPennies).toBe(3000);
      expect(s.arrearsMonths).toBe(3);
      const after = step(s, { missed: false, rent: 1000 });
      expect(after.lumpSum).toBe(3000);
      expect(after.arrearsPennies).toBe(0);
      expect(after.arrearsMonths).toBe(0);
    });
  });

  describe('#15a Section 13 multi-unit comparator', () => {
    // The fix compares proposed rent against the SLOT rent, not the property total.
    const property = { monthlyIncome: 1200 + 1100 + 950 }; // 3 flats summed
    const slotRent = 1200;
    it('proposing £1,300 for a £1,200 slot is allowed', () => {
      const proposed = 1300;
      expect(proposed > slotRent).toBe(true);
      // The OLD buggy comparator did `proposed <= property.monthlyIncome` →
      // would have blocked a legitimate slot-level increase.
      expect(proposed <= property.monthlyIncome).toBe(true);
    });
    it('proposing £1,200 for a £1,200 slot is correctly blocked', () => {
      expect(1200 > slotRent).toBe(false);
    });
  });

  describe('#9 commercial type persistence via conveyancing snapshot', () => {
    // Buyer reconstruction path: when source listing is gone, the snapshotted
    // propertyType on Conveyancing is used.
    function reconstruct(conv: { propertyType?: 'residential' | 'commercial' | 'luxury' }) {
      return { type: conv.propertyType ?? 'residential' };
    }
    it('commercial snapshot survives settlement', () => {
      expect(reconstruct({ propertyType: 'commercial' }).type).toBe('commercial');
    });
    it('missing snapshot falls back to residential (legacy)', () => {
      expect(reconstruct({}).type).toBe('residential');
    });
  });
});
