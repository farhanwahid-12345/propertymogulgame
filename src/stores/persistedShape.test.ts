import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';

/**
 * Item #18 — persisted-shape snapshot.
 *
 * Guards against regressions in `partialize`: actions and methods must NEVER
 * be written to localStorage (they'd bloat the save and break hydration after
 * a refactor that renamed them). Critical state fields must always be present.
 */
describe('gameStore persisted shape', () => {
  beforeEach(() => {
    useGameStore.persist?.clearStorage?.();
  });

  it('strips all action functions from the persisted snapshot', () => {
    const state = useGameStore.getState();
    // partialize is invoked by Zustand on every setItem. We replicate it by
    // listing the action keys it filters; pull the persist options off the store.
    const opts = (useGameStore.persist as any)?.getOptions?.() ?? {};
    const partialize = opts.partialize;
    expect(typeof partialize).toBe('function');

    const persisted = partialize(state);
    for (const [key, value] of Object.entries(persisted)) {
      expect(typeof value, `Field "${key}" must not be a function`).not.toBe('function');
    }
  });

  it('keeps essential financial + portfolio fields in the snapshot', () => {
    const opts = (useGameStore.persist as any)?.getOptions?.() ?? {};
    const partialize = opts.partialize;
    const persisted = partialize(useGameStore.getState());
    for (const key of [
      'cash', 'level', 'experience', 'creditScore', 'overdraftLimit', 'overdraftUsed',
      'entityType', 'ownedProperties', 'mortgages', 'tenants', 'monthsPlayed',
      'gameSpeed', 'taxRecords', 'tenantConcerns',
    ]) {
      expect(persisted, `Missing persisted field: ${key}`).toHaveProperty(key);
    }
  });
});
