/**
 * Game-clock Web Worker (item #17).
 *
 * Browsers throttle setInterval/setTimeout in background tabs to ≥1 minute.
 * Web Workers are not throttled the same way, so we drive the tick from
 * inside a worker to keep the in-game clock running across tab switches.
 *
 * **Minimal payload contract** — the worker posts only
 *   { type: 'tick', deltaMs: number }
 * across the boundary. No game state is shipped: every piece of state
 * (speed, isPaused, month, store actions) lives on the main thread and is
 * read fresh inside the tick handler. This keeps postMessage cheap and
 * avoids structured-clone overhead on hot ticks.
 */


let lastTime = performance.now();
let intervalId: ReturnType<typeof setInterval> | null = null;

function start() {
  if (intervalId !== null) return;
  lastTime = performance.now();
  intervalId = setInterval(() => {
    const now = performance.now();
    const deltaMs = now - lastTime;
    lastTime = now;
    // Post the actual elapsed milliseconds so the main thread can catch up
    // accurately even if the worker was briefly throttled.
    (self as unknown as Worker).postMessage({ type: 'tick', deltaMs });
  }, 1000);
}

function stop() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

self.addEventListener('message', (e: MessageEvent) => {
  const data = e.data as { type: string };
  if (data?.type === 'start') start();
  else if (data?.type === 'stop') stop();
});

// Auto-start on spawn
start();

export {};
