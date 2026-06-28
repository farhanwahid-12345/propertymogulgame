/**
 * Conveyancing action bundle — withdrawals from buy/sell pipelines.
 *
 * Phase 3e: extracted verbatim from `gameStore.ts` behind a factory. The
 * core monthly conveyancing progression still lives inside
 * `processMarketUpdate` and will be migrated when that orchestrator is split.
 */
import type { Conveyancing, PropertyListing, PropertyOffer } from '@/types/game';
import { toPennies, fromPennies } from '@/lib/formatCurrency';
import { gameRandom } from '@/lib/rng';
import { evaluatePortfolioSaleConsent } from '@/lib/portfolioMortgageConsent';
import { showToast, debit, credit } from '../storeHelpers';

type SetFn = (partial: any) => void;
type GetFn = () => any;

export function createConveyancingActions(set: SetFn, get: GetFn) {
  return {
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
      try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pm:purchase-initiated', { detail: { propertyId, source: 'estate-agent-sale' } })); } catch { /* noop */ }
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
      try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pm:purchase-initiated', { detail: { propertyId, source: 'auction-sale' } })); } catch { /* noop */ }
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
      // Item 10 — flag listings where property value is below the outstanding mortgage.
      const propMortgageBal = prev.mortgages
        .filter((m: any) => m.propertyId === propertyId
          || (m.collateralPropertyIds && m.collateralPropertyIds.includes(propertyId)))
        .reduce((s: number, m: any) => s + (m.remainingBalance || 0), 0);
      const negativeEquityWarning = propMortgageBal > 0 && property.value < propMortgageBal;
      const listing: PropertyListing = {
        propertyId, listingDate: Date.now(), listingMonth: prev.monthsPlayed, isAuction: false,
        daysUntilSale: 30, askingPrice, offers: [], lastOfferCheck: Date.now(),
        negativeEquityWarning: negativeEquityWarning || undefined,
      };
      if (negativeEquityWarning) {
        showToast(
          "⚠️ Listed in Negative Equity",
          `${property.name} value (£${fromPennies(property.value).toLocaleString()}) is below the mortgage (£${fromPennies(propMortgageBal).toLocaleString()}). You'll need to fund the shortfall from cash on completion.`,
          "destructive",
        );
      } else {
        showToast("Property Listed", `${property.name} listed for £${fromPennies(askingPrice).toLocaleString()}`);
      }
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

    withdrawFromConveyancing: (conveyancingId: string) => {
      const prev = get();
      const conv = (prev.conveyancing || []).find((c: any) => c.id === conveyancingId);
      if (!conv) { showToast("Not Found", "That transaction is no longer in progress.", "destructive"); return; }
      if (conv.status === 'selling') {
        const feePennies = toPennies(1500);
        const dbg = debit(prev, feePennies);
        if (!dbg) {
          showToast("Insufficient Funds", `Need £1,500 (even with overdraft) to cover chain-collapse fees.`, "destructive");
          return;
        }
        showToast("Sale Withdrawn", `${conv.propertyName} pulled from sale. Chain-collapse fee £1,500 paid.`, "destructive");
        set({
          cash: dbg.cash,
          overdraftUsed: dbg.overdraftUsed,
          conveyancing: (prev.conveyancing || []).filter((c: any) => c.id !== conveyancingId),
        });
        return;
      }
      const purchase = conv.purchasePrice || 0;
      const abortFee = Math.round(purchase * 0.005);
      const escrowReturn = Math.max(0, (conv.cashHeld || 0) - abortFee);
      const credited = credit(prev, escrowReturn);
      showToast(
        "Purchase Withdrawn",
        `${conv.propertyName} aborted. Solicitor fees forfeit; £${fromPennies(abortFee).toLocaleString()} abort fee deducted.`,
        "destructive",
      );
      const reinstated = !prev.estateAgentProperties.find((p: any) => p.id === conv.propertyId)
        ? [...prev.estateAgentProperties, { id: conv.propertyId, name: conv.propertyName, type: 'residential', price: purchase, value: purchase, neighborhood: '', monthlyIncome: 0, marketTrend: 'stable', condition: 'standard', monthsSinceLastRenovation: 0 } as any]
        : prev.estateAgentProperties;
      set({
        cash: credited.cash,
        overdraftUsed: credited.overdraftUsed,
        conveyancing: (prev.conveyancing || []).filter((c: any) => c.id !== conveyancingId),
        estateAgentProperties: reinstated,
      });
    },
  };
}
