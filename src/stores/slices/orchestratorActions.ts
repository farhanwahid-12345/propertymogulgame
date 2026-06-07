/**
 * Orchestrator action bundle (Phase 3 follow-up — Outstanding Improvements doc, item #3).
 *
 * Extracts `processMarketUpdate` and `processCounterResponses` verbatim from
 * `gameStore.ts` into a slice factory. These two actions cross-cut several
 * domains (renovation completion, reputation, market listings → conveyancing
 * hand-off, damage concerns, loan-rate drift, buyer-counter resolution) so
 * they live together as the "monthly orchestrator" until those domains move
 * to dedicated event-driven slices.
 *
 * Behaviour and persisted shape are unchanged — this is a pure code move.
 */
import { gameRandom } from '@/lib/rng';
import { toPennies, fromPennies } from '@/lib/formatCurrency';
import { LOAN_PRODUCTS, getCeilingPrice } from '@/lib/engine/constants';
import { deriveSqft } from '@/lib/engine/market';
import { applyCeilingDiminishingReturns, isConditionUpgradeRenovation } from '@/lib/engine/renovation';
import { showToast } from '../storeHelpers';
import { mergeConcernsById } from '../sanitizers';
import type {
  Property, PropertyOffer, Renovation, Conveyancing,
} from '@/types/game';

type SetFn = (partial: any) => void;
type GetFn = () => any;

export function createOrchestratorActions(set: SetFn, get: GetFn) {
  return {
    processMarketUpdate: () => {
      const prev = get();
      const currentTime = Date.now();
      const marketChange = (gameRandom() - 0.5) * 0.002;
      const newMarketRate = Math.max(0.015, Math.min(0.08, prev.currentMarketRate + marketChange));

      // Phase 3 #1b — local reputation buffer for events fired inside this tick
      // (renovation completions). Merged into landlordReputation/reputationLog in set().
      let reputationDelta = 0;
      const reputationLogEntries: Array<{ id: string; month: number; reason: string; delta: number; category: 'eviction' | 'walkout' | 'tribunal' | 'dispute' | 'maintenance' | 'tenancy' | 'other' }> = [];
      const newMonthNumber = prev.monthsPlayed;

      // Completed renovations — driven by in-game months so duration matches
      // the dialog's headline and respects gameSpeed. Wall-clock is fallback only.
      const isRenoComplete = (r: Renovation) =>
        typeof r.completionMonth === 'number'
          ? prev.monthsPlayed >= r.completionMonth
          : currentTime >= r.completionDate;
      const completedRenovations = prev.renovations.filter(isRenoComplete);
      const activeRenovations = prev.renovations.filter((r: Renovation) => !isRenoComplete(r));
      const updatedProperties = [...prev.ownedProperties];
      completedRenovations.forEach((renovation: Renovation) => {
        const idx = updatedProperties.findIndex((p: Property) => p.id === renovation.propertyId);
        if (idx >= 0) {
          // ROI variability roll: realistic outcome distribution
          const roll = gameRandom();
          let valueMult = 1.0, rentMult = 1.0, outcomeNote = '';
          if (renovation.type.category === 'conversion') {
            if (roll < 0.55) { valueMult = 1.0; rentMult = 1.0; outcomeNote = 'on spec'; }
            else if (roll < 0.85) { valueMult = 1.5; rentMult = 1.5; outcomeNote = 'over-delivered'; }
            else if (roll < 0.97) { valueMult = 0.8; rentMult = 0.8; outcomeNote = 'soft demand'; }
            else { valueMult = 0.3; rentMult = 0.3; outcomeNote = 'planning issues'; }
          } else {
            if (roll < 0.60) { outcomeNote = 'on spec'; }
            else if (roll < 0.90) { valueMult = 0.85; rentMult = 0.85; outcomeNote = 'minor issues'; }
            else if (roll < 0.98) { valueMult = 0.65; rentMult = 0.65; outcomeNote = 'underwhelming returns'; }
            else { valueMult = 0.55; rentMult = 0.55; outcomeNote = 'major issues found'; }
          }

          const propRecord = updatedProperties[idx];
          const valuePounds = fromPennies(propRecord.value);
          const ceilingPounds = getCeilingPrice({ neighborhood: propRecord.neighborhood, type: propRecord.type });
          const { uplift: cappedValuePounds, diminishingFactor } = applyCeilingDiminishingReturns(
            renovation.type.valueIncrease, valuePounds, ceilingPounds,
          );
          const rentFactor = 0.5 + 0.5 * diminishingFactor;
          const actualValueGain = Math.round(toPennies(cappedValuePounds) * valueMult);
          const actualRentGain = Math.round(toPennies(renovation.type.rentIncrease) * rentMult * rentFactor);

          const subtypeUpdate = (renovation.type as any).resultingSubtype
            ? { subtype: (renovation.type as any).resultingSubtype as Property['subtype'] }
            : {};
          const subtypeUnits = (renovation.type as any).subtypeUnits as number | undefined;
          const subtypeUnitsUpdate = subtypeUnits ? { subtypeUnits } : {};

          const conditionUpdate =
            valueMult > 0 &&
            propRecord.condition === 'standard' &&
            isConditionUpgradeRenovation(renovation.type.id)
              ? { condition: 'premium' as Property['condition'] }
              : {};

          const propertyOccupied = prev.tenants.some((t: any) => t.propertyId === propRecord.id);
          const newBaseRent = (updatedProperties[idx].baseRent || updatedProperties[idx].monthlyIncome) + actualRentGain;
          const newMonthlyIncome = propertyOccupied
            ? updatedProperties[idx].monthlyIncome
            : updatedProperties[idx].monthlyIncome + actualRentGain;

          const sqftAdded = (renovation.type as any).sqftAdded as number | undefined;
          const currentSqftSafe = updatedProperties[idx].internalSqft && updatedProperties[idx].internalSqft! > 0
            ? updatedProperties[idx].internalSqft!
            : deriveSqft({ type: updatedProperties[idx].type, value: fromPennies(updatedProperties[idx].value), internalSqft: updatedProperties[idx].internalSqft, plotSqft: updatedProperties[idx].plotSqft }).internalSqft;
          const sqftUpdate = sqftAdded && sqftAdded > 0 && valueMult > 0
            ? {
                internalSqft: currentSqftSafe + sqftAdded,
                plotSqft: updatedProperties[idx].plotSqft || 0,
              }
            : {};

          const epcTarget = (renovation.type as any).epcTarget as Property['epcRating'] | undefined;
          const epcUpdate = epcTarget && valueMult > 0 ? { epcRating: epcTarget } : {};

          const completedAfter = [
            ...(updatedProperties[idx].completedRenovationIds || []),
            renovation.type.id,
          ];
          const refurbClearUpdate =
            updatedProperties[idx].needsRefurb &&
            completedAfter.includes('kitchen_upgrade') &&
            completedAfter.includes('bathroom_renovation')
              ? { needsRefurb: false }
              : {};

          updatedProperties[idx] = {
            ...updatedProperties[idx],
            value: updatedProperties[idx].value + actualValueGain,
            marketValue: (updatedProperties[idx].marketValue || updatedProperties[idx].value) + actualValueGain,
            monthlyIncome: newMonthlyIncome,
            baseRent: newBaseRent,
            monthsSinceLastRenovation: 0,
            completedRenovationIds: [
              ...(updatedProperties[idx].completedRenovationIds || []),
              renovation.type.id,
            ],
            renovationCompletionMonths: {
              ...(updatedProperties[idx].renovationCompletionMonths || {}),
              [renovation.type.id]: prev.monthsPlayed,
              ...(renovation.type.category === 'conversion' ? { __lastConversion: prev.monthsPlayed } : {}),
            },
            ...sqftUpdate,
            ...subtypeUpdate,
            ...subtypeUnitsUpdate,
            ...epcUpdate,
            ...refurbClearUpdate,
            ...conditionUpdate,
          };
          const expectedValue = renovation.type.valueIncrease;
          const actualValuePounds = fromPennies(actualValueGain);
          const rentNote = propertyOccupied && actualRentGain > 0
            ? ` Sitting tenant on existing rent — serve Section 13 to raise to £${fromPennies(newBaseRent).toLocaleString()}/mo.`
            : '';
          showToast(
            `Renovation Complete (${outcomeNote})!`,
            (valueMult === 1
              ? `${renovation.type.name} on ${updatedProperties[idx].name} delivered the full +£${expectedValue.toLocaleString()} uplift.`
              : `${renovation.type.name} on ${updatedProperties[idx].name} — value gain £${actualValuePounds.toLocaleString()} (expected £${expectedValue.toLocaleString()}).`) + rentNote,
            valueMult === 0 ? 'destructive' : undefined,
          );
          if (valueMult > 0 && (renovation.type.category === 'improvement' || renovation.type.category === 'conversion' || renovation.type.category === 'extension')) {
            reputationDelta += 2;
            reputationLogEntries.push({
              id: `rep_reno_${renovation.id}_${newMonthNumber}`,
              month: newMonthNumber,
              reason: `Completed ${renovation.type.name} on ${updatedProperties[idx].name}`,
              delta: 2,
              category: 'maintenance',
            });
          }
        }
      });

      // Update listings — days-on-market driven by game time (in-game months),
      // not wall-clock, so the badge actually advances during play (Phase 3 #1a).
      const updatedListings = prev.propertyListings.map((listing: any) => {
        const listingMonth = typeof listing.listingMonth === 'number'
          ? listing.listingMonth
          : prev.monthsPlayed;
        const monthsOnMarket = Math.max(0, prev.monthsPlayed - listingMonth);
        const daysOnMarket = monthsOnMarket * 30;
        const property = prev.ownedProperties.find((p: Property) => p.id === listing.propertyId);
        const daysSinceLastCheck = listing.lastOfferCheck
          ? Math.floor((currentTime - listing.lastOfferCheck) / (1000 * 60 * 60 * 24))
          : 999;

        const newOffers = listing.offers || [];
        let lastCheck = listing.lastOfferCheck || listing.listingDate;

        if (!listing.isAuction && property && daysSinceLastCheck >= 3) {
          const asking = listing.askingPrice || property.value;
          const market = property.value;
          const askRatio = asking / Math.max(1, market);

          let numNew: number;
          let bandLow: number;
          let bandHigh: number;
          let bidWarChance: number;
          if (askRatio <= 1.0) {
            numNew = gameRandom() > 0.4 ? 2 : 1;
            bandLow = 0.92; bandHigh = 1.02; bidWarChance = 0.12;
          } else if (askRatio <= 1.15) {
            numNew = gameRandom() > 0.6 ? 2 : 1;
            bandLow = 0.86; bandHigh = 0.98; bidWarChance = 0.04;
          } else {
            numNew = gameRandom() > 0.75 ? 1 : 0;
            bandLow = 0.72; bandHigh = 0.84; bidWarChance = 0;
          }
          const timeAdj = Math.max(0.9, 1 - (daysOnMarket * 0.003));

          const buyerNames = [
            "Mr & Mrs Johnson", "Sarah Matthews", "David Chen", "Emma Wilson",
            "The Thompson Family", "Investment Properties Ltd", "Michael Brown",
            "Liverpool Capital Group", "First Time Buyer", "Retirement Home Buyer",
          ];
          for (let i = 0; i < numNew; i++) {
            const isBidWar = gameRandom() < bidWarChance;
            const pct = isBidWar
              ? 1.03 + gameRandom() * 0.08
              : bandLow + gameRandom() * (bandHigh - bandLow);
            const isCash = gameRandom() < 0.25;
            const offer: PropertyOffer = {
              id: `offer-${Date.now()}-${i}`,
              buyerName: buyerNames[Math.floor(gameRandom() * buyerNames.length)],
              amount: Math.floor(asking * pct * timeAdj),
              daysOnMarket,
              isChainFree: isCash || gameRandom() > 0.6,
              isCash,
              mortgageApproved: isCash ? true : gameRandom() > 0.3,
              timestamp: currentTime,
              status: 'pending', negotiationRound: 0,
            };
            newOffers.push(offer);
            if (listing.autoAcceptThreshold && offer.amount >= listing.autoAcceptThreshold) {
              showToast("Offer Auto-Accepted! 🎉", `${offer.buyerName}'s offer auto-accepted for ${property.name}!`);
            } else {
              showToast(
                isCash ? "Cash Offer Received! 💵" : "New Offer Received! 💰",
                `${offer.buyerName} offered for ${property.name}${isCash ? ' (cash buyer)' : ''}`,
              );
            }
          }
          lastCheck = currentTime;
        }

        const autoAccepted = newOffers.find((o: PropertyOffer) =>
          listing.autoAcceptThreshold && o.amount >= listing.autoAcceptThreshold,
        );
        if (autoAccepted) {
          return { ...listing, listingMonth, daysUntilSale: 0, offers: newOffers, lastOfferCheck: lastCheck };
        }
        return { ...listing, listingMonth, daysUntilSale: Math.max(1, listing.daysUntilSale), offers: newOffers, lastOfferCheck: lastCheck };
      });

      const completedSales = updatedListings.filter((l: any) => l.daysUntilSale === 0);
      const newConveyancing: Conveyancing[] = [];
      completedSales.forEach((sale: any) => {
        const property = prev.ownedProperties.find((p: Property) => p.id === sale.propertyId);
        if (property) {
          const autoOffer = sale.offers?.find((o: PropertyOffer) => sale.autoAcceptThreshold && o.amount >= sale.autoAcceptThreshold);
          if (!autoOffer) return;
          newConveyancing.push({
            id: `conv_sell_${Date.now()}_${property.id}`,
            propertyId: property.id,
            propertyName: property.name,
            status: 'selling',
            startMonth: prev.monthsPlayed,
            completionMonth: prev.monthsPlayed + 1 + Math.floor(gameRandom() * 3),
            salePrice: autoOffer.amount,
            cashHeld: 0,
            isAuction: sale.isAuction,
          });
          showToast("Sale Agreed! ⏳", `${property.name} — conveyancing started. Completion in 1-3 months.`);
        }
      });

      // Void periods
      const activeVoids = prev.voidPeriods.filter((vp: any) => currentTime < vp.endDate);
      const endedVoids = prev.voidPeriods.filter((vp: any) => currentTime >= vp.endDate);
      endedVoids.forEach(() => showToast("Void Period Ended", "Your property is now ready for a new tenant!"));

      // Damage events — flow through the tenant concerns feed.
      const newDamageConcerns: import('@/types/game').TenantConcern[] = [];
      const globalCooldown = prev.lastGlobalDamageMonth !== undefined ? prev.monthsPlayed - prev.lastGlobalDamageMonth : 999;
      if (globalCooldown >= 6) {
        const currentYear = Math.floor(prev.monthsPlayed / 12);
        const damageDescriptions = [
          'Boiler breakdown — heating system needs repair',
          'Roof leak causing interior damage',
          'Major plumbing failure under kitchen',
          'Electrical fault — RCD tripping repeatedly',
          'Damaged flooring requiring replacement',
          'Broken window and frame, security risk',
        ];
        const sellingPropIds = new Set(
          (prev.conveyancing || []).filter((c: any) => c.status === 'selling').map((c: any) => c.propertyId),
        );
        const listedForSalePropIds = new Set((prev.propertyListings || []).map((l: any) => l.propertyId));
        const evictedPropIds = new Set(
          (prev.pendingEvictions || [])
            .filter((ev: any) => prev.monthsPlayed >= ev.effectiveMonth)
            .map((ev: any) => ev.propertyId),
        );

        prev.tenants.forEach(({ propertyId, tenant }: any) => {
          if (newDamageConcerns.length > 0) return;
          if (gameRandom() >= tenant.damageRisk / 100) return;
          const property = prev.ownedProperties.find((p: Property) => p.id === propertyId);
          if (!property) return;
          if (sellingPropIds.has(propertyId) || listedForSalePropIds.has(propertyId) || evictedPropIds.has(propertyId)) return;
          const dmgHist = prev.damageHistory.find((dh: any) => dh.propertyId === propertyId);
          const monthsSinceLast = dmgHist ? prev.monthsPlayed - dmgHist.lastDamageMonth : 999;
          if (monthsSinceLast < 48) return;
          const annualCap = Math.round(property.value * 0.02);
          const existing = prev.annualRepairCosts.find((a: any) => a.propertyId === propertyId && a.year === currentYear);
          const currentCost = existing?.totalCost || 0;
          if (currentCost >= annualCap) return;
          const maxDmg = Math.min(Math.round(property.value * (0.01 + gameRandom() * 0.01)), annualCap - currentCost);
          if (maxDmg > 0) {
            const desc = damageDescriptions[Math.floor(gameRandom() * damageDescriptions.length)];
            newDamageConcerns.push({
              id: `concern_damage_${Date.now()}_${propertyId}`,
              propertyId,
              tenantProfile: tenant.profile as any,
              category: 'maintenance',
              description: desc,
              raisedMonth: prev.monthsPlayed,
              resolveCost: Math.floor(maxDmg),
              satisfactionPenaltyIfIgnored: 6,
              source: 'damage',
            });
          }
        });
      }

      const salePropIds = new Set(completedSales.map((s: any) => s.propertyId));

      const driftLoanSpread = (current: number, min: number, max: number) => {
        const next = current + (gameRandom() - 0.5) * 0.006;
        return Math.max(min, Math.min(max, next));
      };
      const newLoanRates = {
        personal: driftLoanSpread(prev.currentLoanRates.personal, LOAN_PRODUCTS.personal.spreadMin, LOAN_PRODUCTS.personal.spreadMax),
        business: driftLoanSpread(prev.currentLoanRates.business, LOAN_PRODUCTS.business.spreadMin, LOAN_PRODUCTS.business.spreadMax),
      };

      const renovationsCompletedThisTick = completedRenovations.length > 0;
      set((s: any) => ({
        ownedProperties: updatedProperties,
        renovations: activeRenovations,
        currentMarketRate: newMarketRate,
        currentLoanRates: newLoanRates,
        voidPeriods: activeVoids,
        propertyListings: updatedListings.filter((l: any) => !salePropIds.has(l.propertyId)),
        tenantConcerns: mergeConcernsById(s.tenantConcerns, newDamageConcerns),
        lastGlobalDamageMonth: newDamageConcerns.length > 0 ? prev.monthsPlayed : prev.lastGlobalDamageMonth,
        conveyancing: [...prev.conveyancing, ...newConveyancing],
        opsFlashAt: (renovationsCompletedThisTick || newDamageConcerns.length > 0)
          ? Date.now()
          : (s as any).opsFlashAt || 0,
        landlordReputation: reputationDelta !== 0
          ? Math.max(0, Math.min(100, (s.landlordReputation ?? 50) + reputationDelta))
          : (s.landlordReputation ?? 50),
        reputationLog: reputationLogEntries.length > 0
          ? [...((s as any).reputationLog || []), ...reputationLogEntries].slice(-40)
          : ((s as any).reputationLog || []),
      } as any));

      // Toast AFTER state commit — guarantees the matching concern is in the feed
      // before the user sees the notification.
      newDamageConcerns.forEach((c) => {
        const property = prev.ownedProperties.find((p: Property) => p.id === c.propertyId);
        if (!property) return;
        showToast(
          "🔧 Property Damage",
          `${property.name}: ${c.description}. Resolve in the Concerns feed.`,
          "destructive",
        );
      });
    },

    processCounterResponses: () => {
      const prev = get();
      let hasChanges = false;
      const updatedListings = prev.propertyListings.map((listing: any) => {
        const property = prev.ownedProperties.find((p: Property) => p.id === listing.propertyId);
        if (!property) return listing;
        const updatedOffers = (listing.offers || []).map((offer: PropertyOffer) => {
          if (offer.status === 'countered' && offer.counterResponseDate && Date.now() >= offer.counterResponseDate) {
            hasChanges = true;
            const acceptChance = offer.negotiationRound >= 3 ? 0.8 : 0.6;
            const counterChance = offer.negotiationRound >= 3 ? 0 : 0.25;
            const roll = gameRandom();
            if (roll < acceptChance) {
              showToast("Counter-Offer Accepted! 🎉", `${offer.buyerName} accepted your counter for ${property.name}!`);
              return { ...offer, status: 'accepted' as const, amount: offer.counterAmount || offer.amount };
            } else if (roll < acceptChance + counterChance) {
              const diff = (offer.counterAmount || offer.amount) - offer.amount;
              const buyerCounter = offer.amount + Math.floor(diff * (0.4 + gameRandom() * 0.3));
              showToast("Buyer Counter-Offered", `${offer.buyerName} countered with £${fromPennies(buyerCounter).toLocaleString()}`);
              return { ...offer, status: 'buyer-countered' as const, buyerCounterAmount: buyerCounter, counterResponseDate: undefined };
            } else {
              showToast("Buyer Walked Away", `${offer.buyerName} has withdrawn`, "destructive");
              return { ...offer, status: 'walkaway' as const, counterResponseDate: undefined };
            }
          }
          return offer;
        });
        return { ...listing, offers: updatedOffers };
      });
      if (hasChanges) set({ propertyListings: updatedListings });
    },
  };
}
