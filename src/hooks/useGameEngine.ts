import { useEffect, useRef } from "react";
import { useGameStore } from "@/stores/gameStore";

/**
 * Decoupled game engine loop.
 * Runs three periodic processes outside of the React render cycle:
 *   1. Clock tick (1 s)  – decrements timeUntilNextMonth
 *   2. Month-end (triggered when timer hits 0)
 *   3. Market / renovation / damage update (10 s)
 *   4. Counter-offer response check (2 s)
 *
 * All mutations happen inside the Zustand store, so only
 * subscribed components re-render.
 */
export function useGameEngine() {
  const lastMonthProcessed = useRef(-1);

  useEffect(() => {
    // 1-second clock tick
    const clockId = setInterval(() => {
      const { clockTick, timeUntilNextMonth, monthsPlayed, isBankrupt } = useGameStore.getState();
      clockTick();

      // Month-end trigger — process exactly once per month
      if (timeUntilNextMonth <= 1 && lastMonthProcessed.current !== monthsPlayed && !isBankrupt) {
        lastMonthProcessed.current = monthsPlayed;
        useGameStore.getState().processMonthEnd();
        useGameStore.getState().replenishMarket();
      }
    }, 1000);

    // 10-second market / renovation / damage update
    const marketId = setInterval(() => {
      useGameStore.getState().processMarketUpdate();
    }, 10_000);

    // 2-second counter-offer response check
    const counterId = setInterval(() => {
      useGameStore.getState().processCounterResponses();
    }, 2_000);

    return () => {
      clearInterval(clockId);
      clearInterval(marketId);
      clearInterval(counterId);
    };
  }, []);
}
