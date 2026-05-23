import { describe, it, expect } from "vitest";
import {
  getRenovationScaleMultiplier,
  scaleRenovationCost,
  scaleRenovationRent,
  scaleRenovationValue,
  scaleRenovationForProperty,
  applyCeilingDiminishingReturns,
  getConversionScaleMultiplier,
  canUpgradeToPremium,
  isDeductibleRevenueRenovation,
  isFullyUpgraded,
  RENOVATION_EXPECTED_MULTIPLIER,
  CONVERSION_EXPECTED_MULTIPLIER,
} from "./renovation";

describe("getRenovationScaleMultiplier", () => {
  it("returns ~1.0 at reference 900 sqft / £150k", () => {
    expect(getRenovationScaleMultiplier({ internalSqft: 900, propertyValue: 150_000 })).toBeCloseTo(1.0, 5);
  });
  it("scales sublinearly with sqft (4× sqft → ~2× cost)", () => {
    const m = getRenovationScaleMultiplier({ internalSqft: 3_600, propertyValue: 150_000 });
    expect(m).toBeGreaterThan(1.8);
    expect(m).toBeLessThan(2.2);
  });
  it("clamps to [0.5, 4.0]", () => {
    expect(getRenovationScaleMultiplier({ internalSqft: 50, propertyValue: 10_000 })).toBeGreaterThanOrEqual(0.5);
    expect(getRenovationScaleMultiplier({ internalSqft: 20_000, propertyValue: 50_000_000 })).toBeLessThanOrEqual(4.0);
  });
  it("falls back to reference when inputs are missing/zero", () => {
    expect(getRenovationScaleMultiplier({ internalSqft: 0, propertyValue: 0 })).toBeCloseTo(1.0, 5);
  });
});

describe("scaled helpers round consistently", () => {
  const inputs = { internalSqft: 1_200, propertyValue: 200_000 };
  it("cost rounds to nearest £50", () => {
    expect(scaleRenovationCost(5_175, inputs) % 50).toBe(0);
  });
  it("rent rounds to nearest £5", () => {
    expect(scaleRenovationRent(73, inputs) % 5).toBe(0);
  });
  it("value rounds to nearest £100", () => {
    expect(scaleRenovationValue(5_175, inputs) % 100).toBe(0);
  });
});

describe("scaleRenovationForProperty — single source of truth (Phase 1 cost parity)", () => {
  const inputs = { internalSqft: 900, propertyValue: 150_000 };

  it("non-conversion reno equals scaleRenovationCost output (no double-scaling)", () => {
    const r = { id: "kitchen_upgrade", cost: 8_000, rentIncrease: 75, valueIncrease: 12_000, category: "improvement" };
    const scaled = scaleRenovationForProperty(r, inputs);
    expect(scaled.cost).toBe(scaleRenovationCost(8_000, inputs));
    expect(scaled.rent).toBe(scaleRenovationRent(75, inputs));
    expect(scaled.value).toBe(scaleRenovationValue(12_000, inputs));
    expect(scaled.conversionMult).toBe(1);
  });

  it("conversion with default units returns conversionMult ≈ 1", () => {
    const r = { id: "convert_hmo", cost: 25_000, rentIncrease: 300, valueIncrease: 30_000, category: "conversion", subtypeUnits: 4 };
    const scaled = scaleRenovationForProperty(r, inputs);
    expect(scaled.conversionMult).toBeCloseTo(1, 5);
  });

  it("more HMO rooms increases cost vs default", () => {
    const base = { id: "convert_hmo", cost: 25_000, rentIncrease: 300, valueIncrease: 30_000, category: "conversion" };
    const four = scaleRenovationForProperty({ ...base, subtypeUnits: 4 }, inputs);
    const eight = scaleRenovationForProperty({ ...base, subtypeUnits: 8 }, inputs);
    expect(eight.cost).toBeGreaterThan(four.cost);
    expect(eight.rent).toBeGreaterThan(four.rent);
  });

  it("more flats increases cost vs default", () => {
    const base = { id: "convert_flats", cost: 40_000, rentIncrease: 500, valueIncrease: 60_000, category: "conversion" };
    const two = scaleRenovationForProperty({ ...base, subtypeUnits: 2 }, inputs);
    const four = scaleRenovationForProperty({ ...base, subtypeUnits: 4 }, inputs);
    expect(four.cost).toBeGreaterThan(two.cost);
  });
});

describe("applyCeilingDiminishingReturns", () => {
  it("returns full uplift when no ceiling", () => {
    const r = applyCeilingDiminishingReturns(10_000, 100_000, 0);
    expect(r.uplift).toBe(10_000);
    expect(r.diminishingFactor).toBe(1);
  });
  it("returns 1.0 factor below 75% of ceiling", () => {
    const r = applyCeilingDiminishingReturns(10_000, 100_000, 200_000);
    expect(r.diminishingFactor).toBe(1);
  });
  it("tapers between 75-100% of ceiling", () => {
    const r = applyCeilingDiminishingReturns(10_000, 175_000, 200_000);
    expect(r.diminishingFactor).toBeLessThan(1);
    expect(r.diminishingFactor).toBeGreaterThan(0.35);
  });
  it("never drops below 0.35 floor", () => {
    const r = applyCeilingDiminishingReturns(10_000, 250_000, 200_000);
    expect(r.diminishingFactor).toBeGreaterThanOrEqual(0.35);
  });
});

describe("getConversionScaleMultiplier", () => {
  it("HMO scales with rooms", () => {
    const four = getConversionScaleMultiplier({ propertyValue: 150_000, subtype: "hmo", units: 4 });
    const six = getConversionScaleMultiplier({ propertyValue: 150_000, subtype: "hmo", units: 6 });
    expect(six).toBeGreaterThan(four);
  });
  it("flats scales linearly upward", () => {
    const two = getConversionScaleMultiplier({ propertyValue: 150_000, subtype: "flats", units: 2 });
    const four = getConversionScaleMultiplier({ propertyValue: 150_000, subtype: "flats", units: 4 });
    expect(four).toBeGreaterThan(two);
  });
  it("clamps within [0.5, 7.0]", () => {
    const huge = getConversionScaleMultiplier({ propertyValue: 50_000_000, subtype: "hmo", units: 20 });
    expect(huge).toBeLessThanOrEqual(7.0);
  });
});

describe("ROI expectation constants", () => {
  it("renovation expected multiplier ≈ 0.92 (Phase 1 recalibration target)", () => {
    expect(RENOVATION_EXPECTED_MULTIPLIER).toBeGreaterThanOrEqual(0.9);
    expect(RENOVATION_EXPECTED_MULTIPLIER).toBeLessThanOrEqual(1.0);
  });
  it("conversion expected multiplier > 1 (profitable on average)", () => {
    expect(CONVERSION_EXPECTED_MULTIPLIER).toBeGreaterThan(1);
  });
});

describe("upgrade eligibility", () => {
  it("non-standard properties can't be upgraded to premium", () => {
    expect(canUpgradeToPremium({ condition: "premium" })).toBe(false);
    expect(canUpgradeToPremium({ condition: "dilapidated" })).toBe(false);
  });
  it("standard property with remaining upgrades is eligible", () => {
    expect(canUpgradeToPremium({ condition: "standard", completedRenovationIds: ["kitchen_upgrade"] })).toBe(true);
  });
  it("planning cooldown blocks eligibility", () => {
    expect(canUpgradeToPremium({ condition: "standard", hasPlanningCooldown: true })).toBe(false);
  });
  it("isFullyUpgraded true only when ALL premium-upgrade renos done", () => {
    expect(isFullyUpgraded(["kitchen_upgrade", "bathroom_renovation", "central_heating", "double_glazing"])).toBe(true);
    expect(isFullyUpgraded(["kitchen_upgrade"])).toBe(false);
  });
});

describe("isDeductibleRevenueRenovation", () => {
  it("maintenance and improvement are deductible; extensions/conversions are capital", () => {
    expect(isDeductibleRevenueRenovation("maintenance")).toBe(true);
    expect(isDeductibleRevenueRenovation("improvement")).toBe(true);
    expect(isDeductibleRevenueRenovation("extension")).toBe(false);
    expect(isDeductibleRevenueRenovation("conversion")).toBe(false);
  });
});
