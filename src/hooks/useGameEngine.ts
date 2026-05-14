import { useEffect, useRef } from "react";
import { useGameStore } from "@/stores/gameStore";

/**
 * Decoupled game engine loop.
 *
 * Drives the game forward using a Web Worker so the clock keeps ticking even
 * when the tab is in the background (browsers throttle setInterval on hidden
 * tabs to ≥1 minute, but workers are not throttled).
 *
 * The worker posts {type:'tick', deltaMs} once per second. We accumulate the
 * delta and apply it to the store:
 *   • every full second → clockTick() (decrements timeUntilNextMonth)
 *   • when the timer hits 0 → processMonthEnd() + replenishMarket()
 *   • every 10s of accumulated time → processMarketUpdate()
 *   • every 2s of accumulated time → processCounterResponses()
 *
 * Falls back to setInterval if Worker is unavailable.
 */
export function useGameEngine() {
  const accumulatedSec = useRef(0);
  const marketAccumSec = useRef(0);
  const counterAccumSec = useRef(0);
  const processingMonth = useRef(false);

  useEffect(() => {
    /** Hard cap on backlog: prevents huge synchronous catch-up after the
     *  tab returns from background (or after a long sleep). At 4× speed,
     *  60s of accumulator = 12 months of synchronous month-end processing,
     *  which freezes the UI. Cap at 30s so we recover quickly without
     *  blocking the main thread for seconds. */
    const MAX_ACCUMULATOR_SEC = 30;

    const handleTick = (deltaMs: number) => {
      // Reentrancy guard — if a previous handleTick is still running its
      // synchronous catch-up loop, just buffer the delta and bail.
      const gs = useGameStore.getState();
      if (gs.isPaused) return;
      const speed = gs.gameSpeed || 1;
      const scaledSec = (deltaMs * speed) / 1000;
      accumulatedSec.current = Math.min(MAX_ACCUMULATOR_SEC, accumulatedSec.current + scaledSec);
      marketAccumSec.current = Math.min(MAX_ACCUMULATOR_SEC, marketAccumSec.current + scaledSec);
      counterAccumSec.current = Math.min(MAX_ACCUMULATOR_SEC, counterAccumSec.current + scaledSec);

      if (processingMonth.current) return;

      // Whole-second clock ticks (catch up multiple seconds if needed).
      // Always read fresh state inside the loop so timer + monthsPlayed
      // reflect the previous iteration's effects (e.g. month-end reset
      // timeUntilNextMonth back to MONTH_DURATION_SECONDS).
      while (accumulatedSec.current >= 1) {
        accumulatedSec.current -= 1;
        const stateBefore = useGameStore.getState();
        if (stateBefore.isBankrupt) {
          accumulatedSec.current = 0;
          break;
        }
        stateBefore.clockTick();

        // Re-read AFTER clockTick so we see the decremented value.
        const stateAfter = useGameStore.getState();
        if (stateAfter.timeUntilNextMonth <= 0) {
          processingMonth.current = true;
          try {
            useGameStore.getState().processMonthEnd();
            useGameStore.getState().replenishMarket();
          } finally {
            processingMonth.current = false;
          }
          // After a heavy month-end, drain remaining backlog more gently:
          // bail out of the catch-up loop and let the next worker tick
          // continue. Prevents multi-month synchronous freezes.
          if (accumulatedSec.current >= 5) {
            // Cap remaining so we don't immediately reprocess.
            accumulatedSec.current = Math.min(accumulatedSec.current, 2);
            break;
          }
        }
      }

      if (marketAccumSec.current >= 10) {
        marketAccumSec.current = 0;
        useGameStore.getState().processMarketUpdate();
      }

      if (counterAccumSec.current >= 2) {
        counterAccumSec.current = 0;
        useGameStore.getState().processCounterResponses();
      }
    };

    let worker: Worker | null = null;
    let fallbackId: ReturnType<typeof setInterval> | null = null;
    let lastFallbackTime = performance.now();

    try {
      if (typeof Worker !== 'undefined') {
        worker = new Worker(new URL('../workers/gameClock.worker.ts', import.meta.url), { type: 'module' });
        worker.addEventListener('message', (e: MessageEvent) => {
          const data = e.data as { type: string; deltaMs: number };
          if (data?.type === 'tick') handleTick(data.deltaMs);
        });
      }
    } catch (err) {
      console.warn('[useGameEngine] Worker unavailable, falling back to setInterval', err);
      worker = null;
    }

    if (!worker) {
      fallbackId = setInterval(() => {
        const now = performance.now();
        const deltaMs = now - lastFallbackTime;
        lastFallbackTime = now;
        handleTick(deltaMs);
      }, 1000);
    }

    return () => {
      if (worker) worker.terminate();
      if (fallbackId) clearInterval(fallbackId);
    };
  }, []);
}
