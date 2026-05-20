/**
 * Lender consent for selling a property that collateralises a portfolio mortgage.
 *
 * The lender approves if the REMAINING collateral (after the sale) keeps the
 * portfolio within LTV (75%) and ICR (125%) — same thresholds used at
 * origination. On approval, a redemption slice = balance × (propertyValue /
 * sumCollateralValues) is taken from sale proceeds at completion.
 *
 * All monetary values in pennies.
 */

interface PortfolioMortgageLike {
  id: string;
  remainingBalance: number;
  monthlyPayment: number;
  interestRate: number;
  collateralPropertyIds?: string[];
}

interface CollateralPropertyLike {
  id: string;
  value: number; // pennies
  monthlyIncome: number; // pennies — expected gross rent
}

export interface PortfolioSaleConsentResult {
  ok: boolean;
  /** Pennies redeemed from the sale proceeds toward the portfolio balance. */
  redemptionPennies: number;
  /** The portfolio mortgage being affected (if any). */
  affectedMortgage?: PortfolioMortgageLike;
  /** Reason for refusal — only set when ok=false. */
  reason?: string;
  /** Pennies the player must clear (refinance) to make the sale viable. */
  shortfallPennies?: number;
  /** Projected post-sale portfolio LTV (0..1). */
  postSaleLtv?: number;
  /** Projected post-sale portfolio ICR. */
  postSaleIcr?: number;
}

const MAX_LTV = 0.75;
const MIN_ICR = 1.25;

export function evaluatePortfolioSaleConsent(
  propertyBeingSold: CollateralPropertyLike,
  saleProceedsPennies: number,
  allMortgages: PortfolioMortgageLike[],
  allOwnedProperties: CollateralPropertyLike[],
): PortfolioSaleConsentResult {
  // Find any portfolio mortgage backed by this property.
  const affected = allMortgages.find(
    m => m.collateralPropertyIds && m.collateralPropertyIds.includes(propertyBeingSold.id),
  );
  if (!affected || !affected.collateralPropertyIds) {
    return { ok: true, redemptionPennies: 0 };
  }

  const collateral = affected.collateralPropertyIds
    .map(id => allOwnedProperties.find(p => p.id === id))
    .filter((p): p is CollateralPropertyLike => !!p);

  const totalCollateralValue = collateral.reduce((s, p) => s + p.value, 0);
  if (totalCollateralValue <= 0) {
    return { ok: false, redemptionPennies: 0, affectedMortgage: affected, reason: 'Portfolio collateral has no value — lender refuses.' };
  }

  // Redemption slice from sale proceeds.
  const proportionalRedemption = Math.floor(
    affected.remainingBalance * (propertyBeingSold.value / totalCollateralValue),
  );
  const redemption = Math.min(proportionalRedemption, saleProceedsPennies, affected.remainingBalance);
  const balanceAfter = affected.remainingBalance - redemption;

  // Remaining collateral (everything except the property being sold).
  const remainingCollateral = collateral.filter(p => p.id !== propertyBeingSold.id);
  const remainingValue = remainingCollateral.reduce((s, p) => s + p.value, 0);
  const remainingIncome = remainingCollateral.reduce((s, p) => s + p.monthlyIncome, 0);

  // If selling the LAST collateral property → balance must clear entirely from proceeds.
  if (remainingCollateral.length === 0) {
    if (balanceAfter <= 0) {
      return { ok: true, redemptionPennies: affected.remainingBalance, affectedMortgage: affected, postSaleLtv: 0, postSaleIcr: 0 };
    }
    return {
      ok: false,
      redemptionPennies: 0,
      affectedMortgage: affected,
      reason: 'Sale proceeds insufficient to clear the portfolio mortgage in full.',
      shortfallPennies: balanceAfter,
    };
  }

  const postLtv = remainingValue > 0 ? balanceAfter / remainingValue : Infinity;
  // Scale monthly payment down in proportion to redeemed balance for ICR check.
  const newMonthlyPayment = affected.remainingBalance > 0
    ? affected.monthlyPayment * (balanceAfter / affected.remainingBalance)
    : 0;
  const postIcr = newMonthlyPayment > 0 ? remainingIncome / newMonthlyPayment : Infinity;

  if (postLtv > MAX_LTV) {
    // Player must pay down enough to get LTV back to 75%.
    const requiredBalance = Math.floor(remainingValue * MAX_LTV);
    const shortfall = Math.max(0, balanceAfter - requiredBalance);
    return {
      ok: false,
      redemptionPennies: 0,
      affectedMortgage: affected,
      reason: `Lender refused: post-sale portfolio LTV ${Math.round(postLtv * 100)}% exceeds 75% cap. Clear an extra £${Math.ceil(shortfall / 100).toLocaleString()} to proceed.`,
      shortfallPennies: shortfall,
      postSaleLtv: postLtv,
      postSaleIcr: postIcr,
    };
  }

  if (postIcr < MIN_ICR) {
    return {
      ok: false,
      redemptionPennies: 0,
      affectedMortgage: affected,
      reason: `Lender refused: remaining collateral ICR ${postIcr.toFixed(2)}× fails the 1.25× cover test. Pay down the loan or refinance before selling.`,
      postSaleLtv: postLtv,
      postSaleIcr: postIcr,
    };
  }

  return {
    ok: true,
    redemptionPennies: redemption,
    affectedMortgage: affected,
    postSaleLtv: postLtv,
    postSaleIcr: postIcr,
  };
}
