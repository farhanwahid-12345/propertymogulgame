import { useGameStore } from '../gameStore';

export const useCash = () => useGameStore((s) => s.cash);
export const useMortgages = () => useGameStore((s) => s.mortgages);
export const useLoans = () => useGameStore((s) => s.loans);
export const useCreditScore = () => useGameStore((s) => s.creditScore);
export const useOverdraft = () =>
  useGameStore((s) => ({ limit: s.overdraftLimit, used: s.overdraftUsed }));
export const useProviderRates = () => useGameStore((s) => s.mortgageProviderRates);
export const useMarketRate = () => useGameStore((s) => s.currentMarketRate);
