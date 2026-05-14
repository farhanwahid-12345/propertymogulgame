import { useMemo } from "react";

interface PropertyLike {
  id: string;
  value: number;
  monthlyIncome: number;
}

/**
 * Aggregates portfolio-level metrics from the owned property list.
 * `value` (not marketValue) matches the canonical net-worth calc.
 */
export function usePortfolioMetrics<T extends PropertyLike>(
  ownedProperties: T[],
  totalDebt: number
) {
  return useMemo(() => {
    const totalPortfolioValue = ownedProperties.reduce((sum, p) => sum + p.value, 0);
    const totalPortfolioIncome = ownedProperties.reduce((sum, p) => sum + p.monthlyIncome, 0);
    const avgYield =
      totalPortfolioValue > 0
        ? ((totalPortfolioIncome * 12) / totalPortfolioValue * 100).toFixed(1)
        : "0.0";
    const portfolioLTV =
      totalPortfolioValue > 0 ? (totalDebt / totalPortfolioValue) * 100 : 0;

    const sortedOwnedProperties = [...ownedProperties].sort((a, b) => {
      const yA = a.value > 0 ? (a.monthlyIncome / a.value) * 12 * 100 : 0;
      const yB = b.value > 0 ? (b.monthlyIncome / b.value) * 12 * 100 : 0;
      return yB - yA;
    });

    return {
      totalPortfolioValue,
      totalPortfolioIncome,
      avgYield,
      portfolioLTV,
      sortedOwnedProperties,
    };
  }, [ownedProperties, totalDebt]);
}
