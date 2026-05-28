/**
 * Seeded PRNG (Phase 6 / item #22).
 *
 * Implements `mulberry32` — a tiny, fast, statistically-good 32-bit PRNG.
 * The store can persist a `rngSeed` and reset the generator on load so that
 * tests and bug-repro saves replay deterministically.
 *
 * Module-level state intentionally mirrors `Math.random()` ergonomics so call
 * sites can be migrated incrementally: most existing engine code still calls
 * `Math.random()` directly today, but new logic should prefer `gameRandom()`.
 *
 * Usage:
 *   import { seedRng, gameRandom, withSeed } from '@/lib/rng';
 *   seedRng(12345);
 *   gameRandom();           // deterministic
 *   withSeed(42, () => {    // scoped — restores prior state on exit
 *     return runMonth(state);
 *   });
 */

type Mulberry32 = () => number;

function makeMulberry32(seed: number): Mulberry32 {
  let a = (seed | 0) >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let currentSeed: number | null = null;
let prng: Mulberry32 | null = null;

/** Seed (or re-seed) the game RNG. Pass `null` to fall back to Math.random. */
export function seedRng(seed: number | null): void {
  if (seed === null || !Number.isFinite(seed as number)) {
    currentSeed = null;
    prng = null;
    return;
  }
  currentSeed = (seed as number) >>> 0;
  prng = makeMulberry32(currentSeed);
}

/** Returns the current seed, or null when running on Math.random. */
export function getRngSeed(): number | null {
  return currentSeed;
}

/** Drop-in replacement for Math.random(). Deterministic iff seedRng() was called. */
export function gameRandom(): number {
  return prng ? prng() : Math.random();
}

/** Integer in [min, max] inclusive. */
export function randomInt(min: number, max: number): number {
  return Math.floor(gameRandom() * (max - min + 1)) + min;
}

/** Run `fn` with a temporary seed, restoring the prior generator state afterwards.
 *  Useful for tests that need a single deterministic block without polluting global state. */
export function withSeed<T>(seed: number, fn: () => T): T {
  const prevSeed = currentSeed;
  const prevPrng = prng;
  seedRng(seed);
  try {
    return fn();
  } finally {
    currentSeed = prevSeed;
    prng = prevPrng;
  }
}

/** Picks a uniformly-random element. Returns undefined for empty arrays. */
export function pick<T>(arr: readonly T[]): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(gameRandom() * arr.length)];
}
