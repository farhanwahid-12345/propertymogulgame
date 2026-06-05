/**
 * Portfolio action bundle — buy / sell / listings / offers.
 *
 * Phase 3c: extracted verbatim from `gameStore.ts` behind a factory so the
 * store literal stays a thin composer. Behaviour and persisted shape are
 * unchanged. Cross-slice reads via `get()` only.
 */
import type { Conveyancing, PropertyListing, PropertyOffer } from '@/types/game';
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

    handleEstateAgentSale: (propertyId: string, offer: PropertyOffer) => {
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      if (!property) return;

      // Move to conveyancing instead of instant sale
      const conveyancingMonths = 1 + Math.floor(gameRandom() * 3);
      const conv: Conveyancing = {
        id: `conv_sell_${Date.now()}_${propertyId}`,
        propertyId,
        propertyName: property.name,
        status: 'selling',
        startMonth: prev.monthsPlayed,
        completionMonth: prev.monthsPlayed + conveyancingMonths,
        salePrice: offer.amount,
        cashHeld: 0,
        buyerOffer: offer,
      };

      showToast("Sale Agreed! ⏳", `${property.name} — conveyancing started. Completion in ${conveyancingMonths} month(s).`);
      set({
        conveyancing: [...prev.conveyancing, conv],
        propertyListings: prev.propertyListings.filter((l: any) => l.propertyId !== propertyId),
        creditScore: Math.max(300, Math.min(850, prev.creditScore + 5)),
      });
    },

    handleAuctionSale: (propertyId: string, salePrice: number) => {
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      if (!property) return;

      // Auctions: shorter conveyancing (1 month)
      const conv: Conveyancing = {
        id: `conv_auction_${Date.now()}_${propertyId}`,
        propertyId,
        propertyName: property.name,
        status: 'selling',
        startMonth: prev.monthsPlayed,
        completionMonth: prev.monthsPlayed + 1,
        salePrice,
        cashHeld: 0,
        isAuction: true,
      };

      showToast("Auction Sale Agreed! ⏳", `${property.name} — conveyancing for 1 month.`);
      set({
        conveyancing: [...prev.conveyancing, conv],
        propertyListings: prev.propertyListings.filter((l: any) => l.propertyId !== propertyId),
        creditScore: Math.max(300, Math.min(850, prev.creditScore + 5)),
      });
    },

    listPropertyForSale: (propertyId: string, askingPrice: number) => {
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      if (!property) return;
      if (prev.propertyListings.some((l: any) => l.propertyId === propertyId)) {
        showToast("Already Listed", `${property.name} is already listed.`, "destructive"); return;
      }
      // Check not in conveyancing
      if (prev.conveyancing.some((c: any) => c.propertyId === propertyId)) {
        showToast("In Conveyancing", `${property.name} is currently in conveyancing.`, "destructive"); return;
      }
      const consent = evaluatePortfolioSaleConsent(
        { id: property.id, value: property.value, monthlyIncome: property.monthlyIncome },
        askingPrice,
        prev.mortgages,
        prev.ownedProperties.map((p: any) => ({ id: p.id, value: p.value, monthlyIncome: p.monthlyIncome })),
      );
      if (!consent.ok) {
        showToast("Portfolio lender refused", consent.reason || "Cannot list — refinance the portfolio first.", "destructive");
        return;
      }
      const listing: PropertyListing = {
        propertyId, listingDate: Date.now(), listingMonth: prev.monthsPlayed, isAuction: false,
        daysUntilSale: 30, askingPrice, offers: [], lastOfferCheck: Date.now(),
      };
      showToast("Property Listed", `${property.name} listed for £${fromPennies(askingPrice).toLocaleString()}`);
      set((s: any) => ({ propertyListings: [...s.propertyListings, listing] }));
    },

    cancelPropertyListing: (propertyId: string) => set((s: any) => {
      const listing = s.propertyListings.find((l: any) => l.propertyId === propertyId);
      if (!listing) return {} as any;
      const property = s.ownedProperties.find((p: any) => p.id === propertyId);
      // Detect a buyer in active conveyancing for this property (chain in progress)
      const inChain = (s.conveyancing || []).some((c: any) => c.propertyId === propertyId && c.status === 'selling');
      const feePennies = inChain ? toPennies(1500) : toPennies(750);
      if (s.cash < feePennies) {
        showToast(
          "Cannot Withdraw",
          `You need £${fromPennies(feePennies).toLocaleString()} to cover solicitor + agent fees${inChain ? ' (chain collapse)' : ''}.`,
          "destructive",
        );
        return {} as any;
      }
      showToast(
        inChain ? "Chain Collapsed" : "Listing Withdrawn",
        `${property?.name ?? 'Property'} pulled from sale. Fee £${fromPennies(feePennies).toLocaleString()} paid.`,
        inChain ? "destructive" : undefined,
      );
      return {
        cash: s.cash - feePennies,
        propertyListings: s.propertyListings.filter((l: any) => l.propertyId !== propertyId),
        // Drop any in-flight selling conveyancing for this property
        conveyancing: (s.conveyancing || []).filter((c: any) => !(c.propertyId === propertyId && c.status === 'selling')),
      };
    }),

    updatePropertyListingPrice: (propertyId: string, newPrice: number) => {
      set((s: any) => ({
        propertyListings: s.propertyListings.map((l: any) =>
          l.propertyId === propertyId ? { ...l, askingPrice: newPrice } : l
        )
      }));
      showToast("Price Updated", `Asking price updated to £${fromPennies(newPrice).toLocaleString()}`);
    },

    setAutoAcceptThreshold: (propertyId: string, threshold: number | undefined) => set((s: any) => ({
      propertyListings: s.propertyListings.map((l: any) =>
        l.propertyId === propertyId ? { ...l, autoAcceptThreshold: threshold } : l
      )
    })),

    addOfferToListing: (propertyId: string, offer: PropertyOffer) => {
      const prev = get();
      const listing = prev.propertyListings.find((l: any) => l.propertyId === propertyId);
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      if (!listing || !property) return;

      const newOffers = [...(listing.offers || []), offer].sort((a: any, b: any) => b.amount - a.amount);
      if (listing.autoAcceptThreshold && offer.amount >= listing.autoAcceptThreshold) {
        setTimeout(() => get().handleEstateAgentSale(propertyId, offer), 100);
      } else {
        showToast("New Offer!", `${offer.buyerName} offered £${fromPennies(offer.amount).toLocaleString()} for ${property.name}`);
      }
      set((s: any) => ({
        propertyListings: s.propertyListings.map((l: any) =>
          l.propertyId === propertyId ? { ...l, offers: newOffers, lastOfferCheck: Date.now() } : l
        )
      }));
    },

    rejectPropertyOffer: (propertyId: string, offerId: string) => set((s: any) => ({
      propertyListings: s.propertyListings.map((l: any) =>
        l.propertyId === propertyId ? { ...l, offers: (l.offers || []).filter((o: any) => o.id !== offerId) } : l
      )
    })),

    counterOffer: (propertyId: string, offerId: string, counterAmount: number) => {
      const responseDelay = 5000 + gameRandom() * 5000;
      showToast("Counter-Offer Sent", `Awaiting buyer response...`);
      set((s: any) => ({
        propertyListings: s.propertyListings.map((l: any) =>
          l.propertyId === propertyId ? {
            ...l, offers: (l.offers || []).map((o: any) =>
              o.id === offerId ? {
                ...o, status: 'countered' as const, counterAmount,
                negotiationRound: o.negotiationRound + 1,
                counterResponseDate: Date.now() + responseDelay,
              } : o
            )
          } : l
        )
      }));
    },

    reducePriceOnListing: (propertyId: string, reductionPercent = 0.07) => {
      const prev = get();
      const property = prev.ownedProperties.find((p: any) => p.id === propertyId);
      const listing = prev.propertyListings.find((l: any) => l.propertyId === propertyId);
      if (!property || !listing) return;

      const currentPrice = listing.askingPrice || property.value;
      const newPrice = Math.floor(currentPrice * (1 - reductionPercent));
      const numNew = gameRandom() > 0.3 ? (gameRandom() > 0.5 ? 3 : 2) : 1;
      const buyerNames = ["Mr & Mrs Johnson", "Sarah Matthews", "David Chen", "Emma Wilson", "The Thompson Family", "Investment Properties Ltd"];
      const newOffers: PropertyOffer[] = [];
      for (let i = 0; i < numNew; i++) {
        const roll = gameRandom();
        let offerAmount: number;
        if (roll < 0.70) offerAmount = property.value * (0.90 + gameRandom() * 0.15);
        else if (roll < 0.85) offerAmount = property.value * (0.80 + gameRandom() * 0.10);
        else offerAmount = property.value * (1.05 + gameRandom() * 0.10);
        offerAmount = Math.min(offerAmount, newPrice);
        newOffers.push({
          id: `offer-${Date.now()}-reduce-${i}`,
          buyerName: buyerNames[Math.floor(gameRandom() * buyerNames.length)],
          amount: Math.floor(offerAmount), daysOnMarket: 0,
          isChainFree: gameRandom() > 0.5, mortgageApproved: gameRandom() > 0.25,
          timestamp: Date.now(), status: 'pending', negotiationRound: 0,
        });
      }
      showToast("Price Reduced!", `${property.name} reduced to £${fromPennies(newPrice).toLocaleString()}`);
      set((s: any) => ({
        propertyListings: s.propertyListings.map((l: any) =>
          l.propertyId === propertyId
            ? { ...l, askingPrice: newPrice, offers: [...(l.offers || []), ...newOffers].sort((a: any, b: any) => b.amount - a.amount) }
            : l
        )
      }));
    },

    acceptBuyerCounter: (propertyId: string, offerId: string) => {
      const prev = get();
      const listing = prev.propertyListings.find((l: any) => l.propertyId === propertyId);
      const offer = listing?.offers?.find((o: any) => o.id === offerId);
      if (!offer || offer.status !== 'buyer-countered' || !offer.buyerCounterAmount) return;
      set((s: any) => ({
        propertyListings: s.propertyListings.map((l: any) =>
          l.propertyId === propertyId ? {
            ...l, offers: (l.offers || []).map((o: any) =>
              o.id === offerId ? { ...o, status: 'accepted' as const, amount: offer.buyerCounterAmount! } : o
            )
          } : l
        )
      }));
    },

    rejectBuyerCounter: (propertyId: string, offerId: string, newCounterAmount: number) => {
      const responseDelay = 5000 + gameRandom() * 5000;
      showToast("Counter-Offer Sent", `Awaiting buyer response...`);
      set((s: any) => ({
        propertyListings: s.propertyListings.map((l: any) =>
          l.propertyId === propertyId ? {
            ...l, offers: (l.offers || []).map((o: any) =>
              o.id === offerId ? {
                ...o, status: 'countered' as const, counterAmount: newCounterAmount,
                negotiationRound: o.negotiationRound + 1,
                counterResponseDate: Date.now() + responseDelay,
              } : o
            )
          } : l
        )
      }));
    },
  };
}
