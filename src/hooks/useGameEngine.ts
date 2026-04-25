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
  const lastMonthProcessed = useRef(-1);
  const accumulatedSec = useRef(0);
  const marketAccumSec = useRef(0);
  const counterAccumSec = useRef(0);

  useEffect(() => {
    const handleTick = (deltaMs: number) => {
      // Scale wall-clock delta by user-selected game speed multiplier.
      const speed = useGameStore.getState().gameSpeed || 1;
      const scaledMs = deltaMs * speed;
      accumulatedSec.current += scaledMs / 1000;
      marketAccumSec.current += scaledMs / 1000;
      counterAccumSec.current += scaledMs / 1000;

      // Whole-second clock ticks (catch up multiple seconds if needed)
      while (accumulatedSec.current >= 1) {
        accumulatedSec.current -= 1;
        const { clockTick, timeUntilNextMonth, monthsPlayed, isBankrupt } = useGameStore.getState();
        clockTick();

        if (timeUntilNextMonth <= 1 && lastMonthProcessed.current !== monthsPlayed && !isBankrupt) {
          lastMonthProcessed.current = monthsPlayed;
          useGameStore.getState().processMonthEnd();
          useGameStore.getState().replenishMarket();
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
