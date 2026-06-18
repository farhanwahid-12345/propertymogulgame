// @refresh reset
/**
 * useGameState — backward-compatible wrapper over the Zustand store.
 *
 * The Zustand store (`gameStore.ts`) stores all monetary values in PENNIES.
 * Every existing UI component expects POUNDS.  This wrapper:
 *   1. Reads from the store
 *   2. Converts monetary fields to pounds
 *   3. Provides the same return-value shape the old hook had
 *
 * As components are gradually migrated to use the store directly (with
 * `formatPounds()`), this wrapper can shrink and eventually be removed.
 */

import { useCallback, useMemo } from "react";
import { useGameStore } from "@/stores/gameStore";
import { fromPennies, toPennies } from "@/lib/formatCurrency";
import { Property } from "@/components/game/property-card";
import { COUNCIL_TAX_BAND_D, MORTGAGE_PROVIDERS } from "@/lib/engine/constants";
import { calculateDTI, getMaxPropertiesForLevel, getAvailablePropertyTypes, getMaxPropertyValue, getFurnitureValuePennies } from "@/lib/engine/financials";
import { deriveSqft } from "@/lib/engine/market";
import type { Tenant } from "@/components/game/tenant-selector";

// ─── Helpers ──────────────────────────────────────────────

/** Convert a store Property (pennies) to a UI Property (pounds). */
function propertyToPounds(p: any): Property {
  // Backfill sqft for legacy properties so cards always show size.
  let internalSqft = p.internalSqft;
  let plotSqft = p.plotSqft;
  if (!internalSqft || !plotSqft) {
    const derived = deriveSqft({ type: p.type, value: p.value, internalSqft, plotSqft });
    internalSqft = internalSqft || derived.internalSqft;
    plotSqft = plotSqft || derived.plotSqft;
  }
  return {
    ...p,
    price: fromPennies(p.price),
    value: fromPennies(p.value),
    monthlyIncome: fromPennies(p.monthlyIncome),
    mortgageRemaining: p.mortgageRemaining != null ? fromPennies(p.mortgageRemaining) : undefined,
    marketValue: p.marketValue != null ? fromPennies(p.marketValue) : undefined,
    baseRent: p.baseRent != null ? fromPennies(p.baseRent) : undefined,
    totalRenovationSpendPennies: p.totalRenovationSpendPennies || 0,
    internalSqft,
    plotSqft,
  };
}

function mortgageToPounds(m: any) {
  return {
    ...m,
    principal: fromPennies(m.principal),
    monthlyPayment: fromPennies(m.monthlyPayment),
    remainingBalance: fromPennies(m.remainingBalance),
  };
}

function listingToPounds(l: any) {
  return {
    ...l,
    askingPrice: fromPennies(l.askingPrice),
    autoAcceptThreshold: l.autoAcceptThreshold != null ? fromPennies(l.autoAcceptThreshold) : undefined,
    offers: (l.offers || []).map((o: any) => ({
      ...o,
      amount: fromPennies(o.amount),
      counterAmount: o.counterAmount != null ? fromPennies(o.counterAmount) : undefined,
      buyerCounterAmount: o.buyerCounterAmount != null ? fromPennies(o.buyerCounterAmount) : undefined,
    })),
  };
}

function damageToPounds(d: any) {
  return { ...d, repairCost: fromPennies(d.repairCost) };
}

function tenantEventToPounds(e: any) {
  return { ...e, amount: fromPennies(e.amount) };
}

// ─── Hook ─────────────────────────────────────────────────

export function useGameState() {
  const store = useGameStore();
  const ownedPropertiesRaw = Array.isArray(store.ownedProperties) ? store.ownedProperties : [];
  const estateAgentPropertiesRaw = Array.isArray(store.estateAgentProperties) ? store.estateAgentProperties : [];
  const auctionPropertiesRaw = Array.isArray(store.auctionProperties) ? store.auctionProperties : [];
  const mortgagesRaw = Array.isArray(store.mortgages) ? store.mortgages : [];
  const propertyListingsRaw = Array.isArray(store.propertyListings) ? store.propertyListings : [];
  const pendingDamagesRaw = Array.isArray(store.pendingDamages) ? store.pendingDamages : [];
  const tenantEventsRaw = Array.isArray(store.tenantEvents) ? store.tenantEvents : [];
  const tenantsRaw = Array.isArray(store.tenants) ? store.tenants : [];

  // ── Derived values (in pounds) ──────────────────────────
  const ownedProperties = useMemo(() => ownedPropertiesRaw.map(propertyToPounds), [ownedPropertiesRaw]);
  const estateAgentProperties = useMemo(() => estateAgentPropertiesRaw.map(propertyToPounds), [estateAgentPropertiesRaw]);
  const auctionProperties = useMemo(() => auctionPropertiesRaw.map(propertyToPounds), [auctionPropertiesRaw]);
  const mortgages = useMemo(() => mortgagesRaw.map(mortgageToPounds), [mortgagesRaw]);
  const propertyListings = useMemo(() => propertyListingsRaw.map(listingToPounds), [propertyListingsRaw]);
  const pendingDamages = useMemo(() => pendingDamagesRaw.map(damageToPounds), [pendingDamagesRaw]);
  const tenantEvents = useMemo(() => tenantEventsRaw.map(tenantEventToPounds), [tenantEventsRaw]);

  const cash = fromPennies(store.cash);
  const overdraftLimit = fromPennies(store.overdraftLimit);
  const overdraftUsed = fromPennies(store.overdraftUsed);

  // Cash held on in-flight buys still belongs to the player (deposit + fees
  // already debited). The mortgage advance is drawn at completion, so during
  // conveyancing only the player's own cash sits with the solicitor.
   const conveyancingRaw = Array.isArray(store.conveyancing) ? store.conveyancing : [];
  const inflightBuyCapital = conveyancingRaw
    .filter((c: any) => c.status === 'buying')
    .reduce((sum: number, c: any) => sum + fromPennies(c.cashHeld || 0), 0);
  // Forward-looking equity in the in-flight property: expected purchase
  // price less the mortgage that will be drawn at completion. Shown as a
  // separate breakdown line so the player can see the deal's gross value,
  // not just the cash currently with the solicitor.
  const inflightPropertyEquity = conveyancingRaw
    .filter((c: any) => c.status === 'buying')
    .reduce((sum: number, c: any) => {
      const price = fromPennies(c.purchasePrice || 0);
      const mortgage = fromPennies(c.mortgageData?.amount || 0);
      return sum + Math.max(0, price - mortgage);
    }, 0);
  // Active renovations represent capital already spent that will convert to
  // property value on completion — treat as work-in-progress asset so net
  // worth doesn't artificially dip while renovations are underway.
  const renovationsRaw = Array.isArray(store.renovations) ? store.renovations : [];
  const renovationWIP = renovationsRaw.reduce((sum: number, r: any) => sum + (r.type?.cost || 0), 0);
  // Furniture is a depreciating asset (straight-line over 60 months) — count
  // the remaining undepreciated value so net worth reflects what was spent.
  const furnitureValue = ownedPropertiesRaw.reduce(
    (sum: number, p: any) => sum + fromPennies(getFurnitureValuePennies(p)),
    0,
  );
  // Loan balances pulled up so net worth can subtract ALL debt (mortgages + loans).
  const loansRawEarly = ((store as any).loans || []) as Array<{ remainingBalance?: number }>;
  const totalLoanBalanceEarly = loansRawEarly.reduce(
    (s, l: any) => s + fromPennies(l.remainingBalance || 0),
    0,
  );
  const totalMortgageDebt = mortgages.reduce((sum, m) => sum + m.remainingBalance, 0);
  // Net worth = cash + in-flight buying conveyancing cashHeld + renovation WIP + furniture value + Σ property value − Σ debt − overdraft drawn.
  // overdraftUsed is real borrowed money that must be repaid; including it stops
  // net worth from being inflated by short-term overdraft taps. Subtracting mortgage
  // + loan balances stops the "free money" jump when a financed buy completes.
  const netWorth = cash + inflightBuyCapital + renovationWIP + furnitureValue
    + ownedProperties.reduce((sum, p) => sum + p.value, 0)
    - totalMortgageDebt - totalLoanBalanceEarly - overdraftUsed;
  const nowTs = Date.now();
  const voidPeriodsRaw = Array.isArray(store.voidPeriods) ? store.voidPeriods : [];
  const conveyancingPropertyIds = new Set(
    conveyancingRaw.filter((c: any) => c.status === 'buying').map((c: any) => c.propertyId)
  );
  const totalMonthlyIncome = ownedProperties.reduce((sum, p) => {
    if (conveyancingPropertyIds.has(p.id)) return sum;
    const hasTenant = tenantsRaw.some(t => t.propertyId === p.id);
    const isInVoid = voidPeriodsRaw.some((vp: any) =>
      vp.propertyId === p.id && nowTs >= vp.startDate && nowTs <= vp.endDate
    );
    return sum + (hasTenant && !isInVoid ? p.monthlyIncome : 0);
  }, 0);
  const mortgageExpenses = mortgages.reduce((sum, m) => sum + m.monthlyPayment, 0);
  const councilTaxExpenses = ownedProperties.reduce((sum, p) => {
    const hasTenant = tenantsRaw.some(t => t.propertyId === p.id);
    return sum + (!hasTenant ? fromPennies(COUNCIL_TAX_BAND_D) : 0);
  }, 0);
  const insuranceExpenses = ownedProperties.reduce((sum, p) => sum + (p.value * 0.004) / 12, 0);
  const emptyPropertiesCount = ownedProperties.filter(p => !tenantsRaw.some(t => t.propertyId === p.id)).length;
  const loansRaw = ((store as any).loans || []) as Array<{ monthlyPayment: number }>;
  const loanExpenses = loansRaw.reduce((s, l) => s + fromPennies(l.monthlyPayment || 0), 0);
  const totalMonthlyExpenses = mortgageExpenses + councilTaxExpenses + insuranceExpenses + loanExpenses;
  // Include unsecured loan balances so net worth reflects ALL debt the
  // player owes (mortgages + personal / business / investor loans).
  const totalLoanBalance = loansRaw.reduce(
    (s, l: any) => s + fromPennies(l.remainingBalance || 0),
    0,
  );
  const totalDebt = mortgages.reduce((sum, m) => sum + m.remainingBalance, 0) + totalLoanBalance;

  // Credit score — use the value from the store directly (it's maintained there)
  const creditScore = store.creditScore;

  // Mortgage providers with dynamic rates
  const mortgageProviders = useMemo(() => MORTGAGE_PROVIDERS.map(p => ({
    ...p,
    baseRate: store.mortgageProviderRates[p.id] || p.baseRate,
  })), [store.mortgageProviderRates]);

  // ── Action wrappers (convert pounds → pennies for the store) ──

  const buyProperty = useCallback((property: Property, mortgagePercentage?: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only', fixedTermYears?: number) => {
    const pennyProp = {
      ...property,
      price: toPennies(property.price),
      value: toPennies(property.value),
      monthlyIncome: toPennies(property.monthlyIncome),
      mortgageRemaining: property.mortgageRemaining != null ? toPennies(property.mortgageRemaining) : undefined,
      marketValue: property.marketValue != null ? toPennies(property.marketValue) : undefined,
      baseRent: property.baseRent != null ? toPennies(property.baseRent) : undefined,
    };
    store.buyProperty(pennyProp as any, mortgagePercentage, providerId, termYears, mortgageType, fixedTermYears);
  }, [store.buyProperty]);

  const buyPropertyAtPrice = useCallback((property: Property, purchasePrice: number, mortgagePercentage?: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only', fixedTermYears?: number) => {
    const pennyProp = {
      ...property,
      price: toPennies(property.price),
      value: toPennies(property.value),
      monthlyIncome: toPennies(property.monthlyIncome),
      mortgageRemaining: property.mortgageRemaining != null ? toPennies(property.mortgageRemaining) : undefined,
      marketValue: property.marketValue != null ? toPennies(property.marketValue) : undefined,
      baseRent: property.baseRent != null ? toPennies(property.baseRent) : undefined,
    };
    store.buyPropertyAtPrice(pennyProp as any, toPennies(purchasePrice), mortgagePercentage, providerId, termYears, mortgageType, fixedTermYears);
  }, [store.buyPropertyAtPrice]);

  const sellProperty = useCallback((property: Property, isAuction?: boolean) => {
    const pennyProp = {
      ...property,
      price: toPennies(property.price),
      value: toPennies(property.value),
      monthlyIncome: toPennies(property.monthlyIncome),
    };
    store.sellProperty(pennyProp as any, isAuction);
  }, [store.sellProperty]);

  const selectTenant = useCallback((propertyId: string, tenant: Tenant, slotIndex?: number) => {
    store.selectTenant(propertyId, tenant, slotIndex);
  }, [store.selectTenant]);

  const applyRentIncrease = useCallback((
    propertyId: string,
    newRentPounds: number,
    outcome: 'accepted' | 'counter_accepted' | 'tribunal_landlord' | 'tribunal_tenant',
    tribunalFeePounds: number,
    slotIndex?: number,
  ) => {
    store.applyRentIncrease(propertyId, toPennies(newRentPounds), outcome, toPennies(tribunalFeePounds), slotIndex);
  }, [store.applyRentIncrease]);

  const evictTenant = useCallback((propertyId: string, ground: 'rent_arrears' | 'landlord_sale' | 'landlord_move_in' | 'antisocial_behaviour' | 'lease_expiry' | 'tenant_default' | 'break_clause', slotIndex?: number) => {
    store.evictTenant(propertyId, ground, slotIndex);
  }, [store.evictTenant]);

  const cancelEviction = useCallback((propertyId: string, slotIndex?: number) => {
    store.cancelEviction(propertyId, slotIndex);
  }, [store.cancelEviction]);

  const withdrawFromConveyancing = useCallback((conveyancingId: string) => {
    store.withdrawFromConveyancing(conveyancingId);
  }, [store.withdrawFromConveyancing]);


  const disputeDeposit = useCallback((disputeId: string) => {
    store.disputeDeposit(disputeId);
  }, [store.disputeDeposit]);

  const dismissDispute = useCallback((disputeId: string) => {
    store.dismissDispute(disputeId);
  }, [store.dismissDispute]);

  const startRenovation = useCallback((propertyId: string, renovationType: any) => {
    store.startRenovation(propertyId, renovationType);
  }, [store.startRenovation]);

  const settleMortgage = useCallback((mortgagePropertyId: string, useCash?: boolean, settlementPropertyId?: string, partialAmount?: number) => {
    store.settleMortgage(mortgagePropertyId, useCash, settlementPropertyId, partialAmount != null ? toPennies(partialAmount) : undefined);
  }, [store.settleMortgage]);

  const remortgageProperty = useCallback((propertyId: string, newLoanAmount: number, providerId: string) => {
    store.remortgageProperty(propertyId, toPennies(newLoanAmount), providerId);
  }, [store.remortgageProperty]);

  const handleEstateAgentSale = useCallback((propertyId: string, offer: any) => {
    // Offer comes in pounds from the UI — convert amount to pennies
    const pennyOffer = { ...offer, amount: toPennies(offer.amount) };
    store.handleEstateAgentSale(propertyId, pennyOffer);
  }, [store.handleEstateAgentSale]);

  const handleAuctionSale = useCallback((propertyId: string, salePrice: number) => {
    store.handleAuctionSale(propertyId, toPennies(salePrice));
  }, [store.handleAuctionSale]);

  const handleRefinance = useCallback((propertyId: string, newLoanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only') => {
    store.handleRefinance(propertyId, toPennies(newLoanAmount), providerId, termYears, mortgageType);
  }, [store.handleRefinance]);

  const handlePortfolioMortgage = useCallback((selectedPropertyIds: string[], loanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only', fixedTermYears?: number) => {
    return store.handlePortfolioMortgage(selectedPropertyIds, toPennies(loanAmount), providerId, termYears, mortgageType, fixedTermYears);
  }, [store.handlePortfolioMortgage]);

  const handleApplyOverdraft = useCallback((requestedLimit: number) => {
    store.handleApplyOverdraft(toPennies(requestedLimit));
  }, [store.handleApplyOverdraft]);

  const setCash = useCallback((newCash: number) => {
    store.setCash(toPennies(newCash));
  }, [store.setCash]);

  const setOverdraftUsed = useCallback((used: number) => {
    store.setOverdraftUsed(toPennies(used));
  }, [store.setOverdraftUsed]);

  const removeAuctionProperty = useCallback((propertyId: string) => {
    store.removeAuctionProperty(propertyId);
  }, [store.removeAuctionProperty]);

  const payDamageWithCash = useCallback((damageId: string, actualCost?: number) => {
    store.payDamageWithCash(damageId, actualCost != null ? toPennies(actualCost) : undefined);
  }, [store.payDamageWithCash]);

  const payDamageWithLoan = useCallback((damageId: string, actualCost?: number) => {
    store.payDamageWithLoan(damageId, actualCost != null ? toPennies(actualCost) : undefined);
  }, [store.payDamageWithLoan]);

  const listPropertyForSale = useCallback((propertyId: string, askingPrice: number) => {
    store.listPropertyForSale(propertyId, toPennies(askingPrice));
  }, [store.listPropertyForSale]);

  const cancelPropertyListing = useCallback((propertyId: string) => {
    store.cancelPropertyListing(propertyId);
  }, [store.cancelPropertyListing]);

  const updatePropertyListingPrice = useCallback((propertyId: string, newPrice: number) => {
    store.updatePropertyListingPrice(propertyId, toPennies(newPrice));
  }, [store.updatePropertyListingPrice]);

  const setAutoAcceptThreshold = useCallback((propertyId: string, threshold: number | undefined) => {
    store.setAutoAcceptThreshold(propertyId, threshold != null ? toPennies(threshold) : undefined);
  }, [store.setAutoAcceptThreshold]);

  const addOfferToListing = useCallback((propertyId: string, offer: any) => {
    const pennyOffer = {
      ...offer,
      amount: toPennies(offer.amount),
      counterAmount: offer.counterAmount != null ? toPennies(offer.counterAmount) : undefined,
      buyerCounterAmount: offer.buyerCounterAmount != null ? toPennies(offer.buyerCounterAmount) : undefined,
    };
    store.addOfferToListing(propertyId, pennyOffer);
  }, [store.addOfferToListing]);

  const rejectPropertyOffer = useCallback((propertyId: string, offerId: string) => {
    store.rejectPropertyOffer(propertyId, offerId);
  }, [store.rejectPropertyOffer]);

  const dismissDamage = useCallback((damageId: string) => {
    store.dismissDamage(damageId);
  }, [store.dismissDamage]);

  const resetGame = useCallback(() => {
    store.resetGame();
  }, [store.resetGame]);

  const counterOffer = useCallback((propertyId: string, offerId: string, counterAmount: number) => {
    store.counterOffer(propertyId, offerId, toPennies(counterAmount));
  }, [store.counterOffer]);

  const reducePriceOnListing = useCallback((propertyId: string, reductionPercent?: number) => {
    store.reducePriceOnListing(propertyId, reductionPercent);
  }, [store.reducePriceOnListing]);

  const acceptBuyerCounter = useCallback((propertyId: string, offerId: string) => {
    store.acceptBuyerCounter(propertyId, offerId);
  }, [store.acceptBuyerCounter]);

  const rejectBuyerCounter = useCallback((propertyId: string, offerId: string, newCounterAmount: number) => {
    store.rejectBuyerCounter(propertyId, offerId, toPennies(newCounterAmount));
  }, [store.rejectBuyerCounter]);

  const upgradeCondition = useCallback((propertyId: string, targetCondition: any) => {
    store.upgradeCondition(propertyId, targetCondition);
  }, [store.upgradeCondition]);

  const setEntityType = useCallback((type: any) => {
    store.setEntityType(type);
  }, [store.setEntityType]);

  const resolveTenantConcern = useCallback((concernId: string) => {
    store.resolveTenantConcern(concernId);
  }, [store.resolveTenantConcern]);

  const dismissTenantConcern = useCallback((concernId: string) => {
    store.dismissTenantConcern(concernId);
  }, [store.dismissTenantConcern]);

  const submitPlanningApplication = useCallback((propertyId: string, renovationType: any) => {
    (store as any).submitPlanningApplication(propertyId, renovationType);
  }, [(store as any).submitPlanningApplication]);

  const acknowledgePlanningDecision = useCallback((applicationId: string) => {
    (store as any).acknowledgePlanningDecision(applicationId);
  }, [(store as any).acknowledgePlanningDecision]);

  // ── Return same shape as old hook ───────────────────────
  return {
    // State values (pounds)
    cash,
    ownedProperties,
    mortgages,
    tenants: tenantsRaw,
    renovations: Array.isArray(store.renovations) ? store.renovations : [],
    level: store.level,
    experience: store.experience,
    experienceToNext: store.experienceToNext,
    monthsPlayed: store.monthsPlayed,
    timeUntilNextMonth: store.timeUntilNextMonth,
    isBankrupt: store.isBankrupt,
    creditScore,
    currentMarketRate: store.currentMarketRate,
    tenantEvents,
    pendingEvictions: Array.isArray(store.pendingEvictions) ? store.pendingEvictions : [],
    propertyLocks: Array.isArray(store.propertyLocks) ? store.propertyLocks : [],
    depositDisputes: Array.isArray(store.depositDisputes) ? store.depositDisputes : [],
    voidPeriods: Array.isArray(store.voidPeriods) ? store.voidPeriods : [],
    propertyListings,
    overdraftLimit,
    overdraftUsed,
    pendingDamages,
    annualRepairCosts: Array.isArray(store.annualRepairCosts) ? store.annualRepairCosts : [],
    damageHistory: Array.isArray(store.damageHistory) ? store.damageHistory : [],
    lastYearlyGrowth: store.lastYearlyGrowth,
    mortgageProviderRates: store.mortgageProviderRates && typeof store.mortgageProviderRates === 'object' ? store.mortgageProviderRates : {},
    yearlyNetProfit: fromPennies(store.yearlyNetProfit),
    lastCorporationTaxMonth: store.lastCorporationTaxMonth,
    lastGlobalDamageMonth: store.lastGlobalDamageMonth,
    nextEconomicEventMonth: store.nextEconomicEventMonth,
    economicEvents: Array.isArray(store.economicEvents) ? store.economicEvents : [],
    entityType: store.entityType,
    entityChosen: (store as any).entityChosen ?? true,
    conveyancing: Array.isArray(store.conveyancing) ? store.conveyancing : [],
    taxRecords: Array.isArray(store.taxRecords) ? store.taxRecords : [],
    totalTaxPaid: fromPennies(store.totalTaxPaid),
    totalTaxPaidPennies: store.totalTaxPaid,
    yearlyGrossRentPennies: store.yearlyGrossRent || 0,
    yearlyMortgageInterestPennies: store.yearlyMortgageInterest || 0,
    yearlyDeductibleExpensesPennies: store.yearlyDeductibleExpenses || 0,
    tenantConcerns: store.tenantConcerns || [],
    planningApplications: Array.isArray((store as any).planningApplications) ? (store as any).planningApplications : [],
    tenantHistory: Array.isArray((store as any).tenantHistory) ? (store as any).tenantHistory : [],
    debtRecoveryCases: Array.isArray((store as any).debtRecoveryCases) ? (store as any).debtRecoveryCases : [],
    sendArrearsToCourt: (store as any).sendArrearsToCourt,
    issueLetterBeforeAction: (store as any).issueLetterBeforeAction,
    escalateToHighCourt: (store as any).escalateToHighCourt,
    projectedTaxPennies: (store as any).projectedTaxPennies ?? 0,

    // Derived values
    // NOTE: `netWorth` (computed above) already subtracts mortgages + loans +
    // overdraft. Do NOT subtract `totalDebt` again here — that was a long-
    // standing double-subtraction bug that made net worth read low by
    // roughly the mortgage balance.
    netWorth,
    netWorthBreakdown: {
      cash,
      propertyValue: ownedProperties.reduce((sum, p) => sum + p.value, 0),
      furnitureValue,
      renovationWIP,
      conveyancingHeld: inflightBuyCapital,
      conveyancingPropertyEquity: inflightPropertyEquity,
      mortgageDebt: totalMortgageDebt,
      loanDebt: totalLoanBalanceEarly,
      overdraftUsed,
    },
    totalMonthlyIncome,
    totalMonthlyExpenses,
    expenseBreakdown: {
      mortgages: mortgageExpenses,
      councilTax: councilTaxExpenses,
      insurance: insuranceExpenses,
      loans: loanExpenses,
      emptyPropertiesCount,
    },
    loans: loansRaw,
    totalDebt,
    mortgageProviders,
    availableProperties: estateAgentProperties,
    estateAgentProperties,
    auctionProperties,

    // Utility functions
    getMaxPropertiesForLevel,
    getAvailablePropertyTypes,
    getMaxPropertyValue: (level: number) => fromPennies(getMaxPropertyValue(level)),

    // Actions
    buyProperty,
    buyPropertyAtPrice,
    sellProperty,
    selectTenant,
    applyRentIncrease,
    evictTenant,
    cancelEviction,
    withdrawFromConveyancing,
    
    disputeDeposit,
    dismissDispute,
    startRenovation,
    upgradeCondition,
    settleMortgage,
    remortgageProperty,
    handleEstateAgentSale,
    handleAuctionSale,
    handleRefinance,
    handlePortfolioMortgage,
    handleApplyOverdraft,
    setCash,
    setOverdraftUsed,
    removeAuctionProperty,
    payDamageWithCash,
    payDamageWithLoan,
    listPropertyForSale,
    cancelPropertyListing,
    updatePropertyListingPrice,
    setAutoAcceptThreshold,
    addOfferToListing,
    rejectPropertyOffer,
    dismissDamage,
    resetGame,
    counterOffer,
    reducePriceOnListing,
    acceptBuyerCounter,
    rejectBuyerCounter,
    setEntityType,
    resolveTenantConcern,
    dismissTenantConcern,
    submitPlanningApplication,
    acknowledgePlanningDecision,
    splitFlatUnit: store.splitFlatUnit,

  };
}
