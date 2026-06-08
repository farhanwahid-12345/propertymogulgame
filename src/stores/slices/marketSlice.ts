import { useGameStore } from '../gameStore';

export const useEstateAgentProperties = () => useGameStore((s) => s.estateAgentProperties);
export const useAuctionProperties = () => useGameStore((s) => s.auctionProperties);
export const useEconomicEvents = () => useGameStore((s) => s.economicEvents);
export const useNextEconomicEventMonth = () => useGameStore((s) => s.nextEconomicEventMonth);

// Market trend selectors
export const useCurrentMarketRate = () => useGameStore((s) => s.currentMarketRate);
export const useMortgageProviderRates = () => useGameStore((s) => s.mortgageProviderRates);
export const useEstateAgentCount = () => useGameStore((s) => s.estateAgentProperties.length);
export const useAuctionCount = () => useGameStore((s) => s.auctionProperties.length);

