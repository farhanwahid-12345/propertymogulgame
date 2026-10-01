// Pure 12-month cash-flow projection — all values in pennies.
import type { Mortgage, Property, PropertyTenant } from "@/types/game";
import { MONTHLY_INSURANCE_RATE } from "./financials";

/** Assumed uplift when a fixed rate ends and reverts to the lender's SVR. */
export const SVR_REVERSION_UPLIFT = 0.02;

export interface ForecastMonth {
  month: number;
  rent: number;
  mortgage: number;
  costs: number;
  net: number;
  cash: number;
  fixEnding: string[];
}

function fixEndMonth(m: Mortgage): number | null {
  if (!m.fixedTermYears || m.revertedToSVR || m.startMonth == null) return null;
  return m.startMonth + m.fixedTermYears * 12;
}

function revertedPayment(m: Mortgage): number {
  const svr = (m.interestRate || 0) + SVR_REVERSION_UPLIFT;
  if (m.mortgageType === 'interest-only') return Math.round(m.remainingBalance * svr / 12);
  const r = svr / 12;
  const n = Math.max(12, (m.termYears || 25) * 12);
  return Math.round(m.remainingBalance * r / (1 - Math.pow(1 + r, -n)));
}

export function projectCashflow(args: {
  cash: number;
  monthsPlayed: number;
  ownedProperties: Property[];
  tenants: PropertyTenant[];
  mortgages: Mortgage[];
  horizon?: number;
}): ForecastMonth[] {
  const { ownedProperties, tenants, mortgages, monthsPlayed } = args;
  const horizon = args.horizon ?? 12;
  const occupied = new Set((tenants || []).map(t => t.propertyId));
  const rent = ownedProperties.reduce((s, p) => s + (occupied.has(p.id) ? p.monthlyIncome || 0 : 0), 0);
  const costs = Math.round(ownedProperties.reduce((s, p) => s + (p.value || 0) * MONTHLY_INSURANCE_RATE, 0));
  const out: ForecastMonth[] = [];
  let cash = args.cash;
  for (let i = 1; i <= horizon; i++) {
    const month = monthsPlayed + i;
    const fixEnding: string[] = [];
    const mortgage = (mortgages || []).reduce((s, m) => {
      const end = fixEndMonth(m);
      if (end !== null && end === month) {
        fixEnding.push(ownedProperties.find(p => p.id === m.propertyId)?.name || 'Mortgage');
      }
      return s + (end !== null && month >= end ? revertedPayment(m) : m.monthlyPayment || 0);
    }, 0);
    const net = rent - mortgage - costs;
    cash += net;
    out.push({ month, rent, mortgage, costs, net, cash, fixEnding });
  }
  return out;
}
