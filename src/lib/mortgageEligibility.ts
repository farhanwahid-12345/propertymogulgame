// Centralized mortgage eligibility system
// Used by Estate Agent, Auction House, Mortgage Management (refinance), and Portfolio Mortgage

import { BASE_MARKET_RATE } from "@/lib/engine/constants";

/**
 * Fixed-term adjustment applied on top of the live provider rate.
 * Mirrors the values used by the store at mortgage creation time.
 */
export function getFixedTermRateAdjustment(fixedTermYears?: number): number {
  switch (fixedTermYears) {
    case 2: return -0.004;
    case 5: return -0.002;
    case 10: return 0.001;
    default: return 0;
  }
}

/**
 * Effective per-provider rate BEFORE the credit-score adjustment.
 *   = liveProviderRate + (currentMarketRate − BASE_MARKET_RATE) + fixedAdj
 * Both UI (rate shown at signup) and store (rate persisted) must call this
 * so the player gets exactly the rate they signed up for.
 */
export function getEffectiveProviderRate(args: {
  liveProviderRate: number;
  currentMarketRate: number;
  fixedTermYears?: number;
}): number {
  return args.liveProviderRate
    + (args.currentMarketRate - BASE_MARKET_RATE)
    + getFixedTermRateAdjustment(args.fixedTermYears);
}

export interface MortgageEligibilityRequest {
  creditScore: number;
  loanAmount: number;
  propertyValue: number;
  propertyMonthlyRent: number; // projected rental income for THIS property
  providerBaseRate: number;
  providerMinCreditScore: number;
  providerMaxLTV: number;
  providerId: string;
  termYears: number;
  mortgageType: 'repayment' | 'interest-only';
  // Existing portfolio context
  existingMonthlyMortgagePayments: number; // total across all existing mortgages
  totalRentalIncome: number; // EXPECTED monthly rent across all owned properties (regardless of current tenancy)
  ownedPropertyCount?: number; // number of properties player currently owns
  /** Phase 5 #17 — number of properties currently mortgaged. PRA Portfolio
   *  Landlord stress-test triggers at 4+ mortgaged properties. */
  mortgagedPropertyCount?: number;
  /** Phase 5 #16 — property is missing kitchen/bathroom / uninhabitable.
   *  Standard BTL lenders refuse; only bridging finance can complete. */
  propertyNeedsRefurb?: boolean;
}

export interface MortgageEligibilityResult {
  eligible: boolean;
  reason?: string;
  adjustedRate: number; // final interest rate after credit penalties
  maxLTV: number; // max LTV this credit score qualifies for
  monthlyPayment: number;
  icrRatio?: number; // interest coverage ratio
}

// Credit score → max LTV mapping (more forgiving for early game)
export function getMaxLTVForCreditScore(creditScore: number): number {
  if (creditScore >= 800) return 0.95; // Excellent: up to 95% (only 5% deposit)
  if (creditScore >= 650) return 0.90; // Good: up to 90%
  if (creditScore >= 500) return 0.85; // Fair: up to 85%
  return 0.75; // Poor: max 75%
}

// Credit score → rate penalty
export function getRatePenaltyForCreditScore(creditScore: number): number {
  if (creditScore >= 800) return -0.005; // Excellent: 0.5% discount
  if (creditScore >= 650) return 0; // Good: standard
  if (creditScore >= 500) return 0.01; // Fair: +1%
  return 0.02; // Poor: +2%
}

// DTI thresholds per provider — generous on the riskier providers since they
// already charge a higher rate for taking on stretched borrowers.
const PROVIDER_DTI_LIMITS: Record<string, number> = {
  hsbc: 0.50,
  nationwide: 0.55,
  halifax: 0.65,
  quickcash: 0.85,
  easyloan: 0.85,
};

// Random rejection chance for premium providers
const PROVIDER_REJECTION_CHANCE: Record<string, number> = {
  hsbc: 0.15,
  nationwide: 0.10,
  halifax: 0.05,
  quickcash: 0,
  easyloan: 0,
};

export function calculateMonthlyPayment(
  principal: number,
  annualRate: number,
  termYears: number,
  type: 'repayment' | 'interest-only'
): number {
  if (principal <= 0 || annualRate <= 0) return 0;
  if (type === 'interest-only') {
    return (principal * annualRate) / 12;
  }
  const monthlyRate = annualRate / 12;
  const numPayments = termYears * 12;
  return (principal * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
    (Math.pow(1 + monthlyRate, numPayments) - 1);
}

/**
 * Single centralized eligibility check for ALL mortgage applications.
 * Used by: Estate Agent, Auction House, Refinance, Portfolio Mortgage.
 */
export function calculateMortgageEligibility(
  req: MortgageEligibilityRequest
): MortgageEligibilityResult {
  const ltvRequired = req.loanAmount / req.propertyValue;
  const creditMaxLTV = getMaxLTVForCreditScore(req.creditScore);
  const ratePenalty = getRatePenaltyForCreditScore(req.creditScore);
  const adjustedRate = Math.max(0.01, req.providerBaseRate + ratePenalty);

  // Calculate monthly payment with adjusted rate
  const monthlyPayment = calculateMonthlyPayment(
    req.loanAmount,
    adjustedRate,
    req.termYears,
    req.mortgageType
  );

  const result: MortgageEligibilityResult = {
    eligible: true,
    adjustedRate,
    maxLTV: Math.min(creditMaxLTV, req.providerMaxLTV),
    monthlyPayment,
  };

  // 0. Phase 5 #16 — Standard BTL lenders refuse uninhabitable stock.
  if (req.propertyNeedsRefurb) {
    return {
      ...result,
      eligible: false,
      reason: 'Mortgage Denied: Property is missing a kitchen/bathroom and fails the lender\'s habitability test. Use a bridging loan, renovate, then remortgage onto a standard product.',
    };
  }

  // 1. Credit score check against provider minimum
  if (req.creditScore < req.providerMinCreditScore) {
    return {
      ...result,
      eligible: false,
      reason: `Mortgage Denied: Credit score ${req.creditScore} is below ${req.providerMinCreditScore} minimum for this lender.`,
    };
  }

  // 2. LTV check: cap at BOTH provider max AND credit-score max
  const effectiveMaxLTV = Math.min(creditMaxLTV, req.providerMaxLTV);
  if (ltvRequired > effectiveMaxLTV) {
    const depositRequired = Math.round((1 - effectiveMaxLTV) * 100);
    return {
      ...result,
      eligible: false,
      reason: `Mortgage Denied: Your credit score of ${req.creditScore} requires a ${depositRequired}% deposit (max ${Math.round(effectiveMaxLTV * 100)}% LTV). Requested ${Math.round(ltvRequired * 100)}% LTV.`,
    };
  }

  // 3. ICR / Portfolio Affordability Stress Test
  // PRA Portfolio Landlord regime kicks in once the borrower has 4+ mortgaged
  // properties — every new application must then stress-test the ENTIRE book.
  // Fallback for legacy callers: trigger by ownedPropertyCount >= 3.
  const ownedPropertyCount = req.ownedPropertyCount ?? 0;
  const mortgagedPropertyCount = req.mortgagedPropertyCount ?? ownedPropertyCount;
  const isPortfolioLandlord = mortgagedPropertyCount >= 4 || ownedPropertyCount >= 3;

  if (!isPortfolioLandlord) {
    // Lenient: property rent just needs to cover 100% of its mortgage payment
    if (req.propertyMonthlyRent > 0 && monthlyPayment > 0) {
      const icrRatio = req.propertyMonthlyRent / monthlyPayment;
      result.icrRatio = icrRatio;
      if (icrRatio < 1.0) {
        return {
          ...result,
          eligible: false,
          reason: `Mortgage Denied: Property rental income (£${req.propertyMonthlyRent.toLocaleString()}/mo) doesn't cover the mortgage payment (£${Math.ceil(monthlyPayment).toLocaleString()}/mo).`,
        };
      }
    }
  } else {
    // Portfolio Landlord — TOTAL EXPECTED rental income must be >= 120% of TOTAL mortgage payments.
    const totalIncomeWithNew = req.totalRentalIncome + req.propertyMonthlyRent;
    const totalPaymentsWithNew = req.existingMonthlyMortgagePayments + monthlyPayment;
    if (totalPaymentsWithNew > 0 && totalIncomeWithNew > 0) {
      const portfolioICR = totalIncomeWithNew / totalPaymentsWithNew;
      result.icrRatio = portfolioICR;
      if (portfolioICR < 1.20) {
        const praPrefix = mortgagedPropertyCount >= 4 ? 'Portfolio Landlord (PRA): ' : '';
        return {
          ...result,
          eligible: false,
          reason: `${praPrefix}Mortgage Denied: Portfolio expected rental income (£${Math.floor(totalIncomeWithNew).toLocaleString()}/mo) fails the 120% stress test vs total payments (£${Math.ceil(totalPaymentsWithNew).toLocaleString()}/mo). Need £${Math.ceil(totalPaymentsWithNew * 1.20).toLocaleString()}/mo expected income.`,
        };
      }
    }
  }

  // 4. DTI check with new payment included
  const dtiLimit = PROVIDER_DTI_LIMITS[req.providerId] || 0.80;
  const totalIncome = req.totalRentalIncome + req.propertyMonthlyRent;
  if (totalIncome > 0) {
    const projectedDTI = (req.existingMonthlyMortgagePayments + monthlyPayment) / totalIncome;
    if (projectedDTI > dtiLimit) {
      return {
        ...result,
        eligible: false,
        reason: `Mortgage Denied: Debt-to-income ratio ${Math.round(projectedDTI * 100)}% exceeds ${Math.round(dtiLimit * 100)}% limit for this lender.`,
      };
    }
  } else if (req.existingMonthlyMortgagePayments + monthlyPayment > 0) {
    // No rental income at all but trying to get a mortgage
    return {
      ...result,
      eligible: false,
      reason: `Mortgage Denied: No rental income to support mortgage payments.`,
    };
  }

  // 5. Random rejection for premium providers
  const rejectionChance = PROVIDER_REJECTION_CHANCE[req.providerId] || 0;
  if (rejectionChance > 0 && Math.random() < rejectionChance) {
    return {
      ...result,
      eligible: false,
      reason: `Mortgage Denied: Application declined by ${req.providerId.toUpperCase()} underwriting. Try again next month or apply with another lender.`,
    };
  }

  return result;
}

/**
 * Binary search for the largest loan amount that would still pass eligibility.
 * Returns 0 if even £0 fails (e.g. credit score too low for provider).
 * Bypasses random rejection to give a deterministic ceiling.
 */
export function findMaxEligibleLoan(
  base: Omit<MortgageEligibilityRequest, 'loanAmount'>,
): number {
  const skipRandom = { ...base, providerId: `__det__${base.providerId}` };
  const test = (amount: number): boolean => {
    const r = calculateMortgageEligibility({ ...skipRandom, loanAmount: amount } as any);
    return r.eligible;
  };
  let lo = 0;
  let hi = Math.floor(base.propertyValue * 0.95);
  if (!test(0)) return 0;
  while (hi - lo > 500) {
    const mid = Math.floor((lo + hi) / 2);
    if (test(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}
