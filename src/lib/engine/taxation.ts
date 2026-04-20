// UK Taxation system — pure functions, all monetary values in pennies
import type { EntityType } from "@/types/game";

// UK Income Tax bands (2024/25) — thresholds in pennies
const PERSONAL_ALLOWANCE = 1_257_000; // £12,570
const BASIC_RATE_LIMIT = 5_027_000; // £50,270
const HIGHER_RATE_LIMIT = 12_514_000; // £125,140

/**
 * Calculate UK Income Tax for sole traders.
 * Section 24: mortgage interest is NOT deductible — only a 20% tax credit.
 * Input: annual figures in pennies.
 */
export function calculateIncomeTax(
  annualRentalIncome: number,
  annualMortgageInterest: number,
  annualExpenses: number, // council tax, repairs, etc.
): { tax: number; section24Credit: number; effectiveTax: number } {
  // Sole trader: expenses (excl mortgage interest) are deductible
  const taxableIncome = Math.max(0, annualRentalIncome - annualExpenses);

  let tax = 0;
  let remaining = taxableIncome;

  // Personal allowance (tapers above £100k but we'll simplify)
  const personalAllowance = taxableIncome > 10_000_000 
    ? Math.max(0, PERSONAL_ALLOWANCE - Math.floor((taxableIncome - 10_000_000) / 2))
    : PERSONAL_ALLOWANCE;
  remaining = Math.max(0, remaining - personalAllowance);

  // Basic rate: 20%
  const basicBand = Math.min(remaining, BASIC_RATE_LIMIT - personalAllowance);
  tax += Math.floor(basicBand * 0.20);
  remaining -= basicBand;

  // Higher rate: 40%
  const higherBand = Math.min(remaining, HIGHER_RATE_LIMIT - BASIC_RATE_LIMIT);
  tax += Math.floor(higherBand * 0.40);
  remaining -= higherBand;

  // Additional rate: 45%
  if (remaining > 0) {
    tax += Math.floor(remaining * 0.45);
  }

  // Section 24: 20% tax credit on mortgage interest
  const section24Credit = Math.floor(annualMortgageInterest * 0.20);
  const effectiveTax = Math.max(0, tax - section24Credit);

  return { tax, section24Credit, effectiveTax };
}

/**
 * Corporation Tax for LTD companies.
 * Mortgage interest IS fully deductible as a business expense.
 * Small profits rate: 19% (profits ≤ £50k), Main rate: 25% (profits > £250k), marginal relief between.
 */
export function calculateCorporationTax(
  annualRentalIncome: number,
  annualMortgageInterest: number,
  annualExpenses: number,
): number {
  // LTD: mortgage interest is deductible
  const taxableProfit = Math.max(0, annualRentalIncome - annualMortgageInterest - annualExpenses);

  if (taxableProfit <= 5_000_000) {
    // Small profits rate: 19%
    return Math.floor(taxableProfit * 0.19);
  } else if (taxableProfit >= 25_000_000) {
    // Main rate: 25%
    return Math.floor(taxableProfit * 0.25);
  } else {
    // Marginal relief between £50k-£250k
    const mainTax = Math.floor(taxableProfit * 0.25);
    const marginalRelief = Math.floor((25_000_000 - taxableProfit) * (1 / 400) * taxableProfit / 25_000_000);
    return mainTax - marginalRelief;
  }
}

/**
 * Capital Gains Tax (CGT) on property sale — Sole Trader only.
 * Residential property: 18% (basic rate) or 24% (higher rate).
 * Annual exempt amount: £3,000 (2024/25).
 */
export function calculateCGT(
  salePrice: number,
  purchasePrice: number,
  improvementCosts: number,
  entityType: EntityType,
): number {
  if (entityType === 'ltd') return 0; // LTD pays corp tax, not CGT
  
  const gain = salePrice - purchasePrice - improvementCosts;
  if (gain <= 0) return 0;

  const annualExemption = 300_000; // £3,000 in pennies
  const taxableGain = Math.max(0, gain - annualExemption);

  // Simplified: use 24% (higher rate) for property — most landlords are higher rate
  return Math.floor(taxableGain * 0.24);
}

// Condition rent multipliers
export function getConditionRentMultiplier(condition: string): number {
  switch (condition) {
    case 'premium': return 1.25;
    case 'standard': return 1.0;
    case 'dilapidated': return 0.70;
    default: return 1.0;
  }
}

// Depreciation: months until condition degrades
export function getDepreciationMonths(condition: string): number {
  switch (condition) {
    case 'premium': return 36; // 3 years → standard
    case 'standard': return 60; // 5 years → dilapidated
    default: return 999; // dilapidated doesn't degrade further
  }
}

// Asset value uplift when upgrading condition (multiplier on current value)
export function getConditionValueUplift(fromCondition: string, toCondition: string): number {
  if (fromCondition === 'standard' && toCondition === 'premium') return 1.15;
  if (fromCondition === 'dilapidated' && toCondition === 'standard') return 1.25;
  if (fromCondition === 'dilapidated' && toCondition === 'premium') return 1.40;
  return 1.0;
}

// Renovation costs to upgrade condition (in pennies, based on property value)
export function getConditionUpgradeCost(
  propertyValue: number,
  fromCondition: string,
  toCondition: string,
): number {
  if (fromCondition === 'dilapidated' && toCondition === 'standard') {
    return Math.floor(propertyValue * 0.08); // 8% of value
  }
  if (fromCondition === 'standard' && toCondition === 'premium') {
    return Math.floor(propertyValue * 0.15); // 15% of value
  }
  if (fromCondition === 'dilapidated' && toCondition === 'premium') {
    return Math.floor(propertyValue * 0.22); // 22% of value
  }
  return 0;
}
