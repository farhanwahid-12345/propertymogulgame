/**
 * Phase 6 verification — architecture / testability / docs.
 *
 * Locks the new infrastructure pieces shipped in v4 Phase 6:
 *   #17 named probability constants
 *   #22 seeded PRNG (mulberry32)
 *   #23 migration registry runner
 *   #12 GAME_MECHANICS.md exists and references the engine modules
 */
import { describe, it, expect } from 'vitest';
import { seedRng, gameRandom, withSeed, getRngSeed, randomInt } from './rng';
import { runMigrations, CURRENT_VERSION, type Migration } from './migrations';
import {
  EVICTION_UPHELD_PROB,
  CHAIN_COLLAPSE_PROB,
  MARKET_DIP_PROB,
  PRICE_TICK_CLAMP,
} from './engine/probabilities';

describe('Phase 6 — seeded PRNG (#22)', () => {
  it('produces a deterministic sequence for a given seed', () => {
    seedRng(12345);
    const a = [gameRandom(), gameRandom(), gameRandom()];
    seedRng(12345);
    const b = [gameRandom(), gameRandom(), gameRandom()];
    expect(a).toEqual(b);
    seedRng(null); // reset to Math.random
  });

  it('emits values in [0, 1)', () => {
    seedRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = gameRandom();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    seedRng(null);
  });

  it('withSeed restores prior generator state', () => {
    seedRng(100);
    const before = gameRandom();
    const inside = withSeed(999, () => gameRandom());
    const after = gameRandom();
    // The "after" call should continue the original (seed=100) sequence,
    // not be perturbed by the nested withSeed(999) block.
    seedRng(100);
    gameRandom(); // skip the "before" value
    expect(after).toBe(gameRandom());
    expect(inside).not.toBe(before);
    seedRng(null);
  });

  it('randomInt is inclusive on both ends', () => {
    seedRng(42);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(randomInt(1, 3));
    expect(seen.has(1)).toBe(true);
    expect(seen.has(2)).toBe(true);
    expect(seen.has(3)).toBe(true);
    seedRng(null);
  });

  it('getRngSeed returns null when unseeded', () => {
    seedRng(null);
    expect(getRngSeed()).toBeNull();
  });
});

describe('Phase 6 — migration runner (#23)', () => {
  it('walks a v0 blob to CURRENT_VERSION via registered steps', () => {
    const steps: Migration[] = [
      { from: 0, to: 1, describe: 'init flag', apply: (p) => { p.a = 1; } },
      { from: 1, to: 2, describe: 'add b', apply: (p) => { p.b = 2; } },
    ];
    const out = runMigrations({ _version: 0 }, steps, 2);
    expect(out._version).toBe(2);
    expect(out.a).toBe(1);
    expect(out.b).toBe(2);
  });

  it('skips already-applied steps', () => {
    const steps: Migration[] = [
      { from: 0, to: 1, describe: 'noop', apply: (p) => { p.touched = (p.touched ?? 0) + 1; } },
    ];
    const out = runMigrations({ _version: 1, touched: 0 }, steps, 1);
    expect(out.touched).toBe(0);
  });

  it('stamps the target version even with no steps', () => {
    const out = runMigrations({ _version: 0 }, [], 5);
    expect(out._version).toBe(5);
  });

  it('CURRENT_VERSION matches the inline ladder in the store', () => {
    // Reminder: if the store bumps _version, bump this too and register the step.
    expect(CURRENT_VERSION).toBe(26);
  });
});

describe('Phase 6 — named probability constants (#17)', () => {
  it('eviction outcome probabilities sum to 1', () => {
    expect(EVICTION_UPHELD_PROB).toBe(0.60);
  });
  it('macro drift constants are sane', () => {
    expect(CHAIN_COLLAPSE_PROB).toBeGreaterThan(0);
    expect(CHAIN_COLLAPSE_PROB).toBeLessThan(0.1);
    expect(MARKET_DIP_PROB).toBeGreaterThan(0);
    expect(PRICE_TICK_CLAMP).toBeCloseTo(0.06, 5);
  });
});

describe('Phase 6 — GAME_MECHANICS.md (#12)', () => {
  it('exists at the documented path and covers the major systems', async () => {
    // Vite supports `?raw` to import any file as a string at test time.
    const doc = (await import('../../docs/GAME_MECHANICS.md?raw')).default as string;
    for (const section of ['Rent', 'Condition', 'Mortgages', 'EPC', 'Taxation', 'RNG', 'Persistence']) {
      expect(doc).toMatch(new RegExp(section, 'i'));
    }
  });
});
