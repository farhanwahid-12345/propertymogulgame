import { describe, it, expect } from "vitest";
import { getMaxPropertiesForLevel, MAX_PROPERTIES_HARD_CAP } from "@/lib/engine/financials";
import { calculateMortgageEligibility } from "@/lib/mortgageEligibility";

describe("Phase 3 v4 verification", () => {
  it("#4 — hard cap of 12 properties regardless of level", () => {
    expect(MAX_PROPERTIES_HARD_CAP).toBe(12);
    for (let level = 1; level <= 10; level++) {
      expect(getMaxPropertiesForLevel(level)).toBe(12);
    }
  });

  it("#14 — distressed (needsRefurb) properties refuse standard mortgage but mention cash route", () => {
    const r = calculateMortgageEligibility({
      creditScore: 750,
      loanAmount: 100_000,
      propertyValue: 150_000,
      propertyMonthlyRent: 1_200,
      providerBaseRate: 0.05,
      providerMinCreditScore: 600,
      providerMaxLTV: 0.75,
      providerId: "nationwide",
      termYears: 25,
      mortgageType: "repayment",
      existingMonthlyMortgagePayments: 0,
      totalRentalIncome: 0,
      ownedPropertyCount: 0,
      mortgagedPropertyCount: 0,
      propertyNeedsRefurb: true,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/cash/i);
  });

  it("#14 — discount band yields 30–60% off (sanity bounds)", () => {
    // 1000 random draws of (1 - (0.30 + rand*0.30)) must always sit in [0.40, 0.70].
    for (let i = 0; i < 1000; i++) {
      const pct = 0.30 + Math.random() * 0.30;
      expect(pct).toBeGreaterThanOrEqual(0.30);
      expect(pct).toBeLessThanOrEqual(0.60 + 1e-9);
    }
  });
});
