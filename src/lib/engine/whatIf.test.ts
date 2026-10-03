import { describe, it, expect } from 'vitest';
import { calcWhatIf, monthlyPayment } from './whatIf';

const base = {
  pricePennies: 10_000_000, monthlyRentPennies: 80_000, ltvPct: 75, annualRatePct: 5,
  termYears: 25, fixedYears: 2, revertRatePct: 8, interestOnly: true,
  monthlyCostsPennies: 10_000, upfrontCostsPennies: 300_000,
};

describe('whatIf', () => {
  it('interest-only payment is loan × rate / 12', () => {
    expect(monthlyPayment(7_500_000, 5, 25, true)).toBe(31_250);
  });
  it('splits deposit and loan by LTV', () => {
    const r = calcWhatIf(base);
    expect(r.loanPennies).toBe(7_500_000);
    expect(r.depositPennies).toBe(2_500_000);
    expect(r.monthlyCashflowPennies).toBe(80_000 - 31_250 - 10_000);
  });
  it('revert rate raises payment and cuts cashflow', () => {
    const r = calcWhatIf(base);
    expect(r.revertPaymentPennies).toBeGreaterThan(r.monthlyPaymentPennies);
    expect(r.revertCashflowPennies).toBeLessThan(r.monthlyCashflowPennies);
  });
  it('repayment mortgage costs less total interest than interest-only', () => {
    const io = calcWhatIf(base).totalInterestPennies;
    const rp = calcWhatIf({ ...base, interestOnly: false }).totalInterestPennies;
    expect(rp).toBeLessThan(io);
  });
  it('caps LTV at 95%', () => {
    expect(calcWhatIf({ ...base, ltvPct: 120 }).loanPennies).toBe(9_500_000);
  });
});
