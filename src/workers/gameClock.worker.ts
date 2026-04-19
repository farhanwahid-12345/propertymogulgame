/**
 * Game-clock Web Worker.
 *
 * Browsers throttle setInterval/setTimeout in background tabs to ≥1 minute.
 * Web Workers do NOT receive the same aggressive throttling, so by driving the
 * tick from inside a worker the in-game clock keeps running while the player
 * is on another tab.
 *
 * The worker measures elapsed wall-clock time using performance.now() and
 * posts the elapsed delta (in ms) back to the main thread roughly every
 * second. The main thread is then responsible for converting that delta into
 * "ticks" and triggering month-end / market / counter-offer processes —
 * keeping all game state on the main thread's Zustand store.
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
