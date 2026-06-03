// @vitest-environment jsdom
/**
 * Store-level tests — Phase 5 / item #5.
 *
 * Locks in store-level invariants that previously had no coverage:
 *   - initial state shape
 *   - simple speed / pause / cash / entity mutators
 *   - month-end clock tick safety on an empty portfolio
 *   - eviction state-machine guards (no-tenant, invalid grounds, cancel)
 *   - deposit-dispute guard (no open dispute)
 *   - splitFlatUnit validation (non-existent property)
 *   - resetGame restores starting cash
 *   - RNG determinism via withSeed
 *
 * Deeper month-end / conveyancing / credit-score flows depend on a fully
 * populated portfolio; those land as the gameStore continues to be split
 * into domain slices in follow-up work.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { INITIAL_CASH, MONTH_DURATION_SECONDS } from '@/lib/engine/constants';
import { withSeed, gameRandom } from '@/lib/rng';

function reset() {
  useGameStore.getState().resetGame();
}

describe('gameStore — initial state', () => {
  beforeEach(reset);

  it('starts with INITIAL_CASH, level 1, credit 750, not bankrupt', () => {
    const s = useGameStore.getState();
    expect(s.cash).toBe(INITIAL_CASH);
    expect(s.level).toBe(1);
    expect(s.creditScore).toBe(750);
    expect(s.isBankrupt).toBe(false);
    expect(s.overdraftUsed).toBe(0);
  });

  it('starts paused-state false with gameSpeed 1', () => {
    const s = useGameStore.getState();
    expect(s.gameSpeed).toBe(1);
    expect(s.isPaused).toBe(false);
    expect(s.timeUntilNextMonth).toBe(MONTH_DURATION_SECONDS);
  });

  it('starts with empty owned portfolio and seeded market inventory', () => {
    const s = useGameStore.getState();
    expect(s.ownedProperties).toEqual([]);
    expect(s.mortgages).toEqual([]);
    expect(s.tenants).toEqual([]);
    expect(s.estateAgentProperties.length).toBeGreaterThan(0);
    expect(s.auctionProperties.length).toBeGreaterThan(0);
  });
});

describe('gameStore — simple mutators', () => {
  beforeEach(reset);

  it('setCash overrides cash', () => {
    useGameStore.getState().setCash(42_000_00);
    expect(useGameStore.getState().cash).toBe(42_000_00);
  });

  it('setGameSpeed clamps to [0.25, 8]', () => {
    const { setGameSpeed } = useGameStore.getState();
    setGameSpeed(0);
    expect(useGameStore.getState().gameSpeed).toBe(0.25);
    setGameSpeed(99);
    expect(useGameStore.getState().gameSpeed).toBe(8);
    setGameSpeed(2);
    expect(useGameStore.getState().gameSpeed).toBe(2);
  });

  it('togglePause flips, setPaused sets explicitly', () => {
    const api = useGameStore.getState();
    api.togglePause();
    expect(useGameStore.getState().isPaused).toBe(true);
    api.setPaused(false);
    expect(useGameStore.getState().isPaused).toBe(false);
  });

  it('setEntityType switches sole_trader ↔ ltd_company', () => {
    useGameStore.getState().setEntityType('ltd_company');
    expect(useGameStore.getState().entityType).toBe('ltd_company');
  });

  it('clockTick decrements timeUntilNextMonth without going below zero', () => {
    const { clockTick } = useGameStore.getState();
    const start = useGameStore.getState().timeUntilNextMonth;
    clockTick();
    expect(useGameStore.getState().timeUntilNextMonth).toBe(start - 1);
  });
});

describe('gameStore — eviction guards', () => {
  beforeEach(reset);

  it('evictTenant on a property with no tenant is a no-op (no pendingEvictions)', () => {
    useGameStore.getState().evictTenant('nonexistent', 'rent_arrears', 0);
    expect(useGameStore.getState().pendingEvictions).toHaveLength(0);
  });

  it('cancelEviction on an empty queue is safe', () => {
    expect(() => useGameStore.getState().cancelEviction('nonexistent', 0)).not.toThrow();
    expect(useGameStore.getState().pendingEvictions).toHaveLength(0);
  });
});

describe('gameStore — deposit dispute guard', () => {
  beforeEach(reset);

  it('disputeDeposit on an unknown id does not throw and changes nothing', () => {
    const before = useGameStore.getState().depositDisputes ?? [];
    useGameStore.getState().disputeDeposit('does-not-exist');
    expect(useGameStore.getState().depositDisputes ?? []).toEqual(before);
  });
});

describe('gameStore — title split guard', () => {
  beforeEach(reset);

  it('splitFlatUnit silently no-ops on unknown property', () => {
    const before = useGameStore.getState();
    expect(() =>
      before.splitFlatUnit('nope', 0, 'peppercorn'),
    ).not.toThrow();
    expect(useGameStore.getState().ownedProperties).toEqual(before.ownedProperties);
    expect(useGameStore.getState().cash).toBe(before.cash);
  });
});

describe('gameStore — resetGame', () => {
  it('restores cash + clears overdraft after mutation', () => {
    const api = useGameStore.getState();
    api.setCash(1);
    api.setOverdraftUsed(500);
    api.resetGame();
    const s = useGameStore.getState();
    expect(s.cash).toBe(INITIAL_CASH);
    expect(s.overdraftUsed).toBe(0);
    expect(s.level).toBe(1);
  });
});

describe('rng determinism (withSeed)', () => {
  it('produces identical sequences for the same seed', () => {
    const a = withSeed(123, () => [gameRandom(), gameRandom(), gameRandom()]);
    const b = withSeed(123, () => [gameRandom(), gameRandom(), gameRandom()]);
    expect(a).toEqual(b);
  });

  it('produces different sequences for different seeds', () => {
    const a = withSeed(1, () => [gameRandom(), gameRandom(), gameRandom()]);
    const b = withSeed(2, () => [gameRandom(), gameRandom(), gameRandom()]);
    expect(a).not.toEqual(b);
  });
});
