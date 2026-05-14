import { useCallback } from "react";

interface MortgageLike {
  propertyId: string;
  remainingBalance: number;
  collateralPropertyIds?: string[];
}

/**
 * Returns a memoized getter that computes the outstanding debt allocated to a
 * given property — including its share of any portfolio mortgage it collateralises.
 */
export function usePropertyDebt(mortgages: MortgageLike[]) {
  return useCallback(
    (propertyId: string) =>
      mortgages.reduce((sum, m) => {
        if (m.propertyId === propertyId) return sum + m.remainingBalance;
        if (m.collateralPropertyIds?.includes(propertyId)) {
          const share = m.remainingBalance / (m.collateralPropertyIds.length || 1);
          return sum + share;
        }
        return sum;
      }, 0),
    [mortgages]
  );
}
