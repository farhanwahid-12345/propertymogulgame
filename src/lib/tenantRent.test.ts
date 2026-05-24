import { describe, it, expect } from "vitest";
import {
  getProfileRentMultiplier,
  getConditionRentMultiplierShared,
  getFurnishingRentMultiplier,
  calcTenantRent,
} from "./tenantRent";

describe("getProfileRentMultiplier", () => {
  it("premium > risky > standard > budget", () => {
    expect(getProfileRentMultiplier("premium")).toBeGreaterThan(getProfileRentMultiplier("risky"));
    expect(getProfileRentMultiplier("risky")).toBeGreaterThan(getProfileRentMultiplier("standard"));
    expect(getProfileRentMultiplier("standard")).toBeGreaterThan(getProfileRentMultiplier("budget"));
  });
});

describe("getFurnishingRentMultiplier", () => {
  it("fully furnished > part furnished > unfurnished", () => {
    expect(getFurnishingRentMultiplier("fully_furnished"))
      .toBeGreaterThan(getFurnishingRentMultiplier("part_furnished"));
    expect(getFurnishingRentMultiplier("part_furnished"))
      .toBeGreaterThan(getFurnishingRentMultiplier("unfurnished"));
  });
  it("defaults to 1.0 when undefined", () => {
    expect(getFurnishingRentMultiplier(undefined)).toBe(1);
  });
});

describe("calcTenantRent — preview/store parity", () => {
  it("matches manual product of multipliers", () => {
    const baseRent = 1_000;
    const expected = Math.floor(1_000 * 1.10 * 1.25 * 1.24); // premium tenant, premium condition, fully furnished (Phase 2 #6)
    expect(calcTenantRent(baseRent, { profile: "premium" }, "premium", "fully_furnished")).toBe(expected);
  });
  it("dilapidated drops below base rent", () => {
    expect(calcTenantRent(1_000, { profile: "standard" }, "dilapidated")).toBeLessThan(1_000);
  });
  it("unit-agnostic: scaling pennies and pounds yields same multiplier shape", () => {
    const a = calcTenantRent(1_000, { profile: "premium" }, "standard", "part_furnished");
    const b = calcTenantRent(100_000, { profile: "premium" }, "standard", "part_furnished");
    expect(b).toBeGreaterThan(a * 99); // ~100×
    expect(b).toBeLessThan(a * 101);
  });
});
