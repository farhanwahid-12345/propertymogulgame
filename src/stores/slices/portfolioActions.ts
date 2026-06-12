/**
 * Portfolio action bundle — buy / sell / listings / offers.
 *
 * Phase 3c: extracted verbatim from `gameStore.ts` behind a factory so the
 * store literal stays a thin composer. Behaviour and persisted shape are
 * unchanged. Cross-slice reads via `get()` only.
 */
import type { Conveyancing, Property, PropertyListing, PropertyTenant } from '@/types/game';
import { toPennies, fromPennies } from '@/lib/formatCurrency';
import { SOLICITOR_FEES, MORTGAGE_PROVIDERS } from '@/lib/engine/constants';
import {
  calculateStampDuty,
  getPropertyValueRangeForLevel,
  getMaxPropertiesForLevel,
  getAvailablePropertyTypes,
} from '@/lib/engine/financials';
import {
  calculateMortgageEligibility,
  getEffectiveProviderRate,
} from '@/lib/mortgageEligibility';
import { evaluatePortfolioSaleConsent } from '@/lib/portfolioMortgageConsent';
import { gameRandom } from '@/lib/rng';
import { showToast, debit } from '../storeHelpers';
import { checkAndUnlockAchievements, ACHIEVEMENTS } from '@/lib/achievements';

type SetFn = (partial: any) => void;
type GetFn = () => any;

export function createPortfolioActions(set: SetFn, get: GetFn) {
  return {
    buyProperty: (property: any, mortgagePercentage = 0, providerId?: string, termYears = 25, mortgageType: 'repayment' | 'interest-only' = 'repayment', fixedTermYears = 0) => {
      const prev = get();
      if (prev.isBankrupt) { showToast("Bankrupt", "Cannot purchase while bankrupt!", "destructive"); return; }
      if (prev.ownedProperties.some((p: any) => p.id === property.id)) { showToast("Already Owned", "You already own this property.", "destructive"); return; }
      // Count conveyancing buys as pending
      const pendingBuys = prev.conveyancing.filter((c: any) => c.status === 'buying').length;
      if (prev.ownedProperties.length + pendingBuys >= getMaxPropertiesForLevel(prev.level)) { showToast("Property Limit", `Max ${getMaxPropertiesForLevel(prev.level)} properties (portfolio cap).`, "destructive"); return; }

      const allowedTypes = getAvailablePropertyTypes(prev.level);
      if (!allowedTypes.includes('all') && !allowedTypes.includes(property.type)) { showToast("Level Restriction", `Cannot buy ${property.type} at this level!`, "destructive"); return; }

      const { min: minValue, max: maxValue } = getPropertyValueRangeForLevel(prev.level);
      if (property.price < minValue) { showToast("Too Cheap", `Min property value at level ${prev.level}: £${fromPennies(minValue).toLocaleString()}`, "destructive"); return; }
      if (property.price > maxValue) { showToast("Too Expensive", `Max at level ${prev.level}: £${fromPennies(maxValue).toLocaleString()}`, "destructive"); return; }

      const mortgageAmount = Math.round((property.price * mortgagePercentage) / 100);
      const stampDuty = calculateStampDuty(property.price);
      const mortgageFee = mortgageAmount > 0 ? Math.round(property.price * 0.01) : 0;
      const cashRequired = property.price - mortgageAmount + SOLICITOR_FEES + stampDuty + mortgageFee;

      // Pre-flight mortgage eligibility BEFORE debiting cash so a rejection
      // doesn't leave the player out-of-pocket.
      let mortgageData: Conveyancing['mortgageData'] = undefined;
      let creditAdj = 0;
      if (mortgageAmount > 0) {
        const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];
        const totalRentalIncome = prev.ownedProperties.reduce((total: number, prop: any) => total + prop.monthlyIncome, 0);
        const existingPayments = prev.mortgages.reduce((s: number, m: any) => s + m.monthlyPayment, 0);
        const providerRate = prev.mortgageProviderRates[provider.id] || provider.baseRate;

        const eligibility = calculateMortgageEligibility({
          creditScore: prev.creditScore,
          loanAmount: fromPennies(mortgageAmount),
          propertyValue: fromPennies(property.price),
          propertyMonthlyRent: fromPennies(property.monthlyIncome),
          providerBaseRate: getEffectiveProviderRate({ liveProviderRate: providerRate, currentMarketRate: prev.currentMarketRate, fixedTermYears }),
          providerMinCreditScore: provider.minCreditScore,
          providerMaxLTV: provider.maxLTV,
          providerId: provider.id,
          termYears, mortgageType,
          existingMonthlyMortgagePayments: fromPennies(existingPayments),
          totalRentalIncome: fromPennies(totalRentalIncome),
          ownedPropertyCount: prev.ownedProperties.length,
          mortgagedPropertyCount: new Set(prev.mortgages.map((m: any) => m.propertyId)).size,
          propertyNeedsRefurb: property.needsRefurb,
        });

        if (!eligibility.eligible) {
          showToast("Mortgage Rejected", eligibility.reason || "Lender declined this application.", "destructive");
          return;
        }
        if (mortgagePercentage / 100 > 0.85) creditAdj -= 3;

        mortgageData = {
          amount: mortgageAmount,
          providerId: providerId || "halifax",
          termYears, mortgageType,
          monthlyPayment: toPennies(eligibility.monthlyPayment),
          interestRate: eligibility.adjustedRate,
          fixedTermYears: fixedTermYears > 0 ? fixedTermYears : undefined,
        };
      }

      const debited = debit(prev, cashRequired);
      if (!debited) { showToast("Insufficient Funds", `Need £${fromPennies(cashRequired).toLocaleString()} (even with overdraft).`, "destructive"); return; }

      // Create conveyancing entry instead of instant purchase
      const conveyancingMonths = 1 + Math.floor(gameRandom() * 3);
      const conv: Conveyancing = {
        id: `conv_buy_${Date.now()}_${property.id}`,
        propertyId: property.id,
        propertyName: property.name,
        status: 'buying',
        startMonth: prev.monthsPlayed,
        completionMonth: prev.monthsPlayed + conveyancingMonths,
        purchasePrice: property.price,
        mortgageData,
        cashHeld: cashRequired,
        advertisedYield: property.yield,
        advertisedMonthlyIncome: property.monthlyIncome,
        propertyType: property.type,
      };

      showToast("Offer Accepted! ⏳", `${property.name} — conveyancing started. Completion in ${conveyancingMonths} month(s).`);

      if (debited.usedOverdraft > 0) {
        showToast("Overdraft Used", `Tapped £${fromPennies(debited.usedOverdraft).toLocaleString()} overdraft for the deposit.`);
      }
      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        conveyancing: [...prev.conveyancing, conv],
        // Hide property from market while in conveyancing
        estateAgentProperties: prev.estateAgentProperties.filter((p: any) => p.id !== property.id),
        auctionProperties: prev.auctionProperties.filter((p: any) => p.id !== property.id),
        experience: prev.experience + Math.floor(fromPennies(property.price) / 10000),
        creditScore: Math.max(300, Math.min(850, prev.creditScore + creditAdj)),
      });
    },

    buyPropertyAtPrice: (property: any, purchasePrice: number, mortgagePercentage = 0, providerId?: string, termYears = 25, mortgageType: 'repayment' | 'interest-only' = 'repayment', fixedTermYears = 0) => {
      const prev = get();
      if (prev.isBankrupt) return;
      if (prev.ownedProperties.some((p: any) => p.id === property.id)) { showToast("Already Owned", `You already own ${property.name}!`, "destructive"); return; }
      const pendingBuys = prev.conveyancing.filter((c: any) => c.status === 'buying').length;
      if (prev.ownedProperties.length + pendingBuys >= getMaxPropertiesForLevel(prev.level)) { showToast("Portfolio Limit", `Max ${getMaxPropertiesForLevel(prev.level)} properties (portfolio cap).`, "destructive"); return; }

      const { min: minValue } = getPropertyValueRangeForLevel(prev.level);
      if (property.value < minValue) { showToast("Too Cheap", `Min value at level ${prev.level}`, "destructive"); return; }

      const mortgageAmount = Math.round((purchasePrice * mortgagePercentage) / 100);
      const stampDuty = calculateStampDuty(purchasePrice);
      const mortgageFee = mortgageAmount > 0 ? Math.round(purchasePrice * 0.01) : 0;
      const cashRequired = purchasePrice - mortgageAmount + SOLICITOR_FEES + stampDuty + mortgageFee;

      // Pre-flight mortgage eligibility BEFORE debiting cash.
      let mortgageData: Conveyancing['mortgageData'] = undefined;
      let creditAdj = 0;
      if (mortgageAmount > 0) {
        const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];
        const totalRentalIncome = prev.ownedProperties.reduce((total: number, prop: any) => total + prop.monthlyIncome, 0);
        const existingPayments = prev.mortgages.reduce((s: number, m: any) => s + m.monthlyPayment, 0);
        const providerRate = prev.mortgageProviderRates[provider.id] || provider.baseRate;

        const eligibility = calculateMortgageEligibility({
          creditScore: prev.creditScore,
          loanAmount: fromPennies(mortgageAmount),
          propertyValue: fromPennies(purchasePrice),
          propertyMonthlyRent: fromPennies(property.monthlyIncome),
          providerBaseRate: getEffectiveProviderRate({ liveProviderRate: providerRate, currentMarketRate: prev.currentMarketRate, fixedTermYears }),
          providerMinCreditScore: provider.minCreditScore,
          providerMaxLTV: provider.maxLTV,
          providerId: provider.id,
          termYears, mortgageType,
          existingMonthlyMortgagePayments: fromPennies(existingPayments),
          totalRentalIncome: fromPennies(totalRentalIncome),
          ownedPropertyCount: prev.ownedProperties.length,
          mortgagedPropertyCount: new Set(prev.mortgages.map((m: any) => m.propertyId)).size,
          propertyNeedsRefurb: property.needsRefurb,
        });

        if (!eligibility.eligible) {
          showToast("Mortgage Rejected", eligibility.reason || "Lender declined this application.", "destructive");
          return;
        }
        if (mortgagePercentage / 100 > 0.85) creditAdj -= 3;

        mortgageData = {
          amount: mortgageAmount,
          providerId: providerId || "halifax",
          termYears, mortgageType,
          monthlyPayment: toPennies(eligibility.monthlyPayment),
          interestRate: eligibility.adjustedRate,
          fixedTermYears: fixedTermYears > 0 ? fixedTermYears : undefined,
        };
      }

      const debited = debit(prev, cashRequired);
      if (!debited) { showToast("Insufficient Funds", `Need £${fromPennies(cashRequired).toLocaleString()} (even with overdraft).`, "destructive"); return; }

      const conveyancingMonths = 1 + Math.floor(gameRandom() * 3);
      const conv: Conveyancing = {
        id: `conv_buy_${Date.now()}_${property.id}`,
        propertyId: property.id,
        propertyName: property.name,
        status: 'buying',
        startMonth: prev.monthsPlayed,
        completionMonth: prev.monthsPlayed + conveyancingMonths,
        purchasePrice,
        mortgageData,
        cashHeld: cashRequired,
        advertisedYield: property.yield,
        advertisedMonthlyIncome: property.monthlyIncome,
        propertyType: property.type,
      };

      showToast("Offer Accepted! ⏳", `${property.name} — conveyancing started. Completion in ${conveyancingMonths} month(s).`);

      if (debited.usedOverdraft > 0) {
        showToast("Overdraft Used", `Tapped £${fromPennies(debited.usedOverdraft).toLocaleString()} overdraft for the deposit.`);
      }
      set({
        cash: debited.cash,
        overdraftUsed: debited.overdraftUsed,
        conveyancing: [...prev.conveyancing, conv],
        // Hide property from market while in conveyancing
        estateAgentProperties: prev.estateAgentProperties.filter((p: any) => p.id !== property.id),
        auctionProperties: prev.auctionProperties.filter((p: any) => p.id !== property.id),
        experience: prev.experience + Math.floor(fromPennies(purchasePrice) / 10000),
        creditScore: Math.max(300, Math.min(850, prev.creditScore + creditAdj)),
      });
    },

    // ─── SELL / LISTINGS ────────────────────
    sellProperty: (property: any, isAuction = false) => {
      const prev = get();
      // property here is already in pennies (wrapped by useGameState).
      const consent = evaluatePortfolioSaleConsent(
        { id: property.id, value: property.value, monthlyIncome: property.monthlyIncome },
        property.value,
        prev.mortgages,
        prev.ownedProperties.map((p: any) => ({ id: p.id, value: p.value, monthlyIncome: p.monthlyIncome })),
      );
      if (!consent.ok) {
        showToast("Portfolio lender refused", consent.reason || "Cannot list — refinance the portfolio first.", "destructive");
        return;
      }
      const daysToSell = isAuction ? 1 : 30 + Math.floor(gameRandom() * 60);
      const listing: PropertyListing = {
        propertyId: property.id, listingDate: Date.now(), listingMonth: prev.monthsPlayed, isAuction,
        daysUntilSale: daysToSell, askingPrice: property.value,
        offers: [], lastOfferCheck: Date.now(),
      };
      showToast("Property Listed!", `${property.name} listed ${isAuction ? 'for auction' : 'on market'}.`);
      set((s: any) => ({ propertyListings: [...s.propertyListings, listing] }));
    },

    // Sale conveyancing lifecycle moved to conveyancingActions.ts (Outstanding Improvements Phase 2).

    // ─── Outstanding Improvements v4 Step 2: title-split + auction removal ───
    removeAuctionProperty: (propertyId: string) => set((s: any) => ({
      auctionProperties: s.auctionProperties.filter((p: any) => p.id !== propertyId),
      estateAgentProperties: s.estateAgentProperties.filter((p: any) => p.id !== propertyId),
    })),

    splitFlatUnit: (propertyId: string, slotIndex: number, groundRentMode: 'peppercorn' | 'percent') => {
      const prev = get();
      const parent = prev.ownedProperties.find((p: any) => p.id === propertyId);
      if (!parent) return;
      if (parent.subtype !== 'flats') {
        showToast("Cannot Split", "Only converted-flat properties can have units split off.", "destructive");
        return;
      }
      const units = Math.max(1, parent.subtypeUnits ?? 1);
      if (units <= 0) return;
      const splitFee = SOLICITOR_FEES;
      if (!debit(prev, splitFee)) {
        showToast("Insufficient Funds", `Need £${fromPennies(splitFee).toLocaleString()} for solicitor fees to split the title.`, "destructive");
        return;
      }

      const perUnitValue = Math.round(parent.value / units);
      const splitUnitValue = Math.round(perUnitValue * 1.08);
      const remainingValue = Math.max(0, parent.value - perUnitValue);

      const slotTenant = prev.tenants.find((t: any) => t.propertyId === propertyId && t.slotIndex === slotIndex);
      const slotRentPennies = slotTenant?.rentPennies ?? Math.round(parent.monthlyIncome / units);

      const serviceChargePct = 0.02 + gameRandom() * 0.03;
      const groundRentPennies = groundRentMode === 'peppercorn'
        ? 1000
        : Math.round(splitUnitValue * 0.005);

      const newId = `split_${propertyId}_${slotIndex}_${Date.now()}`;
      const newFlat: Property = {
        ...parent,
        id: newId,
        name: `${parent.name} — Flat ${slotIndex + 1}`,
        price: splitUnitValue,
        value: splitUnitValue,
        marketValue: splitUnitValue,
        monthlyIncome: slotRentPennies,
        subtype: 'standard',
        subtypeUnits: undefined,
        owned: true,
        titleSplitOf: parent.id,
        flatUnitId: slotIndex,
        isLeasehold: true,
        serviceChargePctAnnual: serviceChargePct,
        groundRentPennies,
        completedRenovationIds: [],
        renovationCompletionMonths: {},
        totalRenovationSpendPennies: 0,
      };

      const remainingUnits = units - 1;
      const removingParent = remainingUnits <= 0;

      const reindexedTenants = prev.tenants
        .filter((t: any) => !(t.propertyId === propertyId && t.slotIndex === slotIndex))
        .map((t: any) => {
          if (t.propertyId !== propertyId) return t;
          if (t.slotIndex > slotIndex) return { ...t, slotIndex: t.slotIndex - 1 };
          return t;
        });

      let migratedTenant: PropertyTenant | null = null;
      if (slotTenant) {
        migratedTenant = {
          ...slotTenant,
          propertyId: newId,
          slotIndex: 0,
          rentPennies: slotRentPennies,
        };
      }

      const updatedOwned: Property[] = [];
      for (const p of prev.ownedProperties) {
        if (p.id !== propertyId) { updatedOwned.push(p); continue; }
        if (removingParent) continue;
        updatedOwned.push({
          ...p,
          value: remainingValue,
          marketValue: remainingValue,
          subtypeUnits: remainingUnits,
          monthlyIncome: Math.max(0, p.monthlyIncome - slotRentPennies),
        });
      }
      updatedOwned.push(newFlat);

      set({
        ownedProperties: updatedOwned,
        tenants: migratedTenant
          ? [...reindexedTenants, migratedTenant]
          : reindexedTenants,
      });

      showToast(
        "Title Split Complete",
        `Flat ${slotIndex + 1} is now its own leasehold property. Service charge ${(serviceChargePct * 100).toFixed(1)}%/yr; ground rent £${fromPennies(groundRentPennies).toLocaleString()}/yr.`,
      );
    },
  };
}
