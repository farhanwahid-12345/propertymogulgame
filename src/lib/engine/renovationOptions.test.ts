import { describe, it, expect } from "vitest";
import { RENOVATION_OPTIONS } from "@/components/game/renovation-dialog";

describe("RENOVATION_OPTIONS sqft preservation invariants (item #4)", () => {
  it("every extension renovation adds positive internal sqft", () => {
    const extensions = RENOVATION_OPTIONS.filter(r => r.category === "extension");
    expect(extensions.length).toBeGreaterThan(0);
    for (const r of extensions) {
      expect(r.sqftAdded, `${r.id} should declare sqftAdded`).toBeGreaterThan(0);
    }
  });

  it("no conversion renovation declares sqftAdded (conversions redistribute, never grow or shrink footprint)", () => {
    const conversions = RENOVATION_OPTIONS.filter(r => r.category === "conversion");
    expect(conversions.length).toBeGreaterThan(0);
    for (const r of conversions) {
      expect(r.sqftAdded ?? 0, `${r.id} must not declare sqftAdded`).toBe(0);
    }
  });

  it("no maintenance/improvement renovation alters sqft", () => {
    const works = RENOVATION_OPTIONS.filter(r => r.category === "maintenance" || r.category === "improvement");
    for (const r of works) {
      expect(r.sqftAdded ?? 0, `${r.id} (${r.category}) must not declare sqftAdded`).toBe(0);
    }
  });
});

describe("extension sqft addition is purely additive (item #4)", () => {
  // Simulates the gameStore completion logic for sqftUpdate.
  const applyExtension = (currentSqft: number, sqftAdded: number | undefined, valueMult: number) => {
    if (!sqftAdded || valueMult <= 0) return currentSqft;
    return currentSqft + sqftAdded;
  };

  it("adds sqftAdded on a successful roll", () => {
    expect(applyExtension(900, 200, 1.0)).toBe(1100);
  });

  it("never decreases sqft (botched works produce no usable space, but never reduce existing)", () => {
    expect(applyExtension(900, 250, 0)).toBe(900);
    expect(applyExtension(900, undefined, 1.0)).toBe(900);
  });
});
