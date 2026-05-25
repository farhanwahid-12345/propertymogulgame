import { describe, it, expect } from "vitest";
import { RENOVATION_OPTIONS } from "@/components/game/renovation-dialog";

describe("Phase 3 verification", () => {
  it("#6a — every extension declares positive sqftAdded and conversions never declare sqftAdded", () => {
    const exts = RENOVATION_OPTIONS.filter(r => r.category === "extension");
    expect(exts.length).toBeGreaterThan(0);
    for (const r of exts) {
      expect((r as any).sqftAdded, `${r.id} must add sqft`).toBeGreaterThan(0);
    }
    const conv = RENOVATION_OPTIONS.filter(r => r.category === "conversion");
    for (const r of conv) {
      expect((r as any).sqftAdded ?? 0, `${r.id} must not declare sqftAdded`).toBe(0);
    }
  });

  it("#6a — sqft additivity invariant: extension applied to 900 sqft never shrinks below 900", () => {
    const start = 900;
    const ext = RENOVATION_OPTIONS.find(r => r.id === "rear_extension")!;
    const after = start + (ext as any).sqftAdded;
    expect(after).toBeGreaterThan(start);
  });

  it("#12 — renovation headline ROI uplifted by ~25%", () => {
    // Kitchen baseline was £16,000 → expect ~£20,000 after +25%.
    const kitchen = RENOVATION_OPTIONS.find(r => r.id === "kitchen_upgrade")!;
    expect(kitchen.valueIncrease).toBeGreaterThanOrEqual(19_500);
    expect(kitchen.valueIncrease).toBeLessThanOrEqual(20_500);
    expect(kitchen.rentIncrease).toBeGreaterThanOrEqual(295);
    expect(kitchen.rentIncrease).toBeLessThanOrEqual(305);
  });
});
