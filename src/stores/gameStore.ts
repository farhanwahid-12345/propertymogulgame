import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  GameState, Property, Mortgage, PropertyTenant, VoidPeriod,
  PropertyListing, PropertyOffer, Renovation,
  PropertyDamage, MacroEconomicEvent, Conveyancing, TaxRecord,
  EntityType, PropertyCondition,
} from '@/types/game';
import type { Tenant } from '@/components/ui/tenant-selector';
import type { RenovationType } from '@/components/ui/renovation-dialog';
import { toPennies, fromPennies } from '@/lib/formatCurrency';
import { createDebouncedStorage } from '@/lib/debouncedSave';
import {
  INITIAL_CASH, EXPERIENCE_BASE, BASE_MARKET_RATE, COUNCIL_TAX_BAND_D,
  CORPORATION_TAX_RATE, SOLICITOR_FEES, ESTATE_AGENT_RATE, AUCTION_SELLER_FEE,
  MORTGAGE_PROVIDERS, AVAILABLE_PROPERTIES, MONTH_DURATION_SECONDS,
} from '@/lib/engine/constants';
import {
  calculateStampDuty, calculateDTI, fluctuateProviderRates, getInitialProviderRates,
  getPropertyValueRangeForLevel, getMaxPropertiesForLevel, getAvailablePropertyTypes,
  getMaxPropertyValue, getRequiredNetWorth,
} from '@/lib/engine/financials';
import { generateRandomProperty } from '@/lib/engine/market';
import {
  calculateMortgageEligibility, getMaxLTVForCreditScore, calculateMonthlyPayment as calcPayment,
} from '@/lib/mortgageEligibility';
import {
  calculateIncomeTax, calculateCorporationTax, calculateCGT,
  getConditionRentMultiplier, getDepreciationMonths, getConditionUpgradeCost,
} from '@/lib/engine/taxation';
import { calcTenantRent } from '@/lib/tenantRent';

// ─── Helpers ──────────────────────────────────────────────
function showToast(title: string, description: string, variant?: 'destructive') {
  import('@/hooks/use-toast').then(({ toast }) => {
    toast({ title, description, variant });
  });
}

// ─── Actions interface ───────────────────────────────────
interface GameActions {
  // Timer
  clockTick: () => void;
  processMonthEnd: () => void;
  processMarketUpdate: () => void;
  processCounterResponses: () => void;
  // Entity
  setEntityType: (type: EntityType) => void;
  // Property buying
  buyProperty: (property: Property, mortgagePercentage?: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only') => void;
  buyPropertyAtPrice: (property: Property, purchasePrice: number, mortgagePercentage?: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only') => void;
  // Property selling
  sellProperty: (property: Property, isAuction?: boolean) => void;
  handleEstateAgentSale: (propertyId: string, offer: any) => void;
  handleAuctionSale: (propertyId: string, salePrice: number) => void;
  // Listings
  listPropertyForSale: (propertyId: string, askingPrice: number) => void;
  cancelPropertyListing: (propertyId: string) => void;
  updatePropertyListingPrice: (propertyId: string, newPrice: number) => void;
  setAutoAcceptThreshold: (propertyId: string, threshold: number | undefined) => void;
  addOfferToListing: (propertyId: string, offer: PropertyOffer) => void;
  rejectPropertyOffer: (propertyId: string, offerId: string) => void;
  counterOffer: (propertyId: string, offerId: string, counterAmount: number) => void;
  reducePriceOnListing: (propertyId: string, reductionPercent?: number) => void;
  acceptBuyerCounter: (propertyId: string, offerId: string) => void;
  rejectBuyerCounter: (propertyId: string, offerId: string, newCounterAmount: number) => void;
  // Tenants
  selectTenant: (propertyId: string, tenant: Tenant) => void;
  removeTenant: (propertyId: string) => void;
  // Renovations
  startRenovation: (propertyId: string, renovationType: RenovationType) => void;
  upgradeCondition: (propertyId: string, targetCondition: PropertyCondition) => void;
  // Mortgages
  settleMortgage: (mortgagePropertyId: string, useCash?: boolean, settlementPropertyId?: string, partialAmount?: number) => void;
  remortgageProperty: (propertyId: string, newLoanAmount: number, providerId: string) => void;
  handleRefinance: (propertyId: string, newLoanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only') => void;
  handlePortfolioMortgage: (selectedPropertyIds: string[], loanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only') => void;
  // Overdraft / Cash
  handleApplyOverdraft: (requestedLimit: number) => void;
  setCash: (newCash: number) => void;
  setOverdraftUsed: (used: number) => void;
  // Damage
  payDamageWithCash: (damageId: string, actualCost?: number) => void;
  payDamageWithLoan: (damageId: string, actualCost?: number) => void;
  dismissDamage: (damageId: string) => void;
  // Market management
  removeAuctionProperty: (propertyId: string) => void;
  replenishMarket: () => void;
  // Tenant concerns
  resolveTenantConcern: (concernId: string) => void;
  dismissTenantConcern: (concernId: string) => void;
  // Game
  resetGame: () => void;
}

// ─── Initial state ────────────────────────────────────────
function createInitialState(): GameState {
  const shuffled = [...AVAILABLE_PROPERTIES].sort(() => Math.random() - 0.5);
  return {
    _version: 4,
    cash: INITIAL_CASH,
    level: 1,
    experience: 0,
    experienceToNext: EXPERIENCE_BASE,
    creditScore: 750, // Start with "Excellent" credit
    isBankrupt: false,
    overdraftLimit: 0,
    overdraftUsed: 0,
    entityType: 'sole_trader',
    ownedProperties: [],
    estateAgentProperties: shuffled.slice(5),
    auctionProperties: shuffled.slice(0, 5),
    propertyListings: [],
    tenants: [],
    voidPeriods: [],
    renovations: [],
    pendingDamages: [],
    annualRepairCosts: [],
    damageHistory: [],
    conveyancing: [],
    mortgages: [],
    mortgageProviderRates: getInitialProviderRates(),
    currentMarketRate: BASE_MARKET_RATE,
    monthsPlayed: 0,
    timeUntilNextMonth: MONTH_DURATION_SECONDS,
    lastYearlyGrowth: 0,
    yearlyNetProfit: 0,
    lastCorporationTaxMonth: 0,
    lastGlobalDamageMonth: 0,
    nextEconomicEventMonth: 3 + Math.floor(Math.random() * 4),
    economicEvents: [],
    tenantEvents: [],
    taxRecords: [],
    totalTaxPaid: 0,
    tenantConcerns: [],
  };
}

// ─── Save migration ───────────────────────────────────────
function migrateState(persisted: any): GameState {
  // v1 (or no version) = pounds; v2 = pennies
  if (!persisted._version || persisted._version < 2) {
    const moneyFields = ['cash', 'overdraftLimit', 'overdraftUsed', 'yearlyNetProfit'];
    moneyFields.forEach(f => {
      if (typeof persisted[f] === 'number') persisted[f] = toPennies(persisted[f]);
    });
    const propMoneyFields = ['price', 'value', 'monthlyIncome', 'mortgageRemaining', 'marketValue', 'baseRent'];
    ['ownedProperties', 'estateAgentProperties', 'auctionProperties'].forEach(arrKey => {
      if (Array.isArray(persisted[arrKey])) {
        persisted[arrKey] = persisted[arrKey].map((p: any) => {
          const out = { ...p };
          propMoneyFields.forEach(f => { if (typeof out[f] === 'number') out[f] = toPennies(out[f]); });
          return out;
        });
      }
    });
    if (Array.isArray(persisted.mortgages)) {
      persisted.mortgages = persisted.mortgages.map((m: any) => ({
        ...m, principal: toPennies(m.principal || 0), monthlyPayment: toPennies(m.monthlyPayment || 0), remainingBalance: toPennies(m.remainingBalance || 0),
      }));
    }
    if (Array.isArray(persisted.propertyListings)) {
      persisted.propertyListings = persisted.propertyListings.map((l: any) => ({
        ...l, askingPrice: toPennies(l.askingPrice || 0),
        autoAcceptThreshold: l.autoAcceptThreshold ? toPennies(l.autoAcceptThreshold) : undefined,
        offers: Array.isArray(l.offers) ? l.offers.map((o: any) => ({
          ...o, amount: toPennies(o.amount || 0),
          counterAmount: o.counterAmount ? toPennies(o.counterAmount) : undefined,
          buyerCounterAmount: o.buyerCounterAmount ? toPennies(o.buyerCounterAmount) : undefined,
        })) : [],
      }));
    }
    if (Array.isArray(persisted.pendingDamages)) {
      persisted.pendingDamages = persisted.pendingDamages.map((d: any) => ({ ...d, repairCost: toPennies(d.repairCost || 0) }));
    }
    if (Array.isArray(persisted.tenantEvents)) {
      persisted.tenantEvents = persisted.tenantEvents.map((e: any) => ({ ...e, amount: toPennies(e.amount || 0) }));
    }
    if (Array.isArray(persisted.annualRepairCosts)) {
      persisted.annualRepairCosts = persisted.annualRepairCosts.map((a: any) => ({ ...a, totalCost: toPennies(a.totalCost || 0) }));
    }
    persisted._version = 2;
  }

  // v2 → v3: add condition, entityType, conveyancing, tax fields
  if (persisted._version < 3) {
    // Add condition to all properties
    ['ownedProperties', 'estateAgentProperties', 'auctionProperties'].forEach(arrKey => {
      if (Array.isArray(persisted[arrKey])) {
        persisted[arrKey] = persisted[arrKey].map((p: any) => ({
          ...p,
          condition: p.condition || 'standard',
          monthsSinceLastRenovation: p.monthsSinceLastRenovation ?? 0,
        }));
      }
    });
    persisted.entityType = persisted.entityType || 'sole_trader';
    persisted.conveyancing = persisted.conveyancing || [];
    persisted.taxRecords = persisted.taxRecords || [];
    persisted.totalTaxPaid = persisted.totalTaxPaid || 0;
    // Upgrade credit score for existing players (they had 580 start, now 750)
    if (persisted.creditScore && persisted.creditScore < 650 && persisted.monthsPlayed < 3) {
      persisted.creditScore = 750;
    }
    persisted._version = 3;
  }

  // v3 → v4: add tenantConcerns
  if (persisted._version < 4) {
    persisted.tenantConcerns = persisted.tenantConcerns || [];
    persisted._version = 4;
  }

  // Backfill satisfaction on existing tenants (any save version)
  if (Array.isArray(persisted.tenants)) {
    persisted.tenants = persisted.tenants.map((t: any) => ({
      ...t,
      satisfaction: typeof t.satisfaction === 'number' ? t.satisfaction : 80,
      lastSatisfactionUpdate: typeof t.lastSatisfactionUpdate === 'number' ? t.lastSatisfactionUpdate : (persisted.monthsPlayed || 0),
      satisfactionReasons: t.satisfactionReasons || [],
    }));
  }

  // Migrate old save fields
  if (persisted.estateAgentPropertyIds && !persisted.estateAgentProperties) {
    persisted.estateAgentProperties = AVAILABLE_PROPERTIES.filter((p: Property) => persisted.estateAgentPropertyIds.includes(p.id));
  }
  if (persisted.auctionPropertyIds && !persisted.auctionProperties) {
    persisted.auctionProperties = AVAILABLE_PROPERTIES.filter((p: Property) => persisted.auctionPropertyIds.includes(p.id));
  }

  const initial = createInitialState();
  return { ...initial, ...persisted };
}

// ─── STORE ────────────────────────────────────────────────
export const useGameStore = create<GameState & GameActions>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      // ─── ENTITY ────────────────────────────
      setEntityType: (type) => {
        const prev = get();
        if (prev.entityType === 'ltd') {
          showToast("Already Incorporated", "Cannot revert from LTD.", "destructive");
          return;
        }
        if (type === 'ltd') {
          const incorporationFee = toPennies(1000);
          if (prev.cash < incorporationFee) {
            showToast("Insufficient Funds", "Need £1,000 to incorporate.", "destructive");
            return;
          }
          set({ entityType: type, cash: prev.cash - incorporationFee });
          showToast("Incorporated! 🏢", "You are now trading as a Limited Company. Mortgage interest is fully tax-deductible.");
        } else {
          set({ entityType: type });
        }
      },

      // ─── TIMER ────────────────────────────
      clockTick: () => set(s => ({ timeUntilNextMonth: Math.max(0, s.timeUntilNextMonth - 1) })),

      processMonthEnd: () => {
        const prev = get();
        if (prev.isBankrupt) return;
        if (prev.timeUntilNextMonth > 0) return;

        const currentTime = Date.now();
        const newMonthNumber = prev.monthsPlayed + 1;

        // ── Process conveyancing ──
        let completedBuys: Conveyancing[] = [];
        let completedSells: Conveyancing[] = [];
        let cancelledConveyancing: Conveyancing[] = [];
        let activeConveyancing: Conveyancing[] = [];
        let conveyancingCashReturn = 0;

        prev.conveyancing.forEach(conv => {
          if (newMonthNumber >= conv.completionMonth) {
            // 10% chain collapse chance
            if (Math.random() < 0.10) {
              cancelledConveyancing.push(conv);
              conveyancingCashReturn += conv.cashHeld;
              showToast("⛓️ Chain Collapsed!", `${conv.propertyName} — the ${conv.status === 'buying' ? 'seller pulled out' : 'buyer pulled out'}. Transaction cancelled.`, "destructive");
            } else {
              if (conv.status === 'buying') completedBuys.push(conv);
              else completedSells.push(conv);
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

        completedBuys.forEach(conv => {
          // Find the property from market lists
          let prop = newEstateAgent.find(p => p.id === conv.propertyId) || newAuction.find(p => p.id === conv.propertyId);
          if (!prop) {
            // Property was generated inline — reconstruct with derived rent so monthlyIncome isn't £0
            const reconstructedValue = conv.purchasePrice || 0;
            const reconstructedYield = 6 + Math.random() * 9;
            const derivedRent = reconstructedValue > 0 ? Math.floor((reconstructedValue * (reconstructedYield / 100)) / 12) : 0;
            prop = { id: conv.propertyId, name: conv.propertyName, type: 'residential', price: reconstructedValue, value: reconstructedValue, neighborhood: '', monthlyIncome: derivedRent, image: '', marketTrend: 'stable', condition: 'standard', monthsSinceLastRenovation: 0, yield: reconstructedYield };
          }
          // Ensure baseRent is non-zero — fall back to value × yield/12 if monthlyIncome is missing
          const effectiveYield = prop.yield || (6 + Math.random() * 9);
          const effectiveRent = prop.monthlyIncome > 0
            ? prop.monthlyIncome
            : (prop.value > 0 ? Math.floor((prop.value * (effectiveYield / 100)) / 12) : 0);
          const purchased: Property = {
            ...prop, owned: true, price: conv.purchasePrice || prop.price,
            // Settling-in: marketValue is at-least the purchase price so fees don't show as instant paper loss
            marketValue: Math.max(prop.value, conv.purchasePrice || prop.price),
            yield: effectiveYield,
            monthlyIncome: effectiveRent,
            lastRentIncrease: newMonthNumber, baseRent: effectiveRent,
          };
          newOwnedProperties.push(purchased);
          newEstateAgent = newEstateAgent.filter(p => p.id !== conv.propertyId);
          newAuction = newAuction.filter(p => p.id !== conv.propertyId);

          if (conv.mortgageData) {
            newMortgages.push({
              id: `${conv.propertyId}_${Date.now()}`, propertyId: conv.propertyId,
              principal: conv.mortgageData.amount, monthlyPayment: conv.mortgageData.monthlyPayment,
              remainingBalance: conv.mortgageData.amount, interestRate: conv.mortgageData.interestRate,
              termYears: conv.mortgageData.termYears, mortgageType: conv.mortgageData.mortgageType,
              providerId: conv.mortgageData.providerId, startDate: Date.now(),
            });
          }
          showToast("Conveyancing Complete! 🏠", `${conv.propertyName} is now yours!`);
        });

        // Complete sell conveyancing — remove property, add cash
        let sellCash = 0;
        let newTenants = [...prev.tenants];
        let newVoidPeriods = [...prev.voidPeriods];
        let newPropertyListings = [...prev.propertyListings];

        completedSells.forEach(conv => {
          const salePrice = conv.salePrice || 0;
          const fees = conv.isAuction ? Math.round(salePrice * AUCTION_SELLER_FEE) : Math.round(salePrice * ESTATE_AGENT_RATE);
          const mortgage = newMortgages.find(m => m.propertyId === conv.propertyId);
          const net = salePrice - fees - SOLICITOR_FEES - (mortgage?.remainingBalance || 0);

          // CGT for sole traders
          const property = newOwnedProperties.find(p => p.id === conv.propertyId);
          let cgtAmount = 0;
          if (property && prev.entityType === 'sole_trader') {
            cgtAmount = calculateCGT(salePrice, property.price, 0, prev.entityType);
          }

          sellCash += net - cgtAmount;
          newOwnedProperties = newOwnedProperties.filter(p => p.id !== conv.propertyId);
          newMortgages = newMortgages.filter(m => m.propertyId !== conv.propertyId);
          newTenants = newTenants.filter(t => t.propertyId !== conv.propertyId);
          newVoidPeriods = newVoidPeriods.filter(vp => vp.propertyId !== conv.propertyId);
          newPropertyListings = newPropertyListings.filter(l => l.propertyId !== conv.propertyId);

          showToast("Property Sold! 🎉", `${conv.propertyName} sold for £${fromPennies(salePrice).toLocaleString()}${cgtAmount > 0 ? ` (CGT: £${fromPennies(cgtAmount).toLocaleString()})` : ''}`);
        });

        // ── Monthly income (skip conveyancing properties) ──
        const conveyancingPropertyIds = new Set([...activeConveyancing.map(c => c.propertyId), ...cancelledConveyancing.map(c => c.propertyId)]);

        const monthlyIncome = newOwnedProperties.reduce((total, property) => {
          if (conveyancingPropertyIds.has(property.id)) return total; // No rent during conveyancing
          const hasTenant = newTenants.some(t => t.propertyId === property.id);
          const isInVoid = newVoidPeriods.some(vp =>
            vp.propertyId === property.id && currentTime >= vp.startDate && currentTime <= vp.endDate
          );
          return total + (hasTenant && !isInVoid ? property.monthlyIncome : 0);
        }, 0);

        // Expenses
        const mortgagePayments = newMortgages.reduce((s, m) => s + m.monthlyPayment, 0);
        const councilTax = newOwnedProperties.reduce((total, property) => {
          const hasTenant = newTenants.some(t => t.propertyId === property.id);
          const isInVoid = newVoidPeriods.some(vp =>
            vp.propertyId === property.id && currentTime >= vp.startDate && currentTime <= vp.endDate
          );
          return total + (!hasTenant || isInVoid ? COUNCIL_TAX_BAND_D : 0);
        }, 0);
        const totalExpenses = mortgagePayments + councilTax;
        const netIncome = monthlyIncome - totalExpenses;

        // Update mortgage balances
        const updatedMortgages = newMortgages.map(mortgage => {
          const interest = Math.round(mortgage.remainingBalance * (mortgage.interestRate / 12));
          let newBalance = mortgage.remainingBalance;
          if (mortgage.mortgageType === 'repayment') {
            const principal = mortgage.monthlyPayment - interest;
            newBalance = Math.max(0, mortgage.remainingBalance - principal);
          }
          return { ...mortgage, remainingBalance: newBalance };
        });

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

        // Check paid-off mortgages
        const paidOff = updatedMortgages.filter(m =>
          (newMortgages.find(old => old.id === m.id)?.remainingBalance ?? 0) > 0 && m.remainingBalance === 0
        );
        paidOff.forEach(m => {
          const prop = newOwnedProperties.find(p => p.id === m.propertyId);
          if (prop) {
            creditAdj += 15;
            showToast("Mortgage Paid Off! 🎉", `${prop.name} is now fully owned!`);
          }
        });

        const finalMortgages = updatedMortgages.filter(m => m.remainingBalance > 0);

        // ── Depreciation ──
        let updatedOwnedProperties = newOwnedProperties.map(p => {
          const newMonthsSince = (p.monthsSinceLastRenovation || 0) + 1;
          const depMonths = getDepreciationMonths(p.condition);
          let newCondition = p.condition;
          let resetMonths = newMonthsSince;

          if (newMonthsSince >= depMonths) {
            if (p.condition === 'premium') {
              newCondition = 'standard';
              resetMonths = 0;
              showToast("⚠️ Property Degraded", `${p.name} has degraded from Premium to Standard condition.`);
            } else if (p.condition === 'standard') {
              newCondition = 'dilapidated';
              resetMonths = 0;
              showToast("🏚️ Property Dilapidated!", `${p.name} has degraded to Dilapidated! Rent reduced.`, "destructive");
            }
          }

          // Apply condition rent multiplier to base rent
          if (newCondition !== p.condition) {
            const baseRent = p.baseRent || p.monthlyIncome;
            const newRent = Math.floor(baseRent * getConditionRentMultiplier(newCondition));
            return { ...p, condition: newCondition, monthsSinceLastRenovation: resetMonths, monthlyIncome: newRent };
          }

          return { ...p, monthsSinceLastRenovation: resetMonths };
        });

        // ── Tenant satisfaction & early exit ──
        // For each tenant, adjust satisfaction based on neglect (condition,
        // damages, recent rent hikes). Low satisfaction can trigger an
        // early exit (creating a void period).
        const recentDamageIds = new Set(prev.pendingDamages.map(d => d.propertyId));
        let satisfactionAdjustedTenants = newTenants.map(t => {
          const property = updatedOwnedProperties.find(p => p.id === t.propertyId);
          if (!property) return t;
          const reasons: Array<{ reason: string; delta: number }> = [];
          let delta = 0;

          if (property.condition === 'dilapidated') {
            delta -= 15; reasons.push({ reason: 'Dilapidated condition', delta: -15 });
          } else if (property.condition === 'standard' && t.tenant.profile === 'premium') {
            delta -= 5; reasons.push({ reason: 'Premium tenant in standard property', delta: -5 });
          } else if (property.condition === 'premium') {
            delta += 3; reasons.push({ reason: 'Premium condition', delta: +3 });
          }

          if (recentDamageIds.has(t.propertyId)) {
            delta -= 10; reasons.push({ reason: 'Unrepaired damage', delta: -10 });
          }

          // Recent rent hike (within last 3 months)
          if (property.lastRentIncrease !== undefined && newMonthNumber - property.lastRentIncrease <= 3 && property.lastRentIncrease !== prev.monthsPlayed) {
            delta -= 8; reasons.push({ reason: 'Recent rent increase', delta: -8 });
          }

          // Drift back toward 70 baseline if no negative pressure
          if (reasons.length === 0) {
            const drift = t.satisfaction < 70 ? 2 : t.satisfaction > 70 ? -1 : 0;
            delta += drift;
            if (drift !== 0) reasons.push({ reason: 'Stable conditions', delta: drift });
          }

          const newSatisfaction = Math.max(0, Math.min(100, t.satisfaction + delta));
          return { ...t, satisfaction: newSatisfaction, lastSatisfactionUpdate: newMonthNumber, satisfactionReasons: reasons };
        });

        // Early-exit: <25 satisfaction → 8% chance tenant leaves (void period)
        const earlyExitVoids: VoidPeriod[] = [];
        satisfactionAdjustedTenants = satisfactionAdjustedTenants.filter(t => {
          if (t.satisfaction < 25 && Math.random() < 0.08) {
            const voidDuration = (30 + Math.random() * 60) * 24 * 60 * 60 * 1000;
            earlyExitVoids.push({ propertyId: t.propertyId, startDate: Date.now(), endDate: Date.now() + voidDuration });
            const property = updatedOwnedProperties.find(p => p.id === t.propertyId);
            showToast("Tenant Moved Out 😞", `${t.tenant.name}${property ? ` left ${property.name}` : ''} due to low satisfaction.`, "destructive");
            return false;
          }
          return true;
        });
        newTenants = satisfactionAdjustedTenants;
        newVoidPeriods = [...newVoidPeriods, ...earlyExitVoids];

        // ── Tenant concerns: monthly generation + satisfaction decay + auto-resolution ──
        const CONCERN_TEMPLATES: Array<{ category: import('@/types/game').ConcernCategory; descriptions: string[]; baseCostPct: [number, number]; penalty: number }> = [
          { category: 'maintenance', descriptions: ['Boiler not heating properly', 'Leaking tap in kitchen', 'Cracked window seal'], baseCostPct: [0.0008, 0.003], penalty: 3 },
          { category: 'noise', descriptions: ['Noisy neighbours late at night', 'Construction work next door'], baseCostPct: [0.0005, 0.0015], penalty: 2 },
          { category: 'mould', descriptions: ['Mould appearing in bathroom', 'Damp patch on bedroom wall'], baseCostPct: [0.0015, 0.005], penalty: 5 },
          { category: 'appliance', descriptions: ['Washing machine stopped working', 'Oven element broken', 'Fridge not cooling'], baseCostPct: [0.001, 0.0035], penalty: 3 },
          { category: 'safety', descriptions: ['Smoke alarm faulty', 'Loose stair railing', 'Front door lock broken'], baseCostPct: [0.0008, 0.003], penalty: 6 },
        ];

        const newConcerns: import('@/types/game').TenantConcern[] = [];
        const existingActiveByProp = new Map<string, number>();
        prev.tenantConcerns.filter(c => !c.resolvedMonth).forEach(c => {
          existingActiveByProp.set(c.propertyId, (existingActiveByProp.get(c.propertyId) || 0) + 1);
        });

        newTenants.forEach(t => {
          const property = updatedOwnedProperties.find(p => p.id === t.propertyId);
          if (!property) return;
          if ((existingActiveByProp.get(t.propertyId) || 0) >= 2) return;

          let chance = 0.06;
          if (property.condition === 'dilapidated') chance += 0.06;
          else if (property.condition === 'premium') chance -= 0.02;
          if (t.tenant.profile === 'premium') chance += 0.02;
          else if (t.tenant.profile === 'risky') chance -= 0.04;
          chance = Math.max(0.005, chance);

          if (Math.random() >= chance) return;

          const tpl = CONCERN_TEMPLATES[Math.floor(Math.random() * CONCERN_TEMPLATES.length)];
          const desc = tpl.descriptions[Math.floor(Math.random() * tpl.descriptions.length)];
          const [lo, hi] = tpl.baseCostPct;
          const pct = lo + Math.random() * (hi - lo);
          const cost = Math.max(toPennies(150), Math.min(toPennies(3000), Math.round(property.value * pct)));
          const penaltyMod = t.tenant.profile === 'premium' ? 1 : t.tenant.profile === 'budget' ? 0.7 : 1;
          newConcerns.push({
            id: `concern_${newMonthNumber}_${t.propertyId}_${Math.random().toString(36).slice(2, 7)}`,
            propertyId: t.propertyId,
            tenantProfile: t.tenant.profile as any,
            category: tpl.category,
            description: desc,
            raisedMonth: newMonthNumber,
            resolveCost: cost,
            satisfactionPenaltyIfIgnored: Math.round(tpl.penalty * penaltyMod),
          });
          existingActiveByProp.set(t.propertyId, (existingActiveByProp.get(t.propertyId) || 0) + 1);
        });

        if (newConcerns.length > 0) {
          showToast("New Tenant Concern 🛠️", `${newConcerns.length} new concern${newConcerns.length > 1 ? 's' : ''} raised — check the feed.`);
        }

        // Apply satisfaction decay for old unresolved concerns; auto-resolve when condition is premium
        let updatedConcerns = [...prev.tenantConcerns, ...newConcerns];
        const satPenaltyByProp = new Map<string, number>();
        updatedConcerns = updatedConcerns.map(c => {
          if (c.resolvedMonth) return c;
          const property = updatedOwnedProperties.find(p => p.id === c.propertyId);
          if (property && property.condition === 'premium' && (c.category === 'maintenance' || c.category === 'mould')) {
            return { ...c, resolvedMonth: newMonthNumber };
          }
          if (c.raisedMonth < newMonthNumber) {
            satPenaltyByProp.set(c.propertyId, (satPenaltyByProp.get(c.propertyId) || 0) + c.satisfactionPenaltyIfIgnored);
          }
          return c;
        });
        if (satPenaltyByProp.size > 0) {
          newTenants = newTenants.map(t => {
            const pen = satPenaltyByProp.get(t.propertyId);
            if (!pen) return t;
            return { ...t, satisfaction: Math.max(0, t.satisfaction - pen) };
          });
        }
        // Trim long-resolved
        updatedConcerns = updatedConcerns.filter(c => !c.resolvedMonth || (newMonthNumber - c.resolvedMonth) <= 6);


        const isBankrupt = newCashBeforeTax < 0 && totalExpenses > monthlyIncome;
        if (isBankrupt && !prev.isBankrupt) {
          showToast("BANKRUPTCY!", "Your expenses exceed your income and you've run out of cash!", "destructive");
        }

        // Level check
        const propertyEquity = updatedOwnedProperties.reduce((total, p) => {
          const m = finalMortgages.find(mt => mt.propertyId === p.id);
          return total + p.value - (m?.remainingBalance || 0);
        }, 0);
        const netWorth = newCashBeforeTax + propertyEquity;
        let newLevel = prev.level;
        while (newLevel < 10 && netWorth >= getRequiredNetWorth(newLevel + 1)) newLevel++;
        if (newLevel > prev.level) {
          showToast("Level Up!", `Congratulations! You reached level ${newLevel}!`);
        }

        // ── Monthly property value drift (~5.5%/yr nominal w/ occasional dips) ──
        // Replaces the old once-yearly 2-4% bump. Long-run trend is gentle and upward,
        // so freshly-bought properties don't show losses immediately after fees.
        updatedOwnedProperties = updatedOwnedProperties.map(property => {
          const monthlyDrift = 0.0045 + (Math.random() - 0.5) * 0.004; // ~0.25%–0.65%
          const isDip = Math.random() < 0.015;
          const change = isDip ? -(0.005 + Math.random() * 0.01) : monthlyDrift;
          return {
            ...property,
            value: Math.round(property.value * (1 + change)),
            marketValue: Math.round((property.marketValue || property.value) * (1 + change)),
          };
        });

        // Annual rent uplift (kept on its own yearly schedule)
        let newLastYearlyGrowth = prev.lastYearlyGrowth;
        if (newMonthNumber > 0 && newMonthNumber % 12 === 0 && newMonthNumber !== prev.lastYearlyGrowth) {
          const rentIncreaseRate = 0.03;
          updatedOwnedProperties = updatedOwnedProperties.map(property => {
            const newBaseRent = Math.floor((property.baseRent || property.monthlyIncome) * (1 + rentIncreaseRate));
            return {
              ...property,
              monthlyIncome: Math.floor(property.monthlyIncome * (1 + rentIncreaseRate)),
              baseRent: newBaseRent,
              lastRentIncrease: newMonthNumber,
            };
          });
          newLastYearlyGrowth = newMonthNumber;
          showToast("Annual Rent Uplift!", `Rents increased by 3% across your portfolio.`);
        }

        // Fluctuate provider rates
        const newProviderRates = fluctuateProviderRates(prev.mortgageProviderRates);

        // ── Taxation (April = month 3 in 0-indexed) ──
        const accumulatedProfit = prev.yearlyNetProfit + netIncome;
        const currentMonth = newMonthNumber % 12;
        const isApril = currentMonth === 3;
        const lastTaxYear = Math.floor(prev.lastCorporationTaxMonth / 12);
        const currentTaxYear = Math.floor(newMonthNumber / 12);
        let taxPaid = 0;
        let finalYearlyProfit = accumulatedProfit;
        let lastCorpTaxMonth = prev.lastCorporationTaxMonth;
        let newTaxRecords = [...prev.taxRecords];
        let newTotalTaxPaid = prev.totalTaxPaid;

        if (isApril && currentTaxYear > lastTaxYear && accumulatedProfit > 0) {
          const annualProfit = accumulatedProfit;
          const annualMortgageInterest = finalMortgages.reduce((s, m) => s + Math.round(m.remainingBalance * m.interestRate), 0);
          const annualExpenses = councilTax * 12; // Simplified annual expenses

          if (prev.entityType === 'sole_trader') {
            const { effectiveTax, section24Credit } = calculateIncomeTax(annualProfit, annualMortgageInterest, annualExpenses);
            taxPaid = effectiveTax;
            showToast("📋 Income Tax Due!", `Paid £${fromPennies(taxPaid).toLocaleString()} income tax (Section 24 credit: £${fromPennies(section24Credit).toLocaleString()})`);
            newTaxRecords.push({ month: newMonthNumber, type: 'income_tax', amount: taxPaid, description: `Annual income tax with §24 credit` });
          } else {
            taxPaid = calculateCorporationTax(annualProfit, annualMortgageInterest, annualExpenses);
            showToast("📋 Corporation Tax Due!", `Paid £${fromPennies(taxPaid).toLocaleString()} corporation tax`);
            newTaxRecords.push({ month: newMonthNumber, type: 'corporation_tax', amount: taxPaid, description: `Annual corporation tax` });
          }

          newTotalTaxPaid += taxPaid;
          finalYearlyProfit = 0;
          lastCorpTaxMonth = newMonthNumber;
        }

        const finalCash = Math.max(0, newCashBeforeTax - taxPaid);

        // Macro-economic events
        let nextEventMonth = prev.nextEconomicEventMonth;
        let economicEvents = [...prev.economicEvents];
        let eventCashBonus = 0;
        let eventRateAdjust = 0;

        if (newMonthNumber >= nextEventMonth && updatedOwnedProperties.length > 0) {
          const eventTypes: Array<{ type: MacroEconomicEvent['type']; name: string; description: string }> = [
            { type: 'rate_cut', name: '📉 Base Rates Cut!', description: 'The Bank of England has cut base rates by 1%.' },
            { type: 'tech_boom', name: '🚀 Tech Boom in the City!', description: 'Property values and rents increase by 15%.' },
            { type: 'recession', name: '📉 Economic Recession', description: 'Base rates rise 1.5% and property values drop 10%.' },
            { type: 'grant', name: '🏛️ Government Landlord Grant', description: 'You receive a cash injection!' },
          ];
          const chosen = eventTypes[Math.floor(Math.random() * eventTypes.length)];
          const event: MacroEconomicEvent = {
            id: `event_${newMonthNumber}`, name: chosen.name,
            description: chosen.description, month: newMonthNumber, type: chosen.type,
          };
          economicEvents = [...economicEvents.slice(-9), event];

          if (chosen.type === 'rate_cut') eventRateAdjust = -0.01;
          else if (chosen.type === 'tech_boom') {
            updatedOwnedProperties = updatedOwnedProperties.map(p => ({
              ...p, value: Math.floor(p.value * 1.15),
              marketValue: Math.floor((p.marketValue || p.value) * 1.15),
              monthlyIncome: Math.floor(p.monthlyIncome * 1.15),
              baseRent: Math.floor((p.baseRent || p.monthlyIncome) * 1.15),
            }));
          } else if (chosen.type === 'recession') {
            eventRateAdjust = 0.015;
            updatedOwnedProperties = updatedOwnedProperties.map(p => ({
              ...p, value: Math.floor(p.value * 0.90),
              marketValue: Math.floor((p.marketValue || p.value) * 0.90),
            }));
          } else if (chosen.type === 'grant') {
            eventCashBonus = toPennies(5000 + Math.floor(Math.random() * 15000));
          }

          showToast(chosen.name, chosen.description + (eventCashBonus > 0 ? ` You received £${fromPennies(eventCashBonus).toLocaleString()}!` : ''));
          nextEventMonth = newMonthNumber + 3 + Math.floor(Math.random() * 4);
        }

        let finalProviderRates = newProviderRates;
        if (eventRateAdjust !== 0) {
          finalProviderRates = { ...newProviderRates };
          Object.keys(finalProviderRates).forEach(key => {
            finalProviderRates[key] = Math.max(0.01, finalProviderRates[key] + eventRateAdjust);
          });
        }

        set({
          cash: finalCash + eventCashBonus,
          ownedProperties: updatedOwnedProperties,
          mortgages: finalMortgages,
          level: newLevel,
          monthsPlayed: newMonthNumber,
          timeUntilNextMonth: MONTH_DURATION_SECONDS,
          isBankrupt,
          creditScore: Math.max(300, Math.min(850, prev.creditScore + creditAdj)),
          lastYearlyGrowth: newLastYearlyGrowth,
          mortgageProviderRates: finalProviderRates,
          yearlyNetProfit: finalYearlyProfit,
          lastCorporationTaxMonth: lastCorpTaxMonth,
          nextEconomicEventMonth: nextEventMonth,
          economicEvents,
          conveyancing: activeConveyancing,
          estateAgentProperties: newEstateAgent,
          auctionProperties: newAuction,
          tenants: newTenants,
          voidPeriods: newVoidPeriods,
          propertyListings: newPropertyListings,
          taxRecords: newTaxRecords.slice(-50), // Keep last 50 records
          totalTaxPaid: newTotalTaxPaid,
          tenantConcerns: updatedConcerns,
        });
      },

      processMarketUpdate: () => {
        const prev = get();
        const currentTime = Date.now();
        const marketChange = (Math.random() - 0.5) * 0.002;
        const newMarketRate = Math.max(0.015, Math.min(0.08, prev.currentMarketRate + marketChange));

        // Completed renovations
        const completedRenovations = prev.renovations.filter(r => currentTime >= r.completionDate);
        const activeRenovations = prev.renovations.filter(r => currentTime < r.completionDate);
        let updatedProperties = [...prev.ownedProperties];
        completedRenovations.forEach(renovation => {
          const idx = updatedProperties.findIndex(p => p.id === renovation.propertyId);
          if (idx >= 0) {
            updatedProperties[idx] = {
              ...updatedProperties[idx],
              value: updatedProperties[idx].value + toPennies(renovation.type.valueIncrease),
              monthlyIncome: updatedProperties[idx].monthlyIncome + toPennies(renovation.type.rentIncrease),
              monthsSinceLastRenovation: 0, // Reset depreciation timer
            };
            showToast("Renovation Complete!", `${renovation.type.name} finished on ${updatedProperties[idx].name}!`);
          }
        });

        // Update listings
        const updatedListings = prev.propertyListings.map(listing => {
          const daysOnMarket = Math.floor((currentTime - listing.listingDate) / (1000 * 60 * 60 * 24));
          const property = prev.ownedProperties.find(p => p.id === listing.propertyId);
          const daysSinceLastCheck = listing.lastOfferCheck
            ? Math.floor((currentTime - listing.lastOfferCheck) / (1000 * 60 * 60 * 24))
            : 0;

          let newOffers = listing.offers || [];
          let lastCheck = listing.lastOfferCheck || listing.listingDate;

          if (!listing.isAuction && property && daysSinceLastCheck >= 3) {
            const numNew = Math.random() > 0.5 ? 2 : 1;
            const buyerNames = [
              "Mr & Mrs Johnson", "Sarah Matthews", "David Chen", "Emma Wilson",
              "The Thompson Family", "Investment Properties Ltd", "Michael Brown",
              "Liverpool Capital Group", "First Time Buyer", "Retirement Home Buyer"
            ];
            for (let i = 0; i < numNew; i++) {
              const priceMultiplier = 0.85 + (Math.random() * 0.2);
              const timeAdj = Math.max(0.9, 1 - (daysOnMarket * 0.002));
              const offer: PropertyOffer = {
                id: `offer-${Date.now()}-${i}`,
                buyerName: buyerNames[Math.floor(Math.random() * buyerNames.length)],
                amount: Math.floor(property.value * priceMultiplier * timeAdj),
                daysOnMarket, isChainFree: Math.random() > 0.6,
                mortgageApproved: Math.random() > 0.3, timestamp: currentTime,
                status: 'pending', negotiationRound: 0,
              };
              newOffers.push(offer);
              if (listing.autoAcceptThreshold && offer.amount >= listing.autoAcceptThreshold) {
                showToast("Offer Auto-Accepted! 🎉", `${offer.buyerName}'s offer auto-accepted for ${property.name}!`);
              } else {
                showToast("New Offer Received! 💰", `${offer.buyerName} offered for ${property.name}`);
              }
            }
            lastCheck = currentTime;
          }

          const autoAccepted = newOffers.find(o =>
            listing.autoAcceptThreshold && o.amount >= listing.autoAcceptThreshold
          );
          if (autoAccepted) {
            return { ...listing, daysUntilSale: 0, offers: newOffers, lastOfferCheck: lastCheck };
          }
          return { ...listing, daysUntilSale: Math.max(0, listing.daysUntilSale - 1), offers: newOffers, lastOfferCheck: lastCheck };
        });

        // Process completed sales → move to conveyancing instead of instant
        const completedSales = updatedListings.filter(l => l.daysUntilSale === 0);
        const newConveyancing: Conveyancing[] = [];
        completedSales.forEach(sale => {
          const property = prev.ownedProperties.find(p => p.id === sale.propertyId);
          if (property) {
            const autoOffer = sale.offers?.find(o => sale.autoAcceptThreshold && o.amount >= sale.autoAcceptThreshold);
            const salePrice = autoOffer ? autoOffer.amount : (sale.isAuction ? Math.floor(property.value * 0.85) : property.value);
            newConveyancing.push({
              id: `conv_sell_${Date.now()}_${property.id}`,
              propertyId: property.id,
              propertyName: property.name,
              status: 'selling',
              startMonth: prev.monthsPlayed,
              completionMonth: prev.monthsPlayed + 1 + Math.floor(Math.random() * 3),
              salePrice,
              cashHeld: 0,
              isAuction: sale.isAuction,
            });
            showToast("Sale Agreed! ⏳", `${property.name} — conveyancing started. Completion in 1-3 months.`);
          }
        });

        // Void periods
        const activeVoids = prev.voidPeriods.filter(vp => currentTime < vp.endDate);
        const endedVoids = prev.voidPeriods.filter(vp => currentTime >= vp.endDate);
        endedVoids.forEach(() => showToast("Void Period Ended", "Your property is now ready for a new tenant!"));

        // Damage events
        const newDamages: PropertyDamage[] = [];
        const globalCooldown = prev.lastGlobalDamageMonth !== undefined ? prev.monthsPlayed - prev.lastGlobalDamageMonth : 999;
        if (globalCooldown >= 6) {
          const currentYear = Math.floor(prev.monthsPlayed / 12);
          prev.tenants.forEach(({ propertyId, tenant }) => {
            if (newDamages.length > 0) return;
            if (Math.random() >= tenant.damageRisk / 100) return;
            const property = prev.ownedProperties.find(p => p.id === propertyId);
            if (!property) return;
            const dmgHist = prev.damageHistory.find(dh => dh.propertyId === propertyId);
            const monthsSinceLast = dmgHist ? prev.monthsPlayed - dmgHist.lastDamageMonth : 999;
            if (monthsSinceLast < 48) return;
            const annualCap = Math.round(property.value * 0.02);
            const existing = prev.annualRepairCosts.find(a => a.propertyId === propertyId && a.year === currentYear);
            const currentCost = existing?.totalCost || 0;
            if (currentCost >= annualCap) return;
            const maxDmg = Math.min(Math.round(property.value * (0.01 + Math.random() * 0.01)), annualCap - currentCost);
            if (maxDmg > 0) {
              newDamages.push({
                id: `damage_${Date.now()}_${propertyId}`, propertyId,
                propertyName: property.name, repairCost: Math.floor(maxDmg), timestamp: Date.now(),
              });
            }
          });
        }

        // Build final state — don't remove sold properties yet (they're in conveyancing now)
        const salePropIds = new Set(completedSales.map(s => s.propertyId));

        set({
          ownedProperties: updatedProperties,
          renovations: activeRenovations,
          currentMarketRate: newMarketRate,
          voidPeriods: activeVoids,
          propertyListings: updatedListings.filter(l => l.daysUntilSale > 0 && !salePropIds.has(l.propertyId)),
          pendingDamages: [...prev.pendingDamages, ...newDamages],
          lastGlobalDamageMonth: newDamages.length > 0 ? prev.monthsPlayed : prev.lastGlobalDamageMonth,
          conveyancing: [...prev.conveyancing, ...newConveyancing],
        });
      },

      processCounterResponses: () => {
        const prev = get();
        let hasChanges = false;
        const updatedListings = prev.propertyListings.map(listing => {
          const property = prev.ownedProperties.find(p => p.id === listing.propertyId);
          if (!property) return listing;
          const updatedOffers = (listing.offers || []).map(offer => {
            if (offer.status === 'countered' && offer.counterResponseDate && Date.now() >= offer.counterResponseDate) {
              hasChanges = true;
              const acceptChance = offer.negotiationRound >= 3 ? 0.8 : 0.6;
              const counterChance = offer.negotiationRound >= 3 ? 0 : 0.25;
              const roll = Math.random();
              if (roll < acceptChance) {
                showToast("Counter-Offer Accepted! 🎉", `${offer.buyerName} accepted your counter for ${property.name}!`);
                return { ...offer, status: 'accepted' as const, amount: offer.counterAmount || offer.amount };
              } else if (roll < acceptChance + counterChance) {
                const diff = (offer.counterAmount || offer.amount) - offer.amount;
                const buyerCounter = offer.amount + Math.floor(diff * (0.4 + Math.random() * 0.3));
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

      // ─── BUY PROPERTY ──────────────────────
      buyProperty: (property, mortgagePercentage = 0, providerId, termYears = 25, mortgageType = 'repayment') => {
        const prev = get();
        if (prev.isBankrupt) { showToast("Bankrupt", "Cannot purchase while bankrupt!", "destructive"); return; }
        if (prev.ownedProperties.some(p => p.id === property.id)) { showToast("Already Owned", "You already own this property.", "destructive"); return; }
        // Count conveyancing buys as pending
        const pendingBuys = prev.conveyancing.filter(c => c.status === 'buying').length;
        if (prev.ownedProperties.length + pendingBuys >= getMaxPropertiesForLevel(prev.level)) { showToast("Property Limit", `Max ${getMaxPropertiesForLevel(prev.level)} at level ${prev.level}!`, "destructive"); return; }

        const allowedTypes = getAvailablePropertyTypes(prev.level);
        if (!allowedTypes.includes('all') && !allowedTypes.includes(property.type)) { showToast("Level Restriction", `Cannot buy ${property.type} at this level!`, "destructive"); return; }

        const { min: minValue, max: maxValue } = getPropertyValueRangeForLevel(prev.level);
        if (property.price < minValue) { showToast("Too Cheap", `Min property value at level ${prev.level}: £${fromPennies(minValue).toLocaleString()}`, "destructive"); return; }
        if (property.price > maxValue) { showToast("Too Expensive", `Max at level ${prev.level}: £${fromPennies(maxValue).toLocaleString()}`, "destructive"); return; }

        const mortgageAmount = Math.round((property.price * mortgagePercentage) / 100);
        const stampDuty = calculateStampDuty(property.price);
        const mortgageFee = mortgageAmount > 0 ? Math.round(property.price * 0.01) : 0;
        const cashRequired = property.price - mortgageAmount + SOLICITOR_FEES + stampDuty + mortgageFee;

        if (prev.cash < cashRequired) { showToast("Insufficient Funds", `Need £${fromPennies(cashRequired).toLocaleString()}`, "destructive"); return; }

        let mortgageData: Conveyancing['mortgageData'] = undefined;
        let creditAdj = 0;
        if (mortgageAmount > 0) {
          const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];
          const totalRentalIncome = prev.ownedProperties.reduce((total, prop) => {
            return total + (prev.tenants.some(t => t.propertyId === prop.id) ? prop.monthlyIncome : 0);
          }, 0);
          const existingPayments = prev.mortgages.reduce((s, m) => s + m.monthlyPayment, 0);
          const providerRate = prev.mortgageProviderRates[provider.id] || provider.baseRate;

          const eligibility = calculateMortgageEligibility({
            creditScore: prev.creditScore,
            loanAmount: fromPennies(mortgageAmount),
            propertyValue: fromPennies(property.price),
            propertyMonthlyRent: fromPennies(property.monthlyIncome),
            providerBaseRate: providerRate + prev.currentMarketRate - BASE_MARKET_RATE,
            providerMinCreditScore: provider.minCreditScore,
            providerMaxLTV: provider.maxLTV,
            providerId: provider.id,
            termYears, mortgageType,
            existingMonthlyMortgagePayments: fromPennies(existingPayments),
            totalRentalIncome: fromPennies(totalRentalIncome),
            ownedPropertyCount: prev.ownedProperties.length,
          });

          if (!eligibility.eligible) { showToast("Mortgage Rejected", eligibility.reason || "Declined", "destructive"); return; }
          if (mortgagePercentage / 100 > 0.85) creditAdj -= 3;

          mortgageData = {
            amount: mortgageAmount,
            providerId: providerId || "halifax",
            termYears, mortgageType,
            monthlyPayment: toPennies(eligibility.monthlyPayment),
            interestRate: eligibility.adjustedRate,
          };
        }

        // Create conveyancing entry instead of instant purchase
        const conveyancingMonths = 1 + Math.floor(Math.random() * 3);
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
        };

        showToast("Offer Accepted! ⏳", `${property.name} — conveyancing started. Completion in ${conveyancingMonths} month(s).`);

        set({
          cash: prev.cash - cashRequired,
          conveyancing: [...prev.conveyancing, conv],
          // Hide property from market while in conveyancing
          estateAgentProperties: prev.estateAgentProperties.filter(p => p.id !== property.id),
          auctionProperties: prev.auctionProperties.filter(p => p.id !== property.id),
          experience: prev.experience + Math.floor(fromPennies(property.price) / 10000),
          creditScore: Math.max(300, Math.min(850, prev.creditScore + creditAdj)),
        });
      },

      buyPropertyAtPrice: (property, purchasePrice, mortgagePercentage = 0, providerId, termYears = 25, mortgageType = 'repayment') => {
        const prev = get();
        if (prev.isBankrupt) return;
        if (prev.ownedProperties.some(p => p.id === property.id)) { showToast("Already Owned", `You already own ${property.name}!`, "destructive"); return; }
        const pendingBuys = prev.conveyancing.filter(c => c.status === 'buying').length;
        if (prev.ownedProperties.length + pendingBuys >= getMaxPropertiesForLevel(prev.level)) { showToast("Portfolio Limit", `Max ${getMaxPropertiesForLevel(prev.level)} at level ${prev.level}!`, "destructive"); return; }

        const { min: minValue } = getPropertyValueRangeForLevel(prev.level);
        if (property.value < minValue) { showToast("Too Cheap", `Min value at level ${prev.level}`, "destructive"); return; }

        const mortgageAmount = Math.round((purchasePrice * mortgagePercentage) / 100);
        const stampDuty = calculateStampDuty(purchasePrice);
        const mortgageFee = mortgageAmount > 0 ? Math.round(purchasePrice * 0.01) : 0;
        const cashRequired = purchasePrice - mortgageAmount + SOLICITOR_FEES + stampDuty + mortgageFee;

        if (prev.cash < cashRequired) { showToast("Insufficient Funds", `Need £${fromPennies(cashRequired).toLocaleString()}`, "destructive"); return; }

        let mortgageData: Conveyancing['mortgageData'] = undefined;
        let creditAdj = 0;
        if (mortgageAmount > 0) {
          const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];
          const totalRentalIncome = prev.ownedProperties.reduce((total, prop) => total + (prev.tenants.some(t => t.propertyId === prop.id) ? prop.monthlyIncome : 0), 0);
          const existingPayments = prev.mortgages.reduce((s, m) => s + m.monthlyPayment, 0);
          const providerRate = prev.mortgageProviderRates[provider.id] || provider.baseRate;

          const eligibility = calculateMortgageEligibility({
            creditScore: prev.creditScore,
            loanAmount: fromPennies(mortgageAmount),
            propertyValue: fromPennies(purchasePrice),
            propertyMonthlyRent: fromPennies(property.monthlyIncome),
            providerBaseRate: providerRate + prev.currentMarketRate - BASE_MARKET_RATE,
            providerMinCreditScore: provider.minCreditScore,
            providerMaxLTV: provider.maxLTV,
            providerId: provider.id,
            termYears, mortgageType,
            existingMonthlyMortgagePayments: fromPennies(existingPayments),
            totalRentalIncome: fromPennies(totalRentalIncome),
            ownedPropertyCount: prev.ownedProperties.length,
          });

          if (!eligibility.eligible) { showToast("Mortgage Rejected", eligibility.reason || "Declined", "destructive"); return; }
          if (mortgagePercentage / 100 > 0.85) creditAdj -= 3;

          mortgageData = {
            amount: mortgageAmount,
            providerId: providerId || "halifax",
            termYears, mortgageType,
            monthlyPayment: toPennies(eligibility.monthlyPayment),
            interestRate: eligibility.adjustedRate,
          };
        }

        const conveyancingMonths = 1 + Math.floor(Math.random() * 3);
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
        };

        showToast("Offer Accepted! ⏳", `${property.name} — conveyancing started. Completion in ${conveyancingMonths} month(s).`);

        set({
          cash: prev.cash - cashRequired,
          conveyancing: [...prev.conveyancing, conv],
          // Hide property from market while in conveyancing
          estateAgentProperties: prev.estateAgentProperties.filter(p => p.id !== property.id),
          auctionProperties: prev.auctionProperties.filter(p => p.id !== property.id),
          experience: prev.experience + Math.floor(fromPennies(purchasePrice) / 10000),
          creditScore: Math.max(300, Math.min(850, prev.creditScore + creditAdj)),
        });
      },

      // ─── SELL / LISTINGS ────────────────────
      sellProperty: (property, isAuction = false) => {
        const daysToSell = isAuction ? 1 : 30 + Math.floor(Math.random() * 60);
        const listing: PropertyListing = {
          propertyId: property.id, listingDate: Date.now(), isAuction,
          daysUntilSale: daysToSell, askingPrice: property.value,
          offers: [], lastOfferCheck: Date.now(),
        };
        showToast("Property Listed!", `${property.name} listed ${isAuction ? 'for auction' : 'on market'}.`);
        set(s => ({ propertyListings: [...s.propertyListings, listing] }));
      },

      handleEstateAgentSale: (propertyId, offer) => {
        const prev = get();
        const property = prev.ownedProperties.find(p => p.id === propertyId);
        if (!property) return;

        // Move to conveyancing instead of instant sale
        const conveyancingMonths = 1 + Math.floor(Math.random() * 3);
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
          propertyListings: prev.propertyListings.filter(l => l.propertyId !== propertyId),
          creditScore: Math.max(300, Math.min(850, prev.creditScore + 5)),
        });
      },

      handleAuctionSale: (propertyId, salePrice) => {
        const prev = get();
        const property = prev.ownedProperties.find(p => p.id === propertyId);
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
          propertyListings: prev.propertyListings.filter(l => l.propertyId !== propertyId),
          creditScore: Math.max(300, Math.min(850, prev.creditScore + 5)),
        });
      },

      listPropertyForSale: (propertyId, askingPrice) => {
        const prev = get();
        const property = prev.ownedProperties.find(p => p.id === propertyId);
        if (!property) return;
        if (prev.propertyListings.some(l => l.propertyId === propertyId)) {
          showToast("Already Listed", `${property.name} is already listed.`, "destructive"); return;
        }
        // Check not in conveyancing
        if (prev.conveyancing.some(c => c.propertyId === propertyId)) {
          showToast("In Conveyancing", `${property.name} is currently in conveyancing.`, "destructive"); return;
        }
        const listing: PropertyListing = {
          propertyId, listingDate: Date.now(), isAuction: false,
          daysUntilSale: 30, askingPrice, offers: [], lastOfferCheck: Date.now(),
        };
        showToast("Property Listed", `${property.name} listed for £${fromPennies(askingPrice).toLocaleString()}`);
        set(s => ({ propertyListings: [...s.propertyListings, listing] }));
      },

      cancelPropertyListing: (propertyId) => set(s => ({
        propertyListings: s.propertyListings.filter(l => l.propertyId !== propertyId)
      })),

      updatePropertyListingPrice: (propertyId, newPrice) => {
        set(s => ({
          propertyListings: s.propertyListings.map(l =>
            l.propertyId === propertyId ? { ...l, askingPrice: newPrice } : l
          )
        }));
        showToast("Price Updated", `Asking price updated to £${fromPennies(newPrice).toLocaleString()}`);
      },

      setAutoAcceptThreshold: (propertyId, threshold) => set(s => ({
        propertyListings: s.propertyListings.map(l =>
          l.propertyId === propertyId ? { ...l, autoAcceptThreshold: threshold } : l
        )
      })),

      addOfferToListing: (propertyId, offer) => {
        const prev = get();
        const listing = prev.propertyListings.find(l => l.propertyId === propertyId);
        const property = prev.ownedProperties.find(p => p.id === propertyId);
        if (!listing || !property) return;

        const newOffers = [...(listing.offers || []), offer].sort((a, b) => b.amount - a.amount);
        if (listing.autoAcceptThreshold && offer.amount >= listing.autoAcceptThreshold) {
          setTimeout(() => get().handleEstateAgentSale(propertyId, offer), 100);
        } else {
          showToast("New Offer!", `${offer.buyerName} offered £${fromPennies(offer.amount).toLocaleString()} for ${property.name}`);
        }
        set(s => ({
          propertyListings: s.propertyListings.map(l =>
            l.propertyId === propertyId ? { ...l, offers: newOffers, lastOfferCheck: Date.now() } : l
          )
        }));
      },

      rejectPropertyOffer: (propertyId, offerId) => set(s => ({
        propertyListings: s.propertyListings.map(l =>
          l.propertyId === propertyId ? { ...l, offers: (l.offers || []).filter(o => o.id !== offerId) } : l
        )
      })),

      counterOffer: (propertyId, offerId, counterAmount) => {
        const responseDelay = 5000 + Math.random() * 5000;
        showToast("Counter-Offer Sent", `Awaiting buyer response...`);
        set(s => ({
          propertyListings: s.propertyListings.map(l =>
            l.propertyId === propertyId ? {
              ...l, offers: (l.offers || []).map(o =>
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

      reducePriceOnListing: (propertyId, reductionPercent = 0.07) => {
        const prev = get();
        const property = prev.ownedProperties.find(p => p.id === propertyId);
        const listing = prev.propertyListings.find(l => l.propertyId === propertyId);
        if (!property || !listing) return;

        const currentPrice = listing.askingPrice || property.value;
        const newPrice = Math.floor(currentPrice * (1 - reductionPercent));
        const numNew = Math.random() > 0.3 ? (Math.random() > 0.5 ? 3 : 2) : 1;
        const buyerNames = ["Mr & Mrs Johnson", "Sarah Matthews", "David Chen", "Emma Wilson", "The Thompson Family", "Investment Properties Ltd"];
        const newOffers: PropertyOffer[] = [];
        for (let i = 0; i < numNew; i++) {
          const roll = Math.random();
          let offerAmount: number;
          if (roll < 0.70) offerAmount = property.value * (0.90 + Math.random() * 0.15);
          else if (roll < 0.85) offerAmount = property.value * (0.80 + Math.random() * 0.10);
          else offerAmount = property.value * (1.05 + Math.random() * 0.10);
          offerAmount = Math.min(offerAmount, newPrice);
          newOffers.push({
            id: `offer-${Date.now()}-reduce-${i}`,
            buyerName: buyerNames[Math.floor(Math.random() * buyerNames.length)],
            amount: Math.floor(offerAmount), daysOnMarket: 0,
            isChainFree: Math.random() > 0.5, mortgageApproved: Math.random() > 0.25,
            timestamp: Date.now(), status: 'pending', negotiationRound: 0,
          });
        }
        showToast("Price Reduced!", `${property.name} reduced to £${fromPennies(newPrice).toLocaleString()}`);
        set(s => ({
          propertyListings: s.propertyListings.map(l =>
            l.propertyId === propertyId
              ? { ...l, askingPrice: newPrice, offers: [...(l.offers || []), ...newOffers].sort((a, b) => b.amount - a.amount) }
              : l
          )
        }));
      },

      acceptBuyerCounter: (propertyId, offerId) => {
        const prev = get();
        const listing = prev.propertyListings.find(l => l.propertyId === propertyId);
        const offer = listing?.offers?.find(o => o.id === offerId);
        if (!offer || offer.status !== 'buyer-countered' || !offer.buyerCounterAmount) return;
        set(s => ({
          propertyListings: s.propertyListings.map(l =>
            l.propertyId === propertyId ? {
              ...l, offers: (l.offers || []).map(o =>
                o.id === offerId ? { ...o, status: 'accepted' as const, amount: offer.buyerCounterAmount! } : o
              )
            } : l
          )
        }));
      },

      rejectBuyerCounter: (propertyId, offerId, newCounterAmount) => {
        const responseDelay = 5000 + Math.random() * 5000;
        showToast("Counter-Offer Sent", `Awaiting buyer response...`);
        set(s => ({
          propertyListings: s.propertyListings.map(l =>
            l.propertyId === propertyId ? {
              ...l, offers: (l.offers || []).map(o =>
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

      // ─── TENANTS ───────────────────────────
      selectTenant: (propertyId, tenant) => {
        const prev = get();
        const property = prev.ownedProperties.find(p => p.id === propertyId);
        if (!property) return;
        // Can't change tenant during conveyancing
        if (prev.conveyancing.some(c => c.propertyId === propertyId)) {
          showToast("In Conveyancing", "Cannot change tenants during conveyancing.", "destructive"); return;
        }

        // Robust base-rent fallback: stored baseRent → current monthlyIncome →
        // value × yield/12 (last-resort for properties created via inline conveyancing)
        let currentBaseRent = property.baseRent || property.monthlyIncome;
        if (currentBaseRent <= 0 && property.value > 0) {
          const yieldPct = property.yield ?? 7;
          currentBaseRent = Math.floor((property.value * (yieldPct / 100)) / 12);
        }
        // Use shared helper so the displayed preview matches the actual rent
        const newRent = calcTenantRent(currentBaseRent, tenant, property.condition);
        const isIncrease = newRent > property.monthlyIncome;

        if (isIncrease && property.lastTenantChange !== undefined) {
          const months = prev.monthsPlayed - property.lastTenantChange;
          if (months < 3) {
            showToast("Too Soon", `Wait ${3 - months} more month(s) for a higher-paying tenant.`, "destructive");
            return;
          }
        }

        const updatedVoids = prev.voidPeriods.filter(vp => vp.propertyId !== propertyId);
        const existingIdx = prev.tenants.findIndex(t => t.propertyId === propertyId);
        const rec: PropertyTenant = {
          propertyId,
          tenant,
          rentMultiplier: tenant.rentMultiplier,
          startDate: Date.now(),
          satisfaction: 80,
          lastSatisfactionUpdate: prev.monthsPlayed,
          satisfactionReasons: [],
        };
        let updatedTenants;
        if (existingIdx >= 0) { updatedTenants = [...prev.tenants]; updatedTenants[existingIdx] = rec; }
        else updatedTenants = [...prev.tenants, rec];

        const updatedProps = prev.ownedProperties.map(p =>
          p.id === propertyId ? { ...p, monthlyIncome: newRent, baseRent: currentBaseRent, lastTenantChange: prev.monthsPlayed, lastRentIncrease: prev.monthsPlayed } : p
        );
        showToast("Tenant Selected!", `${tenant.name} renting at £${fromPennies(newRent).toLocaleString()}/mo`);
        set({ tenants: updatedTenants, ownedProperties: updatedProps, voidPeriods: updatedVoids });
      },

      removeTenant: (propertyId) => {
        const voidDuration = (30 + Math.random() * 60) * 24 * 60 * 60 * 1000;
        const voidPeriod: VoidPeriod = { propertyId, startDate: Date.now(), endDate: Date.now() + voidDuration };
        showToast("Tenant Removed", `Property void for ${Math.floor(voidDuration / (24 * 60 * 60 * 1000))} days.`);
        set(s => ({
          tenants: s.tenants.filter(t => t.propertyId !== propertyId),
          voidPeriods: [...s.voidPeriods, voidPeriod],
        }));
      },

      // ─── RENOVATIONS ──────────────────────
      startRenovation: (propertyId, renovationType) => {
        const prev = get();
        const costPennies = toPennies(renovationType.cost);
        if (prev.cash < costPennies) { showToast("Insufficient Funds", `Need £${renovationType.cost.toLocaleString()}`, "destructive"); return; }
        if (prev.renovations.some(r => r.propertyId === propertyId)) { showToast("Renovation in Progress", "Already renovating!", "destructive"); return; }
        const renovation: Renovation = {
          id: `${propertyId}_${renovationType.id}_${Date.now()}`, propertyId,
          type: renovationType, startDate: Date.now(),
          completionDate: Date.now() + (renovationType.duration * 60 * 1000),
        };
        showToast("Renovation Started!", `${renovationType.name} begun.`);
        set(s => ({ cash: s.cash - costPennies, renovations: [...s.renovations, renovation] }));
      },

      upgradeCondition: (propertyId, targetCondition) => {
        const prev = get();
        const property = prev.ownedProperties.find(p => p.id === propertyId);
        if (!property) return;
        if (prev.conveyancing.some(c => c.propertyId === propertyId)) {
          showToast("In Conveyancing", "Cannot renovate during conveyancing.", "destructive"); return;
        }
        const cost = getConditionUpgradeCost(property.value, property.condition, targetCondition);
        if (cost <= 0) { showToast("Invalid Upgrade", "Cannot upgrade to this condition.", "destructive"); return; }
        if (prev.cash < cost) { showToast("Insufficient Funds", `Need £${fromPennies(cost).toLocaleString()}`, "destructive"); return; }

        const baseRent = property.baseRent || property.monthlyIncome;
        const newRent = Math.floor(baseRent * getConditionRentMultiplier(targetCondition));

        showToast("🔨 Condition Upgrade!", `${property.name} upgraded to ${targetCondition}. Rent now £${fromPennies(newRent).toLocaleString()}/mo`);
        set({
          cash: prev.cash - cost,
          ownedProperties: prev.ownedProperties.map(p =>
            p.id === propertyId ? { ...p, condition: targetCondition, monthsSinceLastRenovation: 0, monthlyIncome: newRent } : p
          ),
        });
      },

      // ─── MORTGAGES ─────────────────────────
      settleMortgage: (mortgagePropertyId, useCash = false, settlementPropertyId, partialAmount) => {
        const prev = get();
        const mortgage = prev.mortgages.find(m => m.propertyId === mortgagePropertyId);
        if (!mortgage) { showToast("Settlement Failed", "Mortgage not found!", "destructive"); return; }

        if (useCash) {
          if (partialAmount && partialAmount > 0) {
            if (prev.cash < partialAmount) { showToast("Insufficient Cash", `Need £${fromPennies(partialAmount).toLocaleString()}`, "destructive"); return; }
            const newBal = mortgage.remainingBalance - partialAmount;
            if (newBal <= 0) {
              showToast("Mortgage Paid Off!", `Fully paid with £${fromPennies(partialAmount).toLocaleString()}`);
              set({ cash: prev.cash - partialAmount, mortgages: prev.mortgages.filter(m => m.propertyId !== mortgagePropertyId), creditScore: Math.min(850, prev.creditScore + 5) });
            } else {
              showToast("Partial Payment", `Paid £${fromPennies(partialAmount).toLocaleString()}. Remaining: £${fromPennies(newBal).toLocaleString()}`);
              set({ cash: prev.cash - partialAmount, mortgages: prev.mortgages.map(m => m.propertyId === mortgagePropertyId ? { ...m, remainingBalance: newBal } : m) });
            }
          } else {
            if (prev.cash < mortgage.remainingBalance) { showToast("Insufficient Cash", `Need £${fromPennies(mortgage.remainingBalance).toLocaleString()}`, "destructive"); return; }
            showToast("Mortgage Paid Off!", `Paid £${fromPennies(mortgage.remainingBalance).toLocaleString()}`);
            set({ cash: prev.cash - mortgage.remainingBalance, mortgages: prev.mortgages.filter(m => m.propertyId !== mortgagePropertyId), creditScore: Math.min(850, prev.creditScore + 5) });
          }
        } else {
          const settleProp = prev.ownedProperties.find(p => p.id === settlementPropertyId);
          if (!settleProp) { showToast("Settlement Failed", "Property not found!", "destructive"); return; }
          if (settleProp.value < mortgage.remainingBalance) { showToast("Insufficient Value", "Property value too low!", "destructive"); return; }
          const cashFromSale = settleProp.value - mortgage.remainingBalance - SOLICITOR_FEES - Math.round(settleProp.value * ESTATE_AGENT_RATE);
          showToast("Mortgage Settled!", `${settleProp.name} sold. Net: £${fromPennies(cashFromSale).toLocaleString()}`);
          set({
            cash: prev.cash + cashFromSale,
            ownedProperties: prev.ownedProperties.filter(p => p.id !== settlementPropertyId),
            mortgages: prev.mortgages.filter(m => m.propertyId !== mortgagePropertyId),
            tenants: prev.tenants.filter(t => t.propertyId !== settlementPropertyId),
            voidPeriods: prev.voidPeriods.filter(vp => vp.propertyId !== settlementPropertyId),
          });
        }
      },

      remortgageProperty: (propertyId, newLoanAmount, providerId) => {
        const prev = get();
        const property = prev.ownedProperties.find(p => p.id === propertyId);
        const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId);
        if (!property || !provider) { showToast("Remortgage Failed", "Not found!", "destructive"); return; }
        const maxLTV = Math.round(property.value * provider.maxLTV);
        if (newLoanAmount > maxLTV) { showToast("Loan Too Large", `Max: £${fromPennies(maxLTV).toLocaleString()}`, "destructive"); return; }
        const existing = prev.mortgages.find(m => m.propertyId === propertyId);
        const existingBal = existing?.remainingBalance || 0;
        if (newLoanAmount < existingBal) { showToast("Remortgage Failed", "Must cover existing balance!", "destructive"); return; }
        const mortgageFee = Math.round(newLoanAmount * 0.01);
        const totalFees = SOLICITOR_FEES + mortgageFee;
        const cashRaised = newLoanAmount - existingBal - totalFees;
        const rate = (prev.mortgageProviderRates[provider.id] || provider.baseRate) + prev.currentMarketRate - BASE_MARKET_RATE +
          (prev.creditScore < 650 ? 0.01 : 0) + (prev.creditScore < 600 ? 0.015 : 0);
        const monthlyRate = rate / 12;
        const numPayments = 300;
        const monthlyPayment = Math.round(newLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1));
        const newMortgage: Mortgage = {
          id: `${propertyId}_${Date.now()}`, propertyId, principal: newLoanAmount,
          monthlyPayment, remainingBalance: newLoanAmount,
          interestRate: rate, termYears: 25, mortgageType: 'repayment',
          providerId, startDate: Date.now(),
        };
        showToast("Remortgage Complete!", `Cash raised: £${fromPennies(cashRaised).toLocaleString()}`);
        set({
          cash: prev.cash + cashRaised,
          mortgages: existing ? prev.mortgages.map(m => m.propertyId === propertyId ? newMortgage : m) : [...prev.mortgages, newMortgage],
        });
      },

      handleRefinance: (propertyId, newLoanAmount, providerId, termYears, mortgageType) => {
        const prev = get();
        const property = prev.ownedProperties.find(p => p.id === propertyId);
        if (!property) return;
        if (prev.mortgages.some(m => m.collateralPropertyIds?.includes(propertyId))) {
          showToast("Not Allowed", "Part of a portfolio mortgage.", "destructive"); return;
        }
        const existing = prev.mortgages.find(m => m.propertyId === propertyId);
        const currentBal = existing?.remainingBalance || 0;
        const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];
        if (newLoanAmount < currentBal) { showToast("Refinance Failed", "Must cover existing balance!", "destructive"); return; }

        const totalRentalIncome = prev.ownedProperties.reduce((t, p) => t + (prev.tenants.some(tt => tt.propertyId === p.id) ? p.monthlyIncome : 0), 0);
        const existingPayments = prev.mortgages.filter(m => m.propertyId !== propertyId).reduce((s, m) => s + m.monthlyPayment, 0);
        const providerRate = prev.mortgageProviderRates[provider.id] || provider.baseRate;

        const eligibility = calculateMortgageEligibility({
          creditScore: prev.creditScore, loanAmount: fromPennies(newLoanAmount),
          propertyValue: fromPennies(property.value), propertyMonthlyRent: fromPennies(property.monthlyIncome),
          providerBaseRate: providerRate + prev.currentMarketRate - BASE_MARKET_RATE,
          providerMinCreditScore: provider.minCreditScore, providerMaxLTV: provider.maxLTV,
          providerId: provider.id, termYears, mortgageType,
          existingMonthlyMortgagePayments: fromPennies(existingPayments),
          totalRentalIncome: fromPennies(totalRentalIncome - property.monthlyIncome),
          ownedPropertyCount: prev.ownedProperties.length,
        });
        if (!eligibility.eligible) { showToast("Refinance Rejected", eligibility.reason || "Declined", "destructive"); return; }

        const newMortgage: Mortgage = {
          id: `${propertyId}_${Date.now()}`, propertyId, principal: newLoanAmount,
          monthlyPayment: toPennies(eligibility.monthlyPayment), remainingBalance: newLoanAmount,
          interestRate: eligibility.adjustedRate, termYears, mortgageType,
          providerId: provider.id, startDate: Date.now(),
        };
        const cashDelta = newLoanAmount - currentBal;
        showToast("Refinance Complete!", cashDelta > 0 ? `£${fromPennies(cashDelta).toLocaleString()} released.` : `Refinanced for £${fromPennies(newLoanAmount).toLocaleString()}`);
        set({
          cash: prev.cash + cashDelta,
          mortgages: existing ? prev.mortgages.map(m => m.propertyId === propertyId ? newMortgage : m) : [...prev.mortgages, newMortgage],
        });
      },

      handlePortfolioMortgage: (selectedPropertyIds, loanAmount, providerId, termYears, mortgageType) => {
        const prev = get();
        if (prev.mortgages.some(m => m.collateralPropertyIds?.some(id => selectedPropertyIds.includes(id)))) {
          showToast("Cannot Create", "Properties already in a portfolio mortgage.", "destructive"); return;
        }
        const selectedProps = prev.ownedProperties.filter(p => selectedPropertyIds.includes(p.id));
        const totalValue = selectedProps.reduce((s, p) => s + p.value, 0);
        const totalRent = selectedProps.reduce((s, p) => s + p.monthlyIncome, 0);
        const totalCurrentMortgages = prev.mortgages.filter(m => selectedPropertyIds.includes(m.propertyId)).reduce((s, m) => s + m.remainingBalance, 0);

        const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];
        const providerRate = (prev.mortgageProviderRates[provider.id] || provider.baseRate) + 0.005;
        const existingPayments = prev.mortgages.filter(m => !selectedPropertyIds.includes(m.propertyId)).reduce((s, m) => s + m.monthlyPayment, 0);
        const otherIncome = prev.ownedProperties.filter(p => !selectedPropertyIds.includes(p.id)).reduce((t, p) => t + (prev.tenants.some(tt => tt.propertyId === p.id) ? p.monthlyIncome : 0), 0);

        // LTD companies get lower max LTV on commercial mortgages
        let adjustedMaxLTV = provider.maxLTV;
        if (prev.entityType === 'ltd') {
          adjustedMaxLTV = Math.min(adjustedMaxLTV, 0.75);
        }

        const eligibility = calculateMortgageEligibility({
          creditScore: prev.creditScore, loanAmount: fromPennies(loanAmount),
          propertyValue: fromPennies(totalValue), propertyMonthlyRent: fromPennies(totalRent),
          providerBaseRate: providerRate + prev.currentMarketRate - BASE_MARKET_RATE,
          providerMinCreditScore: provider.minCreditScore, providerMaxLTV: adjustedMaxLTV,
          providerId: provider.id, termYears, mortgageType,
          existingMonthlyMortgagePayments: fromPennies(existingPayments),
          totalRentalIncome: fromPennies(otherIncome),
          ownedPropertyCount: prev.ownedProperties.length,
        });
        if (!eligibility.eligible) { showToast("Portfolio Mortgage Rejected", eligibility.reason || "Declined", "destructive"); return; }

        const portfolioMortgage: Mortgage = {
          id: `portfolio_${Date.now()}`, propertyId: `portfolio_${selectedPropertyIds[0] || 'group'}`,
          principal: loanAmount, monthlyPayment: toPennies(eligibility.monthlyPayment),
          remainingBalance: loanAmount, interestRate: eligibility.adjustedRate,
          termYears, mortgageType, providerId: provider.id,
          collateralPropertyIds: [...selectedPropertyIds], startDate: Date.now(),
        };
        const remainingMortgages = prev.mortgages.filter(m => !selectedPropertyIds.includes(m.propertyId));
        const cashDelta = loanAmount - totalCurrentMortgages;
        set({ cash: prev.cash + cashDelta, mortgages: [...remainingMortgages, portfolioMortgage] });
      },

      // ─── OVERDRAFT / CASH ─────────────────
      handleApplyOverdraft: (requestedLimit) => set({ overdraftLimit: requestedLimit }),
      setCash: (newCash) => set({ cash: newCash }),
      setOverdraftUsed: (used) => set({ overdraftUsed: used }),

      // ─── DAMAGE ────────────────────────────
      payDamageWithCash: (damageId, actualCost) => {
        const prev = get();
        const damage = prev.pendingDamages.find(d => d.id === damageId);
        if (!damage) return;
        const cost = actualCost ?? damage.repairCost;
        const currentYear = Math.floor(prev.monthsPlayed / 12);
        const existing = prev.annualRepairCosts.find(a => a.propertyId === damage.propertyId && a.year === currentYear);
        const updatedAnnual = existing
          ? prev.annualRepairCosts.map(a => a.propertyId === damage.propertyId && a.year === currentYear ? { ...a, totalCost: a.totalCost + cost } : a)
          : [...prev.annualRepairCosts, { propertyId: damage.propertyId, year: currentYear, totalCost: cost }];
        const dmgHist = prev.damageHistory.find(dh => dh.propertyId === damage.propertyId);
        const updatedHistory = dmgHist
          ? prev.damageHistory.map(dh => dh.propertyId === damage.propertyId ? { ...dh, lastDamageMonth: prev.monthsPlayed } : dh)
          : [...prev.damageHistory, { propertyId: damage.propertyId, lastDamageMonth: prev.monthsPlayed }];
        showToast("Repairs Paid", `Paid £${fromPennies(cost).toLocaleString()} to repair ${damage.propertyName}`);
        set({ cash: prev.cash - cost, pendingDamages: prev.pendingDamages.filter(d => d.id !== damageId), annualRepairCosts: updatedAnnual, damageHistory: updatedHistory });
      },

      payDamageWithLoan: (damageId, actualCost) => {
        const prev = get();
        const damage = prev.pendingDamages.find(d => d.id === damageId);
        if (!damage) return;
        const cost = actualCost ?? damage.repairCost;
        const currentYear = Math.floor(prev.monthsPlayed / 12);
        const existing = prev.annualRepairCosts.find(a => a.propertyId === damage.propertyId && a.year === currentYear);
        const updatedAnnual = existing
          ? prev.annualRepairCosts.map(a => a.propertyId === damage.propertyId && a.year === currentYear ? { ...a, totalCost: a.totalCost + cost } : a)
          : [...prev.annualRepairCosts, { propertyId: damage.propertyId, year: currentYear, totalCost: cost }];
        const dmgHist = prev.damageHistory.find(dh => dh.propertyId === damage.propertyId);
        const updatedHistory = dmgHist
          ? prev.damageHistory.map(dh => dh.propertyId === damage.propertyId ? { ...dh, lastDamageMonth: prev.monthsPlayed } : dh)
          : [...prev.damageHistory, { propertyId: damage.propertyId, lastDamageMonth: prev.monthsPlayed }];
        showToast("Bank Loan Taken", `Borrowed £${fromPennies(cost).toLocaleString()} for ${damage.propertyName}`, "destructive");
        set({ cash: prev.cash + cost, pendingDamages: prev.pendingDamages.filter(d => d.id !== damageId), annualRepairCosts: updatedAnnual, creditScore: Math.max(300, prev.creditScore - 10), damageHistory: updatedHistory });
      },

      dismissDamage: (damageId) => set(s => ({ pendingDamages: s.pendingDamages.filter(d => d.id !== damageId) })),

      // ─── MARKET ────────────────────────────
      removeAuctionProperty: (propertyId) => set(s => ({
        auctionProperties: s.auctionProperties.filter(p => p.id !== propertyId),
        estateAgentProperties: s.estateAgentProperties.filter(p => p.id !== propertyId),
      })),

      replenishMarket: () => {
        const prev = get();
        const { min, max } = getPropertyValueRangeForLevel(prev.level);
        const TARGET_AUCTION = 5;

        // Build excluded ID set: owned + in-conveyancing + listed for sale
        const excludedIds = new Set<string>([
          ...prev.ownedProperties.map(p => p.id),
          ...prev.conveyancing.map(c => c.propertyId),
          ...prev.propertyListings.map(l => l.propertyId),
        ]);

        // Filter out excluded properties from current market lists immediately
        let auctions = prev.auctionProperties
          .filter(p => !excludedIds.has(p.id))
          .filter(p => p.price >= min && p.price <= max);
        let estate = prev.estateAgentProperties.filter(p => !excludedIds.has(p.id));

        const invalidAuction = prev.auctionProperties
          .filter(p => !excludedIds.has(p.id))
          .filter(p => p.price < min || p.price > max);
        invalidAuction.forEach(p => { if (!estate.find(e => e.id === p.id)) estate.push(p); });

        if (auctions.length < TARGET_AUCTION) {
          const needed = TARGET_AUCTION - auctions.length;
          for (let i = 0; i < needed; i++) {
            const candidate = estate.find(p => p.price >= min && p.price <= max && !auctions.find(a => a.id === p.id));
            if (candidate) {
              auctions.push(candidate);
              estate = estate.filter(e => e.id !== candidate.id);
            } else {
              auctions.push(generateRandomProperty(prev.level));
            }
          }
        }

        const usedIds = new Set([...auctions.map(p => p.id), ...estate.map(p => p.id)]);
        const totalAvailable = auctions.length + estate.length;
        const needed = Math.max(0, 30 - totalAvailable);

        const eligibleProviders = MORTGAGE_PROVIDERS.filter(p => prev.creditScore >= p.minCreditScore);
        const maxLTV = eligibleProviders.length > 0 ? Math.max(...eligibleProviders.map(p => p.maxLTV)) : 0;
        const isAffordable = (p: Property) => {
          const maxMort = Math.round(p.price * maxLTV);
          const sd = p.price <= toPennies(250000) ? Math.round(p.price * 0.03) : Math.round(toPennies(250000) * 0.03 + (p.price - toPennies(250000)) * 0.08);
          const fees = SOLICITOR_FEES + Math.round(p.price * 0.01) + sd;
          return prev.cash >= (p.price - maxMort) + fees;
        };
        const isInRange = (p: Property) => p.price >= min && p.price <= max;
        const affordableCount = estate.filter(p => isInRange(p) && isAffordable(p)).length;

        if (affordableCount < 8) {
          const extra = 8 - affordableCount;
          for (let i = 0; i < extra; i++) {
            const priceFloor = Math.max(toPennies(40000), min);
            const targetPrice = priceFloor + Math.random() * (priceFloor * 0.5);
            const adjusted = Math.max(priceFloor, Math.min(max, Math.floor(targetPrice / 100_000) * 100_000));
            const prop = generateRandomProperty(prev.level);
            prop.price = adjusted;
            prop.value = adjusted;
            prop.monthlyIncome = Math.floor((adjusted * (6 + Math.random() * 9) / 100) / 12);
            if (!usedIds.has(prop.id) && !excludedIds.has(prop.id)) {
              estate.push(prop);
              usedIds.add(prop.id);
            }
          }
        }

        for (let i = 0; i < needed; i++) {
          const candidates = AVAILABLE_PROPERTIES.filter(p =>
            !usedIds.has(p.id) && !excludedIds.has(p.id) && p.price >= min && p.price <= max
          );
          const pick = candidates.length > 0
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : generateRandomProperty(prev.level);
          if (!usedIds.has(pick.id) && !excludedIds.has(pick.id)) {
            estate.push({ ...pick });
            usedIds.add(pick.id);
          }
        }

        set({ auctionProperties: auctions, estateAgentProperties: estate });
      },

      // ─── TENANT CONCERNS ───────────────────
      resolveTenantConcern: (concernId) => {
        const prev = get();
        const concern = prev.tenantConcerns.find(c => c.id === concernId && !c.resolvedMonth);
        if (!concern) return;
        if (prev.cash < concern.resolveCost) {
          showToast("Insufficient Funds", `Need £${fromPennies(concern.resolveCost).toLocaleString()} to resolve.`, "destructive");
          return;
        }
        const updatedTenants = prev.tenants.map(t =>
          t.propertyId === concern.propertyId
            ? { ...t, satisfaction: Math.min(100, t.satisfaction + 8) }
            : t
        );
        showToast("Concern Resolved ✅", `Spent £${fromPennies(concern.resolveCost).toLocaleString()} — tenant happier.`);
        set({
          cash: prev.cash - concern.resolveCost,
          tenants: updatedTenants,
          tenantConcerns: prev.tenantConcerns.map(c =>
            c.id === concernId ? { ...c, resolvedMonth: prev.monthsPlayed } : c
          ),
        });
      },

      dismissTenantConcern: (concernId) => {
        // "Snooze" — keep in feed; satisfaction will decay each month it remains unresolved
        showToast("Concern Snoozed", "It'll keep nagging until resolved.");
      },

      // ─── RESET ─────────────────────────────
      resetGame: () => {
        const fresh = createInitialState();
        set(fresh);
        showToast("Game Reset", "Started fresh with £100K!");
      },
    }),
    {
      name: 'propertyTycoonSave',
      storage: createDebouncedStorage(2000),
      version: 4,
      migrate: (persisted: any, version: number) => {
        if (version < 4) return migrateState(persisted);
        return persisted;
      },
      partialize: (state) => {
        const { clockTick, processMonthEnd, processMarketUpdate, processCounterResponses,
          buyProperty, buyPropertyAtPrice, sellProperty, handleEstateAgentSale, handleAuctionSale,
          listPropertyForSale, cancelPropertyListing, updatePropertyListingPrice,
          setAutoAcceptThreshold, addOfferToListing, rejectPropertyOffer, counterOffer,
          reducePriceOnListing, acceptBuyerCounter, rejectBuyerCounter, selectTenant, removeTenant,
          startRenovation, upgradeCondition, settleMortgage, remortgageProperty, handleRefinance, handlePortfolioMortgage,
          handleApplyOverdraft, setCash, setOverdraftUsed, payDamageWithCash, payDamageWithLoan,
          dismissDamage, removeAuctionProperty, replenishMarket, resetGame, setEntityType,
          resolveTenantConcern, dismissTenantConcern,
          ...data } = state;
        return data;
      },
    }
  )
);

// ─── SELECTORS ────────────────────────────────────────────
export const usePlayerData = () => useGameStore(s => ({
  cash: s.cash, creditScore: s.creditScore, level: s.level,
  experience: s.experience, experienceToNext: s.experienceToNext,
  isBankrupt: s.isBankrupt, overdraftLimit: s.overdraftLimit, overdraftUsed: s.overdraftUsed,
  entityType: s.entityType,
}));

export const useTimeData = () => useGameStore(s => ({
  monthsPlayed: s.monthsPlayed, timeUntilNextMonth: s.timeUntilNextMonth,
}));

export const usePropertyData = () => useGameStore(s => ({
  ownedProperties: s.ownedProperties,
  estateAgentProperties: s.estateAgentProperties,
  auctionProperties: s.auctionProperties,
  propertyListings: s.propertyListings,
  tenants: s.tenants, pendingDamages: s.pendingDamages,
  conveyancing: s.conveyancing,
}));

export const useFinanceData = () => useGameStore(s => ({
  mortgages: s.mortgages, currentMarketRate: s.currentMarketRate,
  mortgageProviderRates: s.mortgageProviderRates,
}));
