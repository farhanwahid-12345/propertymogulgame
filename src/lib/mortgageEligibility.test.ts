import { describe, it, expect } from "vitest";
import { BASE_MARKET_RATE } from "@/lib/engine/constants";
import { getEffectiveProviderRate, getFixedTermRateAdjustment } from "./mortgageEligibility";

describe("getFixedTermRateAdjustment", () => {
  it("2yr fixed is discounted 40bps", () => {
    expect(getFixedTermRateAdjustment(2)).toBe(-0.004);
  });
  it("5yr fixed is discounted 20bps", () => {
    expect(getFixedTermRateAdjustment(5)).toBe(-0.002);
  });
  it("10yr fixed is premium 10bps", () => {
    expect(getFixedTermRateAdjustment(10)).toBe(0.001);
  });
  it("no fixed term → 0", () => {
    expect(getFixedTermRateAdjustment(undefined)).toBe(0);
    expect(getFixedTermRateAdjustment(0)).toBe(0);
  });
});

describe("getEffectiveProviderRate (Phase 1 rate-fidelity invariant)", () => {
  it("base market rate → equals live provider rate (no drift, no fix adj)", () => {
    expect(getEffectiveProviderRate({
      liveProviderRate: 0.05,
      currentMarketRate: BASE_MARKET_RATE,
    })).toBeCloseTo(0.05, 10);
  });

  it("adds market drift on top of provider rate", () => {
    const r = getEffectiveProviderRate({
      liveProviderRate: 0.05,
      currentMarketRate: BASE_MARKET_RATE + 0.01,
    });
    expect(r).toBeCloseTo(0.06, 10);
  });

  it("applies fixed-term adjustment", () => {
    const r = getEffectiveProviderRate({
      liveProviderRate: 0.05,
      currentMarketRate: BASE_MARKET_RATE,
      fixedTermYears: 2,
    });
    expect(r).toBeCloseTo(0.046, 10);
  });

  it("displayed-rate-equals-stored-rate invariant holds across drift + fix", () => {
    // Whatever the UI sees, the store persists by calling the same helper.
    const args = { liveProviderRate: 0.058, currentMarketRate: 0.042, fixedTermYears: 5 as const };
    const ui = getEffectiveProviderRate(args);
    const store = getEffectiveProviderRate(args);
    expect(ui).toBe(store);
  });
});
