import { useGameStore } from '../gameStore';

export const useTaxRecords = () => useGameStore((s) => s.taxRecords);
export const useTotalTaxPaid = () => useGameStore((s) => s.totalTaxPaid);
export const useUnusedLosses = () => useGameStore((s) => s.unusedLosses ?? 0);
export const useYearlyTaxContext = () =>
  useGameStore((s) => ({
    grossRent: s.yearlyGrossRent,
    mortgageInterest: s.yearlyMortgageInterest,
    deductibleExpenses: s.yearlyDeductibleExpenses,
    netProfit: s.yearlyNetProfit,
  }));
export const useEntityType = () => useGameStore((s) => s.entityType);
