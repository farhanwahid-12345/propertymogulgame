import { describe, it, expect } from "vitest";
import { maxConversionUnits, applyConversionUnits } from "./planning";

describe("joint planning sizing", () => {
  it("HMO room cap rises when extension floor area is included", () => {
    expect(maxConversionUnits("hmo", 900)).toBe(5);
    expect(maxConversionUnits("hmo", 900 + 400)).toBe(7);
  });
  it("flat cap rises with extension floor area", () => {
    expect(maxConversionUnits("flats", 1100)).toBe(2);
    expect(maxConversionUnits("flats", 1100 + 600)).toBe(3);
  });
  it("caps stay within 3-8 rooms and 2-5 flats", () => {
    expect(maxConversionUnits("hmo", 5000)).toBe(8);
    expect(maxConversionUnits("flats", 9000)).toBe(5);
    expect(maxConversionUnits("hmo", 300)).toBe(3);
  });
  it("applying for more rooms carries the unit count and lowers odds", () => {
    const r = applyConversionUnits({ id: "convert_hmo", name: "HMO", planningFee: 500, baseApprovalProb: 0.7 }, 7);
    expect(r.subtypeUnits).toBe(7);
    expect(r.name).toBe("HMO (7-bed)");
    expect(r.planningFee).toBe(800);
    expect(r.baseApprovalProb).toBeCloseTo(0.55);
  });
});
