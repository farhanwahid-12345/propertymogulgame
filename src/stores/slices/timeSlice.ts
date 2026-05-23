import { useGameStore } from '../gameStore';
import { useShallow } from 'zustand/react/shallow';

export const useMonthsPlayed = () => useGameStore((s) => s.monthsPlayed);
export const useTimeUntilNextMonth = () => useGameStore((s) => s.timeUntilNextMonth);
export const useGameSpeed = () => useGameStore((s) => s.gameSpeed);
export const useIsPaused = () => useGameStore((s) => s.isPaused);
export const useTimeActions = () =>
  useGameStore(useShallow((s) => ({
    clockTick: s.clockTick,
    setGameSpeed: (s as any).setGameSpeed,
    togglePause: (s as any).togglePause,
  })));
