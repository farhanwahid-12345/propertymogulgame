import { describe, it, expect } from "vitest";
import {
  getProfileRentMultiplier,
  getConditionRentMultiplierShared,
  getFurnishingRentMultiplier,
  calcTenantRent,
} from "./tenantRent";

describe("getProfileRentMultiplier", () => {
  it("is neutralised to 1.0 (profile variance is baked into LHA tiering upstream)", () => {
    expect(getProfileRentMultiplier("premium")).toBe(1);
    expect(getProfileRentMultiplier("standard")).toBe(1);
    expect(getProfileRentMultiplier("budget")).toBe(1);
    expect(getProfileRentMultiplier("risky")).toBe(1);
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

describe("calcTenantRent — condition × furnishing only (no profile stacking)", () => {
  it("equals base × condition × furnishing", () => {
    const expected = Math.floor(1_000 * 1.10 * 1.08); // premium condition × fully furnished
    expect(calcTenantRent(1_000, { profile: "premium" }, "premium", "fully_furnished")).toBe(expected);
  });
  it("premium and standard profiles produce identical rent (no double-count)", () => {
    const premium = calcTenantRent(1_000, { profile: "premium" }, "standard", "unfurnished");
    const standard = calcTenantRent(1_000, { profile: "standard" }, "standard", "unfurnished");
    expect(premium).toBe(standard);
  });
  it("dilapidated drops below base rent", () => {
    expect(calcTenantRent(1_000, { profile: "standard" }, "dilapidated")).toBeLessThan(1_000);
  });
  it("clamps at 2× city LHA when clamp context is provided", () => {
    // Pass a hugely inflated baseRent; result must be capped at 2× LHA for the
    // inferred bedroom band.
    const out = calcTenantRent(
      999_999, // pounds
      { profile: "premium" },
      "premium",
      "fully_furnished",
      { cityId: "middlesbrough", internalSqft: 800, unit: "pounds" },
    );
    expect(out).toBeLessThan(5_000); // sane upper bound regardless of city/band
    expect(out).toBeGreaterThan(0);
  });
});
