/** Pure "what-if" purchase/remortgage calculator. All money in pennies. */
export interface WhatIfInput {
  pricePennies: number;
  monthlyRentPennies: number;
  ltvPct: number; // 0-95
  annualRatePct: number;
  termYears: number;
  fixedYears: number;
  revertRatePct: number;
  interestOnly: boolean;
  monthlyCostsPennies: number; // insurance, agent, maintenance
  upfrontCostsPennies: number; // stamp duty, fees
}

export interface WhatIfResult {
  loanPennies: number;
  depositPennies: number;
  monthlyPaymentPennies: number;
  revertPaymentPennies: number;
  monthlyCashflowPennies: number;
  revertCashflowPennies: number;
  totalInterestPennies: number;
  cashOnCashRoiPct: number;
}

export function monthlyPayment(loan: number, annualRatePct: number, termYears: number, interestOnly: boolean): number {
  const r = annualRatePct / 100 / 12;
  if (loan <= 0) return 0;
  if (interestOnly) return Math.round(loan * r);
  const n = Math.max(1, Math.round(termYears * 12));
  if (r === 0) return Math.round(loan / n);
  return Math.round((loan * r) / (1 - Math.pow(1 + r, -n)));
}

export function calcWhatIf(i: WhatIfInput): WhatIfResult {
  const ltv = Math.min(95, Math.max(0, i.ltvPct));
  const loan = Math.round(i.pricePennies * ltv / 100);
  const deposit = i.pricePennies - loan;
  const pay = monthlyPayment(loan, i.annualRatePct, i.termYears, i.interestOnly);
  const revert = monthlyPayment(loan, i.revertRatePct, i.termYears, i.interestOnly);
  const n = Math.round(i.termYears * 12);
  const fixedMonths = Math.min(n, Math.round(i.fixedYears * 12));
  let totalInterest: number;
  if (i.interestOnly) {
    totalInterest = pay * fixedMonths + revert * (n - fixedMonths);
  } else {
    // Simulate balance so the revert rate applies to the remaining balance.
    let bal = loan; totalInterest = 0;
    for (let m = 0; m < n && bal > 0; m++) {
      const rate = (m < fixedMonths ? i.annualRatePct : i.revertRatePct) / 100 / 12;
      const p = m < fixedMonths ? pay : monthlyPayment(bal, i.revertRatePct, (n - m) / 12, false);
      const interest = Math.round(bal * rate);
      totalInterest += interest;
      bal -= Math.max(0, p - interest);
      if (m === fixedMonths - 1 && fixedMonths < n) { /* revert begins next month */ }
    }
  }
  const cf = i.monthlyRentPennies - pay - i.monthlyCostsPennies;
  const revertCf = i.monthlyRentPennies - revert - i.monthlyCostsPennies;
  const cashIn = deposit + i.upfrontCostsPennies;
  const roi = cashIn > 0 ? (cf * 12 / cashIn) * 100 : 0;
  return {
    loanPennies: loan, depositPennies: deposit, monthlyPaymentPennies: pay,
    revertPaymentPennies: revert, monthlyCashflowPennies: cf, revertCashflowPennies: revertCf,
    totalInterestPennies: Math.round(totalInterest), cashOnCashRoiPct: roi,
  };
}
