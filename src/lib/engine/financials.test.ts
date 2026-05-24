import { describe, it, expect } from "vitest";
import {
  calculateStampDuty,
  calculateDTI,
  getFurnitureValuePennies,
  getFurnishingCostPerSqft,
  getPropertyValueRangeForLevel,
  getRequiredNetWorth,
  fluctuateProviderRates,
  getInitialProviderRates,
} from "./financials";
import { toPennies } from "@/lib/formatCurrency";

describe("calculateStampDuty", () => {
  it("returns 0 below £40k threshold", () => {
    expect(calculateStampDuty(toPennies(39_000))).toBe(0);
  });
  it("charges 3% in the first band", () => {
    // £100k → (100k-40k)*3% = £1,800
    expect(calculateStampDuty(toPennies(100_000))).toBe(toPennies(1_800));
  });
  it("stacks bands correctly at £300k", () => {
    // (250-40)*3% + (300-250)*8% = 6,300 + 4,000 = 10,300
    expect(calculateStampDuty(toPennies(300_000))).toBe(toPennies(10_300));
  });
  it("never returns negative", () => {
    expect(calculateStampDuty(0)).toBe(0);
  });
});

describe("calculateDTI", () => {
  const props = [{ id: "p1", monthlyIncome: 100_000 } as any];
  const tenants = [{ propertyId: "p1" } as any];
  it("returns 0 when no debt", () => {
    expect(calculateDTI([], props, tenants)).toBe(0);
  });
  it("returns 999 sentinel when income is 0 but debt exists", () => {
    expect(calculateDTI([{ monthlyPayment: 50_000 } as any], [], [])).toBe(999);
  });
  it("computes ratio correctly", () => {
    const m = [{ monthlyPayment: 50_000 } as any];
    expect(calculateDTI(m, props, tenants)).toBeCloseTo(0.5, 5);
  });
  it("excludes income from vacant properties", () => {
    const m = [{ monthlyPayment: 50_000 } as any];
    expect(calculateDTI(m, props, [])).toBe(999);
  });
});

describe("getFurnitureValuePennies", () => {
  it("returns 0 for unfurnished", () => {
    expect(getFurnitureValuePennies({ furnishingTier: "unfurnished" })).toBe(0);
  });
  it("returns 0 when fully depreciated", () => {
    expect(getFurnitureValuePennies({
      furnishingTier: "fully_furnished", internalSqft: 800, furnishingMonthsRemaining: 0,
    })).toBe(0);
  });
  it("depreciates linearly to half at 30 months remaining", () => {
    // Phase 2 #4: fully_furnished = £5/sqft. 800 sqft × £5 = £4,000 install → half = £2,000.
    const v = getFurnitureValuePennies({
      furnishingTier: "fully_furnished", internalSqft: 800, furnishingMonthsRemaining: 30,
    });
    expect(v).toBe(toPennies(2_000));
  });
  it("is full install value at 60 months remaining", () => {
    const v = getFurnitureValuePennies({
      furnishingTier: "part_furnished", internalSqft: 800, furnishingMonthsRemaining: 60,
    });
    expect(v).toBe(toPennies(800 * 2));
  });
  it("uses default 800 sqft when missing", () => {
    expect(getFurnitureValuePennies({
      furnishingTier: "fully_furnished", furnishingMonthsRemaining: 60,
    })).toBe(toPennies(800 * 5));
  });
});

describe("getFurnishingCostPerSqft", () => {
  it("returns £0 unfurnished, £2 part, £5 full (Phase 2 #4 — 30% of legacy)", () => {
    expect(getFurnishingCostPerSqft("unfurnished")).toBe(0);
    expect(getFurnishingCostPerSqft("part_furnished")).toBe(2);
    expect(getFurnishingCostPerSqft("fully_furnished")).toBe(5);
  });
});

describe("level progression", () => {
  it("level 1 caps at £100k", () => {
    expect(getPropertyValueRangeForLevel(1).max).toBe(toPennies(100_000));
  });
  it("level 10 caps at £30M", () => {
    expect(getPropertyValueRangeForLevel(10).max).toBe(toPennies(30_000_000));
  });
  it("net worth requirement doubles per level above 2", () => {
    expect(getRequiredNetWorth(2)).toBe(toPennies(250_000));
    expect(getRequiredNetWorth(3)).toBe(toPennies(500_000));
    expect(getRequiredNetWorth(4)).toBe(toPennies(1_000_000));
  });
});

describe("fluctuateProviderRates", () => {
  it("keeps every provider within ±1.5% of base", () => {
    const initial = getInitialProviderRates();
    let rates = initial;
    for (let i = 0; i < 200; i++) rates = fluctuateProviderRates(rates);
    for (const id of Object.keys(initial)) {
      expect(rates[id]).toBeGreaterThanOrEqual(initial[id] - 0.0151);
      expect(rates[id]).toBeLessThanOrEqual(initial[id] + 0.0151);
      expect(rates[id]).toBeGreaterThanOrEqual(0.01);
    }
  });
});
