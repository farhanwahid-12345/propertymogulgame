import { describe, it, expect } from 'vitest';
import { calculateMortgageEligibility } from './mortgageEligibility';

// Baseline eligibility request — passes by default; tests perturb one field
// at a time to verify the new Phase 5 gates.
const baseReq = {
  creditScore: 750,
  loanAmount: 100_000,
  propertyValue: 150_000,
  propertyMonthlyRent: 1_200,
  providerBaseRate: 0.05,
  providerMinCreditScore: 600,
  providerMaxLTV: 0.85,
  providerId: 'halifax',
  termYears: 25,
  mortgageType: 'repayment' as const,
  existingMonthlyMortgagePayments: 0,
  totalRentalIncome: 0,
};

describe('Phase 5 #16 — unmortgageable auction stock', () => {
  it('refuses standard BTL mortgage when property needs full refurb', () => {
    const r = calculateMortgageEligibility({ ...baseReq, propertyNeedsRefurb: true });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/habitability|bridging/i);
  });

  it('approves the same loan once the refurb flag clears', () => {
    const r = calculateMortgageEligibility({ ...baseReq, propertyNeedsRefurb: false });
    expect(r.eligible).toBe(true);
  });
});

describe('Phase 5 #17 — PRA Portfolio Landlord threshold', () => {
  it('does NOT label rejection as PRA when fewer than 4 properties are mortgaged', () => {
    const r = calculateMortgageEligibility({
      ...baseReq,
      mortgagedPropertyCount: 3,
      ownedPropertyCount: 3,
      totalRentalIncome: 1_200,
      existingMonthlyMortgagePayments: 3_000,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason ?? '').not.toMatch(/Portfolio Landlord \(PRA\)/);
  });

  it('labels rejection as PRA once 4+ properties are mortgaged', () => {
    const r = calculateMortgageEligibility({
      ...baseReq,
      mortgagedPropertyCount: 4,
      ownedPropertyCount: 4,
      totalRentalIncome: 1_200,
      existingMonthlyMortgagePayments: 3_000,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/Portfolio Landlord \(PRA\)/);
  });
});
