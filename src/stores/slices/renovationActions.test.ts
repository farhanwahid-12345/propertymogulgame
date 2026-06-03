// @vitest-environment jsdom
/**
 * Tests for the extracted renovation/planning slice (Phase 5 follow-up).
 *
 * These exercise the action bundle through the live store so we also verify
 * the spread-into-store wiring stays correct.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../gameStore';
import type { Property } from '@/types/game';
import { toPennies } from '@/lib/formatCurrency';

function reset() { useGameStore.getState().resetGame(); }

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p-test-1',
    name: '1 Test Street',
    address: '1 Test Street, Middlesbrough',
    neighborhood: 'Acklam',
    city: 'middlesbrough',
    type: 'house',
    subtype: 'standard',
    condition: 'standard',
    bedrooms: 3,
    bathrooms: 1,
    internalSqft: 900,
    price: toPennies(120_000),
    value: toPennies(120_000),
    marketValue: toPennies(120_000),
    baseRent: 800,
    monthlyIncome: 800,
    purchasePrice: toPennies(120_000),
    purchaseMonth: 0,
    purchaseDate: Date.now(),
    yieldPercent: 8,
    epcRating: 'D',
    completedRenovationIds: [],
    totalRenovationSpendPennies: 0,
    capitalImprovementsPennies: 0,
    ...overrides,
  } as Property;
}

describe('renovationActions — store wiring', () => {
  beforeEach(reset);

  it('exposes startRenovation / upgradeCondition / furnishProperty on the store', () => {
    const s = useGameStore.getState();
    expect(typeof s.startRenovation).toBe('function');
    expect(typeof s.upgradeCondition).toBe('function');
    expect(typeof s.furnishProperty).toBe('function');
    expect(typeof s.submitPlanningApplication).toBe('function');
    expect(typeof s.submitBatchPlanningApplications).toBe('function');
    expect(typeof s.acknowledgePlanningDecision).toBe('function');
  });

  it('upgradeCondition is a no-op for unknown property', () => {
    const before = useGameStore.getState().cash;
    useGameStore.getState().upgradeCondition('does-not-exist', 'premium');
    expect(useGameStore.getState().cash).toBe(before);
  });

  it('furnishProperty is a no-op for unknown property', () => {
    const before = useGameStore.getState().cash;
    useGameStore.getState().furnishProperty('does-not-exist', 'fully_furnished');
    expect(useGameStore.getState().cash).toBe(before);
  });

  it('acknowledgePlanningDecision is a no-op for unknown application', () => {
    const before = useGameStore.getState().planningApplications;
    useGameStore.getState().acknowledgePlanningDecision('nope');
    expect(useGameStore.getState().planningApplications).toBe(before);
  });

  it('upgradeCondition charges cash and upgrades condition on a real property', () => {
    const property = makeProperty({ condition: 'dilapidated' });
    useGameStore.setState({ ownedProperties: [property] });
    const cashBefore = useGameStore.getState().cash;

    useGameStore.getState().upgradeCondition(property.id, 'standard');

    const after = useGameStore.getState();
    const owned = after.ownedProperties[0];
    expect(owned.condition).toBe('standard');
    // some debit happened (cash decreased or overdraft used)
    expect(after.cash + after.overdraftUsed).toBeLessThan(cashBefore);
  });

  it('furnishProperty installs furnishings and bumps advertised rent', () => {
    const property = makeProperty();
    useGameStore.setState({ ownedProperties: [property] });

    useGameStore.getState().furnishProperty(property.id, 'fully_furnished');

    const owned = useGameStore.getState().ownedProperties[0];
    expect(owned.furnishingTier).toBe('fully_furnished');
    expect(owned.furnishingMonthsRemaining).toBe(60);
    expect(owned.monthlyIncome).toBeGreaterThan(800);
  });

  it('furnishProperty is blocked while a tenant is in place', () => {
    const property = makeProperty();
    useGameStore.setState({
      ownedProperties: [property],
      tenants: [{ propertyId: property.id, slotIndex: 0 } as any],
    });

    useGameStore.getState().furnishProperty(property.id, 'fully_furnished');

    const owned = useGameStore.getState().ownedProperties[0];
    expect(owned.furnishingTier).toBeUndefined();
  });
});
