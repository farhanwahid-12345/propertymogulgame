/**
 * Improvements #7 item 6 — bank investment products.
 *
 * Four products with escalating risk and different liquidity rules. All money is
 * integer pennies. Monthly returns are drawn from a seeded normal-ish
 * distribution (sum of two uniforms) so saves stay replayable.
 */
import { gameRandom } from '@/lib/rng';

export type InvestmentKind = 'savings' | 'bonds' | 'index' | 'risky';

export interface InvestmentProduct {
  kind: InvestmentKind;
  name: string;
  blurb: string;
  /** Minimum opening deposit (pennies). */
  minDepositPennies: number;
  /** Months before a withdrawal request settles into cash. */
  noticeMonths: number;
  /** Expected monthly return (decimal) before the BoE adjustment. */
  meanMonthlyReturn: number;
  /** Monthly volatility (decimal). 0 for deterministic products. */
  volatility: number;
  /** How much of the BoE base rate feeds into the return. */
  boeSensitivity: number;
  /** Penalty on principal when withdrawing before `lockMonths` (decimal). */
  earlyExitPenalty: number;
  /** Months the money is expected to stay in for the headline rate. */
  lockMonths: number;
  riskLabel: string;
}

export const INVESTMENT_PRODUCTS: Record<InvestmentKind, InvestmentProduct> = {
  savings: {
    kind: 'savings',
    name: 'Instant-access savings',
    blurb: 'Tracks the Bank of England base rate less 0.6%. Withdraw any time.',
    minDepositPennies: 100_00,
    noticeMonths: 0,
    meanMonthlyReturn: 0,
    volatility: 0,
    boeSensitivity: 1,
    earlyExitPenalty: 0,
    lockMonths: 0,
    riskLabel: 'No risk',
  },
  bonds: {
    kind: 'bonds',
    name: '3-year government bonds',
    blurb: 'Base rate plus 1.1%, fixed. 3 months notice; early exit costs 2% of the pot.',
    minDepositPennies: 1_000_00,
    noticeMonths: 3,
    meanMonthlyReturn: 0,
    volatility: 0.0008,
    boeSensitivity: 1,
    earlyExitPenalty: 0.02,
    lockMonths: 36,
    riskLabel: 'Very low risk',
  },
  index: {
    kind: 'index',
    name: 'S&P 500 index fund',
    blurb: 'Roughly 8%/yr long run, but individual months swing hard. 1 month to settle.',
    minDepositPennies: 500_00,
    noticeMonths: 1,
    meanMonthlyReturn: 0.0065,
    volatility: 0.038,
    boeSensitivity: -0.25,
    earlyExitPenalty: 0,
    lockMonths: 0,
    riskLabel: 'Medium risk',
  },
  risky: {
    kind: 'risky',
    name: 'High-growth stock picks',
    blurb: 'Big upside, real chance of a wipeout month. 1 month to settle.',
    minDepositPennies: 500_00,
    noticeMonths: 1,
    meanMonthlyReturn: 0.014,
    volatility: 0.135,
    boeSensitivity: -0.5,
    earlyExitPenalty: 0,
    lockMonths: 0,
    riskLabel: 'High risk',
  },
};

/** Headline annualised rate shown in the UI for a product. */
export function annualisedRate(product: InvestmentProduct, boeRate: number): number {
  if (product.kind === 'savings') return Math.max(0.001, boeRate - 0.006);
  if (product.kind === 'bonds') return boeRate + 0.011;
  return product.meanMonthlyReturn * 12 + product.boeSensitivity * boeRate * 0.5;
}

/** Symmetric-ish random draw in [-1, 1] with a central bias. */
function draw(): number {
  return (gameRandom() + gameRandom() - 1);
}

/**
 * Monthly return (decimal) for one holding. Deterministic products ignore
 * volatility; the risky bucket can suffer a rare heavy drawdown.
 */
export function monthlyReturn(kind: InvestmentKind, boeRate: number): number {
  const product = INVESTMENT_PRODUCTS[kind];
  if (kind === 'savings' || kind === 'bonds') {
    return annualisedRate(product, boeRate) / 12;
  }
  const base = product.meanMonthlyReturn + product.boeSensitivity * (boeRate - 0.04) / 12;
  let r = base + draw() * product.volatility;
  if (kind === 'risky' && gameRandom() < 0.04) {
    r -= 0.18 + gameRandom() * 0.22; // profit warning / blow-up
  }
  return Math.max(-0.75, r);
}
