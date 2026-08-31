/**
 * Improvements #7 item 6 / #8 item 7 — bank investment products.
 *
 * Five products with escalating risk and different liquidity rules. All money is
 * integer pennies. Monthly returns are drawn from a seeded distribution so saves
 * stay replayable.
 *
 * Product spec (from design doc):
 * - Instant-access savings: BoE base rate + 0.5%.
 * - Premium Bonds: ~5%/yr, stable, £50,000 holding cap.
 * - S&P 500: 5–12%/yr, ~9.5% median, inversely tied to the BoE rate.
 * - Risky stocks: monthly thirds — 33% big gain / 33% big loss / 33% flat.
 * - Crypto: same thirds model with much wider swings.
 */
import { gameRandom } from '@/lib/rng';

export type InvestmentKind = 'savings' | 'bonds' | 'index' | 'risky' | 'crypto';

export interface InvestmentProduct {
  kind: InvestmentKind;
  name: string;
  blurb: string;
  /** Minimum opening deposit (pennies). */
  minDepositPennies: number;
  /** Optional maximum total holding (pennies) — e.g. the £50k Premium Bonds cap. */
  maxHoldingPennies?: number;
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
    name: 'High-interest savings',
    blurb: 'Pays the Bank of England base rate + 0.5%. Withdraw any time.',
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
    name: 'Premium Bonds',
    blurb: '≈5% per year via the monthly prize draw, very stable. Max holding £50,000.',
    minDepositPennies: 100_00,
    maxHoldingPennies: 50_000_00,
    noticeMonths: 1,
    meanMonthlyReturn: 0.05 / 12,
    volatility: 0.0008,
    boeSensitivity: 0,
    earlyExitPenalty: 0,
    lockMonths: 0,
    riskLabel: 'Very low risk',
  },
  index: {
    kind: 'index',
    name: 'S&P 500 index fund',
    blurb: '5–12%/yr (≈9.5% median) — does best when the base rate is low. 1 month to settle.',
    minDepositPennies: 500_00,
    noticeMonths: 1,
    meanMonthlyReturn: 0.095 / 12,
    volatility: 0.038,
    boeSensitivity: -0.6,
    earlyExitPenalty: 0,
    lockMonths: 0,
    riskLabel: 'Medium risk',
  },
  risky: {
    kind: 'risky',
    name: 'High-growth stock picks',
    blurb: 'Each month: roughly a third chance of a big gain, a big loss, or flat. 1 month to settle.',
    minDepositPennies: 500_00,
    noticeMonths: 1,
    meanMonthlyReturn: 0.012,
    volatility: 0.11,
    boeSensitivity: -0.4,
    earlyExitPenalty: 0,
    lockMonths: 0,
    riskLabel: 'High risk',
  },
  crypto: {
    kind: 'crypto',
    name: 'Crypto basket',
    blurb: 'Same thirds model as risky stocks but with wilder swings — moon or crash. 1 month to settle.',
    minDepositPennies: 250_00,
    noticeMonths: 1,
    meanMonthlyReturn: 0.02,
    volatility: 0.28,
    boeSensitivity: -0.3,
    earlyExitPenalty: 0,
    lockMonths: 0,
    riskLabel: 'Very high risk',
  },
};

/** Headline annualised rate shown in the UI for a product. */
export function annualisedRate(product: InvestmentProduct, boeRate: number): number {
  if (product.kind === 'savings') return Math.max(0.005, boeRate + 0.005);
  if (product.kind === 'bonds') return 0.05;
  // S&P 500: 9.5% median at a 4.5% base rate, clamped into the 5–12% band;
  // low BoE → higher returns, high BoE → lower returns.
  if (product.kind === 'index') {
    return Math.min(0.12, Math.max(0.05,
      product.meanMonthlyReturn * 12 + product.boeSensitivity * (boeRate - 0.045)));
  }
  // Risky buckets show the long-run mean; months are drawn as thirds.
  return product.meanMonthlyReturn * 12;
}

/** Symmetric-ish random draw in [-1, 1] with a central bias. */
function draw(): number {
  return (gameRandom() + gameRandom() - 1);
}

/**
 * Thirds model for the speculative buckets: ~33% big gain, ~33% big loss,
 * ~33% roughly flat. Magnitudes scale with the product volatility.
 */
function thirdsReturn(product: InvestmentProduct): number {
  const roll = gameRandom();
  const swing = product.volatility * (0.8 + gameRandom() * 0.7);
  if (roll < 1 / 3) return swing;                    // big gain
  if (roll < 2 / 3) return -swing;                   // big loss
  return draw() * product.volatility * 0.15;         // ~flat
}

/**
 * Monthly return (decimal) for one holding. Deterministic products ignore
 * volatility; the speculative buckets use the thirds model.
 */
export function monthlyReturn(kind: InvestmentKind, boeRate: number): number {
  const product = INVESTMENT_PRODUCTS[kind];
  if (kind === 'savings' || kind === 'bonds') {
    return annualisedRate(product, boeRate) / 12 + draw() * product.volatility;
  }
  if (kind === 'index') {
    return annualisedRate(product, boeRate) / 12 + draw() * product.volatility;
  }
  const boeTilt = product.boeSensitivity * (boeRate - 0.045) / 12;
  const floor = kind === 'crypto' ? -0.9 : -0.75;
  return Math.max(floor, thirdsReturn(product) + boeTilt);
}
