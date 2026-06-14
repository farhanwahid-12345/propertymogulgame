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
export interface IncomeTaxBreakdown {
  tax: number;
  section24Credit: number;
  effectiveTax: number;
  personalAllowance: number;
  basicBandTax: number;
  higherBandTax: number;
  additionalBandTax: number;
  taxableIncome: number;
}

export function calculateIncomeTax(
  annualRentalIncome: number,
  annualMortgageInterest: number,
  annualExpenses: number, // council tax, repairs, etc.
): IncomeTaxBreakdown {
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
  const basicBandTax = Math.floor(basicBand * 0.20);
  tax += basicBandTax;
  remaining -= basicBand;

  // Higher rate: 40%
  const higherBand = Math.min(remaining, HIGHER_RATE_LIMIT - BASIC_RATE_LIMIT);
  const higherBandTax = Math.floor(higherBand * 0.40);
  tax += higherBandTax;
  remaining -= higherBand;

  // Additional rate: 45%
  const additionalBandTax = remaining > 0 ? Math.floor(remaining * 0.45) : 0;
  tax += additionalBandTax;

  // Section 24: 20% tax credit on mortgage interest
  const section24Credit = Math.floor(annualMortgageInterest * 0.20);
  const effectiveTax = Math.max(0, tax - section24Credit);

  return {
    tax,
    section24Credit,
    effectiveTax,
    personalAllowance,
    basicBandTax,
    higherBandTax,
    additionalBandTax,
    taxableIncome,
  };
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
    // Small profits rate: 19% (≤ £50k)
    return Math.floor(taxableProfit * 0.19);
  } else if (taxableProfit >= 25_000_000) {
    // Main rate: 25% (≥ £250k)
    return Math.floor(taxableProfit * 0.25);
  } else {
    // Marginal relief between £50k and £250k (2023/24 onward).
    //   MR = (Upper − Profit) × (3/200)
    //   Tax = Profit × 25% − MR
    const marginalRelief = Math.floor((25_000_000 - taxableProfit) * 3 / 200);
    return Math.max(0, Math.floor(taxableProfit * 0.25) - marginalRelief);
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
    case 'premium': return 1.10;
    case 'standard': return 1.0;
    case 'dilapidated': return 0.85;
    default: return 1.0;
  }
}
/**
 * Project the annual tax bill (pennies) given the current year's running
 * accumulators. Used to warn the player one month before tax is collected.
 */
export function projectAnnualTax(
  entityType: EntityType,
  yearlyGrossRent: number,
  yearlyMortgageInterest: number,
  yearlyDeductibleExpenses: number,
  unusedLosses: number = 0,
): number {
  if (yearlyGrossRent <= 0) return 0;
  if (entityType === 'sole_trader') {
    const grossTaxable = Math.max(0, yearlyGrossRent - yearlyDeductibleExpenses);
    const offsetUsed = Math.min(unusedLosses, grossTaxable);
    const adjusted = yearlyGrossRent - offsetUsed;
    return calculateIncomeTax(adjusted, yearlyMortgageInterest, yearlyDeductibleExpenses).effectiveTax;
  }
  const preTax = yearlyGrossRent - yearlyMortgageInterest - yearlyDeductibleExpenses;
  if (preTax <= 0) return 0;
  const offsetUsed = Math.min(unusedLosses, preTax);
  return calculateCorporationTax(yearlyGrossRent - offsetUsed, yearlyMortgageInterest, yearlyDeductibleExpenses);
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
