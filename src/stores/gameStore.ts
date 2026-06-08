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
import { createOrchestratorActions } from './slices/orchestratorActions';
import { createMonthEndActions } from './slices/monthEndActions';

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

      // ─── MONTH END (Outstanding Improvements Phase 1: extracted to slice) ─
      ...createMonthEndActions(set as any, get as any),

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
