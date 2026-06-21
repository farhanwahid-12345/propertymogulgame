// @vitest-environment jsdom
/**
 * Phase 4 — Targeted regression tests aimed at the bug classes we've already
 * been bitten by this session:
 *   • unit-conversion errors (rent review 100× bug)
 *   • array-merge omissions (missing tenantEvents push that blocked arrears
 *     evictions)
 *   • preview vs. apply mismatch (loan rate/cap drift)
 *   • silent yield drift outside its declared 6–15% band
 *   • sqft regressions across the planning → works pipeline
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from './gameStore';
import { withSeed } from '@/lib/rng';
import { toPennies, fromPennies } from '@/lib/formatCurrency';
import { impliedCommercialYield } from '@/lib/engine/market';
import { getEffectiveInternalSqft } from '@/lib/engine/planning';
import { LOAN_PRODUCTS } from '@/lib/engine/constants';
import type { Property, PropertyTenant, TenantEvent } from '@/types/game';
import type { Tenant } from '@/components/game/tenant-selector';

const PROP_ID = 'phase4-prop';

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
    name: 'Test',
    type: 'residential',
    price: toPennies(100_000),
    value: toPennies(100_000),
    marketValue: toPennies(100_000),
    neighborhood: 'Test',
    monthlyIncome: toPennies(800),
    baseRent: toPennies(800),
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

// ─── Rent review sanity (regression for 100× bug) ─────────────────

describe('commercial rent review — proposedMarketRentPennies sanity', () => {
  it('proposed rent stays within 0.9×–1.5× of current rent for a single review period', () => {
    const currentRent = toPennies(2_500);
    const freq = 60; // 5-year cycle, the highest commonly used
    const commercialProp = makeProperty({
      type: 'commercial',
      monthlyIncome: currentRent,
      baseRent: currentRent,
      commercialLease: {
        fri: true,
        termMonths: 120,
        startMonth: 0,
        expiryMonth: 120,
        reviewFrequencyMonths: freq,
        breakClause: { type: 'none' },
        conditionScoreAtLeaseStart: 65,
        negotiatedRentPennies: currentRent,
      },
    });
    useGameStore.setState({
      ownedProperties: [commercialProp],
      tenants: [makePropertyTenant({
        rentPennies: currentRent,
        moveInMonth: 0,
        lastRentReviewMonth: 0,
      })],
      timeUntilNextMonth: 0,
      monthsPlayed: freq, // exactly hit the review anniversary
    });
    withSeed(11, () => {
      useGameStore.getState().processMonthEnd();
    });
    const reviews = useGameStore.getState().pendingRentReviews ?? [];
    expect(reviews).toHaveLength(1);
    const r = reviews[0];
    expect(r.currentRentPennies).toBe(currentRent);
    // Sanity band — 100× would land at ~250_000 pennies → catastrophically out.
    expect(r.proposedMarketRentPennies).toBeGreaterThanOrEqual(Math.floor(currentRent * 0.9));
    expect(r.proposedMarketRentPennies).toBeLessThanOrEqual(Math.ceil(currentRent * 1.5));
  });
});

// ─── Tenant event persistence (regression for missing array-merge) ─

describe('processMonthEnd persists default tenantEvents after a missed payment', () => {
  it('a missed-rent tick produces a corresponding default event in state.tenantEvents', () => {
    let triggered = false;
    for (let seed = 1; seed < 30 && !triggered; seed++) {
      useGameStore.getState().resetGame();
      useGameStore.setState({
        ownedProperties: [makeProperty()],
        tenants: [makePropertyTenant({
          tenant: makeTenant({ profile: 'risky', defaultRisk: 60 }),
          arrearsPennies: 0,
          arrearsMonths: 0,
        })],
        tenantEvents: [],
        timeUntilNextMonth: 0,
        monthsPlayed: 1,
      });
      withSeed(seed, () => {
        useGameStore.getState().processMonthEnd();
      });
      const t = useGameStore.getState().tenants.find(x => x.propertyId === PROP_ID);
      if ((t?.arrearsPennies ?? 0) > 0) {
        triggered = true;
        const events: TenantEvent[] = useGameStore.getState().tenantEvents;
        const defaults = events.filter(e => e.type === 'default' && e.propertyId === PROP_ID);
        expect(defaults.length).toBeGreaterThanOrEqual(1);
        expect(defaults[defaults.length - 1].month).toBe(useGameStore.getState().monthsPlayed);
      }
    }
    expect(triggered).toBe(true);
  });
});

// ─── Loan rate / cap consistency (preview vs. applied) ────────────

describe('applyForLoan — applied rate matches the preview computation', () => {
  it('a personal loan booked at the panel-preview inputs lands at the previewed APR', () => {
    // Plant a known store state so the preview and the action see identical inputs.
    useGameStore.setState({
      cash: toPennies(50_000),
      creditScore: 720,
      landlordReputation: 50,
      ownedProperties: [makeProperty({ monthlyIncome: toPennies(2_000) })],
      mortgages: [],
      loans: [],
      annualAccounts: [],
      currentMarketRate: 0.05,
      currentLoanRates: { personal: 0.04, business: 0.05 },
    } as any);

    const s = useGameStore.getState() as any;
    const kind: 'personal' = 'personal';
    const product = LOAN_PRODUCTS[kind];
    // Mirror loans-panel preview math exactly.
    const creditPenalty = s.creditScore >= 800 ? -0.005 : s.creditScore >= 650 ? 0 : s.creditScore >= 500 ? 0.01 : 0.02;
    const spread = s.currentLoanRates?.[kind] ?? product.baseSpread;
    const previewRate = Math.max(0.02, s.currentMarketRate + spread + creditPenalty);

    useGameStore.getState().applyForLoan(kind, toPennies(5_000), 36);

    const loans = (useGameStore.getState() as any).loans;
    expect(loans).toHaveLength(1);
    // Allow tiny float drift; primarily guards against a different *rule* being applied.
    expect(loans[0].interestRate).toBeCloseTo(previewRate, 6);
  });
});

// ─── Commercial yield bounds across the full input space ──────────

describe('impliedCommercialYield stays inside [0.06, 0.15]', () => {
  it('never returns outside the band for any (covenantStrength, remainingMonths)', () => {
    for (let cov = 0; cov <= 100; cov += 5) {
      for (let m = 0; m <= 300; m += 10) {
        const y = impliedCommercialYield(cov, m);
        expect(y).toBeGreaterThanOrEqual(0.06);
        expect(y).toBeLessThanOrEqual(0.15);
      }
    }
  });
});

// ─── Sqft monotonicity across planning → works → complete ─────────

describe('property internalSqft never decreases through a planning sequence', () => {
  it('base → approved (unbuilt) → works active → completed: sqft only goes up or stays flat', () => {
    const propertyId = 'sqft-mono';
    const renoId = 'ext-1';
    const renovationOptions = [{ id: renoId, sqftAdded: 200 }];

    // Stage 1 — base: no planning approvals on file.
    const baseSqft = getEffectiveInternalSqft(700, [], propertyId, renovationOptions, [], []);

    // Stage 2 — planning approved (unbuilt), sqft uplift not yet baked in.
    const approvedSqft = getEffectiveInternalSqft(
      700,
      [{ propertyId, renovationTypeId: renoId, status: 'approved', sqftAppliedAtPlanning: false }],
      propertyId,
      renovationOptions,
      [],
      [],
    );

    // Stage 3 — works active: store has baked the sqft into the base; the
    // planning application is marked sqftAppliedAtPlanning so we don't
    // double-count via the helper.
    const activeSqft = getEffectiveInternalSqft(
      900,
      [{ propertyId, renovationTypeId: renoId, status: 'approved', sqftAppliedAtPlanning: true }],
      propertyId,
      renovationOptions,
      [renoId],
      [],
    );

    // Stage 4 — completed renovation: sqft remains baked in.
    const completedSqft = getEffectiveInternalSqft(
      900,
      [{ propertyId, renovationTypeId: renoId, status: 'approved', sqftAppliedAtPlanning: true }],
      propertyId,
      renovationOptions,
      [],
      [renoId],
    );

    expect(approvedSqft).toBeGreaterThanOrEqual(baseSqft);
    expect(activeSqft).toBeGreaterThanOrEqual(approvedSqft);
    expect(completedSqft).toBeGreaterThanOrEqual(activeSqft);
    // And concretely: a 200 sqft extension should land at +200 over baseline.
    expect(completedSqft).toBe(baseSqft + 200);
  });
});
