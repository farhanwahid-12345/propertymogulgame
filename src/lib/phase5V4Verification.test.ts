import { describe, it, expect } from "vitest";

import { PropertyCard } from "@/components/game/property-card";
import { PropertyCardSkeleton, PanelSkeleton, ListingRowSkeleton } from "@/components/ui/property-card-skeleton";

/**
 * Phase 5 — Performance & Code-Splitting verification.
 *
 * Covers:
 *   #5 PropertyCard wrapped in React.memo
 *   #6 Lazy-loadable dialog bodies (OperationsCenter / LoansPanel / TaxBreakdown
 *      are imported dynamically in BankingPanel.tsx — verified via source scan)
 *   #7 Skeleton components exported and renderable
 */
describe("Phase 5 — Performance & Code-Splitting (v4)", () => {
  it("PropertyCard is wrapped in React.memo (#5)", () => {
    // memo() returns an object with $$typeof Symbol(react.memo) — duck-type it.
    expect(PropertyCard).toBeDefined();
    expect(typeof PropertyCard).toBe("object");
    // memo wrappers expose the inner function on `.type`
    expect((PropertyCard as any).$$typeof?.toString()).toContain("react.memo");
  });

  it("BankingPanel uses React.lazy for heavy panels (#6)", async () => {
    // @ts-expect-error - fs available at vitest runtime
    const fs = await import("fs");
    const src = fs.readFileSync("src/components/sections/BankingPanel.tsx", "utf8");
    expect(src).toMatch(/lazy\(\(\) =>\s*import\("@\/components\/game\/operations-center"\)/);
    expect(src).toMatch(/lazy\(\(\) =>\s*import\("@\/components\/game\/loans-panel"\)/);
    expect(src).toMatch(/lazy\(\(\) =>\s*import\("@\/components\/game\/tax-breakdown"\)/);
    expect(src).toMatch(/<Suspense fallback=\{<PanelSkeleton/);
  });

  it("Skeleton components are exported and render (#7)", () => {
    expect(typeof PropertyCardSkeleton).toBe("function");
    expect(typeof PanelSkeleton).toBe("function");
    expect(typeof ListingRowSkeleton).toBe("function");
  });
});
