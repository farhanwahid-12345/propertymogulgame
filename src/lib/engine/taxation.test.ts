import { describe, it, expect } from "vitest";
import {
  calculateIncomeTax,
  calculateCorporationTax,
  calculateCGT,
  projectAnnualTax,
  getConditionRentMultiplier,
  getConditionValueUplift,
  getConditionUpgradeCost,
} from "./taxation";

const k = (pounds: number) => pounds * 100; // pounds → pennies

describe("calculateIncomeTax (sole trader, Section 24)", () => {
  it("zero income → zero tax", () => {
    const r = calculateIncomeTax(0, 0, 0);
    expect(r.effectiveTax).toBe(0);
  });

  it("income under personal allowance is untaxed", () => {
    const r = calculateIncomeTax(k(10_000), 0, 0);
    expect(r.effectiveTax).toBe(0);
  });

  it("applies 20% credit on mortgage interest", () => {
    // £30k rent, £8k interest, no expenses
    // Taxable = 30k − 0 (no expense deduction for interest) = 30k
    // Taxable after PA = 30k − 12.57k = 17,430
    // Basic tax = 17,430 * 0.20 = £3,486
    // Credit = 8k * 0.20 = £1,600
    // Effective = £1,886
    const r = calculateIncomeTax(k(30_000), k(8_000), 0);
    expect(r.section24Credit).toBe(k(1_600));
    expect(r.effectiveTax).toBe(k(3_486) - k(1_600));
  });

  it("section24 credit cannot push tax negative", () => {
    const r = calculateIncomeTax(k(13_000), k(50_000), 0);
    expect(r.effectiveTax).toBeGreaterThanOrEqual(0);
  });

  it("hits higher-rate band above £50,270", () => {
    const r = calculateIncomeTax(k(80_000), 0, 0);
    expect(r.higherBandTax).toBeGreaterThan(0);
  });
});

describe("calculateCorporationTax (LTD)", () => {
  it("deducts mortgage interest fully", () => {
    // Sole trader on same numbers would tax the gross; LTD shouldn't.
    const ltdTax = calculateCorporationTax(k(30_000), k(8_000), 0);
    // Profit = 22k → 19% → £4,180
    expect(ltdTax).toBe(k(4_180));
  });

  it("hits small profits rate ≤ £50k", () => {
    expect(calculateCorporationTax(k(40_000), 0, 0)).toBe(k(40_000 * 0.19));
  });

  it("hits main rate ≥ £250k", () => {
    expect(calculateCorporationTax(k(300_000), 0, 0)).toBe(k(300_000 * 0.25));
  });

  it("applies marginal relief between £50k and £250k", () => {
    const tax = calculateCorporationTax(k(100_000), 0, 0);
    // 100k*25% - (250k-100k)*3/200 = 25,000 - 2,250 = 22,750
    expect(tax).toBe(k(22_750));
  });

  it("zero or negative profit pays no tax", () => {
    expect(calculateCorporationTax(k(10_000), k(50_000), 0)).toBe(0);
  });
});

describe("calculateCGT", () => {
  it("LTD pays no CGT", () => {
    expect(calculateCGT(k(200_000), k(100_000), 0, "ltd")).toBe(0);
  });
  it("zero gain → zero tax", () => {
    expect(calculateCGT(k(100_000), k(100_000), 0, "sole_trader")).toBe(0);
  });
  it("applies £3k annual exemption then 24%", () => {
    // Gain = 50k - 3k exempt = 47k * 24% = 11,280
    expect(calculateCGT(k(150_000), k(100_000), 0, "sole_trader")).toBe(k(11_280));
  });
  it("improvement costs reduce the gain", () => {
    expect(calculateCGT(k(150_000), k(100_000), k(20_000), "sole_trader"))
      .toBe(calculateCGT(k(130_000), k(100_000), 0, "sole_trader"));
  });
});

describe("projectAnnualTax", () => {
  it("returns 0 when no rent", () => {
    expect(projectAnnualTax("sole_trader", 0, 0, 0)).toBe(0);
    expect(projectAnnualTax("ltd", 0, 0, 0)).toBe(0);
  });
  it("uses LTD path for ltd entity", () => {
    const ltd = projectAnnualTax("ltd", k(30_000), k(8_000), 0);
    expect(ltd).toBe(calculateCorporationTax(k(30_000), k(8_000), 0));
  });
  it("applies unused losses against sole-trader taxable income", () => {
    const noLoss = projectAnnualTax("sole_trader", k(40_000), k(5_000), 0, 0);
    const withLoss = projectAnnualTax("sole_trader", k(40_000), k(5_000), 0, k(10_000));
    expect(withLoss).toBeLessThan(noLoss);
  });
});

describe("condition multipliers", () => {
  it("rent multiplier ordering: dilapidated < standard < premium", () => {
    expect(getConditionRentMultiplier("dilapidated")).toBeLessThan(getConditionRentMultiplier("standard"));
    expect(getConditionRentMultiplier("standard")).toBeLessThan(getConditionRentMultiplier("premium"));
  });
  it("value uplift dilapidated→premium > standalone hops", () => {
    expect(getConditionValueUplift("dilapidated", "premium"))
      .toBeGreaterThan(getConditionValueUplift("dilapidated", "standard"));
  });
  it("upgrade cost scales with property value", () => {
    const c = getConditionUpgradeCost(100_000_00, "dilapidated", "premium");
    expect(c).toBe(22_000_00);
  });
});
