// Pure financial calculation functions — no side effects, no state
import type { Property, Mortgage, PropertyTenant, MortgageProvider } from "@/types/game";
import { toPennies } from "@/lib/formatCurrency";
import { MORTGAGE_PROVIDERS, BASE_MARKET_RATE } from "./constants";

// UK Stamp Duty Land Tax — input & output in pennies
export function calculateStampDuty(purchasePrice: number): number {
  const p = purchasePrice; // pennies
  const band0 = toPennies(40_000);
  const band1 = toPennies(250_000);
  const band2 = toPennies(925_000);
  const band3 = toPennies(1_500_000);

  if (p <= band0) return 0;

  let duty = 0;
  // 0-£250k: 3%
  if (p > band0) duty += Math.round((Math.min(p, band1) - band0) * 0.03);
  // £250k-£925k: 8%
  if (p > band1) duty += Math.round((Math.min(p, band2) - band1) * 0.08);
  // £925k-£1.5M: 13%
  if (p > band2) duty += Math.round((Math.min(p, band3) - band2) * 0.13);
  // £1.5M+: 15%
  if (p > band3) duty += Math.round((p - band3) * 0.15);

  return Math.floor(duty);
}

// Calculate DTI ratio
export function calculateDTI(
  mortgages: Mortgage[],
  ownedProperties: Property[],
  tenants: PropertyTenant[]
): number {
  const totalPayments = mortgages.reduce((s, m) => s + m.monthlyPayment, 0);
  const totalIncome = ownedProperties.reduce((total, prop) => {
    const hasTenant = tenants.some(t => t.propertyId === prop.id);
    return total + (hasTenant ? prop.monthlyIncome : 0);
  }, 0);
  if (totalIncome === 0) return totalPayments > 0 ? 999 : 0;
  return totalPayments / totalIncome;
}

// Fluctuate mortgage provider rates each month
export function fluctuateProviderRates(
  currentRates: Record<string, number>
): Record<string, number> {
  const newRates: Record<string, number> = {};
  MORTGAGE_PROVIDERS.forEach(provider => {
    const current = currentRates[provider.id] || provider.baseRate;
    const volatility = provider.baseRate < 0.05 ? 0.008 : provider.baseRate < 0.07 ? 0.005 : 0.003;
    const fluctuation = (Math.random() - 0.5) * 2 * volatility;
    const minRate = provider.baseRate - 0.015;
    const maxRate = provider.baseRate + 0.015;
    newRates[provider.id] = Math.max(Math.max(0.01, minRate), Math.min(maxRate, current + fluctuation));
  });
  return newRates;
}

// Get initial provider rates from base
export function getInitialProviderRates(): Record<string, number> {
  const rates: Record<string, number> = {};
  MORTGAGE_PROVIDERS.forEach(p => { rates[p.id] = p.baseRate; });
  return rates;
}

// Level → property value range (in pennies)
export function getPropertyValueRangeForLevel(level: number): { min: number; max: number } {
  const ranges: Record<number, [number, number]> = {
    1: [0, 100_000], 2: [100_000, 250_000], 3: [250_000, 500_000],
    4: [500_000, 750_000], 5: [750_000, 1_000_000], 6: [1_000_000, 2_500_000],
    7: [2_500_000, 5_000_000], 8: [5_000_000, 10_000_000],
    9: [10_000_000, 20_000_000], 10: [20_000_000, 30_000_000],
  };
  const [min, max] = ranges[level] || [0, 100_000];
  return { min: toPennies(min), max: toPennies(max) };
}

export function getMaxPropertiesForLevel(_level: number): number { return 10; }

export function getAvailablePropertyTypes(level: number): string[] {
  if (level >= 5) return ['all'];
  if (level >= 4) return ['residential', 'commercial', 'luxury'];
  if (level >= 3) return ['residential', 'commercial'];
  return ['residential'];
}

export function getMaxPropertyValue(level: number): number {
  return getPropertyValueRangeForLevel(level).max;
}

// Net-worth level requirement (in pennies)
export function getRequiredNetWorth(level: number): number {
  if (level <= 1) return 0;
  if (level === 2) return toPennies(250_000);
  return toPennies(250_000) * Math.pow(2, level - 2);
}
