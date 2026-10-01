import { describe, it, expect } from "vitest";
import { projectCashflow } from "./forecast";
describe("projectCashflow", () => {
  it("raises payment when a fix expires and tracks cash", () => {
    const out = projectCashflow({
      cash: 100000, monthsPlayed: 10,
      ownedProperties: [{ id: "p", name: "A", value: 0, monthlyIncome: 50000 } as any],
      tenants: [{ propertyId: "p" } as any],
      mortgages: [{ id: "m", propertyId: "p", monthlyPayment: 30000, remainingBalance: 10000000, interestRate: 0.04, termYears: 25, mortgageType: "interest-only", startMonth: 0, fixedTermYears: 1 } as any],
    });
    expect(out[0].mortgage).toBe(30000);
    expect(out[1].fixEnding).toEqual(["A"]);
    expect(out[1].mortgage).toBe(50000);
    expect(out[0].cash).toBe(120000);
  });
});
