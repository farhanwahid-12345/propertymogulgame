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
  it('uses lenient single-property ICR with 3 mortgaged properties', () => {
    // Single-property ICR: 1200 / monthlyPayment must cover >= 1.0
    const r = calculateMortgageEligibility({
      ...baseReq,
      mortgagedPropertyCount: 3,
      ownedPropertyCount: 3,
      totalRentalIncome: 1_200,
      existingMonthlyMortgagePayments: 3_000,
    });
    expect(r.eligible).toBe(true);
  });

  it('flips to portfolio stress test once 4+ properties are mortgaged', () => {
    // Same numbers but PRA kicks in — portfolio ICR fails 1.20×
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
