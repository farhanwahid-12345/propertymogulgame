/**
 * Month-end action slice (Outstanding Improvements doc — Phase 1).
 *
 * Extracts `processMonthEnd` verbatim from `gameStore.ts` into a slice factory.
 * Pure code move — no logic, variable, or shape changes.
 */
import { toPennies, fromPennies } from '@/lib/formatCurrency';
import { playGavel, playLevelUp, playPaper, playConcernChime } from '@/lib/sound';
import {
  BASE_MARKET_RATE, COUNCIL_TAX_BAND_D, SOLICITOR_FEES, ESTATE_AGENT_RATE,
  computeMonthlyCouncilTaxPennies,
  AUCTION_SELLER_FEE, MORTGAGE_PROVIDERS, MONTH_DURATION_SECONDS, EICR_COST_PENNIES,
  conditionTierFromScore, scoreFromConditionTier,
  TENANT_WEAR_MULTIPLIER, BASE_CONDITION_DECAY, CONDITION_DECAY_FLOOR,
  CONDITION_TOPUP_PENNIES_PER_POINT_PER_SQFT,
} from '@/lib/engine/constants';
import {
  calculateDTI, fluctuateProviderRates, getRequiredNetWorth, getFurnitureValuePennies,
} from '@/lib/engine/financials';
import {
  calculateIncomeTax, calculateCorporationTax, calculateCGT,
  getConditionRentMultiplier, projectAnnualTax,
} from '@/lib/engine/taxation';
import { canUpgradeToPremium } from '@/lib/engine/renovation';
import { gameRandom } from '@/lib/rng';
import {
  CHAIN_COLLAPSE_PROB, SUI_GENERIS_PROB, EVICTION_UPHELD_PROB,
  MARKET_DIP_PROB, TENANT_WALKOUT_RISK_PROB,
} from '@/lib/engine/probabilities';
import { showToast, debit, credit } from '../storeHelpers';
import { evaluateAchievements, ACHIEVEMENTS } from '@/lib/achievements';
import { mergeConcernsById } from '../sanitizers';
import type {
  GameState, Property, Mortgage, Conveyancing, TenantEvent, VoidPeriod, DepositDispute,
  PendingEviction, PropertyLock, EvictionGround, MacroEconomicEvent,
  PropertyTenant, PendingRentReview, PendingLeaseRenewal, DebtRecoveryCase,
} from '@/types/game';

type SetFn = (partial: Partial<GameState> | ((s: GameState) => Partial<GameState>)) => void;
type GetFn = () => GameState;

export function createMonthEndActions(set: SetFn, get: GetFn) {
  return {
    processMonthEnd: () => {
      const prev = get();
      if (prev.isBankrupt) return;
      if (prev.timeUntilNextMonth > 0) return;

      const currentTime = Date.now();
      const newMonthNumber = prev.monthsPlayed + 1;
      // Item 3: bump when any operations-significant thing happens this tick
      // (conveyancing complete, planning decision, renovation complete, missed rent,
      // chain collapse). Read at the end into the final set().
      let opsFlashAtNew = prev.opsFlashAt || 0;
      const flashOps = () => { opsFlashAtNew = Date.now(); };

      // ── Process conveyancing ──
      let completedBuys: Conveyancing[] = [];
      let completedSells: Conveyancing[] = [];
      let cancelledConveyancing: Conveyancing[] = [];
      let activeConveyancing: Conveyancing[] = [];
      let conveyancingCashReturn = 0;
      // Phase 3 #5 — chain-collapse pop-out queue (replaces silent toast).
      const newChainCollapseEvents: import('@/types/game').ChainCollapseEvent[] = [];

      prev.conveyancing.forEach(conv => {
        if (newMonthNumber >= conv.completionMonth) {
          // Phase 3 #5: reduced chain collapse chance (was 10%, now 4%).
          if (gameRandom() < CHAIN_COLLAPSE_PROB) {
            cancelledConveyancing.push(conv);
            conveyancingCashReturn += conv.cashHeld;
            newChainCollapseEvents.push({
              id: `chain_${Date.now()}_${conv.propertyId}`,
              propertyName: conv.propertyName,
              side: conv.status,
              month: newMonthNumber,
              cashReturned: conv.cashHeld,
            });
            flashOps();
          } else {
            if (conv.status === 'buying') completedBuys.push(conv);
            else completedSells.push(conv);
            flashOps();
          }
        } else {
          activeConveyancing.push(conv);
        }
      });


      // Complete buy conveyancing — add property + mortgage
      let newOwnedProperties = [...prev.ownedProperties];
      let newMortgages = [...prev.mortgages];
      let newEstateAgent = [...prev.estateAgentProperties];
      let newAuction = [...prev.auctionProperties];
      const transferredSittingTenants: PropertyTenant[] = [];

      completedBuys.forEach(conv => {
        // Find the property from market lists
        let prop = newEstateAgent.find(p => p.id === conv.propertyId) || newAuction.find(p => p.id === conv.propertyId);
        if (!prop) {
          // Property was generated inline — reconstruct using the advertised
          // yield/rent snapshot so realised numbers match the agent's label.
          // v4 #9 — preserve the snapshotted `propertyType`; older saves fall
          // back to 'residential' but new buys carry the original type through.
          const reconstructedValue = conv.purchasePrice || 0;
          const reconstructedYield = conv.advertisedYield ?? (6 + gameRandom() * 9);
          const derivedRent = conv.advertisedMonthlyIncome
            ?? (reconstructedValue > 0 ? Math.floor((reconstructedValue * (reconstructedYield / 100)) / 12) : 0);
          const reconstructedType = conv.propertyType ?? 'residential';
          prop = { id: conv.propertyId, name: conv.propertyName, type: reconstructedType, price: reconstructedValue, value: reconstructedValue, neighborhood: '', monthlyIncome: derivedRent, image: '', marketTrend: 'stable', condition: 'standard', monthsSinceLastRenovation: 0, yield: reconstructedYield };
        }
        // Phase 3 #2 — preserve the ADVERTISED rent so realised yield rises when
        // we buy under asking; bonus a small "instant equity" cushion when the
        // bargain is material (paid < 90% of listed value).
        const listedValue = prev.estateAgentProperties.find(p => p.id === conv.propertyId)?.value
          ?? prev.auctionProperties.find(p => p.id === conv.propertyId)?.value
          ?? prop.value;
        const paid = conv.purchasePrice || prop.price;
        const advertisedRent = conv.advertisedMonthlyIncome ?? prop.monthlyIncome;
        const bargainRatio = listedValue > 0 ? paid / listedValue : 1;
        let settledValue: number;
        if (bargainRatio < 0.9 && listedValue > paid) {
          // Material bargain → settle slightly above paid (capped at listed value,
          // max +15% of paid) so net worth reflects the instant equity gain.
          settledValue = Math.min(listedValue, Math.round(paid * 1.15));
        } else {
          settledValue = Math.min(listedValue, paid);
        }
        // Yield = annual rent ÷ price paid × 100. With rent fixed, paying less ⇒ higher yield.
        const effectiveYield = paid > 0 ? (advertisedRent * 12 / paid) * 100 : (prop.yield ?? 7);
        const effectiveRent = advertisedRent;
        // Phase 1 — commercial properties complete vacant unless a sitting tenant
        // + lease was attached to the listing (Phase 3 — tenanted commercial buys).
        const isCommercial = prop.type === 'commercial';
        const inheritedLease = isCommercial ? prop.commercialLease : undefined;
        const inheritedSittingTenant = isCommercial ? prop.sittingTenant : undefined;
        const hasSittingTenant = !!(inheritedLease && inheritedSittingTenant);
        // When a sitting tenant transfers, rewrite the lease's start/expiry months
        // so the remaining term matches the current game month.
        let transferredLease: NonNullable<Property['commercialLease']> | undefined = undefined;
        if (hasSittingTenant) {
          const placeholderStart = inheritedLease.startMonth ?? 0;
          const placeholderExpiry = inheritedLease.expiryMonth ?? inheritedLease.termMonths;
          const remaining = Math.max(1, placeholderExpiry - placeholderStart);
          const termMonths = inheritedLease.termMonths ?? remaining;
          transferredLease = {
            ...inheritedLease,
            startMonth: newMonthNumber - (termMonths - remaining),
            expiryMonth: newMonthNumber + remaining,
          };
        }
        const useClassInit = isCommercial
          ? (gameRandom() < SUI_GENERIS_PROB ? 'sui_generis' as const : 'E' as const)
          : undefined;
        const purchasedMonthlyIncome = hasSittingTenant
          ? (transferredLease.negotiatedRentPennies ?? effectiveRent)
          : effectiveRent;
        const purchased: Property = {
          ...prop, owned: true, price: paid,
          type: prop.type,
          value: settledValue,
          // marketValue tracks the listed value so the asking-side signal stays honest.
          marketValue: Math.max(settledValue, paid),
          yield: effectiveYield,
          monthlyIncome: purchasedMonthlyIncome,
          lastRentIncrease: newMonthNumber, baseRent: purchasedMonthlyIncome,
          // Item 9 — explicitly carry EPC from the listing (fallback 'D' for legacy listings without one).
          epcRating: prop.epcRating ?? 'D',
          ...(useClassInit ? { useClass: useClassInit } : {}),
          // Commercial: preserve transferred lease if present; otherwise vacant.
          ...(isCommercial ? { commercialLease: transferredLease } : {}),
          // Strip listing-only sittingTenant field — it now lives in tenants slice.
          sittingTenant: undefined,
        };

        newOwnedProperties.push(purchased);

        if (hasSittingTenant) {
          transferredSittingTenants.push({
            propertyId: conv.propertyId,
            slotIndex: 0,
            tenant: inheritedSittingTenant,
            rentMultiplier: inheritedSittingTenant.rentMultiplier ?? 1,
            startDate: Date.now(),
            satisfaction: 80,
            lastSatisfactionUpdate: newMonthNumber,
            satisfactionReasons: [],
            moveInMonth: transferredLease.startMonth,
            // Sitting tenants transfer without a new TDS deposit at completion.
            depositHeld: 0,
            rentPennies: transferredLease.negotiatedRentPennies,
          });
        }

        newEstateAgent = newEstateAgent.filter(p => p.id !== conv.propertyId);
        newAuction = newAuction.filter(p => p.id !== conv.propertyId);

        if (conv.mortgageData) {
          const fxYears = conv.mortgageData.fixedTermYears;
          newMortgages.push({
            id: `${conv.propertyId}_${Date.now()}`, propertyId: conv.propertyId,
            principal: conv.mortgageData.amount, monthlyPayment: conv.mortgageData.monthlyPayment,
            remainingBalance: conv.mortgageData.amount, interestRate: conv.mortgageData.interestRate,
            termYears: conv.mortgageData.termYears, mortgageType: conv.mortgageData.mortgageType,
            providerId: conv.mortgageData.providerId, startDate: Date.now(),
            startMonth: newMonthNumber,
            fixedTermYears: fxYears && fxYears > 0 ? fxYears : undefined,
            fixedRate: fxYears && fxYears > 0 ? conv.mortgageData.interestRate : undefined,
          });
        }
        const tenantNote = hasSittingTenant
          ? ` Sitting tenant ${inheritedSittingTenant.companyName} transferred — lease continues.`
          : '';
        showToast("Conveyancing Complete! 🏠", `${conv.propertyName} is now yours!${tenantNote}`);
      });

      // Complete sell conveyancing — remove property, add cash
      let sellCash = 0;
      let newTenants = [...prev.tenants, ...transferredSittingTenants];
      let newVoidPeriods = [...prev.voidPeriods];
      let newPropertyListings = [...prev.propertyListings];
      // Phase 4 (v5 statements) — accumulate CGT realised this tax year.
      let cgtThisYearAcc = prev.cgtThisYearPennies ?? 0;
      const cgtRecordsThisRun: import('@/types/game').TaxRecord[] = [];


      completedSells.forEach(conv => {
        const salePrice = conv.salePrice || 0;
        const fees = conv.isAuction ? Math.round(salePrice * AUCTION_SELLER_FEE) : Math.round(salePrice * ESTATE_AGENT_RATE);
        const mortgage = newMortgages.find(m => m.propertyId === conv.propertyId);

        // ─── Portfolio mortgage redemption ───────────────────────────
        // If this property collateralises a portfolio mortgage, the lender
        // takes a proportional redemption slice from sale proceeds and
        // drops the property from the collateral list.
        let portfolioRedemption = 0;
        const portfolioIdx = newMortgages.findIndex(
          m => m.collateralPropertyIds && m.collateralPropertyIds.includes(conv.propertyId),
        );
        if (portfolioIdx >= 0) {
          const pm = newMortgages[portfolioIdx];
          const collateralProps = (pm.collateralPropertyIds || [])
            .map(id => newOwnedProperties.find(p => p.id === id))
            .filter((p): p is typeof newOwnedProperties[number] => !!p);
          const totalCollateralValue = collateralProps.reduce((s, p) => s + p.value, 0);
          const propBeingSold = collateralProps.find(p => p.id === conv.propertyId);
          if (totalCollateralValue > 0 && propBeingSold) {
            portfolioRedemption = Math.min(
              pm.remainingBalance,
              Math.floor(pm.remainingBalance * (propBeingSold.value / totalCollateralValue)),
            );
            const newBalance = pm.remainingBalance - portfolioRedemption;
            const newCollateralIds = (pm.collateralPropertyIds || []).filter(id => id !== conv.propertyId);
            if (newBalance <= 0 || newCollateralIds.length === 0) {
              // Mortgage cleared — remove it entirely.
              newMortgages = newMortgages.filter((_, i) => i !== portfolioIdx);
            } else {
              const scale = newBalance / pm.remainingBalance;
              newMortgages = newMortgages.map((m, i) => i === portfolioIdx ? {
                ...m,
                remainingBalance: newBalance,
                monthlyPayment: Math.floor(m.monthlyPayment * scale),
                collateralPropertyIds: newCollateralIds,
              } : m);
            }
          }
        }

        const net = salePrice - fees - SOLICITOR_FEES - (mortgage?.remainingBalance || 0) - portfolioRedemption;

        // CGT for sole traders — capital improvement spend (extensions/
        // conversions) increases the cost base, reducing the taxable gain.
        const property = newOwnedProperties.find(p => p.id === conv.propertyId);
        let cgtAmount = 0;
        if (property && prev.entityType === 'sole_trader') {
          const improvementCosts = property.capitalImprovementsPennies || 0;
          cgtAmount = calculateCGT(salePrice, property.price, improvementCosts, prev.entityType);
        }

        sellCash += net - cgtAmount;
        if (cgtAmount > 0) {
          cgtThisYearAcc += cgtAmount;
          cgtRecordsThisRun.push({
            month: prev.monthsPlayed,
            type: 'cgt',
            amount: cgtAmount,
            description: `CGT on sale of ${conv.propertyName} — £${fromPennies(cgtAmount).toLocaleString()}`,
          });
        }

        newOwnedProperties = newOwnedProperties.filter(p => p.id !== conv.propertyId);
        newMortgages = newMortgages.filter(m => m.propertyId !== conv.propertyId);
        newTenants = newTenants.filter(t => t.propertyId !== conv.propertyId);
        newVoidPeriods = newVoidPeriods.filter(vp => vp.propertyId !== conv.propertyId);
        newPropertyListings = newPropertyListings.filter(l => l.propertyId !== conv.propertyId);

        const redemptionNote = portfolioRedemption > 0
          ? ` · £${fromPennies(portfolioRedemption).toLocaleString()} redeemed to portfolio lender`
          : '';
        showToast("Property Sold! 🎉", `${conv.propertyName} sold for £${fromPennies(salePrice).toLocaleString()}${cgtAmount > 0 ? ` (CGT: £${fromPennies(cgtAmount).toLocaleString()})` : ''}${redemptionNote}`);
        playGavel();
      });

      // ── Monthly income (skip conveyancing properties) ──
      const conveyancingPropertyIds = new Set([...activeConveyancing.map(c => c.propertyId), ...cancelledConveyancing.map(c => c.propertyId)]);

      // Risk-weighted missed-rent roll: probability scales with tenant.defaultRisk.
      // defaultRisk is ~1–60; convert to monthly miss probability with a 0.4 dampener.
      const missedRentPropertyIds = new Set<string>();
      const missedTenantKeys = new Set<string>();
      const newDefaultEvents: TenantEvent[] = [];
      prev.tenants.forEach(t => {
        if (conveyancingPropertyIds.has(t.propertyId)) return;
        const prop = prev.ownedProperties.find(p => p.id === t.propertyId);
        let monthlyP: number;
        if (prop?.type === 'commercial') {
          // Phase 5 — covenant-driven reliability for commercial tenants.
          const cov = t.tenant.covenantStrength ?? 50;
          monthlyP = Math.min(0.15, Math.max(0.001, ((100 - cov) / 100) * 0.15));
        } else {
          const risk = t.tenant.defaultRisk ?? 5;
          // Phase 5 #12 — risky tenants miss rent ~20%/mo (≈ 2–3 times/yr).
          const isHighRisk = t.tenant.profile === 'risky' || risk >= 30;
          const baseP = Math.min(0.25, Math.max(0.002, (risk / 100) * 0.4));
          monthlyP = isHighRisk ? Math.min(0.45, Math.max(0.20, baseP * 2.5)) : baseP;
        }
        if (gameRandom() < monthlyP) {
          const key = `${t.propertyId}::${t.slotIndex ?? 0}`;
          missedTenantKeys.add(key);
          missedRentPropertyIds.add(t.propertyId);


          newDefaultEvents.push({ propertyId: t.propertyId, type: 'default', amount: prop?.monthlyIncome || 0, month: newMonthNumber });
          // Item 2: throttle toasts to max 1 per ~3 months per tenant.
          const lastToast = t.lastDefaultToastMonth ?? -999;
          if (prop && newMonthNumber - lastToast >= 3) {
            const arrearsAfter = (t.arrearsMonths ?? 0) + 1;
            const evictHint = arrearsAfter >= 2 ? " — Section 8 eviction now available." : "";
            showToast("Missed Rent ⚠️", `${t.tenant.name} missed rent at ${prop.name} (${arrearsAfter}mo arrears).${evictHint}`, "destructive");
            flashOps();
          }
        }
      });


      const monthlyIncome = newOwnedProperties.reduce((total, property) => {
        if (conveyancingPropertyIds.has(property.id)) return total; // No rent during conveyancing
        if (missedRentPropertyIds.has(property.id)) return total;   // Tenant defaulted this month
        const hasTenant = newTenants.some(t => t.propertyId === property.id);
        const isInVoid = newVoidPeriods.some(vp =>
          vp.propertyId === property.id && currentTime >= vp.startDate && currentTime <= vp.endDate
        );
        return total + (hasTenant && !isInVoid ? property.monthlyIncome : 0);
      }, 0);

      // ── Phase 2 (v5) — Letting Agent fees ──
      // Deduct agent fee only on properties where rent was actually received.
      const lettingAgentFees = newOwnedProperties.reduce((total, property) => {
        if (!property.isManaged || !property.agentFeePct) return total;
        if (conveyancingPropertyIds.has(property.id)) return total;
        if (missedRentPropertyIds.has(property.id)) return total;
        const hasTenant = newTenants.some(t => t.propertyId === property.id);
        const isInVoid = newVoidPeriods.some(vp =>
          vp.propertyId === property.id && currentTime >= vp.startDate && currentTime <= vp.endDate
        );
        if (!hasTenant || isInVoid) return total;
        return total + Math.floor(property.monthlyIncome * property.agentFeePct);
      }, 0);

      // ── Phase 2 (v5) — Rent Guarantee Insurance premiums + payouts ──
      let rentGuaranteePremiums = 0;
      let rentGuaranteePayouts = 0;
      newOwnedProperties.forEach((property) => {
        if (!property.hasRentGuarantee) return;
        const started = property.rentGuaranteeStartMonth ?? newMonthNumber;
        // 3% premium charged from the month the policy was taken out
        if (newMonthNumber >= started) {
          rentGuaranteePremiums += Math.floor(property.monthlyIncome * 0.03);
        }
        // 1-month waiting period before claims pay out
        if (newMonthNumber - started < 1) return;
        if (conveyancingPropertyIds.has(property.id)) return;
        const hasTenant = newTenants.some(t => t.propertyId === property.id);
        const isInVoid = newVoidPeriods.some(vp =>
          vp.propertyId === property.id && currentTime >= vp.startDate && currentTime <= vp.endDate
        );
        // Pay out missed rent (full amount) on arrears
        if (hasTenant && missedRentPropertyIds.has(property.id)) {
          rentGuaranteePayouts += property.monthlyIncome;
          showToast('RGI Payout 🛡️', `${property.name} — missed rent £${fromPennies(property.monthlyIncome).toLocaleString()} covered by insurance.`);
        } else if (!hasTenant || isInVoid) {
          // Void cover at 80% of expected rent
          rentGuaranteePayouts += Math.floor(property.monthlyIncome * 0.8);
        }
      });

      // ── Phase 2 (v5) — HMO licence transitions + fines ──
      let hmoFines = 0;
      newOwnedProperties = newOwnedProperties.map((property) => {
        if (property.subtype !== 'hmo') return property;
        let status = property.hmoLicenceStatus ?? 'none';
        let expiresMonth = property.hmoLicenceExpiresMonth;
        const appliedMonth = property.hmoLicenceAppliedMonth;
        // Transition: applied → licensed after 2 months
        if (status === 'applied' && typeof appliedMonth === 'number' && newMonthNumber - appliedMonth >= 2) {
          status = 'licensed';
          expiresMonth = newMonthNumber + 60; // 5-year licence
          showToast('HMO Licence Issued ✅', `${property.name} — licence granted, valid 60 months.`);
        }
        // Auto-expire
        if (status === 'licensed' && typeof expiresMonth === 'number' && newMonthNumber >= expiresMonth) {
          status = 'expired';
          showToast('HMO Licence Expired ⚠️', `${property.name} — renew to avoid fines.`, 'destructive');
        }
        // 2-month-before-expiry reminder
        if (status === 'licensed' && typeof expiresMonth === 'number' && expiresMonth - newMonthNumber === 2) {
          showToast('HMO Licence Renewal Due', `${property.name} — licence expires in 2 months.`);
        }
        // Fine: 3-month grace, then £500/mo + −2 rep (rep applied via reputationDelta after init)
        if (status === 'none' || status === 'expired') {
          const monthsOwned = newMonthNumber; // approximation — no precise purchase month tracked
          if (status === 'expired' || monthsOwned >= 3) {
            hmoFines += 50_000; // £500
          }
        }
        return { ...property, hmoLicenceStatus: status, hmoLicenceExpiresMonth: expiresMonth };
      });
      if (hmoFines > 0) {
        showToast('HMO Unlicensed Fine ⚠️', `£${fromPennies(hmoFines).toLocaleString()} fine for unlicensed HMO let.`, 'destructive');
      }

      // Expenses
      const mortgagePayments = newMortgages.reduce((s, m) => s + m.monthlyPayment, 0);
      const councilTax = newOwnedProperties.reduce((total, property) => {
        const hasTenant = newTenants.some(t => t.propertyId === property.id);
        const isInVoid = newVoidPeriods.some(vp =>
          vp.propertyId === property.id && currentTime >= vp.startDate && currentTime <= vp.endDate
        );
        // Phase 7 #17 — banded council tax by city/value; 50% discount only inside the void window.
        return total + computeMonthlyCouncilTaxPennies({
          valuePounds: Math.round((property.value || 0) / 100),
          city: property.city,
          isOccupied: hasTenant,
          isInVoidDiscountWindow: !hasTenant && isInVoid,
        });
      }, 0);
      // v3 #2 — landlord insurance is billed ANNUALLY (0.4% of property value)
      // and routed through the pending-approval queue. We still compute the
      // monthly accrual here for cashflow projections; the actual debit
      // happens once per 12 months below.
      // Phase 6 — FRI commercial leases: the "I" stands for Insuring, so the
      // tenant carries buildings insurance. Exclude those from landlord accrual.
      const monthlyInsuranceAccrual = newOwnedProperties.reduce((total, property) => {
        if (property.type === 'commercial' && property.commercialLease?.fri === true) return total;
        return total + Math.floor((property.value * 0.004) / 12);
      }, 0);
      const insurance = monthlyInsuranceAccrual; // kept for accrual/projection only
      // Phase 4 #2 — Leasehold service charge + ground rent (monthly slice of annual cost).
      const leaseholdCosts = newOwnedProperties.reduce((total, property) => {
        if (!property.isLeasehold) return total;
        const sc = property.serviceChargePctAnnual
          ? Math.floor((property.value * property.serviceChargePctAnnual) / 12)
          : 0;
        // Phase 8 #20 — if the player also owns the freehold (groundRentRecipientId
        // matches an owned property), the ground rent is a wash. Skip the cash hit.
        const recipientOwnedHere = property.groundRentRecipientId
          ? newOwnedProperties.some(p => p.id === property.groundRentRecipientId)
          : false;
        const gr = !recipientOwnedHere && property.groundRentPennies
          ? Math.floor(property.groundRentPennies / 12)
          : 0;
        return total + sc + gr;
      }, 0);
      const totalExpenses = mortgagePayments + councilTax + insurance + leaseholdCosts
        + lettingAgentFees + rentGuaranteePremiums + hmoFines;
      const netIncome = monthlyIncome - totalExpenses + rentGuaranteePayouts;

      // Update mortgage balances + capture this month's actual interest portion
      // (used for accurate annual tax calcs — Section 24 / Corp Tax deductibility).
      let monthlyMortgageInterest = 0;
      const fixedTermReversions: Array<{ id: string; oldRate: number; newRate: number }> = [];
      const updatedMortgages = newMortgages.map(mortgage => {
        // Fixed-term reversion — when initial fix expires, mortgage moves to lender SVR.
        let workingMortgage = mortgage;
        if (
          mortgage.fixedTermYears && mortgage.fixedTermYears > 0 &&
          mortgage.startMonth !== undefined && !mortgage.revertedToSVR &&
          newMonthNumber - mortgage.startMonth >= mortgage.fixedTermYears * 12
        ) {
          const provider = MORTGAGE_PROVIDERS.find(p => p.id === mortgage.providerId);
          const providerRate = (prev.mortgageProviderRates[mortgage.providerId] || provider?.baseRate || BASE_MARKET_RATE);
          const svrRate = providerRate + 0.02 + (prev.creditScore < 650 ? 0.01 : 0) + (prev.creditScore < 600 ? 0.015 : 0);
          const monthlyRate = svrRate / 12;
          const remainingMonths = Math.max(12, mortgage.termYears * 12 - (newMonthNumber - mortgage.startMonth));
          const newPayment = mortgage.mortgageType === 'interest-only'
            ? Math.round(mortgage.remainingBalance * monthlyRate)
            : Math.round(mortgage.remainingBalance * (monthlyRate * Math.pow(1 + monthlyRate, remainingMonths)) / (Math.pow(1 + monthlyRate, remainingMonths) - 1));
          fixedTermReversions.push({ id: mortgage.id, oldRate: mortgage.interestRate, newRate: svrRate });
          workingMortgage = { ...mortgage, interestRate: svrRate, monthlyPayment: newPayment, revertedToSVR: true };
        }
        const interest = Math.round(workingMortgage.remainingBalance * (workingMortgage.interestRate / 12));
        monthlyMortgageInterest += interest;
        let newBalance = workingMortgage.remainingBalance;
        if (workingMortgage.mortgageType === 'repayment') {
          const principal = workingMortgage.monthlyPayment - interest;
          newBalance = Math.max(0, workingMortgage.remainingBalance - principal);
        }
        return { ...workingMortgage, remainingBalance: newBalance };
      });
      if (fixedTermReversions.length > 0) {
        fixedTermReversions.forEach(r => {
          showToast(
            "Fixed-rate ended",
            `Mortgage reverted to lender SVR: ${(r.oldRate * 100).toFixed(2)}% → ${(r.newRate * 100).toFixed(2)}%. Consider remortgaging.`,
          );
        });
      }

      // ── Credit score ──
      let creditAdj = 0;
      if (updatedMortgages.length > 0 && prev.cash >= 0) creditAdj += 5;
      else if (newOwnedProperties.length > 0 && prev.cash >= 0) creditAdj += 2;

      // Portfolio LTV degradation
      const totalPropertyValue = newOwnedProperties.reduce((s, p) => s + p.value, 0);
      const totalMortgageBalance = updatedMortgages.reduce((s, m) => s + m.remainingBalance, 0);
      const portfolioLTV = totalPropertyValue > 0 ? totalMortgageBalance / totalPropertyValue : 0;
      if (portfolioLTV > 0.80) creditAdj -= 5;
      else if (portfolioLTV > 0.70) creditAdj -= 2;

      // Cash negative = missed payments simulation
      const newCashBeforeTax = prev.cash + netIncome + sellCash + conveyancingCashReturn;
      if (newCashBeforeTax < 0) creditAdj -= 10;

      const playerDTI = calculateDTI(updatedMortgages, newOwnedProperties, newTenants);
      if (playerDTI > 0.60) creditAdj -= 2;

      const thisMonthDefaults = prev.tenantEvents.filter(e => e.type === 'default' && e.month === prev.monthsPlayed);
      creditAdj -= thisMonthDefaults.length * 10;

      const oldDamages = prev.pendingDamages.filter(d => {
        const monthsOld = (Date.now() - d.timestamp) / (1000 * 60 * 60 * 24 * 30);
        return monthsOld >= 2;
      });
      creditAdj -= oldDamages.length * 5;

      if (newMonthNumber > 0 && newMonthNumber % 6 === 0) {
        const recentDefaults = prev.tenantEvents.filter(e => e.type === 'default' && e.month > prev.monthsPlayed - 6);
        if (recentDefaults.length === 0 && newOwnedProperties.length > 0) creditAdj += 3;
      }

      // ── Reputation buffer (Phase 3 #1b) ──
      // Declared early so payoff/renovation/tenancy positive triggers can push too.
      let reputationDelta = 0;
      const reputationLogEntries: Array<{ id: string; month: number; reason: string; delta: number; category: 'eviction' | 'walkout' | 'tribunal' | 'dispute' | 'maintenance' | 'tenancy' | 'other' }> = [];

      // Check paid-off mortgages (v3 #4 — surface via modal queue, not just a toast)
      const newPayoffEvents: import('@/types/game').PayoffEvent[] = [];
      const paidOff = updatedMortgages.filter(m =>
        (newMortgages.find(old => old.id === m.id)?.remainingBalance ?? 0) > 0 && m.remainingBalance === 0
      );
      paidOff.forEach(m => {
        const prop = newOwnedProperties.find(p => p.id === m.propertyId);
        if (prop) {
          creditAdj += 15;
          newPayoffEvents.push({
            id: `payoff-mortgage-${m.id}-${newMonthNumber}`,
            kind: 'mortgage',
            label: prop.name,
            month: newMonthNumber,
          });
          // Phase 3 #1b — paying off a mortgage demonstrates landlord stability.
          reputationDelta += 3;
          reputationLogEntries.push({
            id: `rep_payoff_${m.id}_${newMonthNumber}`,
            month: newMonthNumber,
            reason: `Paid off mortgage on ${prop.name}`,
            delta: 3,
            category: 'other',
          });
        }
      });

      const finalMortgages = updatedMortgages.filter(m => m.remainingBalance > 0);

      // ── Depreciation ──
      let updatedOwnedProperties = newOwnedProperties.map(p => {
        // Furnishing depreciation — countdown to revert
        let furnishingTier = p.furnishingTier;
        let furnishingMonthsRemaining = p.furnishingMonthsRemaining;
        if (furnishingTier && furnishingTier !== 'unfurnished' && typeof furnishingMonthsRemaining === 'number') {
          furnishingMonthsRemaining = Math.max(0, furnishingMonthsRemaining - 1);
          if (furnishingMonthsRemaining === 0) {
            showToast("Furnishings Worn Out", `${p.name} furnishings have depreciated — reverted to unfurnished.`);
            furnishingTier = 'unfurnished';
            furnishingMonthsRemaining = undefined;
          }
        }
        p = { ...p, furnishingTier, furnishingMonthsRemaining };
        return p;
      }).map(p => {
        const newMonthsSince = (p.monthsSinceLastRenovation || 0) + 1;
        // Phase 6 — under an active FRI commercial lease, maintenance and condition
        // are the tenant's responsibility. Landlord-side decay is suspended.
        const friActive = p.type === 'commercial' && p.commercialLease?.fri === true;
        if (friActive) {
          return { ...p, monthsSinceLastRenovation: newMonthsSince };
        }
        // ── Continuous repair-bar decay ──
        const tenantHere = newTenants.find(t => t.propertyId === p.id);
        const wearKey = tenantHere ? (tenantHere.tenant.profile as 'premium'|'standard'|'budget'|'risky') : 'vacant';
        const wear = TENANT_WEAR_MULTIPLIER[wearKey] ?? 1.0;
        const currentScore = p.conditionScore ?? scoreFromConditionTier(p.condition);
        // Extra drain when there's open, past-grace damage on this property
        const staleDamage = (prev.tenantConcerns || []).some(c =>
          c && !c.resolvedMonth && c.source === 'damage' && c.propertyId === p.id &&
          (newMonthNumber - (c.raisedMonth || 0)) > 2
        );
        const damagePenalty = staleDamage ? 1 : 0;
        const decayed = Math.max(CONDITION_DECAY_FLOOR, currentScore - BASE_CONDITION_DECAY * wear - damagePenalty);
        const newCondition = conditionTierFromScore(decayed);
        const tierChanged = newCondition !== p.condition;

        if (tierChanged) {
          if (p.condition === 'premium' && newCondition === 'standard') {
            showToast("⚠️ Property Degraded", `${p.name} dropped from Premium to Standard.`);
          } else if (newCondition === 'dilapidated' && p.condition !== 'dilapidated') {
            showToast("🏚️ Property Dilapidated!", `${p.name} fell to dilapidated condition.`, "destructive");
          }
          const baseRent = p.baseRent || p.monthlyIncome;
          const newRent = Math.floor(baseRent * getConditionRentMultiplier(newCondition));
          return { ...p, condition: newCondition, conditionScore: decayed, monthsSinceLastRenovation: newMonthsSince, monthlyIncome: newRent };
        }
        return { ...p, conditionScore: decayed, monthsSinceLastRenovation: newMonthsSince };
      });

      // ── Tenant satisfaction & early exit ──
      // For each tenant, adjust satisfaction based on neglect (condition,
      // damages, recent rent hikes). Low satisfaction can trigger an
      // early exit (creating a void period).
      const recentDamageIds = new Set(prev.pendingDamages.map(d => d.propertyId));
      // Phase 4 #21: gate passive recovery when an open concern exists for the property.
      const openConcernPropertyIds = new Set(
        (prev.tenantConcerns || [])
          .filter((c) => !c.resolvedMonth)
          .map((c) => c.propertyId),
      );
      let satisfactionAdjustedTenants = newTenants.map(t => {
        const property = updatedOwnedProperties.find(p => p.id === t.propertyId);
        if (!property) return t;
        const reasons: Array<{ reason: string; delta: number }> = [];
        let delta = 0;

        if (property.condition === 'dilapidated') {
          delta -= 4; reasons.push({ reason: 'Dilapidated condition', delta: -4 });
        } else if (property.condition === 'standard' && t.tenant.profile === 'premium') {
          const hasPlanningCooldown = (prev.propertyLocks || []).some(
            l => l.propertyId === property.id && l.reason === 'planning_cooldown' && newMonthNumber < l.untilMonth,
          );
          const eligible = canUpgradeToPremium({
            condition: property.condition,
            completedRenovationIds: property.completedRenovationIds,
            hasPlanningCooldown,
          });
          if (eligible) {
            delta -= 2;
            reasons.push({ reason: 'Premium tenant wants premium finish — renovate to fix', delta: -2 });
          } else {
            reasons.push({ reason: 'Premium tenant accepts current standard', delta: 0 });
          }
        } else if (property.condition === 'premium') {
          delta += 3; reasons.push({ reason: 'Premium condition', delta: +3 });
        }

        if (recentDamageIds.has(t.propertyId)) {
          delta -= 3; reasons.push({ reason: 'Unrepaired damage', delta: -3 });
        }

        // Recent rent hike (within last 6 months) — milder penalty, skip if tenant moved in after the increase
        const tenantMovedInAfterIncrease = (t.moveInMonth ?? 0) >= (property.lastRentIncrease ?? 0);
        if (property.lastRentIncrease !== undefined && newMonthNumber - (property.lastRentIncrease ?? 0) <= 6 && property.lastRentIncrease !== prev.monthsPlayed && !tenantMovedInAfterIncrease) {
          delta -= 1; reasons.push({ reason: 'Recent rent increase', delta: -1 });
        }

        // Phase 4 #21: passive recovery — gentle +0.5–1 pt/mo when conditions
        // are good and no open concerns exist. Skip if property is below
        // standard or there are unresolved concerns dragging things down.
        const hasNegativePressure = delta < 0;
        const conditionGood = property.condition === 'standard' || property.condition === 'premium';
        const hasOpenConcern = openConcernPropertyIds.has(property.id);
        if (!hasNegativePressure && conditionGood && !hasOpenConcern) {
          // 0.5–1 pt range; round to int after accumulation to keep storage clean
          const recovery = 0.5 + gameRandom() * 0.5;
          const rounded = gameRandom() < (recovery - Math.floor(recovery)) ? Math.ceil(recovery) : Math.floor(recovery);
          const applied = Math.max(0, rounded);
          if (applied > 0) {
            delta += applied;
            reasons.push({ reason: 'Passive recovery — good conditions, no concerns', delta: applied });
          }
        }

        // Cap monthly net drop at -3 (was -4) — gentler decay overall
        if (delta < -3) delta = -3;

        const newSatisfaction = Math.max(0, Math.min(100, t.satisfaction + delta));
        return { ...t, satisfaction: newSatisfaction, lastSatisfactionUpdate: newMonthNumber, satisfactionReasons: reasons };
      });

      // Early-exit:
      //   • satisfaction == 0 → guaranteed walkout
      //   • satisfaction 1-24 → 8% chance walkout
      // Both paths refund deposit (with damage retention if property is poor/dilapidated)
      // and raise a TDS dispute if anything is withheld — same flow as eviction completion.
      const earlyExitVoids: VoidPeriod[] = [];
      const newTenantHistory: import('@/types/game').TenantDeparture[] = [...(prev.tenantHistory || [])];
      let walkoutDepositRefund = 0;
      const walkoutDisputes: DepositDispute[] = [];
      // (reputationDelta/reputationLogEntries declared earlier — see "// ── Reputation buffer ──")
      satisfactionAdjustedTenants = satisfactionAdjustedTenants.filter(t => {
        const guaranteedExit = t.satisfaction <= 0;
        const probabilisticExit = t.satisfaction > 0 && t.satisfaction < 15 && gameRandom() < TENANT_WALKOUT_RISK_PROB;
        if (!guaranteedExit && !probabilisticExit) return true;

        const property = updatedOwnedProperties.find(p => p.id === t.propertyId);
        const voidDuration = (30 + gameRandom() * 60) * 24 * 60 * 60 * 1000;
        earlyExitVoids.push({ propertyId: t.propertyId, startDate: Date.now(), endDate: Date.now() + voidDuration });

        // Deposit deduction mirrors eviction-completion logic (lines ~1035)
        const heldAmount = t.depositHeld || 0;
        const cond = property?.condition;
        const withholdPct = cond === 'dilapidated' ? 0.5 : 0;
        const withheld = Math.floor(heldAmount * withholdPct);
        const refund = heldAmount - withheld;
        walkoutDepositRefund += refund;

        if (withheld > 0) {
          walkoutDisputes.push({
            id: `dispute_${t.propertyId}_${newMonthNumber}_${Math.floor(gameRandom() * 1e6)}`,
            propertyId: t.propertyId,
            propertyName: property?.name || t.propertyId,
            tenantName: t.tenant.name,
            withheldAmount: withheld,
            refundedAmount: refund,
            raisedMonth: newMonthNumber,
            status: 'open',
          });
        }

        const title = guaranteedExit ? "Tenant Walked Out 🚪" : "Tenant Moved Out 😞";
        const reasonLine = guaranteedExit ? "Satisfaction hit zero." : "Low satisfaction.";
        const depositLine = withheld > 0
          ? ` Deposit refunded £${fromPennies(refund).toLocaleString()} (£${fromPennies(withheld).toLocaleString()} withheld — pending TDS).`
          : ` Deposit refunded in full (£${fromPennies(refund).toLocaleString()}).`;
        showToast(title, `${t.tenant.name}${property ? ` left ${property.name}` : ''}. ${reasonLine}${depositLine}`, "destructive");

        newTenantHistory.push({
          id: `dep_${t.propertyId}_${newMonthNumber}_${Math.floor(gameRandom() * 1e6)}`,
          propertyId: t.propertyId,
          propertyName: property?.name || t.propertyId,
          tenantName: t.tenant.name,
          reason: 'low_satisfaction',
          month: newMonthNumber,
          detail: `Satisfaction ${Math.round(t.satisfaction)}/100${withheld > 0 ? ` — £${fromPennies(withheld).toLocaleString()} withheld` : ''}`,
        });
        const d = guaranteedExit ? -4 : -2;
        reputationDelta += d;
        reputationLogEntries.push({
          id: `rep_walk_${t.propertyId}_${newMonthNumber}_${Math.floor(gameRandom()*1e6)}`,
          month: newMonthNumber, reason: `${t.tenant.name} walked out of ${property?.name || 'a property'}`,
          delta: d, category: 'walkout',
        });
        return false;
      });
      newTenants = satisfactionAdjustedTenants;
      newVoidPeriods = [...newVoidPeriods, ...earlyExitVoids];

      // ── Proactive walkout warnings ──
      // Surface a destructive toast (+ chime) when a sitting tenant's satisfaction
      // drops under 25 and we haven't already warned about them recently.
      newTenants = newTenants.map(t => {
        if (t.satisfaction >= 25 || t.satisfaction <= 0) return t;
        const lastWarn = t.lastWalkoutWarningMonth ?? -Infinity;
        if (newMonthNumber - lastWarn < 3) return t;
        const property = updatedOwnedProperties.find(p => p.id === t.propertyId);
        showToast(
          "⚠️ Tenant at risk of leaving",
          `${t.tenant.name}${property ? ` at ${property.name}` : ''} is critically unhappy (satisfaction ${Math.round(t.satisfaction)}). Address concerns or they may walk.`,
          "destructive",
        );
        return { ...t, lastWalkoutWarningMonth: newMonthNumber };
      });

      // ── Tenant concerns: monthly generation + satisfaction decay + auto-resolution ──
      const CONCERN_TEMPLATES: Array<{ category: import('@/types/game').ConcernCategory; descriptions: string[]; baseCostPct: [number, number]; penalty: number }> = [
        { category: 'maintenance', descriptions: ['Boiler not heating properly', 'Leaking tap in kitchen', 'Cracked window seal'], baseCostPct: [0.0008, 0.003], penalty: 3 },
        { category: 'noise', descriptions: ['Noisy neighbours late at night', 'Construction work next door'], baseCostPct: [0.0005, 0.0015], penalty: 2 },
        { category: 'mould', descriptions: ['Mould appearing in bathroom', 'Damp patch on bedroom wall'], baseCostPct: [0.0015, 0.005], penalty: 5 },
        { category: 'appliance', descriptions: ['Washing machine stopped working', 'Oven element broken', 'Fridge not cooling'], baseCostPct: [0.001, 0.0035], penalty: 3 },
        { category: 'safety', descriptions: ['Smoke alarm faulty', 'Loose stair railing', 'Front door lock broken'], baseCostPct: [0.0008, 0.003], penalty: 6 },
      ];

      const newConcerns: import('@/types/game').TenantConcern[] = [];
      // Phase 5 #12 — ASB letters from the local council when risky tenants trigger noise/safety concerns.
      const newPoliceLetters: Array<{ id: string; propertyId: string; propertyName: string; tenantName: string; city?: string; concernCategory: string; description: string; month: number; concernId: string }> = [];
      const existingActiveByProp = new Map<string, number>();
      const prevConcerns = prev.tenantConcerns || [];
      prevConcerns.filter(c => !c.resolvedMonth).forEach(c => {
        existingActiveByProp.set(c.propertyId, (existingActiveByProp.get(c.propertyId) || 0) + 1);
      });

      // Properties currently in conveyancing (selling or buying) shouldn't
      // surface new tenant concerns — the player can't act on them and the
      // feed filters them out, which produced phantom toast notifications.
      const inConveyancingIds = new Set(
        (prev.conveyancing || [])
          .filter((c) => c.status === 'selling' || c.status === 'buying')
          .map((c) => c.propertyId)
      );
      const ownedIdsForConcerns = new Set(updatedOwnedProperties.map(p => p.id));

      newTenants.forEach(t => {
        const property = updatedOwnedProperties.find(p => p.id === t.propertyId);
        if (!property) return;
        if (!ownedIdsForConcerns.has(t.propertyId)) return;
        if (inConveyancingIds.has(t.propertyId)) return;
        if ((existingActiveByProp.get(t.propertyId) || 0) >= 2) return;
        // Phase 6 — FRI commercial leases: tenant handles all maintenance, so the
        // landlord never sees concerns/repair bills from leased commercial units.
        if (property.type === 'commercial' && property.commercialLease?.fri === true) return;

        const conditionScore = property.conditionScore ?? scoreFromConditionTier(property.condition);
        let chance = 0.035;
        if (property.condition === 'dilapidated') chance += 0.04;
        else if (property.condition === 'premium') chance -= 0.015;
        // Repair-bar coupling: low score → significantly more concerns
        if (conditionScore < 30) chance += 0.04;
        else if (conditionScore < 50) chance += 0.02;
        else if (conditionScore >= 80) chance -= 0.015;
        if (t.tenant.profile === 'premium') chance += 0.015;
        else if (t.tenant.profile === 'risky') chance += 0.08;
        // 1-month grace after move-in — settling-in period, no surprise concerns
        if ((t.moveInMonth ?? 0) >= newMonthNumber - 1) return;
        chance = Math.max(0.005, chance);

        if (gameRandom() >= chance) return;

        // When repair bar is low, bias toward maintenance/mould/safety templates
        const riskyAsbBias = t.tenant.profile === 'risky' && gameRandom() < 0.85;
        const pool = riskyAsbBias
          ? CONCERN_TEMPLATES.filter(t => t.category === 'noise' || t.category === 'safety')
          : conditionScore < 50
          ? CONCERN_TEMPLATES.filter(t => t.category === 'maintenance' || t.category === 'mould' || t.category === 'safety')
          : CONCERN_TEMPLATES;
        const tpl = pool[Math.floor(gameRandom() * pool.length)];
        const desc = tpl.descriptions[Math.floor(gameRandom() * tpl.descriptions.length)];
        const [lo, hi] = tpl.baseCostPct;
        const pct = lo + gameRandom() * (hi - lo);
        const cost = Math.max(toPennies(150), Math.min(toPennies(3000), Math.round(property.value * pct)));
        const penaltyMod = t.tenant.profile === 'premium' ? 1 : t.tenant.profile === 'budget' ? 0.7 : 1;
        const concernId = `concern_${newMonthNumber}_${t.propertyId}_${gameRandom().toString(36).slice(2, 7)}`;
        newConcerns.push({
          id: concernId,
          propertyId: t.propertyId,
          tenantProfile: t.tenant.profile,
          category: tpl.category,
          description: desc,
          raisedMonth: newMonthNumber,
          resolveCost: cost,
          satisfactionPenaltyIfIgnored: Math.max(1, Math.round(tpl.penalty * penaltyMod * 0.5)),
        });
        // Phase 5 #12 — risky tenant + noise/safety concern triggers an official council letter (once per concern).
        if (riskyAsbBias && (tpl.category === 'noise' || tpl.category === 'safety')) {
          newPoliceLetters.push({
            id: `letter_${concernId}`,
            concernId,
            propertyId: property.id,
            propertyName: property.name,
            tenantName: t.tenant.name,
            city: property.city,
            concernCategory: tpl.category,
            description: desc,
            month: newMonthNumber,
          });
        }
        existingActiveByProp.set(t.propertyId, (existingActiveByProp.get(t.propertyId) || 0) + 1);
      });

      // ── MEES (Minimum Energy Efficiency Standards) ──
      // Today: F/G properties cannot be let lawfully.
      // From in-game 2030 (month 60+): C is the minimum band for new+existing lets.
      // Phase 3 #15 — also surfaces a one-time 12-month-ahead pop-up warning
      // for D/E properties so the player can plan an EPC upgrade ahead of the
      // 2030 cutover (month 48 onwards).
      const MEES_2030_MONTH = 60;
      const MEES_2030_WARNING_MONTH = MEES_2030_MONTH - 12;
      const meesAlreadyByProp = new Set(
        prevConcerns
          .filter(c => !c.resolvedMonth && c.category === 'safety' && c.description.startsWith('EPC '))
          .map(c => c.propertyId)
      );
      newTenants.forEach(t => {
        const property = updatedOwnedProperties.find(p => p.id === t.propertyId);
        if (!property) return;
        const epc = property.epcRating;
        if (!epc) return;
        const post2030 = newMonthNumber >= MEES_2030_MONTH;
        const illegalNow =
          epc === 'F' || epc === 'G' ||
          (post2030 && (epc === 'D' || epc === 'E'));
        if (!illegalNow) return;
        if (meesAlreadyByProp.has(property.id)) return;
        if (inConveyancingIds.has(property.id)) return;
        const standardLabel = post2030 ? 'MEES 2030 (Band C minimum)' : 'MEES';
        newConcerns.push({
          id: `mees_${newMonthNumber}_${property.id}_${gameRandom().toString(36).slice(2, 6)}`,
          propertyId: property.id,
          tenantProfile: t.tenant.profile,
          category: 'safety',
          description: `EPC ${epc} — illegal to let under ${standardLabel}. Upgrade or face fines.`,
          raisedMonth: newMonthNumber,
          resolveCost: 0,
          satisfactionPenaltyIfIgnored: 12,
        });
        meesAlreadyByProp.add(property.id);
      });

      // Phase 3 #15 — 12-month early warning toast for D/E lets approaching 2030.
      if (newMonthNumber >= MEES_2030_WARNING_MONTH && newMonthNumber < MEES_2030_MONTH) {
        const warnedKey = `mees2030_warned_${newMonthNumber}`;
        newTenants.forEach(t => {
          const property = updatedOwnedProperties.find(p => p.id === t.propertyId);
          if (!property) return;
          const epc = property.epcRating;
          if (epc !== 'D' && epc !== 'E') return;
          if (meesAlreadyByProp.has(property.id)) return;
          // Surface as a concern row so it persists rather than only a toast.
          newConcerns.push({
            id: `mees2030_warn_${newMonthNumber}_${property.id}`,
            propertyId: property.id,
            tenantProfile: t.tenant.profile,
            category: 'safety',
            description: `EPC ${epc} — lettings ban from 2030 (${MEES_2030_MONTH - newMonthNumber}mo). Plan an EPC upgrade.`,
            raisedMonth: newMonthNumber,
            resolveCost: 0,
            satisfactionPenaltyIfIgnored: 0,
          });
          // v4 #16 — also fire a one-time pop-up so the player can't miss it.
          showToast(
            "EPC Lettings Ban Approaching",
            `${property.name} is EPC ${epc}. From 2030 (${MEES_2030_MONTH - newMonthNumber}mo) lets below Band C are illegal. Upgrade now to avoid a void.`,
            "destructive",
          );
          meesAlreadyByProp.add(property.id);
        });
      }

      // Phase 4 #13 — commercial lease renewal warning 6 months before expiry.
      // Fired once per lease via the renewalWarnedMonth marker on the property.
      // Phase 4 (this iteration): also rolls the tenant's renewal interest based on
      // covenantStrength. Interested ⇒ queue a pendingLeaseRenewal HoT. Not
      // interested ⇒ stamp endingAtExpiry so the lease terminates on expiryMonth.
      const existingRenewalsByProp = new Set<string>(
        (prev.pendingLeaseRenewals || []).map((r) => r.propertyId),
      );
      const newlyQueuedRenewals: PendingLeaseRenewal[] = [];
      updatedOwnedProperties = updatedOwnedProperties.map(p => {
        const lease = p.commercialLease;
        if (!lease || p.type !== 'commercial') return p;
        const monthsToExpiry = lease.expiryMonth - newMonthNumber;
        if (monthsToExpiry === 6 && lease.renewalWarnedMonth !== newMonthNumber) {
          const tenantRec = newTenants.find(t => t.propertyId === p.id);
          const covenant = tenantRec?.tenant?.covenantStrength ?? 50;
          // P(interested) = clamp(0.3 + covenant/200, 0.3, 0.85)
          const interestedP = Math.min(0.85, Math.max(0.3, 0.3 + covenant / 200));
          const interested = gameRandom() < interestedP;
          if (interested && !existingRenewalsByProp.has(p.id)) {
            const currentRentPennies = p.baseRent || p.monthlyIncome;
            newlyQueuedRenewals.push({
              id: `renewal_${p.id}_${newMonthNumber}`,
              propertyId: p.id,
              raisedMonth: newMonthNumber,
              expiryMonth: lease.expiryMonth,
              currentRentPennies,
            });
            showToast(
              "Renewal Interest 📄",
              `${p.name} — tenant is keen to extend. Open Heads of Terms to negotiate a new term.`,
            );
            return { ...p, commercialLease: { ...lease, renewalWarnedMonth: newMonthNumber } };
          }
          if (!interested) {
            showToast(
              "Tenant Not Renewing ⚠️",
              `${p.name} — tenant has indicated they will vacate at expiry (month ${lease.expiryMonth}). Dilapidations will be assessed on hand-back.`,
              "destructive",
            );
            return { ...p, commercialLease: { ...lease, renewalWarnedMonth: newMonthNumber, endingAtExpiry: true } };
          }
          return { ...p, commercialLease: { ...lease, renewalWarnedMonth: newMonthNumber } };
        }
        return p;
      });

      // Phase 4 — lease expiry: terminate non-renewing leases, claim dilapidations.
      let dilapidationsRecovered = 0;
      const propertiesToVacate: string[] = [];
      updatedOwnedProperties = updatedOwnedProperties.map(p => {
        const lease = p.commercialLease;
        if (!lease || p.type !== 'commercial') return p;
        const expired = newMonthNumber >= lease.expiryMonth;
        if (!expired) return p;
        // If the player negotiated a renewal already, renewCommercialLease would
        // have replaced the lease and reset expiryMonth — we wouldn't reach here.
        const tenantRec = newTenants.find(t => t.propertyId === p.id);
        const sqft = Math.max(400, p.internalSqft ?? 900);
        const currentScore = typeof p.conditionScore === 'number'
          ? p.conditionScore
          : scoreFromConditionTier(p.condition);
        const deltaPoints = Math.max(0, (lease.conditionScoreAtLeaseStart ?? currentScore) - currentScore);
        const dilapsPennies = deltaPoints > 0
          ? Math.max(0, Math.round(CONDITION_TOPUP_PENNIES_PER_POINT_PER_SQFT * sqft * deltaPoints / 100))
          : 0;
        if (dilapsPennies > 0) {
          dilapidationsRecovered += dilapsPennies;
          const companyName = tenantRec?.tenant?.companyName ?? tenantRec?.tenant?.name ?? 'former tenant';
          showToast(
            "Dilapidations Recovered 💷",
            `£${fromPennies(dilapsPennies).toLocaleString()} recovered from ${companyName} for condition restoration at ${p.name}.`,
          );
        } else {
          showToast(
            "Lease Ended",
            `${p.name} — lease expired; property handed back in original condition. No dilapidations claim.`,
          );
        }
        propertiesToVacate.push(p.id);
        if (tenantRec) {
          newTenantHistory.push({
            id: `dep_${p.id}_${newMonthNumber}_${Math.floor(gameRandom() * 1e6)}`,
            propertyId: p.id,
            propertyName: p.name,
            tenantName: tenantRec.tenant?.companyName ?? tenantRec.tenant?.name ?? 'Commercial tenant',
            reason: 'end_of_tenancy',
            month: newMonthNumber,
            detail: dilapsPennies > 0
              ? `Dilapidations £${fromPennies(dilapsPennies).toLocaleString()}`
              : 'Lease expiry',
          });
        }
        return { ...p, commercialLease: undefined, monthlyIncome: 0 };
      });
      if (propertiesToVacate.length > 0) {
        newTenants = newTenants.filter(t => !propertiesToVacate.includes(t.propertyId));
        propertiesToVacate.forEach(pid => {
          newVoidPeriods.push({ propertyId: pid, startDate: Date.now(), endDate: Date.now() });
        });
      }




      // Only toast for concerns that will actually appear in the feed
      // (owned, unresolved, not in conveyancing).
      const visibleNew = newConcerns.filter(c =>
        ownedIdsForConcerns.has(c.propertyId) && !inConveyancingIds.has(c.propertyId)
      );
      if (visibleNew.length > 0) {
        showToast("New Tenant Concern 🛠️", `${visibleNew.length} new concern${visibleNew.length > 1 ? 's' : ''} raised — check the feed.`);
        playConcernChime();
      }

      // Apply satisfaction decay for old unresolved concerns; auto-resolve when condition is premium
      let updatedConcerns = [...prevConcerns, ...newConcerns];
      const satPenaltyByProp = new Map<string, number>();
      updatedConcerns = updatedConcerns.map(c => {
        if (c.resolvedMonth) return c;
        const property = updatedOwnedProperties.find(p => p.id === c.propertyId);
        // Premium condition only auto-resolves organic tenant concerns —
        // real property damage (boiler, roof, etc.) always requires a paid repair.
        if (
          property &&
          property.condition === 'premium' &&
          c.source !== 'damage' &&
          (c.category === 'maintenance' || c.category === 'mould')
        ) {
          return { ...c, resolvedMonth: newMonthNumber };
        }
        // Grace period before satisfaction starts decaying:
        // urgent (safety/noise) and damage-sourced → 2 months; everything else → 3 months
        const grace = (c.category === 'safety' || c.category === 'noise' || c.source === 'damage') ? 2 : 3;
        const monthsOpen = newMonthNumber - c.raisedMonth;
        if (monthsOpen > grace) {
          satPenaltyByProp.set(c.propertyId, (satPenaltyByProp.get(c.propertyId) || 0) + c.satisfactionPenaltyIfIgnored);
        }
        return c;
      });
      if (satPenaltyByProp.size > 0) {
        newTenants = newTenants.map(t => {
          const pen = satPenaltyByProp.get(t.propertyId);
          if (!pen) return t;
          // Cap concern penalty at -2 per tenant per month (was uncapped)
          const cappedPen = Math.min(pen, 2);
          return { ...t, satisfaction: Math.max(0, t.satisfaction - cappedPen) };
        });
      }
      // Trim long-resolved
      updatedConcerns = updatedConcerns.filter(c => !c.resolvedMonth || (newMonthNumber - c.resolvedMonth) <= 6);

      // ── Pending evictions: tick down notice periods, end tenancies, refund deposits, add locks ──
      let activePendingEvictions: PendingEviction[] = [];
      let newPropertyLocks: PropertyLock[] = [...prev.propertyLocks];
      let evictionDepositRefund = walkoutDepositRefund;
      let newDepositDisputes: DepositDispute[] = [...(prev.depositDisputes || []), ...walkoutDisputes];
      prev.pendingEvictions.forEach(rawEv => {
        let ev = rawEv;
        // ── Tenant-filed appeal resolves this month? ──
        if (ev.appealFiled && !ev.appealResolved && ev.appealResolveMonth !== undefined && newMonthNumber >= ev.appealResolveMonth) {
          const upheld = gameRandom() < EVICTION_UPHELD_PROB;
          if (upheld) {
            showToast(
              "Tribunal Ruling: Upheld",
              `${ev.tenantName} appealed your notice on ${ev.propertyId} — the tribunal upheld it. Notice stands.`,
            );
            ev = { ...ev, appealResolved: true };
          } else {
            // Overturned — drop the eviction, restore tenant satisfaction, add cooldown for misused grounds
            const cooldownGrounds: EvictionGround[] = ['landlord_sale', 'landlord_move_in'];
            if (cooldownGrounds.includes(ev.ground)) {
              newPropertyLocks.push({ propertyId: ev.propertyId, reason: 'appeal_cooldown', untilMonth: newMonthNumber + 6, slotIndex: ev.slotIndex });
            }
            newTenants = newTenants.map(t =>
              t.propertyId === ev.propertyId
                ? { ...t, satisfaction: Math.min(100, (t.satisfaction || 0) + 15), evictionNoticeMonth: undefined, evictionGround: undefined }
                : t,
            );
            showToast(
              "Tribunal Ruling: Overturned",
              `${ev.tenantName} won their appeal. Notice removed; tenant stays.${cooldownGrounds.includes(ev.ground) ? ' 6-month cooldown applied to landlord-grounds.' : ''}`,
            );
            return; // drop this eviction entirely
          }
        }

        if (newMonthNumber < ev.effectiveMonth) {
          activePendingEvictions.push(ev);
          return;
        }
        // Notice expired — tenant vacates
        const tenantRec = newTenants.find(t => t.propertyId === ev.propertyId);
        const property = updatedOwnedProperties.find(p => p.id === ev.propertyId);
        if (!tenantRec) return;

        // Refund deposit (50% withheld if property is dilapidated — damage retention)
        const heldAmount = tenantRec.depositHeld || 0;
        const refund = property?.condition === 'dilapidated'
          ? Math.floor(heldAmount * 0.5)
          : heldAmount;
        const withheld = heldAmount - refund;
        evictionDepositRefund += refund;

        // If we withheld anything, raise an open dispute the player can respond to
        if (withheld > 0) {
          newDepositDisputes.push({
            id: `dispute_${ev.propertyId}_${newMonthNumber}_${Math.floor(gameRandom() * 1e6)}`,
            propertyId: ev.propertyId,
            propertyName: property?.name || ev.propertyId,
            tenantName: tenantRec.tenant.name,
            withheldAmount: withheld,
            refundedAmount: refund,
            raisedMonth: newMonthNumber,
            status: 'open',
          });
        }

        // Remove tenant + start a void period
        newTenants = newTenants.filter(t => t.propertyId !== ev.propertyId);
        const voidDuration = (30 + gameRandom() * 60) * 24 * 60 * 60 * 1000;
        newVoidPeriods.push({ propertyId: ev.propertyId, startDate: Date.now(), endDate: Date.now() + voidDuration });
        newTenantHistory.push({
          id: `dep_${ev.propertyId}_${newMonthNumber}_${Math.floor(gameRandom() * 1e6)}`,
          propertyId: ev.propertyId,
          propertyName: property?.name || ev.propertyId,
          tenantName: tenantRec.tenant.name,
          reason: 'eviction_completed',
          month: newMonthNumber,
          detail: ev.ground.replace(/_/g, ' '),
        });
        {
          const d = ev.ground === 'antisocial_behaviour' ? 1 : -3;
          reputationDelta += d;
          reputationLogEntries.push({
            id: `rep_evict_${ev.propertyId}_${newMonthNumber}_${Math.floor(gameRandom()*1e6)}`,
            month: newMonthNumber,
            reason: ev.ground === 'antisocial_behaviour'
              ? `Removed anti-social tenant from ${property?.name || 'a property'}`
              : `Evicted ${tenantRec.tenant.name} (${ev.ground.replace(/_/g,' ')})`,
            delta: d, category: 'eviction',
          });
        }

        // Anti-abuse locks (12 months) — scoped to the evicted slot only.
        if (ev.ground === 'landlord_sale') {
          // Sale lock applies property-wide (must list/sell whole property).
          newPropertyLocks.push({ propertyId: ev.propertyId, reason: 'sale_lock', untilMonth: newMonthNumber + 12 });
        } else if (ev.ground === 'landlord_move_in') {
          newPropertyLocks.push({ propertyId: ev.propertyId, reason: 'relet_lock', untilMonth: newMonthNumber + 12, slotIndex: ev.slotIndex });
        }

        showToast(
          "Eviction Complete",
          `${tenantRec.tenant.name} vacated ${property?.name || 'the property'}. Deposit refunded: £${fromPennies(refund).toLocaleString()}${withheld > 0 ? ` (£${fromPennies(withheld).toLocaleString()} withheld — tenant may dispute)` : ''}.`,
        );
        playPaper();
      });
      // Drop expired locks
      newPropertyLocks = newPropertyLocks.filter(l => newMonthNumber < l.untilMonth);

      // ── Resolve pending planning applications whose decision month has arrived ──
      let newPlanningApplications = [...(prev.planningApplications || [])];
      const newlyApprovedPlanningIds: string[] = [];
      const newlyRefusedPlanningIds: string[] = [];
      newPlanningApplications = newPlanningApplications.map(app => {
        if (app.status === 'pending' && newMonthNumber >= app.decisionMonth) {
          const propName = prev.ownedProperties.find(p => p.id === app.propertyId)?.name || 'property';
          if (app.approved) {
            // Phase 6 #15 — bake the sqft uplift into the property at approval so the
            // displayed footprint doesn't dip back down while works are underway.
            const sqftAdded = app.sqftAdded as number | undefined;
            let sqftAppliedAtPlanning = app.sqftAppliedAtPlanning === true;
            if (sqftAdded && sqftAdded > 0 && !sqftAppliedAtPlanning) {
              const idx = updatedOwnedProperties.findIndex(p => p.id === app.propertyId);
              if (idx >= 0) {
                const base = updatedOwnedProperties[idx].internalSqft || 0;
                updatedOwnedProperties[idx] = {
                  ...updatedOwnedProperties[idx],
                  internalSqft: base + sqftAdded,
                };
                sqftAppliedAtPlanning = true;
              }
            }
            const resolved = { ...app, status: 'approved' as const, sqftAppliedAtPlanning };
            newlyApprovedPlanningIds.push(app.id);
            playLevelUp();
            showToast(
              "Planning Approved! ✅",
              `${app.renovationName} on ${propName} cleared the LPA. Start work from the renovation menu.`,
            );
            flashOps();
            return resolved;
          } else {
            const resolved = { ...app, status: 'refused' as const };
            newlyRefusedPlanningIds.push(app.id);
            showToast(
              "Planning Refused ❌",
              `${app.renovationName} on ${propName} refused: ${app.refusalReason || 'planning grounds'}. 6-month cooldown before resubmission.`,
              "destructive",
            );
            flashOps();
            // Add 6-month cooldown lock scoped to the specific refused renovation
            // so unrelated renovations on this property remain submittable.
            newPropertyLocks.push({
              propertyId: app.propertyId,
              reason: 'planning_cooldown',
              untilMonth: newMonthNumber + 6,
              renovationTypeId: app.renovationTypeId,
            });
            return resolved;
          }
        }
        return app;
      });
      // Drop refused applications only after the player has acknowledged them
      // via the refusal dialog (id removed from pendingPlanningRefusals).
      const refusalQueue = new Set<string>([
        ...(prev.pendingPlanningRefusals || []),
        ...newlyRefusedPlanningIds,
      ]);
      newPlanningApplications = newPlanningApplications.filter(app => {
        if (app.status === 'refused' && !refusalQueue.has(app.id)) return false;
        return true;
      });

      // Auto-expire deposit disputes 6 months after raised (only the closed ones — keep open ones forever until acted on)
      newDepositDisputes = newDepositDisputes.filter(d => {
        if (d.status === 'open') return true;
        const ageSinceResolved = newMonthNumber - (d.resolvedMonth ?? d.raisedMonth);
        return ageSinceResolved <= 1;
      });


      // Bankruptcy/arrears computation is deferred until after forced-sale
      // execution below (so a successful forced auction can clear the debt).

      // Level check
      const propertyEquity = updatedOwnedProperties.reduce((total, p) => {
        const m = finalMortgages.find(mt => mt.propertyId === p.id);
        return total + p.value - (m?.remainingBalance || 0);
      }, 0);
      // Active renovations are capital already spent — include as WIP asset
      const renovationWIP = prev.renovations.reduce((sum, r) => sum + toPennies(r.type?.cost || 0), 0);
      // Furniture as depreciating asset (matches useGameState calc).
      const furnitureWorth = updatedOwnedProperties.reduce((sum, p) => sum + getFurnitureValuePennies(p as any), 0);
      // Subtract drawn overdraft AND outstanding unsecured loan balances so
      // leveling-up cannot be triggered by borrowed money (item #20).
      const loanDebtForLevel = ((prev.loans || []) as Array<{ remainingBalance?: number }>)
        .reduce((s, l) => s + (l.remainingBalance || 0), 0);
      const netWorth = newCashBeforeTax + propertyEquity + renovationWIP + furnitureWorth
        - prev.overdraftUsed - loanDebtForLevel;
      let newLevel = prev.level;
      while (newLevel < 10 && netWorth >= getRequiredNetWorth(newLevel + 1)) newLevel++;
      if (newLevel > prev.level) {
        showToast("Level Up!", `Congratulations! You reached level ${newLevel}!`);
        playLevelUp();
      }

      // ── Monthly property value drift (~3%/yr nominal w/ small frequent dips) ──
      // Tempered to realistic UK long-run growth. A 2.5× purchase-price soft cap
      // prevents runaway compounding on long-held assets — once value hits 2.5× the
      // original purchase price, only `marketValue` drifts (the "asking" signal),
      // while booked `value` (used for net worth) is held at the cap.
      updatedOwnedProperties = updatedOwnedProperties.map(property => {
        // Phase 5 — commercial properties with an active FRI lease are valued on
        // an income-cap basis (annual rent ÷ implied yield). Stronger covenant
        // and longer remaining term compress the yield → higher value.
        const lease = property.commercialLease;
        if (property.type === 'commercial' && lease) {
          const tenantRec = newTenants.find(t => t.propertyId === property.id);
          const cov = tenantRec?.tenant?.covenantStrength ?? 50;
          const remainingMonths = Math.max(0, (lease.expiryMonth ?? 0) - newMonthNumber);
          const rawYield = 0.10 - (cov / 1000) - (remainingMonths / 6000);
          const impliedYield = Math.min(0.12, Math.max(0.05, rawYield));
          const annualRent = (property.monthlyIncome || 0) * 12;
          const capValue = impliedYield > 0 ? Math.round(annualRent / impliedYield) : property.value;
          // Light noise so net worth isn't perfectly static between events.
          const noisy = Math.round(capValue * (1 + (gameRandom() - 0.5) * 0.004));
          return { ...property, value: noisy, marketValue: noisy };
        }
        // Condition-aware mean drift: premium appreciates faster, dilapidated decays
        const meanByCondition =
          property.condition === 'premium'     ? 0.0030 :
          property.condition === 'dilapidated' ? -0.0005 :
                                                 0.0020; // standard
        const monthlyDrift = meanByCondition + (gameRandom() - 0.5) * 0.003; // ±0.15%
        const isDip = gameRandom() < MARKET_DIP_PROB;
        const change = isDip ? -(0.004 + gameRandom() * 0.012) : monthlyDrift;
        const purchaseBasis = property.price || property.value;
        const valueCap = Math.round(purchaseBasis * 2.5);
        const drifted = Math.round(property.value * (1 + change));
        const driftedMarket = Math.round((property.marketValue || property.value) * (1 + change));
        const newValue = change > 0 ? Math.min(drifted, valueCap) : drifted;
        return {
          ...property,
          value: newValue,
          marketValue: driftedMarket,
        };
      });

      // Annual rent uplift — only vacant properties get auto-increase.
      // Sitting tenants keep their agreed rent (use Section 13 to raise).
      let newLastYearlyGrowth = prev.lastYearlyGrowth;
      if (newMonthNumber > 0 && newMonthNumber % 12 === 0 && newMonthNumber !== prev.lastYearlyGrowth) {
        const rentIncreaseRate = 0.03;
        let vacantCount = 0;
        updatedOwnedProperties = updatedOwnedProperties.map(property => {
          const hasTenant = newTenants.some(t => t.propertyId === property.id);
          if (hasTenant) return property; // sitting tenant — rent locked
          vacantCount++;
          const newBaseRent = Math.floor((property.baseRent || property.monthlyIncome) * (1 + rentIncreaseRate));
          return {
            ...property,
            monthlyIncome: Math.floor(property.monthlyIncome * (1 + rentIncreaseRate)),
            baseRent: newBaseRent,
            lastRentIncrease: newMonthNumber,
          };
        });
        newLastYearlyGrowth = newMonthNumber;
        if (vacantCount > 0) {
          showToast("Market Rent Uplift", `Market rents rose 3% on ${vacantCount} vacant propert${vacantCount === 1 ? 'y' : 'ies'}.`);
        }
      }

      // ── Commercial rent reviews ──
      // On each lease's contractual review anniversary (`lease.reviewFrequencyMonths`),
      // queue a `pendingRentReview` so the player can negotiate the new rent via
      // Heads of Terms (review mode). NO auto-uplift is applied any more.
      const existingPendingByProp = new Map<string, any>();
      for (const r of (prev.pendingRentReviews || [])) {
        existingPendingByProp.set(r.propertyId, r);
      }
      const newlyQueuedReviews: PendingRentReview[] = [];
      newTenants.forEach(t => {
        const property = updatedOwnedProperties.find(p => p.id === t.propertyId);
        if (!property || property.type !== 'commercial') return;
        const lease = property.commercialLease;
        const freq = (lease && typeof lease.reviewFrequencyMonths === 'number' && lease.reviewFrequencyMonths > 0)
          ? lease.reviewFrequencyMonths
          : 36;
        const baseline = t.lastRentReviewMonth ?? t.moveInMonth ?? lease?.startMonth ?? 0;
        if (newMonthNumber - baseline < freq) return;
        if (existingPendingByProp.has(property.id)) return;
        // Suggested market uplift: 3% compounded over the review period.
        const upliftFactor = Math.pow(1.03, freq / 12);
        const currentRentPennies = property.baseRent || property.monthlyIncome;
        const proposedMarketRentPennies = Math.round(currentRentPennies * upliftFactor);
        newlyQueuedReviews.push({
          id: `rentreview_${property.id}_${newMonthNumber}`,
          propertyId: property.id,
          dueMonth: newMonthNumber,
          currentRentPennies,
          proposedMarketRentPennies,
        });
      });
      if (newlyQueuedReviews.length > 0) {
        showToast(
          "Rent review due",
          `${newlyQueuedReviews.length} commercial lease${newlyQueuedReviews.length === 1 ? '' : 's'} reached a contractual rent review — open Heads of Terms to negotiate.`,
        );
      }


      // v4 #3 — per-tenant arrears bookkeeping. Missed tenants accumulate
      // months + £ owed and the player receives NO rent that month. When the
      // tenant resumes paying, the FULL outstanding arrears balance is paid
      // back in a single lump sum on top of normal rent (catch-up payment).
      let arrearsRepaidThisMonth = 0;
      newTenants = newTenants.map(t => {
        const key = `${t.propertyId}::${t.slotIndex ?? 0}`;
        const prop = prev.ownedProperties.find(p => p.id === t.propertyId);
        const rentPennies = t.rentPennies || (prop?.monthlyIncome ?? 0);
        if (missedTenantKeys.has(key)) {
          const lastToast = t.lastDefaultToastMonth ?? -999;
          const stamped = newMonthNumber - lastToast >= 3 ? newMonthNumber : (t.lastDefaultToastMonth ?? 0);
          return {
            ...t,
            arrearsMonths: (t.arrearsMonths ?? 0) + 1,
            arrearsPennies: (t.arrearsPennies ?? 0) + rentPennies,
            lastDefaultToastMonth: stamped,
          };
        }
        // Paying this month — repay the FULL outstanding balance as a lump sum.
        const owed = t.arrearsPennies ?? 0;
        if (!conveyancingPropertyIds.has(t.propertyId) && owed > 0) {
          arrearsRepaidThisMonth += owed;
          return {
            ...t,
            arrearsPennies: 0,
            arrearsMonths: 0,
          };
        }
        return t;
      });

      const newProviderRates = fluctuateProviderRates(prev.mortgageProviderRates);

      // ── Taxation (UK tax year ends 5 April → use month 3 in 0-indexed) ──
      // Accumulate THIS month's gross rent, mortgage interest, and deductible
      // expenses into the running yearly totals. Tax is then calculated against
      // the actual annual figures (not pre-deducted "net" income, which used to
      // cause a double-deduction bug that under-taxed both entity types).
      const accumulatedProfit = prev.yearlyNetProfit + netIncome;
      const accumulatedGrossRent = (prev.yearlyGrossRent || 0) + monthlyIncome;
      const accumulatedMortgageInterest = (prev.yearlyMortgageInterest || 0) + monthlyMortgageInterest;
      const accumulatedDeductibleExpenses = (prev.yearlyDeductibleExpenses || 0) + councilTax + insurance;

      const currentMonth = newMonthNumber % 12;
      const isApril = currentMonth === 3;
      const lastTaxYear = Math.floor(prev.lastCorporationTaxMonth / 12);
      const currentTaxYear = Math.floor(newMonthNumber / 12);
      let taxPaid = 0;
      let finalYearlyProfit = accumulatedProfit;
      let finalYearlyGrossRent = accumulatedGrossRent;
      let finalYearlyMortgageInterest = accumulatedMortgageInterest;
      let finalYearlyDeductibleExpenses = accumulatedDeductibleExpenses;
      let lastCorpTaxMonth = prev.lastCorporationTaxMonth;
      let newTaxRecords = [...prev.taxRecords, ...cgtRecordsThisRun];
      let newTotalTaxPaid = prev.totalTaxPaid;
      let newUnusedLosses = prev.unusedLosses ?? 0;
      let newLossesApplied = prev.lossesAppliedThisYear ?? 0;
      let newLossesGenerated = prev.lossesGeneratedThisYear ?? 0;
      // Phase 4 (v5 statements) — populated when an annual tax year closes below.
      let newAnnualAccountRecord: import('@/types/game').AnnualAccountRecord | null = null;
      let netProfitBeforeTaxForRecord = 0;

      // Phase F fix: fire the rollover on EVERY 12-month boundary crossed,
      // not just on April. The previous `isApril` gate meant year records
      // only landed when the game-month happened to be April AND the tax
      // year had advanced — which in practice only ever produced "Year 1".
      void isApril;
      if (currentTaxYear > lastTaxYear) {

        if (prev.entityType === 'sole_trader') {
          // Sole trader: rental income MINUS deductible expenses (NOT mortgage
          // interest — Section 24 turns interest into a 20% tax credit only).
          // Item 5: offset taxable rental profit with brought-forward losses.
          const grossTaxable = Math.max(0, accumulatedGrossRent - accumulatedDeductibleExpenses);
          const offsetUsed = Math.min(newUnusedLosses, grossTaxable);
          const adjustedRentalIncome = accumulatedGrossRent - offsetUsed;
          const { effectiveTax, section24Credit, tax } = calculateIncomeTax(
            adjustedRentalIncome,
            accumulatedMortgageInterest,
            accumulatedDeductibleExpenses,
          );
          taxPaid = effectiveTax;
          newUnusedLosses -= offsetUsed;
          newLossesApplied = offsetUsed;
          // If gross profit was negative (rare for sole traders), accumulate as new loss.
          const grossLoss = Math.max(0, accumulatedDeductibleExpenses - accumulatedGrossRent);
          newLossesGenerated = grossLoss;
          if (grossLoss > 0) { newUnusedLosses += grossLoss; }
          const lossNote = offsetUsed > 0
            ? ` (loss b/f £${fromPennies(offsetUsed).toLocaleString()} used)`
            : grossLoss > 0
              ? ` (loss £${fromPennies(grossLoss).toLocaleString()} carried forward)`
              : '';
          newTaxRecords.push({ month: newMonthNumber, type: 'income_tax', amount: taxPaid, description: `Year ${currentTaxYear} income tax — £${fromPennies(taxPaid).toLocaleString()} (gross £${fromPennies(tax).toLocaleString()} − §24 credit £${fromPennies(section24Credit).toLocaleString()})${lossNote}` });
        } else {
          // LTD: mortgage interest IS deductible. Item 5: pre-tax profit can
          // be negative → carry losses forward; positive → offset losses first.
          const preTaxProfit = accumulatedGrossRent - accumulatedMortgageInterest - accumulatedDeductibleExpenses;
          let offsetUsed = 0;
          if (preTaxProfit > 0) {
            offsetUsed = Math.min(newUnusedLosses, preTaxProfit);
            newUnusedLosses -= offsetUsed;
            newLossesApplied = offsetUsed;
            newLossesGenerated = 0;
            taxPaid = calculateCorporationTax(
              accumulatedGrossRent - offsetUsed,
              accumulatedMortgageInterest,
              accumulatedDeductibleExpenses,
            );
          } else if (preTaxProfit < 0) {
            newUnusedLosses += -preTaxProfit;
            newLossesGenerated = -preTaxProfit;
            newLossesApplied = 0;
            taxPaid = 0;
          }
          const taxableAfter = Math.max(0, preTaxProfit - offsetUsed);
          const lossNote = offsetUsed > 0
            ? ` (loss b/f £${fromPennies(offsetUsed).toLocaleString()} used)`
            : preTaxProfit < 0
              ? ` (loss £${fromPennies(-preTaxProfit).toLocaleString()} carried forward)`
              : '';
          newTaxRecords.push({ month: newMonthNumber, type: 'corporation_tax', amount: taxPaid, description: `Year ${currentTaxYear} corporation tax — £${fromPennies(taxPaid).toLocaleString()} on profit £${fromPennies(taxableAfter).toLocaleString()}${lossNote}` });
        }

        newTotalTaxPaid += taxPaid;
        // Phase 4 (v5 statements) — capture P&L portion of the just-closed
        // tax year. Balance-sheet figures (cash, property value, debt) are
        // filled in at the set() call below using the final post-month state.
        netProfitBeforeTaxForRecord =
          accumulatedGrossRent - accumulatedMortgageInterest - accumulatedDeductibleExpenses;
        newAnnualAccountRecord = {
          year: currentTaxYear,
          startMonth: prev.lastCorporationTaxMonth,
          endMonth: newMonthNumber,
          entityType: prev.entityType,
          grossRent: accumulatedGrossRent,
          mortgageInterest: accumulatedMortgageInterest,
          allowableExpenses: accumulatedDeductibleExpenses,
          netProfitBeforeTax: netProfitBeforeTaxForRecord,
          taxPaid,
          cgtPaid: cgtThisYearAcc,
          // Filled in at set() time with final balance-sheet values.
          cashAtYearEnd: 0,
          propertyValueAtYearEnd: 0,
          mortgageDebtAtYearEnd: 0,
          loanDebtAtYearEnd: 0,
          netWorthAtYearEnd: 0,
        };
        // Reset all yearly accumulators
        finalYearlyProfit = 0;
        finalYearlyGrossRent = 0;
        finalYearlyMortgageInterest = 0;
        finalYearlyDeductibleExpenses = 0;
        lastCorpTaxMonth = newMonthNumber;
        cgtThisYearAcc = 0;
      }


      // Cashflow: net inflows against outflows in a single operation so the
      // overdraft is only tapped when the month's RENT can't cover the
      // month's BILLS — not just because bills happen to settle first
      // (item #16: was previously debiting outflows from prev.cash before
      // crediting rent, which caused phantom overdraft taps).
      //
      // Item #10: insurance, council tax and tax bills are no longer silently
      // debited — they go into `pendingTransactions` and the game auto-pauses
      // until the player approves them via the dialog. Mortgage payments stay
      // automatic (contractual direct debit).
      const newPendingTransactions: import('@/types/game').PendingTransaction[] = [];

      // v3 #2 — Annual landlord insurance. Bill once every 12 months and warn one month ahead.
      const nextInsuranceDueMonth = prev.nextInsuranceDueMonth ?? 12;
      const lastInsuranceWarnedMonth = prev.lastInsuranceWarnedMonth ?? -1;
      let updatedNextInsuranceDueMonth = nextInsuranceDueMonth;
      let updatedLastInsuranceWarnedMonth = lastInsuranceWarnedMonth;
      const annualInsurancePennies = newOwnedProperties.reduce(
        (t, p) => {
          if (p.type === 'commercial' && p.commercialLease?.fri === true) return t;
          return t + Math.floor(p.value * 0.004);
        },
        0,
      );
      if (annualInsurancePennies > 0) {
        // 1-month-ahead warning toast
        if (
          newMonthNumber === nextInsuranceDueMonth - 1 &&
          lastInsuranceWarnedMonth !== newMonthNumber
        ) {
          showToast(
            "Insurance Due Next Month",
            `Annual landlord insurance of £${fromPennies(annualInsurancePennies).toLocaleString()} will be billed next month.`,
          );
          updatedLastInsuranceWarnedMonth = newMonthNumber;
        }
        if (newMonthNumber >= nextInsuranceDueMonth) {
          newPendingTransactions.push({
            id: `ptx-ins-${newMonthNumber}`,
            type: 'insurance',
            amount: annualInsurancePennies,
            description: `Annual landlord insurance — month ${newMonthNumber} (${newOwnedProperties.length} ${newOwnedProperties.length === 1 ? 'property' : 'properties'})`,
            month: newMonthNumber,
          });
          updatedNextInsuranceDueMonth = newMonthNumber + 12;
        }
      }
      if (councilTax > 0) {
        newPendingTransactions.push({
          id: `ptx-ct-${newMonthNumber}`,
          type: 'council_tax',
          amount: councilTax,
          description: `Council tax on empty properties — month ${newMonthNumber}`,
          month: newMonthNumber,
        });
      }
      if (taxPaid > 0) {
        newPendingTransactions.push({
          id: `ptx-tax-${newMonthNumber}`,
          type: prev.entityType === 'ltd' ? 'corporation_tax' : 'income_tax',
          amount: taxPaid,
          description: prev.entityType === 'ltd'
            ? `Corporation tax — tax year ${currentTaxYear}`
            : `Self-assessment income tax — tax year ${currentTaxYear}`,
          month: newMonthNumber,
        });
      }

      // Phase 2 (v5): include letting-agent fees, RGI premiums, HMO fines as outflows; RGI payouts as inflows.
      const totalOutflows = mortgagePayments + lettingAgentFees + rentGuaranteePremiums + hmoFines;
      const totalInflows = monthlyIncome + sellCash + conveyancingCashReturn + evictionDepositRefund + arrearsRepaidThisMonth + rentGuaranteePayouts + dilapidationsRecovered;
      const netCashDelta = totalInflows - totalOutflows;
      let finalCash = prev.cash;
      let finalOverdraftUsed = prev.overdraftUsed;
      if (netCashDelta >= 0) {
        finalCash = prev.cash + netCashDelta;
      } else {
        const shortfall = -netCashDelta;
        if (prev.cash >= shortfall) {
          finalCash = prev.cash - shortfall;
        } else {
          const fromCash = prev.cash;
          const fromOverdraft = shortfall - fromCash;
          const overdraftAvail = Math.max(0, prev.overdraftLimit - prev.overdraftUsed);
          const taken = Math.min(fromOverdraft, overdraftAvail);
          finalCash = Math.max(0, fromCash - shortfall + taken);
          finalOverdraftUsed = prev.overdraftUsed + taken;
        }
      }


      // No auto-sweep — overdraft is only repaid when the player explicitly
      // does so via the Credit & Banking panel (item 9a).

      // Macro-economic events
      let nextEventMonth = prev.nextEconomicEventMonth;
      let economicEvents = [...prev.economicEvents];
      let eventRateAdjust = 0;

      if (newMonthNumber >= nextEventMonth && updatedOwnedProperties.length > 0) {
        // 30% chance the timer fires but nothing newsworthy happens — quiet stretches
        const skipRoll = gameRandom();
        if (skipRoll < 0.30) {
          nextEventMonth = newMonthNumber + 8 + Math.floor(gameRandom() * 9); // 8–16mo
        } else {
          const eventTypes: Array<{ type: MacroEconomicEvent['type']; name: string; description: string; weight: number }> = [
            // Big shocks — rarer
            { type: 'rate_cut',         name: '📉 Base Rates Cut',           description: 'The Bank of England has cut base rates by 0.5%.',                            weight: 1 },
            { type: 'tech_boom',        name: '🚀 Tech Boom in the City',    description: 'Property values rise 4% and rents nudge up 2%.',                              weight: 1 },
            { type: 'recession',        name: '📉 Economic Recession',       description: 'Base rates rise 1%, values drop 5%, rents soften 2%.',                       weight: 1 },
            // Small/neutral — more common
            { type: 'mild_correction',  name: '〰️ Mild Market Correction',   description: 'Property values dip 2%; rents unchanged.',                                   weight: 2 },
            { type: 'rate_hike',        name: '📈 Rate Hike',                 description: 'Base rates rise 0.5% — borrowing gets pricier.',                              weight: 2 },
            { type: 'rate_cut_small',   name: '📉 Modest Rate Cut',           description: 'Base rates trim by 0.5%.',                                                    weight: 2 },
          ];
          // Weighted pick
          const totalWeight = eventTypes.reduce((s, e) => s + e.weight, 0);
          let r = gameRandom() * totalWeight;
          const chosen = eventTypes.find(e => (r -= e.weight) <= 0) || eventTypes[0];
          const event: MacroEconomicEvent = {
            id: `event_${newMonthNumber}`, name: chosen.name,
            description: chosen.description, month: newMonthNumber, type: chosen.type,
          };
          economicEvents = [...economicEvents.slice(-9), event];

          // Single-tick swing clamp helper — never move a value more than ±6% per event
          const clampSwing = (oldV: number, newV: number) => {
            const minV = Math.floor(oldV * 0.94);
            const maxV = Math.floor(oldV * 1.06);
            return Math.max(minV, Math.min(maxV, newV));
          };

          if (chosen.type === 'rate_cut') {
            eventRateAdjust = -0.005;
          } else if (chosen.type === 'rate_cut_small') {
            eventRateAdjust = -0.005;
          } else if (chosen.type === 'rate_hike') {
            eventRateAdjust = 0.005;
          } else if (chosen.type === 'tech_boom') {
            updatedOwnedProperties = updatedOwnedProperties.map(p => {
              const purchaseBasis = p.price || p.value;
              const valueCap = Math.round(purchaseBasis * 2.5);
              const raw = Math.floor(p.value * 1.04);
              const newValue = Math.min(clampSwing(p.value, raw), valueCap);
              const hasTenant = newTenants.some(t => t.propertyId === p.id);
              return {
                ...p, value: newValue,
                marketValue: Math.floor((p.marketValue || p.value) * 1.04),
                // Only raise rent on vacant properties — sitting tenants keep agreed rent
                ...(hasTenant ? {} : {
                  monthlyIncome: Math.floor(p.monthlyIncome * 1.02),
                  baseRent: Math.floor((p.baseRent || p.monthlyIncome) * 1.02),
                }),
              };
            });
          } else if (chosen.type === 'recession') {
            eventRateAdjust = 0.01;
            updatedOwnedProperties = updatedOwnedProperties.map(p => {
              const hasTenant = newTenants.some(t => t.propertyId === p.id);
              return {
                ...p, value: clampSwing(p.value, Math.floor(p.value * 0.95)),
                marketValue: Math.floor((p.marketValue || p.value) * 0.95),
                // Only adjust rent on vacant properties — sitting tenants keep agreed rent
                ...(hasTenant ? {} : {
                  monthlyIncome: Math.floor(p.monthlyIncome * 0.98),
                  baseRent: Math.floor((p.baseRent || p.monthlyIncome) * 0.98),
                }),
              };
            });
          } else if (chosen.type === 'mild_correction') {
            updatedOwnedProperties = updatedOwnedProperties.map(p => ({
              ...p, value: clampSwing(p.value, Math.floor(p.value * 0.98)),
              marketValue: Math.floor((p.marketValue || p.value) * 0.98),
            }));
          }

          showToast(chosen.name, chosen.description);
          nextEventMonth = newMonthNumber + 8 + Math.floor(gameRandom() * 9); // 8–16mo
        }
      }

      let finalProviderRates = newProviderRates;
      if (eventRateAdjust !== 0) {
        finalProviderRates = { ...newProviderRates };
        Object.keys(finalProviderRates).forEach(key => {
          finalProviderRates[key] = Math.max(0.01, finalProviderRates[key] + eventRateAdjust);
        });
      }

      // ── Loans amortisation (personal/business/investor) ──
      const allPrevLoans: import('@/types/game').Loan[] = (prev.loans || []);
      const prevLoans = allPrevLoans.filter((l) => l.kind !== 'bridging');
      const prevBridges = allPrevLoans.filter((l) => l.kind === 'bridging');
      const updatedLoans: import('@/types/game').Loan[] = [];
      // Phase 7 #18 — track loans repaid this month for the loyalty discount.
      const loanPayoffsThisMonth: Array<{ id: string; kind: 'personal'|'business'|'investor'|'bridging'; repaidOnSchedule: boolean; month: number }> = [];
      prevLoans.forEach(l => {
        const monthlyInterest = Math.round(l.remainingBalance * (l.interestRate / 12));
        const principalPaid = Math.max(0, l.monthlyPayment - monthlyInterest);
        const newBal = Math.max(0, l.remainingBalance - principalPaid);
        // Try to debit the loan payment from cash/overdraft first.
        const debited = debit({ cash: finalCash, overdraftUsed: finalOverdraftUsed, overdraftLimit: prev.overdraftLimit }, l.monthlyPayment);
        if (debited) {
          finalCash = debited.cash;
          finalOverdraftUsed = debited.overdraftUsed;
          const newStreak = (l.onTimeStreak ?? 0) + 1;
          // 12-month on-time streak → +5 credit
          if (newStreak > 0 && newStreak % 12 === 0) creditAdj += 5;
          if (newBal <= 0) {
            const repaidOnSchedule = l.lastMissedMonth === undefined;
            loanPayoffsThisMonth.push({ id: l.id, kind: l.kind, repaidOnSchedule, month: newMonthNumber });
            newPayoffEvents.push({
              id: `payoff-loan-${l.id}-${newMonthNumber}`,
              kind: 'loan',
              label: l.kind,
              month: newMonthNumber,
              amountPennies: l.monthlyPayment,
            });
            return;
          }
          updatedLoans.push({ ...l, remainingBalance: newBal, onTimeStreak: newStreak });
        } else {
          // Missed payment — credit penalty + arrears flag, +2% penalty rate.
          creditAdj -= 15;
          const penalisedRate = Math.min(0.30, l.interestRate + 0.02);
          const repenalisedPayment = (() => {
            const remaining = Math.max(1, l.termMonths - Math.max(0, prev.monthsPlayed - l.startMonth));
            const r = penalisedRate / 12;
            return Math.round((l.remainingBalance * r) / (1 - Math.pow(1 + r, -remaining)));
          })();
          showToast("Loan Payment Missed", `${l.kind} loan in arrears — credit −15, rate now ${(penalisedRate * 100).toFixed(2)}%.`, "destructive");
          updatedLoans.push({
            ...l,
            interestRate: penalisedRate,
            monthlyPayment: Math.max(l.monthlyPayment, repenalisedPayment),
            onTimeStreak: 0,
            lastMissedMonth: prev.monthsPlayed,
          });
        }
      });

      // ── Bridging loans (interest-only, balloon at term) ──
      prevBridges.forEach(l => {
        const monthlyInterest = Math.max(1, Math.round(l.remainingBalance * (l.interestRate / 12)));
        const debited = debit({ cash: finalCash, overdraftUsed: finalOverdraftUsed, overdraftLimit: prev.overdraftLimit }, monthlyInterest);
        if (debited) { finalCash = debited.cash; finalOverdraftUsed = debited.overdraftUsed; }
        else { creditAdj -= 10; }

        const expiryMonth = l.startMonth + l.termMonths;
        const isExpired = newMonthNumber >= expiryMonth && l.remainingBalance > 0;
        if (isExpired && !l.expiryPenaltyApplied) {
          creditAdj -= 80;
          const penalisedRate = Math.min(0.30, l.interestRate + 0.06);
          showToast(
            "⚠ Bridging Loan Expired",
            `Bridge against ${l.propertyId ?? 'property'} unredeemed at expiry — credit −80, rate now ${(penalisedRate * 100).toFixed(2)}% APR. Remortgage onto a standard product ASAP.`,
            "destructive",
          );
          updatedLoans.push({
            ...l,
            interestRate: penalisedRate,
            monthlyPayment: monthlyInterest,
            expiryPenaltyApplied: true,
            lastMissedMonth: prev.monthsPlayed,
          });
        } else {
          updatedLoans.push({ ...l, monthlyPayment: monthlyInterest });
        }
      });


      // ── Annual EICR (electrical safety) check on residential properties ──
      // v4 #8a — emit ONE PendingTransaction per property so the player can
      // see exactly which property each EICR is for.
      let eicrCharged = 0;
      const eicrUpdatedProps = updatedOwnedProperties.map(p => {
        if (p.type !== 'residential') return p;
        const last = p.lastEicrMonth ?? 0;
        if (newMonthNumber - last < 12) return p;
        eicrCharged += EICR_COST_PENNIES;
        newPendingTransactions.push({
          id: `ptx-eicr-${p.id}-${newMonthNumber}`,
          type: 'eicr',
          amount: EICR_COST_PENNIES,
          description: `${p.name} — annual electrical safety certificate (EICR).`,
          month: newMonthNumber,
        });
        return { ...p, lastEicrMonth: newMonthNumber };
      });
      if (eicrCharged > 0) {
        finalYearlyDeductibleExpenses += eicrCharged;
      }
      updatedOwnedProperties = eicrUpdatedProps;

      // ── Arrears / Court / Bailiff escalation ──────────────────────────
      // Three-stage: warning → court order + scheduled forced sale → bankruptcy.
      let newArrears: import('@/types/game').ArrearsState | null = prev.arrears ?? null;
      const overdraftHeadroom = Math.max(0, prev.overdraftLimit - finalOverdraftUsed);
      const projectedNet = monthlyIncome - totalExpenses;
      // Distress only when (a) cash is gone AND overdraft is exhausted, OR
      // (b) the next month's projected shortfall can't be covered by cash +
      // overdraft headroom. Holding cash while using overdraft is NOT distress.
      const exhausted = finalCash <= 0 && overdraftHeadroom <= 0;
      const projectedShortfall = projectedNet < 0 && (finalCash + overdraftHeadroom) < Math.abs(projectedNet);
      const inDistress = exhausted || projectedShortfall;

      // 1. Execute any previously-scheduled forced sale
      if (newArrears?.forcedAuctionPropertyId && newArrears.scheduledSaleMonth && newMonthNumber >= newArrears.scheduledSaleMonth) {
        const pid = newArrears.forcedAuctionPropertyId;
        const propIdx = updatedOwnedProperties.findIndex(p => p.id === pid);
        if (propIdx >= 0) {
          const prop = updatedOwnedProperties[propIdx];
          const salePrice = Math.floor((prop.marketValue || prop.value) * 0.90);
          const mortgageIdx = finalMortgages.findIndex(m => m.propertyId === pid);
          const owed = mortgageIdx >= 0 ? finalMortgages[mortgageIdx].remainingBalance : 0;
          const netProceeds = Math.max(0, salePrice - owed);
          finalCash += netProceeds;
          updatedOwnedProperties.splice(propIdx, 1);
          if (mortgageIdx >= 0) finalMortgages.splice(mortgageIdx, 1);
          showToast("⚖️ Bailiffs Sold Property", `${prop.name} was forcibly auctioned at 90% of value. Net proceeds £${(netProceeds/100).toLocaleString()} applied to arrears.`, "destructive");
        }
        newArrears = { ...newArrears, forcedAuctionPropertyId: undefined, scheduledSaleMonth: undefined };
      }

      // Recompute net worth AFTER forced sale
      const propertyEquityFinal = updatedOwnedProperties.reduce((t, p) => {
        const m = finalMortgages.find(mt => mt.propertyId === p.id);
        return t + p.value - (m?.remainingBalance || 0);
      }, 0);
      const furnitureWorthFinal = updatedOwnedProperties.reduce((s, p) => s + getFurnitureValuePennies(p as any), 0);
      // Subtract outstanding unsecured loan balances so the bankruptcy gate
      // reflects ALL debt the player owes (item #20).
      const loanDebtFinal = updatedLoans.reduce((s, l) => s + (l.remainingBalance || 0), 0);
      const netWorthFinal = finalCash - finalOverdraftUsed + propertyEquityFinal + renovationWIP + furnitureWorthFinal - loanDebtFinal;

      let isBankrupt = false;
      // Phase 7 #16 — overdraft prompt: fires once at the start of a fresh distress
      // episode when the player has no overdraft and is eligible (creditScore > 580).
      let newOverdraftPrompt: { eligibleLimit: number; month: number } | null = prev.pendingOverdraftPrompt ?? null;
      let newOverdraftPromptedMonth: number = prev.overdraftPromptedMonth ?? -999;
      if (inDistress) {
        const months = (newArrears?.monthsBehind ?? 0) + 1;
        if (!newArrears) {
          // Stage 0 — try the overdraft prompt before the warning toast.
          const noOverdraft = (prev.overdraftLimit || 0) === 0;
          const eligible = prev.creditScore > 580;
          const monthsSinceLastPrompt = newMonthNumber - newOverdraftPromptedMonth;
          if (noOverdraft && eligible && monthsSinceLastPrompt >= 12 && !newOverdraftPrompt) {
            // Eligible limit scales with credit score (between £2.5k and £15k).
            const tier = prev.creditScore >= 750 ? 15000 : prev.creditScore >= 680 ? 10000 : prev.creditScore >= 620 ? 5000 : 2500;
            newOverdraftPrompt = { eligibleLimit: tier * 100, month: newMonthNumber };
            newOverdraftPromptedMonth = newMonthNumber;
          }
          newArrears = { startMonth: newMonthNumber, monthsBehind: 1 };
          showToast("⚠️ Cashflow Warning", "Your expenses exceed income and your cash buffer is gone. Sell, refinance, or raise rent — or the bailiffs will be called next month.", "destructive");
        } else if (months >= 2 && !newArrears.forcedAuctionPropertyId && !newArrears.courtOrderMonth) {
          // Court order: pick highest-equity property to force-auction next month
          const target = [...updatedOwnedProperties].sort((a, b) => {
            const ma = finalMortgages.find(m => m.propertyId === a.id)?.remainingBalance || 0;
            const mb = finalMortgages.find(m => m.propertyId === b.id)?.remainingBalance || 0;
            return (b.value - mb) - (a.value - ma);
          })[0];
          if (target) {
            newArrears = { ...newArrears, monthsBehind: months, courtOrderMonth: newMonthNumber, forcedAuctionPropertyId: target.id, scheduledSaleMonth: newMonthNumber + 1 };
            showToast("⚖️ Court Order Issued", `Persistent arrears — ${target.name} will be forcibly auctioned next month at 90% of value.`, "destructive");
          } else {
            // No property to seize → straight to bankruptcy
            isBankrupt = true;
          }
        } else {
          newArrears = { ...newArrears, monthsBehind: months };
        }
      } else {
        // Recovered — clear arrears + reset distress-episode prompt gate
        if (newArrears) {
          showToast("✅ Arrears Cleared", "Cashflow back in the black — court action paused.");
          newOverdraftPromptedMonth = -999;
        }
        newArrears = null;
      }

      // Final bankruptcy gate: post-forced-sale net worth still negative
      if (!isBankrupt && netWorthFinal < 0 && updatedOwnedProperties.length === 0 && exhausted) {
        isBankrupt = true;
      }
      // Phase 7 #16 — snapshot at the moment of bankruptcy for the end-game modal.
      let newBankruptcySummary = prev.bankruptcySummary ?? null;
      if (isBankrupt && !prev.isBankrupt) {
        const totalDebt = loanDebtFinal
          + finalMortgages.reduce((s, m) => s + (m.remainingBalance || 0), 0)
          + finalOverdraftUsed;
        newBankruptcySummary = {
          month: newMonthNumber,
          totalDebt,
          propertiesLostCount: (prev.ownedProperties?.length || 0) - updatedOwnedProperties.length,
          remainingCash: finalCash - finalOverdraftUsed,
        };
        showToast("💀 BANKRUPTCY!", "Court ordered insolvency — game over.", "destructive");
      }

      // ── Tax projection warning — fire one month before April collection ──
      let newProjectedTaxPennies = prev.projectedTaxPennies ?? 0;
      let newProjectedTaxStampedMonth = prev.projectedTaxStampedMonth ?? 0;
      const monthIdx = newMonthNumber % 12;
      if (monthIdx === 2 && currentTaxYear > lastTaxYear && finalYearlyGrossRent > 0) {
        const projected = projectAnnualTax(
          prev.entityType,
          finalYearlyGrossRent,
          finalYearlyMortgageInterest,
          finalYearlyDeductibleExpenses,
          newUnusedLosses,
        );
        if (projected > 0 && newProjectedTaxStampedMonth !== newMonthNumber) {
          newProjectedTaxPennies = projected;
          newProjectedTaxStampedMonth = newMonthNumber;
          const headroom = Math.max(0, prev.overdraftLimit - finalOverdraftUsed);
          const shortfall = Math.max(0, projected - (finalCash + headroom));
          const taxLabel = prev.entityType === 'sole_trader' ? 'Self-assessment tax' : 'Corporation tax';
          showToast(
            shortfall > 0 ? "⚠️ Tax due next month" : "🧾 Tax due next month",
            shortfall > 0
              ? `${taxLabel} ~£${fromPennies(projected).toLocaleString()}. Shortfall £${fromPennies(shortfall).toLocaleString()} — raise funds via Bank tab.`
              : `${taxLabel} ~£${fromPennies(projected).toLocaleString()} will be collected next month.`,
            shortfall > 0 ? "destructive" : undefined,
          );
        }
      } else if (monthIdx === 4) {
        // Tax was collected this April — clear the projection stamp.
        newProjectedTaxPennies = 0;
      }

      // ── Debt-recovery case resolution ──
      const prevCases = (prev.debtRecoveryCases || []) as import('@/types/game').DebtRecoveryCase[];
      const resolvedCases: import('@/types/game').DebtRecoveryCase[] = [];
      const updatedCases = prevCases.map(c => {
        if (c.status !== 'in_court' || newMonthNumber < c.resolveMonth) return c;
        const predetermined = ((c as DebtRecoveryCase & { _predeterminedStatus?: 'recovered' | 'partial' | 'unrecoverable' })._predeterminedStatus || 'recovered');
        let recoveredGross = 0;
        if (predetermined === 'recovered') recoveredGross = c.originalArrearsPennies;
        else if (predetermined === 'partial') recoveredGross = Math.floor(c.originalArrearsPennies * (0.3 + gameRandom() * 0.4));
        const net = Math.floor(recoveredGross * (1 - c.recoveryFeePct));
        if (net > 0) {
          const credited = credit({ cash: finalCash, overdraftUsed: finalOverdraftUsed }, net);
          finalCash = credited.cash;
          finalOverdraftUsed = credited.overdraftUsed;
        }
        const updated: import('@/types/game').DebtRecoveryCase = { ...c, status: predetermined, netRecoveredPennies: net };
        resolvedCases.push(updated);
        if (predetermined === 'unrecoverable') {
          showToast("⚖️ Debt unrecoverable", `Tenant ${c.tenantName} is judgment-proof — £${fromPennies(c.originalArrearsPennies).toLocaleString()} written off.`, "destructive");
        } else {
          showToast(
            predetermined === 'recovered' ? "⚖️ Debt recovered" : "⚖️ Partial recovery",
            `Recovered £${fromPennies(net).toLocaleString()} from ${c.tenantName} (after 25% agency fee).`,
            'success',
          );
        }
        return updated;
      });
      // Phase 4 #19: resolve High Court Enforcement escalations.
      const casesWithHce = updatedCases.map(c => {
        if (!c.escalatedToHighCourtMonth || c.hceResolved) return c;
        if (newMonthNumber < (c.hceResolveMonth ?? Infinity)) return c;
        const recovered = c.hceExpectedRecoveryPennies ?? 0;
        if (recovered > 0) {
          const credited = credit({ cash: finalCash, overdraftUsed: finalOverdraftUsed }, recovered);
          finalCash = credited.cash;
          finalOverdraftUsed = credited.overdraftUsed;
          showToast("⚖️ HCE Recovered", `High Court Enforcement recovered £${fromPennies(recovered).toLocaleString()} from ${c.tenantName}.`, 'success');
        } else {
          showToast("⚖️ HCE Unsuccessful", `HCE could not recover the residual debt from ${c.tenantName}.`, "destructive");
        }
        return {
          ...c,
          hceResolved: true,
          netRecoveredPennies: (c.netRecoveredPennies ?? 0) + recovered,
          status: recovered > 0 ? 'recovered' : c.status,
        } as import('@/types/game').DebtRecoveryCase;
      });
      // Keep last 30 resolved cases; preserve all active (in_court or pending HCE).
      const trimmedCases = [
        ...casesWithHce.filter(c => c.status === 'in_court' || (c.escalatedToHighCourtMonth && !c.hceResolved)),
        ...casesWithHce.filter(c => c.status !== 'in_court' && !(c.escalatedToHighCourtMonth && !c.hceResolved)).slice(-30),
      ];




      // Phase 3 #1b — Long-tenancy bonus: every 12 months a sitting tenant has
      // remained with satisfaction ≥ 70, the landlord earns +1 reputation.
      newTenants.forEach(t => {
        if (typeof t.moveInMonth !== 'number') return;
        const tenure = newMonthNumber - t.moveInMonth;
        if (tenure <= 0 || tenure % 12 !== 0) return;
        if ((t.satisfaction ?? 70) < 70) return;
        reputationDelta += 1;
        reputationLogEntries.push({
          id: `rep_longtenancy_${t.propertyId}_${t.slotIndex}_${newMonthNumber}`,
          month: newMonthNumber,
          reason: `${t.tenant.name} reached ${tenure / 12} year${tenure === 12 ? '' : 's'} as a happy tenant`,
          delta: 1,
          category: 'tenancy',
        });
      });

      set(s => ({
        cash: finalCash,
        overdraftUsed: finalOverdraftUsed,
        ownedProperties: updatedOwnedProperties,
        mortgages: finalMortgages,
        level: newLevel,
        monthsPlayed: newMonthNumber,
        timeUntilNextMonth: MONTH_DURATION_SECONDS,
        isBankrupt,
        arrears: newArrears,
        creditScore: Math.max(300, Math.min(850, prev.creditScore + creditAdj)),
        lastYearlyGrowth: newLastYearlyGrowth,
        mortgageProviderRates: finalProviderRates,
        yearlyNetProfit: finalYearlyProfit,
        yearlyGrossRent: finalYearlyGrossRent,
        yearlyMortgageInterest: finalYearlyMortgageInterest,
        yearlyDeductibleExpenses: finalYearlyDeductibleExpenses,
        lastCorporationTaxMonth: lastCorpTaxMonth,
        nextEconomicEventMonth: nextEventMonth,
        economicEvents,
        conveyancing: activeConveyancing,
        chainCollapseEvents: newChainCollapseEvents.length > 0
          ? [...(s.chainCollapseEvents || []), ...newChainCollapseEvents]
          : s.chainCollapseEvents,
        estateAgentProperties: newEstateAgent,
        auctionProperties: newAuction,
        tenants: newTenants,
        voidPeriods: newVoidPeriods,
        propertyListings: newPropertyListings,
        taxRecords: newTaxRecords.slice(-50), // Keep last 50 records
        totalTaxPaid: newTotalTaxPaid,
        unusedLosses: newUnusedLosses,
        lossesAppliedThisYear: newLossesApplied,
        lossesGeneratedThisYear: newLossesGenerated,
        // Merge with current store state — preserves any concerns added
        // by an interleaved processMarketUpdate (e.g. damage events).
        tenantConcerns: mergeConcernsById(s.tenantConcerns, updatedConcerns),
        pendingEvictions: activePendingEvictions,
        propertyLocks: newPropertyLocks,
        depositDisputes: newDepositDisputes,
        planningApplications: newPlanningApplications,
        pendingPlanningCelebrations: [
          ...(s.pendingPlanningCelebrations || []),
          ...newlyApprovedPlanningIds,
        ],
        pendingPlanningRefusals: [
          ...(s.pendingPlanningRefusals || []),
          ...newlyRefusedPlanningIds,
        ],
        tenantHistory: newTenantHistory.slice(-100),
        loans: updatedLoans,
        landlordReputation: Math.max(0, Math.min(100, (prev.landlordReputation ?? 50) + reputationDelta)),
        reputationLog: [...(prev.reputationLog || []), ...reputationLogEntries].slice(-40),
        opsFlashAt: opsFlashAtNew,
        debtRecoveryCases: trimmedCases,
        // Phase 5 #14 — persist this month's defaults so eviction checks (recentDefaults < 2) actually pass.
        tenantEvents: [...prev.tenantEvents, ...newDefaultEvents].slice(-24),
        // Phase 5 #12 — append new ASB police letters for the in-game dialog.
        pendingPoliceLetters: newPoliceLetters.length > 0
          ? [...((s.pendingPoliceLetters) || []), ...newPoliceLetters]
          : (s.pendingPoliceLetters || []),
        // Phase 5 #13 — surface case resolutions as a pop-up.
        pendingCourtResolutions: resolvedCases.length > 0
          ? [...((s.pendingCourtResolutions) || []), ...resolvedCases.map(c => c.id)]
          : (s.pendingCourtResolutions || []),
        // Phase 7 #16 — overdraft prompt + bankruptcy snapshot
        pendingOverdraftPrompt: newOverdraftPrompt,
        overdraftPromptedMonth: newOverdraftPromptedMonth,
        bankruptcySummary: newBankruptcySummary,
        // Phase 7 #18 — track repaid loans for investor loyalty discount.
        loanPayoffHistory: [
          ...((s.loanPayoffHistory) || []),
          ...loanPayoffsThisMonth,
        ].slice(-50),
        projectedTaxPennies: newProjectedTaxPennies,
        projectedTaxStampedMonth: newProjectedTaxStampedMonth,
        pendingTransactions: [
          ...(s.pendingTransactions || []),
          ...newPendingTransactions,
        ],
        nextInsuranceDueMonth: updatedNextInsuranceDueMonth,
        lastInsuranceWarnedMonth: updatedLastInsuranceWarnedMonth,
        payoffEvents: newPayoffEvents.length > 0
          ? [...((s.payoffEvents) || []), ...newPayoffEvents]
          : (s.payoffEvents || []),
        // Item #10 + Phase 3 #5 + v3 #4 + Phase 4 #20: pending debits,
        // chain-collapse events, payoff acknowledgements, planning decisions,
        // and macro-economic event pop-ups all auto-pause the clock until
        // the player dismisses them.
        isPaused:
          ((s.pendingTransactions?.length || 0) + newPendingTransactions.length > 0)
          || newChainCollapseEvents.length > 0
          || newPayoffEvents.length > 0
          || ((s.payoffEvents?.length) || 0) > 0
          || newlyApprovedPlanningIds.length > 0
          || newlyRefusedPlanningIds.length > 0
          || ((s.pendingPlanningCelebrations?.length) || 0) > 0
          || ((s.pendingPlanningRefusals?.length) || 0) > 0
          || economicEvents.length !== prev.economicEvents.length
          || (economicEvents.length > 0 && economicEvents[economicEvents.length - 1]?.month === newMonthNumber)
            ? true
            : s.isPaused,
        // Phase 3 #4 — stamp goal achievement once net worth crosses the target.
        goalAchievedAt: (() => {
          const existing = s.goalAchievedAt;
          if (typeof existing === 'number' && existing > 0) return existing;
          const target = (s.goalTarget ?? 0) as number;
          if (target > 0 && netWorthFinal >= target) {
            showToast("🏆 Goal Reached!", `You hit £${fromPennies(target).toLocaleString()} net worth. Set a new target or keep building.`);
            return newMonthNumber;
          }
          return existing;
        })(),
        // Phase 2 (v5) — append performance snapshot (cap last 60).
        monthlySnapshots: [
          ...((s.monthlySnapshots) || []),
          {
            month: newMonthNumber,
            netWorth: netWorthFinal,
            cashflow: totalInflows - totalOutflows,
            rentalIncome: monthlyIncome,
            mortgagePayments,
            propertyCount: updatedOwnedProperties.length,
          },
        ].slice(-60),
        // Phase 4 (v5) — evaluate achievements against the new state snapshot.
        achievements: (() => {
          const prevUnlocked = s.achievements || {};
          const existingGoal = s.goalAchievedAt;
          const goalTarget = (s.goalTarget ?? 0) as number;
          const goalAchievedAtSnapshot =
            (typeof existingGoal === 'number' && existingGoal > 0)
              ? existingGoal
              : (goalTarget > 0 && netWorthFinal >= goalTarget ? newMonthNumber : undefined);
          const { unlocked, newlyUnlockedIds } = evaluateAchievements(
            prevUnlocked,
            {
              ownedProperties: updatedOwnedProperties,
              tenantHistory: newTenantHistory,
              planningApplications: newPlanningApplications,
              goalAchievedAt: goalAchievedAtSnapshot,
              landlordReputation: Math.max(0, Math.min(100, (prev.landlordReputation ?? 50) + reputationDelta)),
              reputationLog: [...(prev.reputationLog || []), ...reputationLogEntries],
            },
            newMonthNumber,
            netWorthFinal,
          );
          for (const id of newlyUnlockedIds) {
            const def = ACHIEVEMENTS.find(a => a.id === id);
            if (def) showToast(`🏅 ${def.title}`, def.description);
          }
          return unlocked;
        })(),
        // Phase 4 (v5 statements) — append the just-closed annual account.
        annualAccounts: (() => {
          const existing = (s.annualAccounts as import('@/types/game').AnnualAccountRecord[] | undefined) || [];
          if (!newAnnualAccountRecord) return existing;
          const propertyValueAtYearEnd = updatedOwnedProperties.reduce((sum, p) => sum + (p.value || 0), 0);
          const mortgageDebtAtYearEnd = finalMortgages.reduce((sum, m) => sum + (m.remainingBalance || 0), 0);
          const loanDebtAtYearEnd = updatedLoans.reduce((sum, l) => sum + (l.remainingBalance || 0), 0);
          return [
            ...existing,
            {
              ...newAnnualAccountRecord,
              cashAtYearEnd: finalCash,
              propertyValueAtYearEnd,
              mortgageDebtAtYearEnd,
              loanDebtAtYearEnd,
              netWorthAtYearEnd: netWorthFinal,
            },
          ];
        })(),
        cgtThisYearPennies: cgtThisYearAcc,
        pendingRentReviews: newlyQueuedReviews.length > 0
          ? [...((s.pendingRentReviews) || []), ...newlyQueuedReviews]
          : (s.pendingRentReviews || []),
        pendingLeaseRenewals: newlyQueuedRenewals.length > 0
          ? [...((s.pendingLeaseRenewals) || []), ...newlyQueuedRenewals]
          : (s.pendingLeaseRenewals || []),



      }));
    },
  };
}
