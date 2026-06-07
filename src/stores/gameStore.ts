import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  GameState, Property, Mortgage, PropertyTenant, VoidPeriod,
  PropertyListing, PropertyOffer, Renovation,
  PropertyDamage, MacroEconomicEvent, Conveyancing, TaxRecord, TenantEvent,
  EntityType, PropertyCondition, EvictionGround, PendingEviction, PropertyLock,
  DepositDispute, PlanningApplication,
} from '@/types/game';
import type { Tenant } from '@/components/game/tenant-selector';
import { RENOVATION_OPTIONS, type RenovationType } from '@/components/game/renovation-dialog';
import { toPennies, fromPennies } from '@/lib/formatCurrency';
import { createDebouncedStorage } from '@/lib/debouncedSave';
import { playGavel, playLevelUp, playPaper, playConcernChime, playWarning } from '@/lib/sound';
import {
  INITIAL_CASH, EXPERIENCE_BASE, BASE_MARKET_RATE, COUNCIL_TAX_BAND_D,
  CORPORATION_TAX_RATE, SOLICITOR_FEES, ESTATE_AGENT_RATE, AUCTION_SELLER_FEE,
  MORTGAGE_PROVIDERS, AVAILABLE_PROPERTIES, MONTH_DURATION_SECONDS,
  ERC_PERCENT, ERC_WINDOW_MONTHS, LOAN_PRODUCTS, EICR_COST_PENNIES, computeErcRate,
  conditionTierFromScore, scoreFromConditionTier,
  TENANT_WEAR_MULTIPLIER, BASE_CONDITION_DECAY, CONDITION_DECAY_FLOOR,
  CONDITION_TOPUP_PENNIES_PER_POINT_PER_SQFT, MAX_TOPUP_POINTS_PER_MONTH,
  CONCERN_RESOLVE_CONDITION_LIFT,
  getCeilingPrice,
} from '@/lib/engine/constants';
import {
  calculateStampDuty, calculateDTI, fluctuateProviderRates, getInitialProviderRates,
  getPropertyValueRangeForLevel, getMaxPropertiesForLevel, getAvailablePropertyTypes,
  getMaxPropertyValue, getRequiredNetWorth, getFurnitureValuePennies, getFurnishingCostPerSqft,
} from '@/lib/engine/financials';
import { generateRandomProperty, generateMarketProperty, deriveSqft } from '@/lib/engine/market';
import { getUnlockedCities } from '@/lib/engine/cities';
import {
  calculateMortgageEligibility, getMaxLTVForCreditScore, calculateMonthlyPayment as calcPayment,
} from '@/lib/mortgageEligibility';
import {
  calculateIncomeTax, calculateCorporationTax, calculateCGT,
  getConditionRentMultiplier, getDepreciationMonths, getConditionUpgradeCost,
  getConditionValueUplift, projectAnnualTax,
} from '@/lib/engine/taxation';
import { calcTenantRent, getFurnishingRentMultiplier, getConditionRentMultiplierShared } from '@/lib/tenantRent';
import { scaleRenovationCost, scaleRenovationRent, scaleRenovationValue, scaleRenovationForProperty, applyCeilingDiminishingReturns, canUpgradeToPremium, isConditionUpgradeRenovation, isFullyUpgraded, isDeductibleRevenueRenovation } from '@/lib/engine/renovation';
import { getEffectiveProviderRate } from '@/lib/mortgageEligibility';
import { computePlanningApprovalProbability, getEffectiveInternalSqft } from '@/lib/engine/planning';
import { evaluatePortfolioSaleConsent } from '@/lib/portfolioMortgageConsent';
import { gameRandom, seedRng } from '@/lib/rng';
import { runMigrations, CURRENT_VERSION, type Migration } from '@/lib/migrations';
import {
  CHAIN_COLLAPSE_PROB, SUI_GENERIS_PROB, EVICTION_UPHELD_PROB,
  MARKET_DIP_PROB, TENANT_WALKOUT_RISK_PROB,
} from '@/lib/engine/probabilities';

// ─── Helpers ──────────────────────────────────────────────
import { showToast, debit, debitStrict, credit, calcDeposit } from './storeHelpers';
import {
  asNumber, asString,
  sanitizeProperty, sanitizeTenantRecord, sanitizeRenovation,
  sanitizeTenantConcern, mergeConcernsById, sanitizeOffer, sanitizePropertyListing,
} from './sanitizers';
import { createRenovationActions } from './slices/renovationActions';
import { createMarketActions } from './slices/marketActions';
import { createFinancialActions } from './slices/financialActions';
import { createPortfolioActions } from './slices/portfolioActions';
import { createTenantActions } from './slices/tenantActions';
import { createConveyancingActions } from './slices/conveyancingActions';

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
  buyProperty: (property: Property, mortgagePercentage?: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only', fixedTermYears?: number) => void;
  buyPropertyAtPrice: (property: Property, purchasePrice: number, mortgagePercentage?: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only', fixedTermYears?: number) => void;
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
  selectTenant: (propertyId: string, tenant: Tenant, slotIndex?: number) => void;
  applyRentIncrease: (propertyId: string, newRentPennies: number, outcome: 'accepted' | 'counter_accepted' | 'tribunal_landlord' | 'tribunal_tenant', tribunalFeePennies: number, slotIndex?: number) => void;
  evictTenant: (propertyId: string, ground: EvictionGround, slotIndex?: number) => void;
  cancelEviction: (propertyId: string, slotIndex?: number) => void;
  withdrawFromConveyancing: (conveyancingId: string) => void;
  // appealEviction removed — appeals are now tenant-driven & resolved by tick
  disputeDeposit: (disputeId: string) => void;
  dismissDispute: (disputeId: string) => void;
  // Renovations
  startRenovation: (propertyId: string, renovationType: RenovationType) => void;
  upgradeCondition: (propertyId: string, targetCondition: PropertyCondition) => void;
  furnishProperty: (propertyId: string, tier: 'unfurnished' | 'part_furnished' | 'fully_furnished') => void;
  // Planning permission
  submitPlanningApplication: (propertyId: string, renovationType: RenovationType) => void;
  submitBatchPlanningApplications: (propertyId: string, renovationTypes: RenovationType[]) => void;
  acknowledgePlanningDecision: (applicationId: string) => void;
  dismissPlanningRefusal: (applicationId: string) => void;
  clearPlanningRefusals: () => void;
  // Mortgages
  settleMortgage: (mortgagePropertyId: string, useCash?: boolean, settlementPropertyId?: string, partialAmount?: number) => void;
  remortgageProperty: (propertyId: string, newLoanAmount: number, providerId: string) => void;
  handleRefinance: (propertyId: string, newLoanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only', fixedTermYears?: number) => void;
  handlePortfolioMortgage: (selectedPropertyIds: string[], loanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only', fixedTermYears?: number) => { ok: true } | { ok: false; reason: string };
  // Loans
  applyForLoan: (kind: 'personal' | 'business' | 'investor', amount: number, termMonths: number) => void;
  takeBridgingLoan: (propertyId: string, amountPennies: number) => void;
  settleLoan: (loanId: string, partialAmount?: number) => void;
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
  topUpCondition: (propertyId: string, points: number) => void;
  dismissTenantConcern: (concernId: string) => void;
  // Speed
  setGameSpeed: (speed: number) => void;
  // Pause
  togglePause: () => void;
  setPaused: (paused: boolean) => void;
  // Item #10 — pending-transaction approval queue
  approvePendingTransaction: (id: string) => void;
  approveAllPendingTransactions: () => void;
  // Phase 3 #5 — chain-collapse pop-out acknowledgement
  dismissChainCollapseEvent: (id: string) => void;
  dismissAllChainCollapseEvents: () => void;
  // v3 #4 — mortgage / loan payoff modal acknowledgement
  dismissPayoffEvent: (id: string) => void;
  dismissAllPayoffEvents: () => void;
  markEconomicEventsSeen: (ids: string[]) => void;
  // Debt recovery
  sendArrearsToCourt: (propertyId: string, slotIndex?: number) => void;
  issueLetterBeforeAction: (propertyId: string, slotIndex?: number) => void;
  escalateToHighCourt: (caseId: string) => void;
  // Phase 4 #2 — Title-split a converted flat into its own leasehold property
  splitFlatUnit: (propertyId: string, slotIndex: number, groundRentMode: 'peppercorn' | 'percent') => void;
  // Game
  resetGame: () => void;
}

// ─── Initial state ────────────────────────────────────────
function createInitialState(): GameState {
  // v4 #11 — jitter marketValue ±15% so asking ≠ true market on the static catalogue too.
  const withMarketJitter = AVAILABLE_PROPERTIES.map(p => ({
    ...p,
    marketValue: Math.max(toPennies(40_000), Math.round(p.value * (1 + (gameRandom() - 0.5) * 0.30))),
  }));
  const shuffled = [...withMarketJitter].sort(() => gameRandom() - 0.5);
  return {
    _version: CURRENT_VERSION,
    rngSeed: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
    cash: INITIAL_CASH,
    level: 1,
    experience: 0,
    experienceToNext: EXPERIENCE_BASE,
    creditScore: 750, // Start with "Excellent" credit
    isBankrupt: false,
    overdraftLimit: 0,
    overdraftUsed: 0,
    entityType: 'sole_trader',
    entityChosen: false,
    onboardingCompleted: false,
    landlordReputation: 50,
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
    currentLoanRates: { personal: LOAN_PRODUCTS.personal.baseSpread, business: LOAN_PRODUCTS.business.baseSpread },
    monthsPlayed: 0,
    timeUntilNextMonth: MONTH_DURATION_SECONDS,
    gameSpeed: 1,
    isPaused: false,
    lastYearlyGrowth: 0,
    yearlyNetProfit: 0,
    yearlyGrossRent: 0,
    yearlyMortgageInterest: 0,
    yearlyDeductibleExpenses: 0,
    lastCorporationTaxMonth: 0,
    lastGlobalDamageMonth: 0,
    nextEconomicEventMonth: 3 + Math.floor(gameRandom() * 4),
    economicEvents: [],
    tenantEvents: [],
    taxRecords: [],
    totalTaxPaid: 0,
    unusedLosses: 0,
    lossesAppliedThisYear: 0,
    lossesGeneratedThisYear: 0,
    tenantConcerns: [],
    pendingEvictions: [],
    propertyLocks: [],
    depositDisputes: [],
    planningApplications: [],
    tenantHistory: [],
    loans: [],
    pendingPlanningCelebrations: [],
    pendingPlanningRefusals: [],
    arrears: null,
    opsFlashAt: 0,
    reputationLog: [],
    seenEconomicEventIds: [],
    debtRecoveryCases: [],
    projectedTaxPennies: 0,
    projectedTaxStampedMonth: 0,
    pendingTransactions: [],
    chainCollapseEvents: [],
    nextInsuranceDueMonth: 12,
    lastInsuranceWarnedMonth: -1,
    payoffEvents: [],
    goalTarget: 500_000 * 100, // £500k net worth — first explicit endgame target
    goalAchievedAt: undefined,
    seenEpcTutorial: false,
  };
}

// ─── Save migration ───────────────────────────────────────
// Ordered registry consumed by `runMigrations` (src/lib/migrations.ts).
// Each step mutates `persisted` in place; the runner stamps `_version`.
export const migrationSteps: ReadonlyArray<Migration> = [
  {
    from: 1, to: 2, describe: 'pounds → pennies',
    apply: (persisted) => {
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
    },
  },
  {
    from: 2, to: 3, describe: 'add condition / entity / conveyancing / tax fields',
    apply: (persisted) => {
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
      if (persisted.creditScore && persisted.creditScore < 650 && persisted.monthsPlayed < 3) {
        persisted.creditScore = 750;
      }
    },
  },
  { from: 3, to: 4, describe: 'add tenantConcerns (init)', apply: () => {} },
  { from: 4, to: 5, describe: 'tenantConcerns repair', apply: () => {} },
  {
    from: 5, to: 6, describe: 'pendingDamages → tenantConcerns',
    apply: (persisted) => {
      if (Array.isArray(persisted.pendingDamages) && persisted.pendingDamages.length > 0) {
        if (!Array.isArray(persisted.tenantConcerns)) persisted.tenantConcerns = [];
        const monthsPlayed = asNumber(persisted.monthsPlayed);
        persisted.pendingDamages.forEach((d: any) => {
          persisted.tenantConcerns.push({
            id: `concern_damage_${d.id || gameRandom().toString(36).slice(2, 8)}`,
            propertyId: asString(d.propertyId),
            tenantProfile: 'standard',
            category: 'maintenance',
            description: `Repair needed at ${d.propertyName || 'property'}`,
            raisedMonth: monthsPlayed,
            resolveCost: asNumber(d.repairCost),
            satisfactionPenaltyIfIgnored: 5,
            source: 'damage',
          });
        });
      }
      persisted.pendingDamages = [];
    },
  },
  {
    from: 6, to: 7, describe: "Renters' Rights: deposit + eviction fields",
    apply: (persisted) => {
      if (Array.isArray(persisted.tenants)) {
        persisted.tenants = persisted.tenants.map((t: any) => ({
          ...t,
          depositHeld: typeof t?.depositHeld === 'number' ? t.depositHeld : 0,
        }));
      }
      if (!Array.isArray(persisted.pendingEvictions)) persisted.pendingEvictions = [];
      if (!Array.isArray(persisted.propertyLocks)) persisted.propertyLocks = [];
    },
  },
  {
    from: 7, to: 8, describe: 'add depositDisputes',
    apply: (persisted) => {
      if (!Array.isArray(persisted.depositDisputes)) persisted.depositDisputes = [];
    },
  },
  {
    from: 8, to: 9, describe: 'add planningApplications',
    apply: (persisted) => {
      if (!Array.isArray(persisted.planningApplications)) persisted.planningApplications = [];
    },
  },
  {
    from: 9, to: 10, describe: 'add tenantHistory',
    apply: (persisted) => {
      if (!Array.isArray(persisted.tenantHistory)) persisted.tenantHistory = [];
    },
  },
  {
    from: 10, to: 11, describe: 'per-year tax accumulators',
    apply: (persisted) => {
      if (typeof persisted.yearlyGrossRent !== 'number') persisted.yearlyGrossRent = 0;
      if (typeof persisted.yearlyMortgageInterest !== 'number') persisted.yearlyMortgageInterest = 0;
      if (typeof persisted.yearlyDeductibleExpenses !== 'number') persisted.yearlyDeductibleExpenses = 0;
    },
  },
  {
    from: 11, to: 12, describe: 'entityChosen flag',
    apply: (persisted) => {
      if (typeof persisted.entityChosen !== 'boolean') persisted.entityChosen = true;
    },
  },
  {
    from: 12, to: 13, describe: 'currentLoanRates',
    apply: (persisted) => {
      if (!persisted.currentLoanRates || typeof persisted.currentLoanRates !== 'object') {
        persisted.currentLoanRates = { personal: LOAN_PRODUCTS.personal.baseSpread, business: LOAN_PRODUCTS.business.baseSpread };
      }
    },
  },
  {
    from: 13, to: 14, describe: 'landlordReputation + onboardingCompleted',
    apply: (persisted) => {
      if (typeof persisted.landlordReputation !== 'number') persisted.landlordReputation = 50;
      if (typeof persisted.onboardingCompleted !== 'boolean') persisted.onboardingCompleted = true;
    },
  },
  {
    from: 14, to: 15, describe: 'rngSeed for deterministic PRNG',
    apply: (persisted) => {
      if (typeof persisted.rngSeed !== 'number' || !Number.isFinite(persisted.rngSeed)) {
        persisted.rngSeed = Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;
      }
    },
  },
  {
    from: 15, to: 16, describe: 'goalTarget + seenEpcTutorial (Phase 3 #4, #6)',
    apply: (persisted) => {
      if (typeof persisted.goalTarget !== 'number' || !Number.isFinite(persisted.goalTarget)) {
        persisted.goalTarget = 500_000 * 100;
      }
      if (typeof persisted.seenEpcTutorial !== 'boolean') {
        persisted.seenEpcTutorial = false;
      }
    },
  },
  {
    from: 16, to: 17, describe: 'Phase 4 #3 — backfill `city` on every property/listing',
    apply: (persisted) => {
      const arrs = ['ownedProperties', 'estateAgentProperties', 'auctionProperties'];
      arrs.forEach(k => {
        if (Array.isArray(persisted[k])) {
          persisted[k] = persisted[k].map((p: any) => ({
            ...p,
            city: p?.city || 'middlesbrough',
          }));
        }
      });
    },
  },
];


function migrateState(persisted: any): GameState {
  const initial = createInitialState();
  runMigrations(persisted, migrationSteps, CURRENT_VERSION);



  // Always backfill tenantConcerns regardless of version — defensive against schema drift
  if (!Array.isArray(persisted.tenantConcerns)) {
    persisted.tenantConcerns = [];
  }

  // Backfill gameSpeed for older saves
  if (typeof persisted.gameSpeed !== 'number' || !Number.isFinite(persisted.gameSpeed)) {
    persisted.gameSpeed = 1;
  }
  // Pause never persists as true — UNLESS pending approval queue still has items (item #10).
  persisted.isPaused = (Array.isArray(persisted.pendingTransactions) && persisted.pendingTransactions.length > 0)
    || (Array.isArray(persisted.chainCollapseEvents) && persisted.chainCollapseEvents.length > 0)
    || (Array.isArray(persisted.payoffEvents) && persisted.payoffEvents.length > 0);

  if (!Array.isArray(persisted.reputationLog)) persisted.reputationLog = [];
  if (!Array.isArray(persisted.seenEconomicEventIds)) persisted.seenEconomicEventIds = [];
  if (!Array.isArray(persisted.debtRecoveryCases)) persisted.debtRecoveryCases = [];
  if (!Array.isArray(persisted.pendingTransactions)) persisted.pendingTransactions = [];
  if (!Array.isArray(persisted.payoffEvents)) persisted.payoffEvents = [];
  if (typeof persisted.projectedTaxPennies !== 'number') persisted.projectedTaxPennies = 0;
  if (typeof persisted.projectedTaxStampedMonth !== 'number') persisted.projectedTaxStampedMonth = 0;
  // v3 #2 — annual insurance scheduling
  if (typeof persisted.nextInsuranceDueMonth !== 'number') {
    persisted.nextInsuranceDueMonth = (persisted.monthsPlayed || 0) + 12;
  }
  if (typeof persisted.lastInsuranceWarnedMonth !== 'number') persisted.lastInsuranceWarnedMonth = -1;
  // Phase 3 #4/#6 — defensive backfill (also handled by migration v15→v16, kept for safety).
  if (typeof persisted.goalTarget !== 'number' || !Number.isFinite(persisted.goalTarget)) {
    persisted.goalTarget = 500_000 * 100;
  }
  if (typeof persisted.seenEpcTutorial !== 'boolean') persisted.seenEpcTutorial = false;

  const arrayKeys: Array<keyof GameState> = [
    'ownedProperties', 'estateAgentProperties', 'auctionProperties', 'propertyListings',
    'tenants', 'voidPeriods', 'renovations', 'pendingDamages', 'annualRepairCosts',
    'damageHistory', 'conveyancing', 'mortgages', 'economicEvents', 'tenantEvents',
    'taxRecords', 'tenantConcerns', 'pendingEvictions', 'propertyLocks', 'depositDisputes',
    'planningApplications', 'tenantHistory', 'loans', 'debtRecoveryCases',
  ];

  arrayKeys.forEach((key) => {
    if (!Array.isArray(persisted[key])) {
      persisted[key] = initial[key];
    }
  });

  if (!persisted.mortgageProviderRates || typeof persisted.mortgageProviderRates !== 'object' || Array.isArray(persisted.mortgageProviderRates)) {
    persisted.mortgageProviderRates = initial.mortgageProviderRates;
  }

  persisted.ownedProperties = persisted.ownedProperties.map(sanitizeProperty);
  persisted.estateAgentProperties = persisted.estateAgentProperties.map(sanitizeProperty);
  persisted.auctionProperties = persisted.auctionProperties.map(sanitizeProperty);
  persisted.tenants = persisted.tenants.map((t: any) => sanitizeTenantRecord(t, asNumber(persisted.monthsPlayed)));
  persisted.renovations = persisted.renovations.map(sanitizeRenovation);
  // Backfill startMonth/completionMonth on legacy renovation records using the
  // dialog's "days" duration (~30 days/month). Floor at 1 month remaining.
  {
    const monthsPlayed = asNumber(persisted.monthsPlayed);
    persisted.renovations = persisted.renovations.map((r: any) => {
      if (typeof r.completionMonth === 'number' && typeof r.startMonth === 'number') return r;
      const durationDays = asNumber(r?.type?.duration, 30);
      const totalMonths = Math.max(1, Math.round(durationDays / 30));
      // For legacy in-flight renos we don't know the original startMonth; assume
      // they're roughly halfway done so the player isn't punished by the migration.
      const remaining = Math.max(1, Math.round(totalMonths / 2));
      return {
        ...r,
        startMonth: typeof r.startMonth === 'number' ? r.startMonth : monthsPlayed - (totalMonths - remaining),
        completionMonth: typeof r.completionMonth === 'number' ? r.completionMonth : monthsPlayed + remaining,
      };
    });
  }
  persisted.tenantConcerns = persisted.tenantConcerns.map(sanitizeTenantConcern);
  // Drop orphaned concerns whose property no longer exists in the portfolio
  // (cleans up bugged saves where damage was raised against a sold property).
  {
    const ownedIds = new Set((persisted.ownedProperties || []).map((p: any) => p?.id).filter(Boolean));
    persisted.tenantConcerns = persisted.tenantConcerns.filter((c: any) => c?.propertyId && ownedIds.has(c.propertyId));
  }
  persisted.propertyListings = persisted.propertyListings.map(sanitizePropertyListing);

  // Migrate old save fields
  if (persisted.estateAgentPropertyIds && !persisted.estateAgentProperties) {
    persisted.estateAgentProperties = AVAILABLE_PROPERTIES.filter((p: Property) => persisted.estateAgentPropertyIds.includes(p.id));
  }
  if (persisted.auctionPropertyIds && !persisted.auctionProperties) {
    persisted.auctionProperties = AVAILABLE_PROPERTIES.filter((p: Property) => persisted.auctionPropertyIds.includes(p.id));
  }

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
          const debited = debit(prev, incorporationFee);
          if (!debited) {
            showToast("Insufficient Funds", "Need £1,000 (even with overdraft) to incorporate.", "destructive");
            return;
          }
          set({ entityType: type, entityChosen: true, cash: debited.cash, overdraftUsed: debited.overdraftUsed });
          showToast("Incorporated! 🏢", `You are now trading as a Limited Company. Mortgage interest is fully tax-deductible.${debited.usedOverdraft > 0 ? ` (£${fromPennies(debited.usedOverdraft).toLocaleString()} via overdraft.)` : ''}`);
        } else {
          set({ entityType: type, entityChosen: true });
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
          // Phase 4 #13 — initialise commercial FRI lease + use class on
          // settlement. Preserve `type` explicitly so commercial never silently
          // flips to residential.
          const isCommercial = prop.type === 'commercial';
          const commercialLeaseInit = isCommercial
            ? {
                fri: true,
                termMonths: 60,
                startMonth: newMonthNumber,
                expiryMonth: newMonthNumber + 60,
              }
            : undefined;
          const useClassInit = isCommercial
            ? (gameRandom() < SUI_GENERIS_PROB ? 'sui_generis' as const : 'E' as const)
            : undefined;
          const purchased: Property = {
            ...prop, owned: true, price: paid,
            type: prop.type,
            value: settledValue,
            // marketValue tracks the listed value so the asking-side signal stays honest.
            marketValue: Math.max(settledValue, paid),
            yield: effectiveYield,
            monthlyIncome: effectiveRent,
            lastRentIncrease: newMonthNumber, baseRent: effectiveRent,
            ...(commercialLeaseInit ? { commercialLease: commercialLeaseInit } : {}),
            ...(useClassInit ? { useClass: useClassInit } : {}),
          };
          newOwnedProperties.push(purchased);

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
          const risk = (t.tenant as any).defaultRisk ?? 5;
          // Phase 4 #11 — high-risk tenants double their arrears probability.
          const isHighRisk = t.tenant.profile === 'risky' || risk >= 30;
          const baseP = Math.min(0.25, Math.max(0.002, (risk / 100) * 0.4));
          const monthlyP = isHighRisk ? Math.min(0.45, baseP * 2) : baseP;
          if (gameRandom() < monthlyP) {
            const key = `${t.propertyId}::${t.slotIndex ?? 0}`;
            missedTenantKeys.add(key);
            missedRentPropertyIds.add(t.propertyId);
            const prop = prev.ownedProperties.find(p => p.id === t.propertyId);
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

        // Expenses
        const mortgagePayments = newMortgages.reduce((s, m) => s + m.monthlyPayment, 0);
        const councilTax = newOwnedProperties.reduce((total, property) => {
          const hasTenant = newTenants.some(t => t.propertyId === property.id);
          const isInVoid = newVoidPeriods.some(vp =>
            vp.propertyId === property.id && currentTime >= vp.startDate && currentTime <= vp.endDate
          );
          return total + (!hasTenant || isInVoid ? COUNCIL_TAX_BAND_D : 0);
        }, 0);
        // v3 #2 — landlord insurance is billed ANNUALLY (0.4% of property value)
        // and routed through the pending-approval queue. We still compute the
        // monthly accrual here for cashflow projections; the actual debit
        // happens once per 12 months below.
        const monthlyInsuranceAccrual = newOwnedProperties.reduce((total, property) => {
          return total + Math.floor((property.value * 0.004) / 12);
        }, 0);
        const insurance = monthlyInsuranceAccrual; // kept for accrual/projection only
        // Phase 4 #2 — Leasehold service charge + ground rent (monthly slice of annual cost).
        const leaseholdCosts = newOwnedProperties.reduce((total, property) => {
          if (!property.isLeasehold) return total;
          const sc = property.serviceChargePctAnnual
            ? Math.floor((property.value * property.serviceChargePctAnnual) / 12)
            : 0;
          const gr = property.groundRentPennies ? Math.floor(property.groundRentPennies / 12) : 0;
          return total + sc + gr;
        }, 0);
        const totalExpenses = mortgagePayments + councilTax + insurance + leaseholdCosts;
        const netIncome = monthlyIncome - totalExpenses;

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
            .filter((c: any) => !c.resolvedMonth)
            .map((c: any) => c.propertyId),
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
        const newTenantHistory: import('@/types/game').TenantDeparture[] = [...((prev as any).tenantHistory || [])];
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
          const lastWarn = (t as any).lastWalkoutWarningMonth ?? -Infinity;
          if (newMonthNumber - lastWarn < 3) return t;
          const property = updatedOwnedProperties.find(p => p.id === t.propertyId);
          showToast(
            "⚠️ Tenant at risk of leaving",
            `${t.tenant.name}${property ? ` at ${property.name}` : ''} is critically unhappy (satisfaction ${Math.round(t.satisfaction)}). Address concerns or they may walk.`,
            "destructive",
          );
          return { ...t, lastWalkoutWarningMonth: newMonthNumber } as any;
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
            .filter((c: any) => c.status === 'selling' || c.status === 'buying')
            .map((c: any) => c.propertyId)
        );
        const ownedIdsForConcerns = new Set(updatedOwnedProperties.map(p => p.id));

        newTenants.forEach(t => {
          const property = updatedOwnedProperties.find(p => p.id === t.propertyId);
          if (!property) return;
          if (!ownedIdsForConcerns.has(t.propertyId)) return;
          if (inConveyancingIds.has(t.propertyId)) return;
          if ((existingActiveByProp.get(t.propertyId) || 0) >= 2) return;

          const conditionScore = property.conditionScore ?? scoreFromConditionTier(property.condition);
          let chance = 0.035;
          if (property.condition === 'dilapidated') chance += 0.04;
          else if (property.condition === 'premium') chance -= 0.015;
          // Repair-bar coupling: low score → significantly more concerns
          if (conditionScore < 30) chance += 0.04;
          else if (conditionScore < 50) chance += 0.02;
          else if (conditionScore >= 80) chance -= 0.015;
          if (t.tenant.profile === 'premium') chance += 0.015;
          else if (t.tenant.profile === 'risky') chance -= 0.025;
          // 1-month grace after move-in — settling-in period, no surprise concerns
          if ((t.moveInMonth ?? 0) >= newMonthNumber - 1) return;
          chance = Math.max(0.005, chance);

          if (gameRandom() >= chance) return;

          // When repair bar is low, bias toward maintenance/mould/safety templates
          const pool = conditionScore < 50
            ? CONCERN_TEMPLATES.filter(t => t.category === 'maintenance' || t.category === 'mould' || t.category === 'safety')
            : CONCERN_TEMPLATES;
          const tpl = pool[Math.floor(gameRandom() * pool.length)];
          const desc = tpl.descriptions[Math.floor(gameRandom() * tpl.descriptions.length)];
          const [lo, hi] = tpl.baseCostPct;
          const pct = lo + gameRandom() * (hi - lo);
          const cost = Math.max(toPennies(150), Math.min(toPennies(3000), Math.round(property.value * pct)));
          const penaltyMod = t.tenant.profile === 'premium' ? 1 : t.tenant.profile === 'budget' ? 0.7 : 1;
          newConcerns.push({
            id: `concern_${newMonthNumber}_${t.propertyId}_${gameRandom().toString(36).slice(2, 7)}`,
            propertyId: t.propertyId,
            tenantProfile: t.tenant.profile as any,
            category: tpl.category,
            description: desc,
            raisedMonth: newMonthNumber,
            resolveCost: cost,
            satisfactionPenaltyIfIgnored: Math.max(1, Math.round(tpl.penalty * penaltyMod * 0.5)),
          });
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
            tenantProfile: t.tenant.profile as any,
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
              tenantProfile: t.tenant.profile as any,
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
        updatedOwnedProperties = updatedOwnedProperties.map(p => {
          const lease = p.commercialLease;
          if (!lease || p.type !== 'commercial') return p;
          const monthsToExpiry = lease.expiryMonth - newMonthNumber;
          if (monthsToExpiry === 6 && lease.renewalWarnedMonth !== newMonthNumber) {
            showToast(
              "Commercial Lease Renewal Due",
              `${p.name} — FRI lease expires in 6 months (month ${lease.expiryMonth}). Negotiate renewal or expect a void.`,
            );
            return { ...p, commercialLease: { ...lease, renewalWarnedMonth: newMonthNumber } };
          }
          return p;
        });


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
            const resolved = { ...app, status: app.approved ? 'approved' as const : 'refused' as const };
            const propName = prev.ownedProperties.find(p => p.id === app.propertyId)?.name || 'property';
            if (app.approved) {
              newlyApprovedPlanningIds.push(app.id);
              playLevelUp();
              showToast(
                "Planning Approved! ✅",
                `${app.renovationName} on ${propName} cleared the LPA. Start work from the renovation menu.`,
              );
              flashOps();
            } else {
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
            }
            return resolved;
          }
          return app;
        });
        // Drop refused applications only after the player has acknowledged them
        // via the refusal dialog (id removed from pendingPlanningRefusals).
        const refusalQueue = new Set<string>([
          ...((prev as any).pendingPlanningRefusals || []),
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
        const loanDebtForLevel = (((prev as any).loans || []) as Array<{ remainingBalance?: number }>)
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

        // ── Commercial triennial rent reviews ──
        // Every 36 months from the tenant's last review (or move-in), commercial
        // leases reset to current market rent — bypassing the 3% Section-13 cap.
        let commercialReviewCount = 0;
        const commercialUplift = 0.0927; // 3 years compounded at 3%
        newTenants = newTenants.map(t => {
          const property = updatedOwnedProperties.find(p => p.id === t.propertyId);
          if (!property || property.type !== 'commercial') return t;
          const baseline = t.lastRentReviewMonth ?? t.moveInMonth ?? 0;
          if (newMonthNumber - baseline < 36) return t;
          const newBase = Math.floor((property.baseRent || property.monthlyIncome) * (1 + commercialUplift));
          updatedOwnedProperties = updatedOwnedProperties.map(p =>
            p.id === t.propertyId ? { ...p, baseRent: newBase, monthlyIncome: Math.floor(p.monthlyIncome * (1 + commercialUplift)), lastRentIncrease: newMonthNumber } : p
          );
          commercialReviewCount++;
          return { ...t, lastRentReviewMonth: newMonthNumber };
        });
        if (commercialReviewCount > 0) {
          showToast(
            "Commercial rent review",
            `${commercialReviewCount} commercial lease${commercialReviewCount === 1 ? '' : 's'} reviewed to market rate (+${(commercialUplift * 100).toFixed(1)}%).`
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
          const rentPennies = (t as any).rentPennies || (prop?.monthlyIncome ?? 0);
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
        let newTaxRecords = [...prev.taxRecords];
        let newTotalTaxPaid = prev.totalTaxPaid;
        let newUnusedLosses = (prev as any).unusedLosses ?? 0;
        let newLossesApplied = (prev as any).lossesAppliedThisYear ?? 0;
        let newLossesGenerated = (prev as any).lossesGeneratedThisYear ?? 0;

        if (isApril && currentTaxYear > lastTaxYear && accumulatedGrossRent > 0) {
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
          // Reset all yearly accumulators
          finalYearlyProfit = 0;
          finalYearlyGrossRent = 0;
          finalYearlyMortgageInterest = 0;
          finalYearlyDeductibleExpenses = 0;
          lastCorpTaxMonth = newMonthNumber;
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
        const nextInsuranceDueMonth = (prev as any).nextInsuranceDueMonth ?? 12;
        const lastInsuranceWarnedMonth = (prev as any).lastInsuranceWarnedMonth ?? -1;
        let updatedNextInsuranceDueMonth = nextInsuranceDueMonth;
        let updatedLastInsuranceWarnedMonth = lastInsuranceWarnedMonth;
        const annualInsurancePennies = newOwnedProperties.reduce(
          (t, p) => t + Math.floor(p.value * 0.004),
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

        const totalOutflows = mortgagePayments; // tax/insurance/council go via pending approval queue
        const totalInflows = monthlyIncome + sellCash + conveyancingCashReturn + evictionDepositRefund + arrearsRepaidThisMonth;
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
        const allPrevLoans: import('@/types/game').Loan[] = ((prev as any).loans || []);
        const prevLoans = allPrevLoans.filter((l: any) => l.kind !== 'bridging');
        const prevBridges = allPrevLoans.filter((l: any) => l.kind === 'bridging');
        const updatedLoans: import('@/types/game').Loan[] = [];
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
        if (inDistress) {
          const months = (newArrears?.monthsBehind ?? 0) + 1;
          if (!newArrears) {
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
          // Recovered — clear arrears
          if (newArrears) {
            showToast("✅ Arrears Cleared", "Cashflow back in the black — court action paused.");
          }
          newArrears = null;
        }

        // Final bankruptcy gate: post-forced-sale net worth still negative
        if (!isBankrupt && netWorthFinal < 0 && updatedOwnedProperties.length === 0 && exhausted) {
          isBankrupt = true;
        }
        if (isBankrupt && !prev.isBankrupt) {
          showToast("💀 BANKRUPTCY!", "Court ordered insolvency — game over.", "destructive");
        }

        // ── Tax projection warning — fire one month before April collection ──
        let newProjectedTaxPennies = (prev as any).projectedTaxPennies ?? 0;
        let newProjectedTaxStampedMonth = (prev as any).projectedTaxStampedMonth ?? 0;
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
        const prevCases = ((prev as any).debtRecoveryCases || []) as import('@/types/game').DebtRecoveryCase[];
        const resolvedCases: import('@/types/game').DebtRecoveryCase[] = [];
        const updatedCases = prevCases.map(c => {
          if (c.status !== 'in_court' || newMonthNumber < c.resolveMonth) return c;
          const predetermined = ((c as any)._predeterminedStatus || 'recovered') as 'recovered' | 'partial' | 'unrecoverable';
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
              'success' as any,
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
            showToast("⚖️ HCE Recovered", `High Court Enforcement recovered £${fromPennies(recovered).toLocaleString()} from ${c.tenantName}.`, 'success' as any);
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
            ...((s as any).pendingPlanningCelebrations || []),
            ...newlyApprovedPlanningIds,
          ],
          pendingPlanningRefusals: [
            ...((s as any).pendingPlanningRefusals || []),
            ...newlyRefusedPlanningIds,
          ],
          tenantHistory: newTenantHistory.slice(-100),
          loans: updatedLoans,
          landlordReputation: Math.max(0, Math.min(100, (prev.landlordReputation ?? 50) + reputationDelta)),
          reputationLog: [...((prev as any).reputationLog || []), ...reputationLogEntries].slice(-40),
          opsFlashAt: opsFlashAtNew,
          debtRecoveryCases: trimmedCases,
          projectedTaxPennies: newProjectedTaxPennies,
          projectedTaxStampedMonth: newProjectedTaxStampedMonth,
          pendingTransactions: [
            ...((s as any).pendingTransactions || []),
            ...newPendingTransactions,
          ],
          nextInsuranceDueMonth: updatedNextInsuranceDueMonth,
          lastInsuranceWarnedMonth: updatedLastInsuranceWarnedMonth,
          payoffEvents: newPayoffEvents.length > 0
            ? [...(((s as any).payoffEvents) || []), ...newPayoffEvents]
            : ((s as any).payoffEvents || []),
          // Item #10 + Phase 3 #5 + v3 #4 + Phase 4 #20: pending debits,
          // chain-collapse events, payoff acknowledgements, planning decisions,
          // and macro-economic event pop-ups all auto-pause the clock until
          // the player dismisses them.
          isPaused:
            (((s as any).pendingTransactions?.length || 0) + newPendingTransactions.length > 0)
            || newChainCollapseEvents.length > 0
            || newPayoffEvents.length > 0
            || (((s as any).payoffEvents?.length) || 0) > 0
            || newlyApprovedPlanningIds.length > 0
            || newlyRefusedPlanningIds.length > 0
            || (((s as any).pendingPlanningCelebrations?.length) || 0) > 0
            || (((s as any).pendingPlanningRefusals?.length) || 0) > 0
            || economicEvents.length !== prev.economicEvents.length
            || (economicEvents.length > 0 && economicEvents[economicEvents.length - 1]?.month === newMonthNumber)
              ? true
              : s.isPaused,
          // Phase 3 #4 — stamp goal achievement once net worth crosses the target.
          goalAchievedAt: (() => {
            const existing = (s as any).goalAchievedAt;
            if (typeof existing === 'number' && existing > 0) return existing;
            const target = ((s as any).goalTarget ?? 0) as number;
            if (target > 0 && netWorthFinal >= target) {
              showToast("🏆 Goal Reached!", `You hit £${fromPennies(target).toLocaleString()} net worth. Set a new target or keep building.`);
              return newMonthNumber;
            }
            return existing;
          })(),
        } as any));
      },

      // ─── Monthly orchestrator (Phase 3 follow-up: extracted to slice) ─
      ...createOrchestratorActions(set as any, get as any),

      // ─── BUY PROPERTY ──────────────────────
      // ─── Portfolio buy/sell/listings (Phase 3c Outstanding Improvements: extracted to slice)
      ...createPortfolioActions(set as any, get as any),



      // ─── TENANTS (Phase 3d Outstanding Improvements: extracted to slice) ─
      ...createTenantActions(set as any, get as any),
      // ─── CONVEYANCING (Phase 3e: withdrawal extracted; monthly progression remains in processMarketUpdate) ─
      ...createConveyancingActions(set as any, get as any),

      // ─── RENOVATIONS ──────────────────────
      // ─── Renovation + planning actions (Phase 5 follow-up: extracted to slice)
      ...createRenovationActions(set as any, get as any),
      // ─── Market replenishment (Phase 3a Outstanding Improvements: extracted to slice)
      ...createMarketActions(set as any, get as any),

      // ─── MORTGAGES ─────────────────────────
      ...createFinancialActions(set as any, get as any),

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

      // replenishMarket — extracted to ./slices/marketActions.ts (Phase 3a).

      // ─── TENANT CONCERNS ───────────────────
      resolveTenantConcern: (concernId) => {
        const prev = get();
        const concerns = prev.tenantConcerns || [];
        const concern = concerns.find(c => c.id === concernId && !c.resolvedMonth);
        if (!concern) return;
        const debited = debit(prev, concern.resolveCost);
        if (!debited) {
          showToast("Insufficient Funds", `Need £${fromPennies(concern.resolveCost).toLocaleString()} (even with overdraft) to resolve.`, "destructive");
          return;
        }
        const updatedTenants = prev.tenants.map(t =>
          t.propertyId === concern.propertyId
            ? { ...t, satisfaction: Math.min(100, t.satisfaction + 8) }
            : t
        );
        // Repair-bar lift on the property — varies by concern category.
        const lift = CONCERN_RESOLVE_CONDITION_LIFT[concern.category] ?? 3;
        const updatedOwned = prev.ownedProperties.map(p => {
          if (p.id !== concern.propertyId) return p;
          const score = Math.max(0, Math.min(100, (p.conditionScore ?? scoreFromConditionTier(p.condition)) + lift));
          return { ...p, conditionScore: score, condition: conditionTierFromScore(score) };
        });

        // Damage-sourced concerns also update annual repair cap and 48-month cooldown
        let updatedAnnual = prev.annualRepairCosts;
        let updatedHistory = prev.damageHistory;
        if (concern.source === 'damage') {
          const currentYear = Math.floor(prev.monthsPlayed / 12);
          const existing = prev.annualRepairCosts.find(a => a.propertyId === concern.propertyId && a.year === currentYear);
          updatedAnnual = existing
            ? prev.annualRepairCosts.map(a =>
                a.propertyId === concern.propertyId && a.year === currentYear
                  ? { ...a, totalCost: a.totalCost + concern.resolveCost }
                  : a
              )
            : [...prev.annualRepairCosts, { propertyId: concern.propertyId, year: currentYear, totalCost: concern.resolveCost }];
          const dmgHist = prev.damageHistory.find(dh => dh.propertyId === concern.propertyId);
          updatedHistory = dmgHist
            ? prev.damageHistory.map(dh =>
                dh.propertyId === concern.propertyId
                  ? { ...dh, lastDamageMonth: prev.monthsPlayed }
                  : dh
              )
            : [...prev.damageHistory, { propertyId: concern.propertyId, lastDamageMonth: prev.monthsPlayed }];
          showToast("🔧 Damage Repaired", `Spent £${fromPennies(concern.resolveCost).toLocaleString()} on repairs.`);
        } else {
          showToast("Concern Resolved ✅", `Spent £${fromPennies(concern.resolveCost).toLocaleString()} — tenant happier.`);
        }

        set({
          cash: debited.cash,
          overdraftUsed: debited.overdraftUsed,
          tenants: updatedTenants,
          ownedProperties: updatedOwned,
          annualRepairCosts: updatedAnnual,
          damageHistory: updatedHistory,
          tenantConcerns: concerns.map(c =>
            c.id === concernId ? { ...c, resolvedMonth: prev.monthsPlayed } : c
          ),
        });
      },

      topUpCondition: (propertyId, pointsRequested) => {
        const prev = get();
        const property = prev.ownedProperties.find(p => p.id === propertyId);
        if (!property) return;
        const currentScore = property.conditionScore ?? scoreFromConditionTier(property.condition);
        const headroomToCap = Math.max(0, 100 - currentScore);
        const monthlyUsed = (property.conditionLastTopUpMonth === prev.monthsPlayed)
          ? (property.conditionTopUpPointsThisMonth ?? 0) : 0;
        const monthlyHeadroom = Math.max(0, MAX_TOPUP_POINTS_PER_MONTH - monthlyUsed);
        const pts = Math.max(0, Math.min(pointsRequested, headroomToCap, monthlyHeadroom));
        if (pts <= 0) {
          showToast("Nothing to do", "Already at the cap (100) or this month's spend limit reached.");
          return;
        }
        const sqft = Math.max(400, property.internalSqft ?? 900);
        const cost = Math.max(1, Math.round(CONDITION_TOPUP_PENNIES_PER_POINT_PER_SQFT * sqft * pts / 100));
        const debited = debit(prev, cost);
        if (!debited) {
          showToast("Insufficient Funds", `Need £${fromPennies(cost).toLocaleString()} (even with overdraft) for ${pts} points of repairs.`, "destructive");
          return;
        }
        const newScore = Math.min(100, currentScore + pts);
        const newMonthlyUsed = monthlyUsed + pts;
        const updated = prev.ownedProperties.map(p =>
          p.id !== propertyId ? p : ({
            ...p,
            conditionScore: newScore,
            condition: conditionTierFromScore(newScore),
            conditionLastTopUpMonth: prev.monthsPlayed,
            conditionTopUpPointsThisMonth: newMonthlyUsed,
          })
        );

        // Crossing into 80+ absorbs lingering soft (non-damage) maintenance/mould concerns
        let absorbedConcerns = 0;
        let updatedConcerns = prev.tenantConcerns;
        if (newScore >= 80 && currentScore < 80) {
          updatedConcerns = (prev.tenantConcerns || []).map(c => {
            if (
              c && !c.resolvedMonth && c.propertyId === propertyId &&
              c.source !== 'damage' &&
              (c.category === 'maintenance' || c.category === 'mould')
            ) {
              absorbedConcerns += 1;
              return { ...c, resolvedMonth: prev.monthsPlayed };
            }
            return c;
          });
        }

        set({
          cash: debited.cash,
          overdraftUsed: debited.overdraftUsed,
          ownedProperties: updated,
          tenantConcerns: updatedConcerns,
        });
        const absorbedSuffix = absorbedConcerns > 0
          ? ` Cleared ${absorbedConcerns} lingering concern${absorbedConcerns > 1 ? 's' : ''}.`
          : '';
        showToast("🛠 Repairs", `${property.name}: +${pts} condition (£${fromPennies(cost).toLocaleString()}).${absorbedSuffix}`);
      },

      dismissTenantConcern: (concernId) => {
        // "Snooze" — keep in feed; satisfaction will decay each month it remains unresolved
        showToast("Concern Snoozed", "It'll keep nagging until resolved.");
      },

      // ─── PHASE 4 #2 — Title-split a converted flat ────────────────────
      splitFlatUnit: (propertyId: string, slotIndex: number, groundRentMode: 'peppercorn' | 'percent') => {
        const prev = get();
        const parent = prev.ownedProperties.find(p => p.id === propertyId);
        if (!parent) return;
        if (parent.subtype !== 'flats') {
          showToast("Cannot Split", "Only converted-flat properties can have units split off.", "destructive");
          return;
        }
        const units = Math.max(1, parent.subtypeUnits ?? 1);
        if (units <= 0) return;
        // Solicitor fee for title split (legal work to create separate leasehold title).
        const splitFee = SOLICITOR_FEES;
        if (!debit(prev, splitFee)) {
          showToast("Insufficient Funds", `Need £${fromPennies(splitFee).toLocaleString()} for solicitor fees to split the title.`, "destructive");
          return;
        }

        const perUnitValue = Math.round(parent.value / units);
        // Sum-of-parts > whole post-split: bump each unit value by 8%.
        const splitUnitValue = Math.round(perUnitValue * 1.08);
        // Remaining house value adjusts down by the original pro-rata (slightly less than 1/N).
        const remainingValue = Math.max(0, parent.value - perUnitValue);

        const slotTenant = prev.tenants.find(t => t.propertyId === propertyId && t.slotIndex === slotIndex);
        const slotRentPennies = slotTenant?.rentPennies ?? Math.round(parent.monthlyIncome / units);

        const serviceChargePct = 0.02 + gameRandom() * 0.03; // 2–5%/yr of value
        const groundRentPennies = groundRentMode === 'peppercorn'
          ? 1000 // £10/yr
          : Math.round(splitUnitValue * 0.005); // 0.5%/yr of value

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

        // Reindex remaining tenants on the parent (slots above split move down by 1).
        const reindexedTenants = prev.tenants
          .filter(t => !(t.propertyId === propertyId && t.slotIndex === slotIndex))
          .map(t => {
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


      resetGame: () => {
        const fresh = createInitialState();
        set(fresh);
        // Clear the tutorial localStorage marker so the entity picker can show
        // again on a fresh game without requiring a hard refresh.
        try { window.localStorage.removeItem('pm_onboarding_done'); } catch { /* noop */ }
        showToast("Game Reset", "Started fresh with £100K!");
      },

      setGameSpeed: (speed) => {
        const clamped = Math.max(0.25, Math.min(8, speed));
        set({ gameSpeed: clamped });
      },

      togglePause: () => {
        set({ isPaused: !get().isPaused });
      },

      setPaused: (paused: boolean) => {
        set({ isPaused: !!paused });
      },

      approvePendingTransaction: (id: string) => {
        const s = get() as any;
        const queue: import('@/types/game').PendingTransaction[] = Array.isArray(s.pendingTransactions) ? s.pendingTransactions : [];
        const tx = queue.find(t => t.id === id);
        if (!tx) return;
        const result = debit({ cash: s.cash, overdraftUsed: s.overdraftUsed, overdraftLimit: s.overdraftLimit }, tx.amount);
        if (!result) {
          showToast("Insufficient funds", `Cannot approve £${fromPennies(tx.amount).toLocaleString()} — raise cash or extend overdraft first.`, 'destructive');
          return;
        }
        const remaining = queue.filter(t => t.id !== id);
        set({
          cash: result.cash,
          overdraftUsed: result.overdraftUsed,
          pendingTransactions: remaining,
          isPaused: remaining.length === 0 ? false : s.isPaused,
        } as any);
        if (result.usedOverdraft > 0) {
          showToast("Approved (overdraft used)", `£${fromPennies(tx.amount).toLocaleString()} paid — £${fromPennies(result.usedOverdraft).toLocaleString()} via overdraft.`);
        } else {
          showToast("Approved", `£${fromPennies(tx.amount).toLocaleString()} — ${tx.description}`);
        }
      },

      approveAllPendingTransactions: () => {
        const s = get() as any;
        const queue: import('@/types/game').PendingTransaction[] = Array.isArray(s.pendingTransactions) ? s.pendingTransactions : [];
        if (queue.length === 0) return;
        let cash = s.cash;
        let overdraftUsed = s.overdraftUsed;
        const remaining: import('@/types/game').PendingTransaction[] = [];
        let approvedAmount = 0;
        let usedOverdraftTotal = 0;
        for (const tx of queue) {
          const result = debit({ cash, overdraftUsed, overdraftLimit: s.overdraftLimit }, tx.amount);
          if (!result) {
            remaining.push(tx);
            continue;
          }
          cash = result.cash;
          overdraftUsed = result.overdraftUsed;
          approvedAmount += tx.amount;
          usedOverdraftTotal += result.usedOverdraft;
        }
        set({
          cash,
          overdraftUsed,
          pendingTransactions: remaining,
          isPaused: remaining.length === 0 ? false : s.isPaused,
        } as any);
        if (remaining.length > 0) {
          showToast(
            "Partial approval",
            `Approved £${fromPennies(approvedAmount).toLocaleString()}. ${remaining.length} item(s) skipped — insufficient funds.`,
            'destructive',
          );
        } else {
          showToast("All approved", `£${fromPennies(approvedAmount).toLocaleString()} paid${usedOverdraftTotal > 0 ? ` (£${fromPennies(usedOverdraftTotal).toLocaleString()} via overdraft)` : ''}.`);
        }
      },

      dismissChainCollapseEvent: (id: string) => {
        const s = get();
        const remaining = (s.chainCollapseEvents || []).filter(e => e.id !== id);
        const stillHasPending = ((s as any).pendingTransactions?.length || 0) > 0;
        set({
          chainCollapseEvents: remaining,
          isPaused: remaining.length === 0 && !stillHasPending ? false : s.isPaused,
        } as any);
      },

      dismissAllChainCollapseEvents: () => {
        const s = get();
        const stillHasPending = ((s as any).pendingTransactions?.length || 0) > 0;
        set({
          chainCollapseEvents: [],
          isPaused: !stillHasPending ? false : s.isPaused,
        } as any);
      },

      // v3 #4 — payoff acknowledgement
      dismissPayoffEvent: (id: string) => {
        const s = get() as any;
        const remaining = ((s.payoffEvents || []) as any[]).filter(e => e.id !== id);
        set({ payoffEvents: remaining } as any);
      },
      dismissAllPayoffEvents: () => {
        set({ payoffEvents: [] } as any);
      },





      markEconomicEventsSeen: (ids: string[]) => {
        if (!ids || ids.length === 0) return;
        const s = get() as any;
        const prevSeen: string[] = Array.isArray(s.seenEconomicEventIds) ? s.seenEconomicEventIds : [];
        const next = Array.from(new Set([...prevSeen, ...ids])).slice(-50);
        set({ seenEconomicEventIds: next } as any);
      },

      sendArrearsToCourt: (propertyId: string, slotIndex: number = 0) => {
        const s = get();
        const tenant = s.tenants.find(t => t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex);
        const prop = s.ownedProperties.find(p => p.id === propertyId);
        if (!tenant || !prop) {
          showToast("Cannot file claim", "Tenant or property not found.", "destructive");
          return;
        }
        const arrearsMonths = tenant.arrearsMonths ?? 0;
        const arrearsPennies = tenant.arrearsPennies ?? 0;
        if (arrearsMonths < 2 || arrearsPennies <= 0) {
          showToast("Not eligible", "Tenant needs at least 2 months of arrears to file in court.", "destructive");
          return;
        }
        const existing = (s.debtRecoveryCases || []).find(c => c.propertyId === propertyId && c.tenantName === tenant.tenant.name && c.status === 'in_court');
        if (existing) {
          showToast("Already filed", "A court case is already in progress for this tenant.", "destructive");
          return;
        }
        const FILING_FEE = 32500; // £325
        const debited = debit(s, FILING_FEE);
        if (!debited) {
          showToast("Insufficient funds", "You need £325 (incl. overdraft) to file the claim.", "destructive");
          return;
        }
        // Pre-roll outcome at filing time so the player can't reload-scum.
        // Phase 4 #19: a Letter Before Action issued within the last 6 months
        // skews the roll toward 'recovered' (+12pp) and away from 'unrecoverable'.
        const lbaBonus = (tenant.letterBeforeActionMonth !== undefined
          && s.monthsPlayed - tenant.letterBeforeActionMonth <= 6) ? 0.12 : 0;
        const roll = gameRandom();
        const recoveredCutoff = 0.55 + lbaBonus;
        const partialCutoff = 0.85 + (lbaBonus * 0.5);
        const status: 'recovered' | 'partial' | 'unrecoverable' =
          roll < recoveredCutoff ? 'recovered' : roll < partialCutoff ? 'partial' : 'unrecoverable';
        const resolveMonth = s.monthsPlayed + 6 + Math.floor(gameRandom() * 7); // 6–12 months
        const newCase: import('@/types/game').DebtRecoveryCase = {
          id: `dr_${propertyId}_${slotIndex}_${s.monthsPlayed}_${gameRandom().toString(36).slice(2, 6)}`,
          propertyId,
          propertyName: prop.name,
          tenantName: tenant.tenant.name,
          originalArrearsPennies: arrearsPennies,
          filedMonth: s.monthsPlayed,
          resolveMonth,
          status: 'in_court' as const,
          recoveryFeePct: 0.25,
        };
        // Stash the pre-rolled outcome on the case for the resolver — we hide it from UI by
        // attaching a private field. Use namespaced key to avoid type pollution.
        (newCase as any)._predeterminedStatus = status;

        // Clear the tenant's arrears on the books — the debt is now being chased by the agency.
        const newTenants = s.tenants.map(t =>
          t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex
            ? { ...t, arrearsMonths: 0, arrearsPennies: 0 }
            : t,
        );
        set({
          cash: debited.cash,
          overdraftUsed: debited.overdraftUsed,
          tenants: newTenants,
          debtRecoveryCases: [...(s.debtRecoveryCases || []), newCase],
          opsFlashAt: Date.now(),
        } as any);
        showToast("⚖️ Claim filed", `£325 filing fee paid. Expect a decision in 6–12 months for ${tenant.tenant.name} (£${fromPennies(arrearsPennies).toLocaleString()} owed).`);
      },

      // Phase 4 #19: cheap pre-CCJ warning shot. Adds a +12 percentage-point
      // bias to the CCJ recovery outcome if filed within 6 months.
      issueLetterBeforeAction: (propertyId, slotIndex = 0) => {
        const s = get();
        const tenant = s.tenants.find(t => t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex);
        if (!tenant) { showToast("Cannot send letter", "Tenant not found.", "destructive"); return; }
        if ((tenant.arrearsMonths ?? 0) < 1) {
          showToast("Not needed", "Tenant has no arrears.", "destructive"); return;
        }
        if (tenant.letterBeforeActionMonth !== undefined) {
          showToast("Already sent", "A Letter Before Action has already been issued.", "destructive"); return;
        }
        const FEE = 5000; // £50
        const debited = debit(s, FEE);
        if (!debited) { showToast("Insufficient funds", "Need £50 (incl. overdraft) to issue the letter.", "destructive"); return; }
        set({
          cash: debited.cash,
          overdraftUsed: debited.overdraftUsed,
          tenants: s.tenants.map(t =>
            t.propertyId === propertyId && (t.slotIndex ?? 0) === slotIndex
              ? { ...t, letterBeforeActionMonth: s.monthsPlayed }
              : t,
          ),
        });
        showToast("📨 Letter Before Action sent", `Formal demand issued to ${tenant.tenant.name}. CCJ filings within 6 months get a recovery boost.`);
      },

      // Phase 4 #19: escalate a CCJ that came back partial / unrecoverable to
      // High Court Enforcement Officers. Fee = £71 + 7.5% of original debt.
      // Pre-rolled 40% chance to recover the residual after 3 months.
      escalateToHighCourt: (caseId) => {
        const s = get();
        const cases = (s as any).debtRecoveryCases || [];
        const idx = cases.findIndex((c: any) => c.id === caseId);
        if (idx < 0) { showToast("Case not found", "Cannot escalate.", "destructive"); return; }
        const c = cases[idx];
        if (c.status !== 'partial' && c.status !== 'unrecoverable') {
          showToast("Not eligible", "Only partial / unrecoverable CCJs can be escalated to HCE.", "destructive"); return;
        }
        if (c.escalatedToHighCourtMonth !== undefined) {
          showToast("Already escalated", "This case is already with the High Court.", "destructive"); return;
        }
        const fee = 7100 + Math.round(c.originalArrearsPennies * 0.075);
        const debited = debit(s, fee);
        if (!debited) { showToast("Insufficient funds", `Need £${fromPennies(fee).toLocaleString()} (incl. overdraft).`, "destructive"); return; }
        const residual = Math.max(0, c.originalArrearsPennies - (c.netRecoveredPennies ?? 0));
        const willRecover = gameRandom() < 0.4;
        const hceExpected = willRecover ? Math.round(residual * (0.7 + gameRandom() * 0.2)) : 0;
        const updated = [...cases];
        updated[idx] = {
          ...c,
          escalatedToHighCourtMonth: s.monthsPlayed,
          hceExpectedRecoveryPennies: hceExpected,
          hceResolveMonth: s.monthsPlayed + 3,
          hceResolved: false,
        };
        set({
          cash: debited.cash,
          overdraftUsed: debited.overdraftUsed,
          debtRecoveryCases: updated,
        } as any);
        showToast("⚖️ Escalated to High Court", `£${fromPennies(fee).toLocaleString()} HCE fee paid. Decision in 3 months.`);
      },

    }),
    {
      name: 'propertyTycoonSave',
      storage: createDebouncedStorage(2000),
      version: CURRENT_VERSION,
      migrate: (persisted: any, _version: number) => {
        // Always run migrateState — idempotent and repairs any stale field shape
        const migrated = migrateState(persisted);
        if (typeof migrated.rngSeed === 'number') seedRng(migrated.rngSeed);
        return migrated;
      },
      merge: (persistedState: any, currentState) => {
        // Zustand only calls migrate() on version mismatch; merge() hardens hydration for
        // malformed current-version saves so missing fields can't blank the app.
        if (!persistedState || typeof persistedState !== 'object') {
          return currentState;
        }

        try {
          const merged = {
            ...currentState,
            ...migrateState(persistedState),
          };
          if (typeof merged.rngSeed === 'number') seedRng(merged.rngSeed);
          return merged;
        } catch {
          return currentState;
        }
      },
      partialize: (state) => {
        // Generically strip all function fields (actions). This is more robust
        // than maintaining a hand-rolled destructure list — adding a new action
        // to the store no longer risks bloating the persisted save.
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(state)) {
          if (typeof value !== 'function') out[key] = value;
        }
        return out as any;
      },

    }
  )
);

// ─── SELECTORS ────────────────────────────────────────────
// Composite selectors return fresh object identities every render, which would
// cause every subscriber to re-render on every tick. `useShallow` (zustand v5)
// performs a shallow-equality check on the returned object so re-renders only
// fire when one of the picked fields actually changes — critical for keeping
// the dashboard smooth at 4× game speed.
import { useShallow } from 'zustand/react/shallow';

export const usePlayerData = () => useGameStore(useShallow(s => ({
  cash: s.cash, creditScore: s.creditScore, level: s.level,
  experience: s.experience, experienceToNext: s.experienceToNext,
  isBankrupt: s.isBankrupt, overdraftLimit: s.overdraftLimit, overdraftUsed: s.overdraftUsed,
  entityType: s.entityType,
})));

export const useTimeData = () => useGameStore(useShallow(s => ({
  monthsPlayed: s.monthsPlayed, timeUntilNextMonth: s.timeUntilNextMonth,
})));

export const usePropertyData = () => useGameStore(useShallow(s => ({
  ownedProperties: s.ownedProperties,
  estateAgentProperties: s.estateAgentProperties,
  auctionProperties: s.auctionProperties,
  propertyListings: s.propertyListings,
  tenants: s.tenants, pendingDamages: s.pendingDamages,
  conveyancing: s.conveyancing,
})));

export const useFinanceData = () => useGameStore(useShallow(s => ({
  mortgages: s.mortgages, currentMarketRate: s.currentMarketRate,
  mortgageProviderRates: s.mortgageProviderRates,
})));


// ─── RNG bootstrap ────────────────────────────────────────
// Seed mulberry32 from the persisted/initial rngSeed so all gameRandom()
// call sites are deterministic from store init. Re-seeded by persist.migrate
// / persist.merge after hydration completes.
{
  const s = useGameStore.getState();
  if (typeof s.rngSeed === 'number') seedRng(s.rngSeed);
}
