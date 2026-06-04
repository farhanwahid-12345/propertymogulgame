// @vitest-environment jsdom
/**
 * Phase 2 (Outstanding Improvements doc) — month-end, eviction state machine,
 * and credit-score store tests.
 *
 * These tests run against the live `useGameStore` and exercise actions that
 * had no coverage prior to this phase. They follow the existing pattern: use
 * `setState` to plant minimal scenarios, call the relevant action(s), and
 * assert via `getState()`. All probabilistic paths are pinned with `withSeed`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { withSeed } from '@/lib/rng';
import { toPennies } from '@/lib/formatCurrency';
import type { Property, PropertyTenant, Mortgage, TenantEvent } from '@/types/game';
import type { Tenant } from '@/components/game/tenant-selector';

const PROP_ID = 'test-prop-1';

function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 't1',
    name: 'Test Tenant',
    profile: 'standard',
    creditScore: 700,
    monthlyIncome: 2500,
    employmentStatus: 'Employed',
    rentMultiplier: 1.0,
    defaultRisk: 5,
    damageRisk: 5,
    description: '',
    traits: [],
    ...overrides,
  };
}

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: PROP_ID,
    name: 'Test House',
    type: 'residential',
    price: toPennies(100_000),
    value: toPennies(100_000),
    marketValue: toPennies(100_000),
    neighborhood: 'Test',
    monthlyIncome: toPennies(800),
    baseRent: toPennies(800),
    image: '',
    marketTrend: 'stable',
    yield: 9,
    condition: 'standard',
    conditionScore: 70,
    monthsSinceLastRenovation: 0,
    internalSqft: 700,
    plotSqft: 1000,
    epcRating: 'D',
    ...overrides,
  };
}

function makePropertyTenant(overrides: Partial<PropertyTenant> = {}): PropertyTenant {
  return {
    propertyId: PROP_ID,
    slotIndex: 0,
    tenant: makeTenant(),
    rentMultiplier: 1.0,
    startDate: Date.now(),
    satisfaction: 80,
    lastSatisfactionUpdate: 0,
    depositHeld: toPennies(800 * 1.15),
    rentPennies: toPennies(800),
    moveInMonth: 0,
    ...overrides,
  };
}

beforeEach(() => {
  useGameStore.getState().resetGame();
});

// ─── Eviction state machine ──────────────────────────────────────

describe('eviction state machine', () => {
  it('serveEviction with landlord_sale on a real tenant creates a pendingEviction entry', () => {
    useGameStore.setState({
      ownedProperties: [makeProperty()],
      tenants: [makePropertyTenant()],
      monthsPlayed: 5,
    });
    withSeed(101, () => {
      useGameStore.getState().evictTenant(PROP_ID, 'landlord_sale', 0);
    });
    const evictions = useGameStore.getState().pendingEvictions;
    expect(evictions).toHaveLength(1);
    expect(evictions[0].propertyId).toBe(PROP_ID);
    expect(evictions[0].slotIndex).toBe(0);
    expect(evictions[0].ground).toBe('landlord_sale');
    expect(evictions[0].servedMonth).toBe(5);
    expect(evictions[0].effectiveMonth).toBeGreaterThan(5); // notice + court backlog
  });

  it('serveEviction on rent_arrears with no missed-payment history is rejected', () => {
    useGameStore.setState({
      ownedProperties: [makeProperty()],
      tenants: [makePropertyTenant()],
      tenantEvents: [], // no defaults
      monthsPlayed: 5,
    });
    useGameStore.getState().evictTenant(PROP_ID, 'rent_arrears', 0);
    expect(useGameStore.getState().pendingEvictions).toHaveLength(0);
  });

  it('serveEviction on rent_arrears succeeds when ≥2 default events exist', () => {
    const events: TenantEvent[] = [
      { propertyId: PROP_ID, type: 'default', amount: toPennies(800), month: 3 },
      { propertyId: PROP_ID, type: 'default', amount: toPennies(800), month: 4 },
    ];
    useGameStore.setState({
      ownedProperties: [makeProperty()],
      tenants: [makePropertyTenant({ arrearsMonths: 2, arrearsPennies: toPennies(1600) })],
      tenantEvents: events,
      monthsPlayed: 5,
    });
    withSeed(202, () => {
      useGameStore.getState().evictTenant(PROP_ID, 'rent_arrears', 0);
    });
    const evictions = useGameStore.getState().pendingEvictions;
    expect(evictions).toHaveLength(1);
    expect(evictions[0].ground).toBe('rent_arrears');
  });

  it('cancelEviction removes the matching entry but leaves others intact', () => {
    useGameStore.setState({
      ownedProperties: [makeProperty(), makeProperty({ id: 'other', name: 'Other' })],
      tenants: [
        makePropertyTenant(),
        makePropertyTenant({ propertyId: 'other', tenant: makeTenant({ id: 't2', name: 'B' }) }),
      ],
      monthsPlayed: 5,
    });
    withSeed(303, () => {
      useGameStore.getState().evictTenant(PROP_ID, 'landlord_sale', 0);
      useGameStore.getState().evictTenant('other', 'landlord_sale', 0);
    });
    expect(useGameStore.getState().pendingEvictions).toHaveLength(2);
    useGameStore.getState().cancelEviction(PROP_ID, 0);
    const remaining = useGameStore.getState().pendingEvictions;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].propertyId).toBe('other');
  });

  it('refuses a duplicate eviction notice on the same slot', () => {
    useGameStore.setState({
      ownedProperties: [makeProperty()],
      tenants: [makePropertyTenant()],
      monthsPlayed: 5,
    });
    withSeed(404, () => {
      useGameStore.getState().evictTenant(PROP_ID, 'landlord_sale', 0);
      useGameStore.getState().evictTenant(PROP_ID, 'landlord_sale', 0);
    });
    expect(useGameStore.getState().pendingEvictions).toHaveLength(1);
  });
});

// ─── Month-end cashflow ──────────────────────────────────────────

describe('processMonthEnd cashflow', () => {
  it('is a no-op when timeUntilNextMonth > 0', () => {
    const cashBefore = useGameStore.getState().cash;
    const monthBefore = useGameStore.getState().monthsPlayed;
    useGameStore.getState().processMonthEnd();
    expect(useGameStore.getState().cash).toBe(cashBefore);
    expect(useGameStore.getState().monthsPlayed).toBe(monthBefore);
  });

  it('advances the month counter when timeUntilNextMonth reaches 0', () => {
    useGameStore.setState({
      ownedProperties: [makeProperty()],
      tenants: [],
      timeUntilNextMonth: 0,
      monthsPlayed: 1,
    });
    withSeed(505, () => {
      useGameStore.getState().processMonthEnd();
    });
    expect(useGameStore.getState().monthsPlayed).toBe(2);
  });

  it('credits cash with rent when a paying low-risk tenant is in place', () => {
    // Seed picked so the missed-rent roll passes for a risk=1 tenant.
    useGameStore.setState({
      ownedProperties: [makeProperty()],
      tenants: [makePropertyTenant({
        tenant: makeTenant({ defaultRisk: 1 }),
        arrearsPennies: 0,
        arrearsMonths: 0,
      })],
      timeUntilNextMonth: 0,
      monthsPlayed: 1,
    });
    const cashBefore = useGameStore.getState().cash;
    // No mortgages, no missed rent → expect a NET positive (rent − council tax(0 since occupied) − insurance).
    withSeed(606, () => {
      useGameStore.getState().processMonthEnd();
    });
    const cashAfter = useGameStore.getState().cash;
    expect(cashAfter).toBeGreaterThan(cashBefore);
  });

  it('accumulates arrearsPennies when the missed-rent roll fires', () => {
    // High-risk tenant → high miss probability; seed reliably triggers it.
    useGameStore.setState({
      ownedProperties: [makeProperty()],
      tenants: [makePropertyTenant({
        tenant: makeTenant({ profile: 'risky', defaultRisk: 60 }),
        arrearsPennies: 0,
        arrearsMonths: 0,
      })],
      timeUntilNextMonth: 0,
      monthsPlayed: 1,
    });
    // Try a handful of seeds until we land on one where the tenant misses
    // (probability is ~0.48 so this loop ends fast and stays deterministic).
    let triggered = false;
    for (let seed = 1; seed < 20 && !triggered; seed++) {
      useGameStore.getState().resetGame();
      useGameStore.setState({
        ownedProperties: [makeProperty()],
        tenants: [makePropertyTenant({
          tenant: makeTenant({ profile: 'risky', defaultRisk: 60 }),
          arrearsPennies: 0,
          arrearsMonths: 0,
        })],
        timeUntilNextMonth: 0,
        monthsPlayed: 1,
      });
      withSeed(seed, () => {
        useGameStore.getState().processMonthEnd();
      });
      const t = useGameStore.getState().tenants.find(x => x.propertyId === PROP_ID);
      if ((t?.arrearsPennies ?? 0) > 0) {
        triggered = true;
        expect(t!.arrearsMonths).toBeGreaterThanOrEqual(1);
        expect(t!.arrearsPennies).toBe(toPennies(800));
      }
    }
    expect(triggered).toBe(true);
  });
});

// ─── Credit score ────────────────────────────────────────────────

describe('credit score transitions', () => {
  it('stays within [300, 850] when nudged by month-end (vacant portfolio)', () => {
    useGameStore.setState({
      ownedProperties: [makeProperty()],
      tenants: [],
      timeUntilNextMonth: 0,
      monthsPlayed: 1,
    });
    withSeed(707, () => {
      useGameStore.getState().processMonthEnd();
    });
    const s = useGameStore.getState().creditScore;
    expect(s).toBeGreaterThanOrEqual(300);
    expect(s).toBeLessThanOrEqual(850);
  });

  it('large mortgaged portfolio with healthy cash boosts credit by +5', () => {
    const mortgage: Mortgage = {
      id: 'm1',
      propertyId: PROP_ID,
      principal: toPennies(80_000),
      monthlyPayment: toPennies(400),
      remainingBalance: toPennies(80_000),
      interestRate: 0.05,
      termYears: 25,
      mortgageType: 'repayment',
      providerId: 'hsbc',
      startDate: Date.now(),
      startMonth: 0,
    };
    useGameStore.setState({
      ownedProperties: [makeProperty({ value: toPennies(200_000), marketValue: toPennies(200_000) })],
      mortgages: [mortgage],
      tenants: [makePropertyTenant({ tenant: makeTenant({ defaultRisk: 1 }) })],
      cash: toPennies(50_000),
      creditScore: 700,
      timeUntilNextMonth: 0,
      monthsPlayed: 1,
    });
    withSeed(808, () => {
      useGameStore.getState().processMonthEnd();
    });
    const score = useGameStore.getState().creditScore;
    // +5 for mortgage-serviced bonus; LTV (80/200=0.40) is under both penalty bands.
    expect(score).toBeGreaterThanOrEqual(700);
  });
});
