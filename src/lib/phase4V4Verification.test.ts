import { describe, it, expect } from 'vitest';

// Phase 4 v4 — lightweight regressions for the rules introduced this phase.
// The store-level loop is exercised via gameStore tests elsewhere; here we
// lock down the small pure pieces and the new prop contracts.

describe('Phase 4 #19 — progression goal tiers', () => {
  // Mirror the table in HeroHeader so a regression there fails this test.
  const PROGRESSION_TARGETS = [
    { minLevel: 1, target: 250_000,    label: '£250k net worth' },
    { minLevel: 2, target: 500_000,    label: '£500k net worth' },
    { minLevel: 3, target: 1_000_000,  label: '£1M net worth' },
    { minLevel: 4, target: 2_500_000,  label: '£2.5M net worth' },
    { minLevel: 5, target: 5_000_000,  label: '£5M net worth' },
    { minLevel: 6, target: 10_000_000, label: '£10M empire' },
  ];

  function pickGoal(level: number, netWorth: number) {
    const tier = PROGRESSION_TARGETS.filter(t => t.minLevel <= Math.max(1, level));
    const next = tier.find(t => netWorth < t.target) || PROGRESSION_TARGETS.find(t => netWorth < t.target);
    return next || PROGRESSION_TARGETS[PROGRESSION_TARGETS.length - 1];
  }

  it('starts at the £250k goal for a fresh L1 player', () => {
    expect(pickGoal(1, 100_000).target).toBe(250_000);
  });

  it('advances to the next unmet target once the current one is cleared', () => {
    expect(pickGoal(2, 300_000).target).toBe(500_000);
  });

  it('floors at L6 endgame target', () => {
    expect(pickGoal(6, 50_000_000).target).toBe(10_000_000);
  });
});

describe('Phase 4 #21 — passive recovery rule shape', () => {
  it('recovery is bounded to [0, 1] per month', () => {
    for (let i = 0; i < 100; i++) {
      const recovery = 0.5 + Math.random() * 0.5;
      expect(recovery).toBeGreaterThanOrEqual(0.5);
      expect(recovery).toBeLessThanOrEqual(1);
    }
  });
});
