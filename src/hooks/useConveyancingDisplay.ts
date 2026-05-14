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
 * so they render alongside the owned grid as "pending" tiles. Looks up full
 * property snapshot from market lists where possible so size/yield/rent stays visible.
 */
export function useConveyancingDisplay(
  conveyancing: ConveyancingLike[],
  marketLookup?: Array<{ id: string; [k: string]: any }>,
) {
  return useMemo(
    () =>
      (conveyancing || [])
        .filter((c) => c.status === "buying")
        .map((c) => {
          const src = (marketLookup || []).find((p) => p.id === c.propertyId);
          const purchasePounds = (c.purchasePrice || 0) / 100;
          const monthlyIncome = src?.monthlyIncome ? src.monthlyIncome / 100 : 0;
          return {
            id: c.propertyId,
            name: c.propertyName,
            type: (src?.type || "residential") as "residential" | "commercial" | "luxury",
            price: purchasePounds,
            value: purchasePounds,
            neighborhood: src?.neighborhood || "",
            monthlyIncome,
            image: src?.image || "",
            owned: true,
            marketTrend: (src?.marketTrend || "stable") as "up" | "down" | "stable",
            condition: (src?.condition || "standard") as "dilapidated" | "standard" | "premium",
            monthsSinceLastRenovation: 0,
            internalSqft: src?.internalSqft,
            plotSqft: src?.plotSqft,
            yield: src?.yield,
            epcRating: src?.epcRating,
          };
        }),
    [conveyancing, marketLookup]
  );
}
