import { describe, it, expect } from "vitest";
import { AVAILABLE_PROPERTIES, expectedResidentialYieldPct, RESIDENTIAL_YIELD_FLOOR_PCT } from "./constants";
import { generateRandomProperty, generateMarketProperty } from "./market";
import { calcTenantRent } from "@/lib/tenantRent";
import { toPennies } from "@/lib/formatCurrency";
import { CITY_IDS } from "./cities";

const quoted = (p: { monthlyIncome: number; price: number }) => (p.monthlyIncome * 12 / p.price) * 100;

describe("price → yield curve", () => {
  it("£50k home yields 11–13% (£458–£542/mo)", () => {
    const y = expectedResidentialYieldPct(toPennies(50_000));
    expect(y).toBeGreaterThanOrEqual(11);
    expect(y).toBeLessThanOrEqual(13);
    const rent = 50_000 * y / 100 / 12;
    expect(rent).toBeGreaterThanOrEqual(458);
    expect(rent).toBeLessThanOrEqual(542);
  });
  it("yield falls as price rises but never below the floor", () => {
    let prev = Infinity;
    for (let v = 40_000; v <= 3_000_000; v += 10_000) {
      const y = expectedResidentialYieldPct(toPennies(v));
      expect(y).toBeLessThanOrEqual(prev);
      expect(y).toBeGreaterThanOrEqual(RESIDENTIAL_YIELD_FLOOR_PCT);
      prev = y;
    }
  });
});

describe("quoted yield always matches rent ÷ price", () => {
  it("starter stock", () => {
    for (const p of AVAILABLE_PROPERTIES) {
      expect(Math.abs(quoted(p) - (p.yield ?? 0))).toBeLessThan(0.05);
    }
  });
  it("starter residential stock follows the curve", () => {
    for (const p of AVAILABLE_PROPERTIES.filter(p => p.type !== "commercial")) {
      expect(Math.abs(quoted(p) - expectedResidentialYieldPct(p.price))).toBeLessThan(0.3);
    }
  });
  it("generated stock in every city", () => {
    for (const city of CITY_IDS) {
      for (let i = 0; i < 200; i++) {
        const p = i % 2 ? generateRandomProperty(5, city) : generateMarketProperty(5, city);
        expect(Math.abs(quoted(p) - p.yield!)).toBeLessThan(0.05);
        if (p.type !== "commercial" && !p.furnishingTier) {
          expect(Math.abs(quoted(p) - expectedResidentialYieldPct(p.price))).toBeLessThan(0.7);
        }
      }
    }
  });
});

describe("tenant profiles offer different rents", () => {
  it("premium > risky > standard > budget", () => {
    const r = (profile: any) => calcTenantRent(50_000, { profile }, "standard", "unfurnished");
    expect(r("premium")).toBeGreaterThan(r("risky"));
    expect(r("risky")).toBeGreaterThan(r("standard"));
    expect(r("standard")).toBeGreaterThan(r("budget"));
  });
});
