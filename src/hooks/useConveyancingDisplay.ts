import { useMemo } from "react";

interface ConveyancingLike {
  status: string;
  propertyId: string;
  propertyName: string;
  purchasePrice?: number;
  completionMonth?: number;
}

/**
 * Surfaces in-flight `buying` conveyancing entries as PropertyCard-shaped stubs
 * so they render alongside the owned grid as "pending" tiles.
 */
export function useConveyancingDisplay(conveyancing: ConveyancingLike[]) {
  return useMemo(
    () =>
      (conveyancing || [])
        .filter((c) => c.status === "buying")
        .map((c) => ({
          id: c.propertyId,
          name: c.propertyName,
          type: "residential" as const,
          price: (c.purchasePrice || 0) / 100,
          value: (c.purchasePrice || 0) / 100,
          neighborhood: "",
          monthlyIncome: 0,
          image: "",
          owned: true,
          marketTrend: "stable" as const,
          condition: "standard" as const,
          monthsSinceLastRenovation: 0,
        })),
    [conveyancing]
  );
}
