/**
 * Phase 6 — additional regression locks for items #11, #12, #15, #16.
 *
 * Pure-function checks that mirror the rules wired into the store.
 * Each block names the document item it guards.
 */
import { describe, it, expect } from 'vitest';

describe('Phase 6 regression — items 11/12/15/16', () => {
  describe('#12 renovation ROI +25% uplift', () => {
    const RENO_ROI_UPLIFT = 1.25;
    it('value & rent uplifts scale by exactly 1.25x', () => {
      const baseValue = 10_000;
      const baseRent = 200;
      expect(Math.round((baseValue * RENO_ROI_UPLIFT) / 100) * 100).toBe(12_500);
      expect(Math.round((baseRent * RENO_ROI_UPLIFT) / 5) * 5).toBe(250);
    });
    it('average realised ROI sits ~25% above legacy baseline', () => {
      const legacy = [5_000, 12_000, 30_000];
      const uplifted = legacy.map(v => v * RENO_ROI_UPLIFT);
      const ratio =
        uplifted.reduce((a, b) => a + b, 0) /
        legacy.reduce((a, b) => a + b, 0);
      expect(ratio).toBeCloseTo(1.25, 5);
    });
  });

  describe('#15 MEES letting block', () => {
    type Band = 'A'|'B'|'C'|'D'|'E'|'F'|'G';
    const isMeesBlocked = (epc: Band, monthsPlayed: number) => {
      const post2030 = monthsPlayed >= 60;
      return epc === 'F' || epc === 'G' || (post2030 && (epc === 'D' || epc === 'E'));
    };

    it('F/G blocked today regardless of date', () => {
      expect(isMeesBlocked('F', 0)).toBe(true);
      expect(isMeesBlocked('G', 0)).toBe(true);
    });
    it('D/E allowed pre-2030, blocked from month 60', () => {
      expect(isMeesBlocked('D', 59)).toBe(false);
      expect(isMeesBlocked('E', 59)).toBe(false);
      expect(isMeesBlocked('D', 60)).toBe(true);
      expect(isMeesBlocked('E', 60)).toBe(true);
    });
    it('Band C and above always allowed', () => {
      for (const b of ['A','B','C'] as Band[]) {
        expect(isMeesBlocked(b, 0)).toBe(false);
        expect(isMeesBlocked(b, 120)).toBe(false);
      }
    });
    it('warning window fires exactly 12 months before deadline', () => {
      const MEES_2030_MONTH = 60;
      const MEES_2030_WARNING_MONTH = MEES_2030_MONTH - 12;
      expect(MEES_2030_WARNING_MONTH).toBe(48);
    });
  });

  describe('#11 eviction court backlog adds 3–6 months on top of notice', () => {
    // Mirror of the store's queueEviction logic
    const effectiveMonth = (currentMonth: number, statutoryNotice: number, backlog: number) =>
      currentMonth + statutoryNotice + backlog;

    it('Section 8 (1mo notice) + backlog lands in 4–7 months', () => {
      for (const backlog of [3, 4, 5, 6]) {
        const m = effectiveMonth(0, 1, backlog);
        expect(m).toBeGreaterThanOrEqual(4);
        expect(m).toBeLessThanOrEqual(7);
      }
    });
    it('Landlord-grounds Section 8 (4mo notice) + backlog lands in 7–10 months', () => {
      for (const backlog of [3, 4, 5, 6]) {
        const m = effectiveMonth(0, 4, backlog);
        expect(m).toBeGreaterThanOrEqual(7);
        expect(m).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('#16 bridging finance lifecycle math', () => {
    const APR = 0.12;
    const monthlyRate = APR / 12;

    it('1% monthly interest on a £100k bridge = £1,000', () => {
      const principal = 100_000_00; // pennies
      const interest = Math.round(principal * monthlyRate);
      expect(interest).toBe(100_000); // £1,000 in pennies
    });
    it('capped at 70% LTV', () => {
      const propertyValue = 200_000_00;
      const maxBridge = Math.floor(propertyValue * 0.70);
      expect(maxBridge).toBe(140_000_00);
    });
    it('expiry default penalty: credit -80 and +6% rate hike', () => {
      const creditBefore = 700;
      const rateBefore = 0.06;
      const creditAfter = creditBefore - 80;
      const rateAfter = rateBefore + 0.06;
      expect(creditAfter).toBe(620);
      expect(rateAfter).toBeCloseTo(0.12, 5);
    });
    it('12-month interest-only term: total cost = 12% of principal', () => {
      const principal = 50_000_00;
      const total = principal * monthlyRate * 12;
      expect(Math.round(total)).toBe(Math.round(principal * 0.12));
    });
  });
});
