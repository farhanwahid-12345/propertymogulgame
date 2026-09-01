import { describe, it, expect } from 'vitest';
import { INVESTMENT_PRODUCTS, annualisedRate, monthlyReturn } from './investments';
import { deriveSqft } from './market';

describe('investment products (Improvements #8 item 7)', () => {
  it('savings pays the BoE base rate plus 0.5%', () => {
    expect(annualisedRate(INVESTMENT_PRODUCTS.savings, 0.045)).toBeCloseTo(0.05, 6);
  });

  it('premium bonds pay ~5% and are capped at £50,000', () => {
    expect(annualisedRate(INVESTMENT_PRODUCTS.bonds, 0.02)).toBeCloseTo(0.05, 6);
    expect(INVESTMENT_PRODUCTS.bonds.maxHoldingPennies).toBe(50_000_00);
  });

  it('S&P 500 stays in the 5–12% band and falls as the base rate rises', () => {
    const low = annualisedRate(INVESTMENT_PRODUCTS.index, 0.005);
    const high = annualisedRate(INVESTMENT_PRODUCTS.index, 0.12);
    expect(low).toBeGreaterThan(high);
    for (const r of [0, 0.02, 0.045, 0.08, 0.15]) {
      const v = annualisedRate(INVESTMENT_PRODUCTS.index, r);
      expect(v).toBeGreaterThanOrEqual(0.05);
      expect(v).toBeLessThanOrEqual(0.12);
    }
  });

  it('risky and crypto produce gains, losses and flat months', () => {
    for (const kind of ['risky', 'crypto'] as const) {
      const draws = Array.from({ length: 400 }, () => monthlyReturn(kind, 0.045));
      expect(draws.some(d => d > 0.02)).toBe(true);
      expect(draws.some(d => d < -0.02)).toBe(true);
      expect(draws.some(d => Math.abs(d) < 0.02)).toBe(true);
    }
  });

  it('crypto swings wider than risky stocks', () => {
    expect(INVESTMENT_PRODUCTS.crypto.volatility)
      .toBeGreaterThan(INVESTMENT_PRODUCTS.risky.volatility);
  });
});

describe('plot footprint (Improvements #8 item 13)', () => {
  it('legacy properties derive roughly 35% plot coverage', () => {
    for (const type of ['residential', 'commercial', 'luxury'] as const) {
      const { internalSqft, plotSqft } = deriveSqft({ type, value: 15_000_000 });
      expect(internalSqft / plotSqft).toBeLessThanOrEqual(0.4);
      expect(plotSqft).toBeGreaterThan(internalSqft);
    }
  });
});
