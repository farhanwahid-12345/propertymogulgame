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
import { Property } from "@/components/ui/property-card";
import { COUNCIL_TAX_BAND_D, MORTGAGE_PROVIDERS } from "@/lib/engine/constants";
import { calculateDTI, getMaxPropertiesForLevel, getAvailablePropertyTypes, getMaxPropertyValue } from "@/lib/engine/financials";
import { deriveSqft } from "@/lib/engine/market";
import type { Tenant } from "@/components/ui/tenant-selector";

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

  // Cash held in escrow on in-flight buys still belongs to the player —
  // include it so net worth doesn't dip during conveyancing.
  const conveyancingRaw = Array.isArray(store.conveyancing) ? store.conveyancing : [];
  const inflightBuyCapital = conveyancingRaw
    .filter((c: any) => c.status === 'buying')
    .reduce((sum: number, c: any) => sum + fromPennies(c.cashHeld || 0), 0);
  const netWorth = cash + inflightBuyCapital + ownedProperties.reduce((sum, p) => sum + p.value, 0);
  const totalMonthlyIncome = ownedProperties.reduce((sum, p) => sum + p.monthlyIncome, 0);
  const mortgageExpenses = mortgages.reduce((sum, m) => sum + m.monthlyPayment, 0);
  const councilTaxExpenses = ownedProperties.reduce((sum, p) => {
    const hasTenant = tenantsRaw.some(t => t.propertyId === p.id);
    return sum + (!hasTenant ? fromPennies(COUNCIL_TAX_BAND_D) : 0);
  }, 0);
  const emptyPropertiesCount = ownedProperties.filter(p => !tenantsRaw.some(t => t.propertyId === p.id)).length;
  const totalMonthlyExpenses = mortgageExpenses + councilTaxExpenses;
  const totalDebt = mortgages.reduce((sum, m) => sum + m.remainingBalance, 0);

  // Credit score — use the value from the store directly (it's maintained there)
  const creditScore = store.creditScore;

  // Mortgage providers with dynamic rates
  const mortgageProviders = useMemo(() => MORTGAGE_PROVIDERS.map(p => ({
    ...p,
    baseRate: store.mortgageProviderRates[p.id] || p.baseRate,
  })), [store.mortgageProviderRates]);

  // ── Action wrappers (convert pounds → pennies for the store) ──

  const buyProperty = useCallback((property: Property, mortgagePercentage?: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only') => {
    const pennyProp = {
      ...property,
      price: toPennies(property.price),
      value: toPennies(property.value),
      monthlyIncome: toPennies(property.monthlyIncome),
      mortgageRemaining: property.mortgageRemaining != null ? toPennies(property.mortgageRemaining) : undefined,
      marketValue: property.marketValue != null ? toPennies(property.marketValue) : undefined,
      baseRent: property.baseRent != null ? toPennies(property.baseRent) : undefined,
    };
    store.buyProperty(pennyProp as any, mortgagePercentage, providerId, termYears, mortgageType);
  }, [store.buyProperty]);

  const buyPropertyAtPrice = useCallback((property: Property, purchasePrice: number, mortgagePercentage?: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only') => {
    const pennyProp = {
      ...property,
      price: toPennies(property.price),
      value: toPennies(property.value),
      monthlyIncome: toPennies(property.monthlyIncome),
      mortgageRemaining: property.mortgageRemaining != null ? toPennies(property.mortgageRemaining) : undefined,
      marketValue: property.marketValue != null ? toPennies(property.marketValue) : undefined,
      baseRent: property.baseRent != null ? toPennies(property.baseRent) : undefined,
    };
    store.buyPropertyAtPrice(pennyProp as any, toPennies(purchasePrice), mortgagePercentage, providerId, termYears, mortgageType);
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

  const selectTenant = useCallback((propertyId: string, tenant: Tenant) => {
    store.selectTenant(propertyId, tenant);
  }, [store.selectTenant]);

  const evictTenant = useCallback((propertyId: string, ground: 'rent_arrears' | 'landlord_sale' | 'landlord_move_in' | 'antisocial_behaviour') => {
    store.evictTenant(propertyId, ground);
  }, [store.evictTenant]);

  const cancelEviction = useCallback((propertyId: string) => {
    store.cancelEviction(propertyId);
  }, [store.cancelEviction]);

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

  const handlePortfolioMortgage = useCallback((selectedPropertyIds: string[], loanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only') => {
    store.handlePortfolioMortgage(selectedPropertyIds, toPennies(loanAmount), providerId, termYears, mortgageType);
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
    conveyancing: Array.isArray(store.conveyancing) ? store.conveyancing : [],
    taxRecords: Array.isArray(store.taxRecords) ? store.taxRecords : [],
    totalTaxPaid: fromPennies(store.totalTaxPaid),
    tenantConcerns: store.tenantConcerns || [],

    // Derived values
    netWorth: netWorth - totalDebt,
    totalMonthlyIncome,
    totalMonthlyExpenses,
    expenseBreakdown: {
      mortgages: mortgageExpenses,
      councilTax: councilTaxExpenses,
      emptyPropertiesCount,
    },
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
    evictTenant,
    cancelEviction,
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
  };
}
