import { useGameStore } from '../gameStore';

export const usePendingPlanningCelebrations = () =>
  useGameStore((s) => s.pendingPlanningCelebrations);
export const useEconomicEventFeed = () => useGameStore((s) => s.economicEvents);
