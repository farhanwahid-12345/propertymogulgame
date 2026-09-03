// @vitest-environment jsdom
/**
 * Commercial arrears eviction flow — validation, notice + court backlog, and
 * lease clearing on possession.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { withSeed } from '@/lib/rng';
import { toPennies } from '@/lib/formatCurrency';
import type { Property, PropertyTenant } from '@/types/game';
import type { Tenant } from '@/components/game/tenant-selector';

const PROP_ID = 'comm-1';

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'ct1',
    name: 'Teesside Trading Ltd',
    profile: 'standard',
    creditScore: 700,
    monthlyIncome: 9000,
    employmentStatus: 'Business',
    rentMultiplier: 1,
    defaultRisk: 10,
    damageRisk: 5,
    description: '',
    traits: [],
    ...overrides,
  };
}

function makeCommercialProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: PROP_ID,
    name: 'Linthorpe Road Shop',
    type: 'commercial',
    price: toPennies(200_000),
    value: toPennies(200_000),
    marketValue: toPennies(200_000),
    neighborhood: 'Linthorpe',
    monthlyIncome: toPennies(1_500),
    baseRent: toPennies(1_500),
    marketTrend: 'stable',
    yield: 9,
    condition: 'standard',
    conditionScore: 70,
    monthsSinceLastRenovation: 0,
    internalSqft: 1200,
    plotSqft: 2000,
    epcRating: 'C',
    commercialLease: {
      tenantName: 'Teesside Trading Ltd',
      covenantStrength: 'medium',
      termYears: 10,
      startMonth: 0,
      rentReviewEveryYears: 5,
      breakClauseAtMonth: undefined,
      annualRentPennies: toPennies(18_000),
    } as Property['commercialLease'],
    ...overrides,
  };
}

function makeCommercialTenant(overrides: Partial<PropertyTenant> = {}): PropertyTenant {
  return {
    propertyId: PROP_ID,
    slotIndex: 0,
    tenant: makeTenant(),
    rentMultiplier: 1,
    startDate: Date.now(),
    satisfaction: 50,
    lastSatisfactionUpdate: 0,
    depositHeld: toPennies(4_500),
    rentPennies: toPennies(1_500),
    moveInMonth: 0,
    ...overrides,
  };
}

beforeEach(() => {
  useGameStore.getState().resetGame();
});

describe('commercial arrears eviction', () => {
  it('rejects the court route below 2 months of arrears', () => {
    useGameStore.setState({
      ownedProperties: [makeCommercialProperty()],
      tenants: [makeCommercialTenant({ arrearsMonths: 1 })],
      monthsPlayed: 10,
    });
    withSeed(7, () => {
      useGameStore.getState().evictTenant(PROP_ID, 'commercial_arrears', 0);
    });
    expect(useGameStore.getState().pendingEvictions).toHaveLength(0);
  });

  it('serves 1 month notice plus a 2-5 month court backlog at 2+ months arrears', () => {
    useGameStore.setState({
      ownedProperties: [makeCommercialProperty()],
      tenants: [makeCommercialTenant({ arrearsMonths: 3, arrearsPennies: toPennies(4_500) })],
      monthsPlayed: 10,
    });
    withSeed(7, () => {
      useGameStore.getState().evictTenant(PROP_ID, 'commercial_arrears', 0);
    });
    const [ev] = useGameStore.getState().pendingEvictions;
    expect(ev).toBeDefined();
    expect(ev.ground).toBe('commercial_arrears');
    expect(ev.noticeExpiryMonth).toBe(11);
    expect(ev.courtBacklogMonths).toBeGreaterThanOrEqual(2);
    expect(ev.courtBacklogMonths).toBeLessThanOrEqual(5);
    expect(ev.effectiveMonth).toBe(11 + (ev.courtBacklogMonths ?? 0));
  });

  it('peaceable forfeiture stays immediate and bypasses the court queue', () => {
    useGameStore.setState({
      ownedProperties: [makeCommercialProperty()],
      tenants: [makeCommercialTenant({ arrearsMonths: 1 })],
      monthsPlayed: 10,
    });
    withSeed(11, () => {
      useGameStore.getState().evictTenant(PROP_ID, 'commercial_forfeiture', 0);
    });
    const [ev] = useGameStore.getState().pendingEvictions;
    expect(ev.courtBacklogMonths).toBe(0);
    expect(ev.effectiveMonth).toBe(10);
  });

  it('possession clears the lease, zeroes the rent roll and starts the vacancy clock', () => {
    useGameStore.setState({
      ownedProperties: [makeCommercialProperty()],
      tenants: [makeCommercialTenant({ arrearsMonths: 3 })],
      monthsPlayed: 10,
      pendingEvictions: [{
        propertyId: PROP_ID,
        slotIndex: 0,
        tenantName: 'Teesside Trading Ltd',
        ground: 'commercial_arrears',
        servedMonth: 8,
        effectiveMonth: 10,
        noticeExpiryMonth: 9,
        courtBacklogMonths: 1,
      }],
    });
    withSeed(3, () => {
      useGameStore.getState().processMonthEnd();
    });
    const state = useGameStore.getState();
    const prop = state.ownedProperties.find(p => p.id === PROP_ID)!;
    expect(prop.commercialLease).toBeUndefined();
    expect(prop.monthlyIncome).toBe(0);
    expect(prop.commercialVacantSinceMonth).toBeDefined();
    expect(state.tenants.find(t => t.propertyId === PROP_ID)).toBeUndefined();
    expect(state.pendingEvictions).toHaveLength(0);
  });
});
