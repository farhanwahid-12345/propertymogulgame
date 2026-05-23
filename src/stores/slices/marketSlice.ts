import { useGameStore } from '../gameStore';

export const useEstateAgentProperties = () => useGameStore((s) => s.estateAgentProperties);
export const useAuctionProperties = () => useGameStore((s) => s.auctionProperties);
export const useEconomicEvents = () => useGameStore((s) => s.economicEvents);
export const useNextEconomicEventMonth = () => useGameStore((s) => s.nextEconomicEventMonth);
