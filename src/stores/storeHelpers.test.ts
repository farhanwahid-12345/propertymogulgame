import { describe, it, expect } from "vitest";
import { debit, credit, calcDeposit } from "./storeHelpers";

describe("debit", () => {
  const base = { cash: 10_000, overdraftUsed: 0, overdraftLimit: 5_000 };

  it("pays from cash when sufficient", () => {
    const r = debit(base, 3_000)!;
    expect(r.cash).toBe(7_000);
    expect(r.overdraftUsed).toBe(0);
    expect(r.usedOverdraft).toBe(0);
  });

  it("dips into overdraft when cash insufficient", () => {
    const r = debit(base, 12_000)!;
    expect(r.cash).toBe(0);
    expect(r.overdraftUsed).toBe(2_000);
    expect(r.usedOverdraft).toBe(2_000);
  });

  it("returns null when total funds insufficient", () => {
    expect(debit(base, 20_000)).toBe(null);
  });

  it("respects existing overdraftUsed", () => {
    const r = debit({ ...base, overdraftUsed: 4_000 }, 11_000)!;
    expect(r.overdraftUsed).toBe(5_000); // hits limit exactly
    expect(r.cash).toBe(0);
  });

  it("no-op for zero amount", () => {
    const r = debit(base, 0)!;
    expect(r.cash).toBe(base.cash);
    expect(r.usedOverdraft).toBe(0);
  });
});

describe("credit", () => {
  it("does NOT auto-repay overdraft (Phase 1 rule)", () => {
    const r = credit({ cash: 0, overdraftUsed: 3_000 }, 5_000);
    expect(r.cash).toBe(5_000);
    expect(r.overdraftUsed).toBe(3_000);
  });
  it("no-op for zero amount", () => {
    const r = credit({ cash: 100, overdraftUsed: 0 }, 0);
    expect(r.cash).toBe(100);
  });
});

describe("calcDeposit (5wk TDS cap)", () => {
  it("£1000/mo rent → ~£1153 deposit", () => {
    // 1000*12*5/52 = 1153.84 → floor 1153
    expect(calcDeposit(1_000)).toBe(1_153);
  });
  it("scales linearly with rent", () => {
    expect(calcDeposit(2_000)).toBeGreaterThan(calcDeposit(1_000));
  });
});
