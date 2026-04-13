// Centralized mortgage eligibility system
// Used by Estate Agent, Auction House, Mortgage Management (refinance), and Portfolio Mortgage

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
  totalRentalIncome: number; // total across all existing tenanted properties
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

// DTI thresholds per provider
const PROVIDER_DTI_LIMITS: Record<string, number> = {
  hsbc: 0.50,
  nationwide: 0.50,
  halifax: 0.65,
  quickcash: 0.80,
  easyloan: 0.80,
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
  // If player owns < 3 properties: lenient 100% ICR (rent covers mortgage)
  // If player owns >= 3 properties: portfolio-level 125% ICR on TOTAL income vs TOTAL payments
  const ownedPropertyCount = req.ownedPropertyCount ?? 0;
  
  if (ownedPropertyCount < 3) {
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
    // Portfolio affordability: TOTAL rental income must be >= 125% of TOTAL mortgage payments
    const totalIncomeWithNew = req.totalRentalIncome + req.propertyMonthlyRent;
    const totalPaymentsWithNew = req.existingMonthlyMortgagePayments + monthlyPayment;
    if (totalPaymentsWithNew > 0 && totalIncomeWithNew > 0) {
      const portfolioICR = totalIncomeWithNew / totalPaymentsWithNew;
      result.icrRatio = portfolioICR;
      if (portfolioICR < 1.25) {
        return {
          ...result,
          eligible: false,
          reason: `Mortgage Denied: Portfolio rental income (£${Math.floor(totalIncomeWithNew).toLocaleString()}/mo) fails the 125% stress test vs total payments (£${Math.ceil(totalPaymentsWithNew).toLocaleString()}/mo). Need £${Math.ceil(totalPaymentsWithNew * 1.25).toLocaleString()}/mo total rental income.`,
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
