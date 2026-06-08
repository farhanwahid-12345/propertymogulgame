import { useGameStore } from '../gameStore';
import { useShallow } from 'zustand/react/shallow';

export const useCash = () => useGameStore((s) => s.cash);
export const useMortgages = () => useGameStore((s) => s.mortgages);
export const useLoans = () => useGameStore((s) => s.loans);
export const useCreditScore = () => useGameStore((s) => s.creditScore);
export const useOverdraft = () =>
  useGameStore(useShallow((s) => ({ limit: s.overdraftLimit, used: s.overdraftUsed })));
export const useProviderRates = () => useGameStore((s) => s.mortgageProviderRates);
export const useMarketRate = () => useGameStore((s) => s.currentMarketRate);

// Aggregate banking selectors
export const useTotalMortgageBalance = () =>
  useGameStore((s) => s.mortgages.reduce((sum: number, m: any) => sum + (m.balance ?? 0), 0));

export const useTotalLoanBalance = () =>
  useGameStore((s) => s.loans.reduce((sum: number, l: any) => sum + (l.balancePennies ?? 0), 0));

export const useAvailableOverdraft = () =>
  useGameStore((s) => Math.max(0, (s.overdraftLimit ?? 0) - (s.overdraftUsed ?? 0)));

export const useCashPlusOverdraft = () =>
  useGameStore((s) => (s.cash ?? 0) + Math.max(0, (s.overdraftLimit ?? 0) - (s.overdraftUsed ?? 0)));

