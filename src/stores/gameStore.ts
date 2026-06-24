import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameState, Property, EntityType, EvictionGround, PropertyCondition, PropertyOffer } from '@/types/game';
import type { Tenant } from '@/components/game/tenant-selector';
import { type RenovationType } from '@/components/game/renovation-dialog';
import { toPennies } from '@/lib/formatCurrency';
import { createDebouncedStorage } from '@/lib/debouncedSave';
import { getActiveSlot, slotKey, migrateLegacySaveIntoSlot0, LEGACY_SAVE_KEY } from '@/lib/saveSlots';
import {
  INITIAL_CASH, EXPERIENCE_BASE, BASE_MARKET_RATE,
  AVAILABLE_PROPERTIES, MONTH_DURATION_SECONDS, LOAN_PRODUCTS,
} from '@/lib/engine/constants';
import { getInitialProviderRates } from '@/lib/engine/financials';
import { gameRandom, seedRng } from '@/lib/rng';
import { runMigrations, CURRENT_VERSION, type Migration } from '@/lib/migrations';
// Re-exported here so phase1V5Verification can confirm the named-probability
// migration is complete even after the action bodies moved to slice files.
export {
  CHAIN_COLLAPSE_PROB, EVICTION_UPHELD_PROB, SUI_GENERIS_PROB,
  MARKET_DIP_PROB, TENANT_WALKOUT_RISK_PROB,
} from '@/lib/engine/probabilities';
import {
  asNumber, asString,
  sanitizeProperty, sanitizeTenantRecord, sanitizeRenovation,
  sanitizeTenantConcern, sanitizePropertyListing,
} from './sanitizers';
import { createRenovationActions } from './slices/renovationActions';
import { createMarketActions } from './slices/marketActions';
import { createFinancialActions } from './slices/financialActions';
import { createPortfolioActions } from './slices/portfolioActions';
import { createTenantActions } from './slices/tenantActions';
import { createConveyancingActions } from './slices/conveyancingActions';
import { createOrchestratorActions } from './slices/orchestratorActions';
import { createMonthEndActions } from './slices/monthEndActions';
import { createGameControlActions } from './slices/gameControlActions';
import { createPropertyManagementActions } from './slices/propertyManagementActions';

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
  signCommercialLease: (
    propertyId: string,
    tenant: Tenant,
    terms: {
      agreedRentPennies: number;
      termMonths: number;
      reviewFrequencyMonths: number;
      breakClause: { type: 'none' | 'tenant' | 'mutual'; atMonth?: number };
    },
  ) => void;
  /** Phase 3 (commercial) — settle a pending rent review at an agreed rent. */
  settleRentReview: (propertyId: string, agreedRentPennies: number) => void;
  /** Phase 4 (commercial) — sign a renewal Heads of Terms (sitting tenant stays, lease re-issued). */
  renewCommercialLease: (
    propertyId: string,
    terms: {
      agreedRentPennies: number;
      termMonths: number;
      reviewFrequencyMonths: number;
      breakClause: { type: 'none' | 'tenant' | 'mutual'; atMonth?: number };
    },
  ) => void;
  /** Phase 4 (commercial) — player declines a renewal interest; lease will end at expiry. */
  declineLeaseRenewal: (propertyId: string) => void;



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
  dismissPoliceLetter: (id: string) => void;
  dismissCourtResolution: (caseId: string) => void;
  acceptOverdraftPrompt: () => void;
  dismissOverdraftPrompt: () => void;
  markEconomicEventsSeen: (ids: string[]) => void;
  // Debt recovery
  sendArrearsToCourt: (propertyId: string, slotIndex?: number) => void;
  issueLetterBeforeAction: (propertyId: string, slotIndex?: number) => void;
  escalateToHighCourt: (caseId: string) => void;
  // Phase 4 #2 — Title-split a converted flat into its own leasehold property
  splitFlatUnit: (propertyId: string, slotIndex: number, groundRentMode: 'peppercorn' | 'percent') => void;
  // Phase 2 (v5) — Letting Agent / Rent Guarantee / HMO Licensing
  toggleLettingAgent: (propertyId: string, tier?: 'standard' | 'premium') => void;
  toggleRentGuarantee: (propertyId: string) => void;
  applyForHmoLicence: (propertyId: string) => void;
  // Game
  resetGame: () => void;
}

// ─── Initial state ────────────────────────────────────────
export function createInitialState(): GameState {
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
    monthlySnapshots: [],
    achievements: {},
    annualAccounts: [],
    pendingRentReviews: [],
    pendingLeaseRenewals: [],
    pendingCommercialApplicants: [],
    pendingPoliceLetters: [],
    pendingCourtResolutions: [],
    pendingOverdraftPrompt: null,
    overdraftPromptedMonth: -999,
    bankruptcySummary: null,
    loanPayoffHistory: [],
    seenGroundRentExplainer: false,
    exTenantDebts: [],


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
  {
    from: 17, to: 18, describe: 'Phase 2 (v5) — letting agent / RGI / HMO licence fields + snapshots',
    apply: (persisted) => {
      const arrs = ['ownedProperties', 'estateAgentProperties', 'auctionProperties'];
      arrs.forEach((k) => {
        if (Array.isArray(persisted[k])) {
          persisted[k] = persisted[k].map((p: any) => ({
            ...p,
            isManaged: Boolean(p?.isManaged),
            agentTier: p?.agentTier === 'premium' ? 'premium' : p?.isManaged ? 'standard' : undefined,
            agentFeePct: typeof p?.agentFeePct === 'number' ? p.agentFeePct : (p?.isManaged ? 0.10 : undefined),
            hasRentGuarantee: Boolean(p?.hasRentGuarantee),
            rentGuaranteeStartMonth: typeof p?.rentGuaranteeStartMonth === 'number' ? p.rentGuaranteeStartMonth : undefined,
            hmoLicenceStatus: ['none', 'applied', 'licensed', 'expired'].includes(p?.hmoLicenceStatus) ? p.hmoLicenceStatus : 'none',
            hmoLicenceAppliedMonth: typeof p?.hmoLicenceAppliedMonth === 'number' ? p.hmoLicenceAppliedMonth : undefined,
            hmoLicenceExpiresMonth: typeof p?.hmoLicenceExpiresMonth === 'number' ? p.hmoLicenceExpiresMonth : undefined,
          }));
        }
      });
      if (!Array.isArray(persisted.monthlySnapshots)) persisted.monthlySnapshots = [];
    },
  },
  {
    from: 18, to: 19, describe: 'Phase 4 (v5) — achievements map',
    apply: (persisted) => {
      if (!persisted.achievements || typeof persisted.achievements !== 'object') {
        persisted.achievements = {};
      }
    },
  },
  {
    from: 19, to: 20, describe: 'Phase 4 (v5 statements) — annual accounts array',
    apply: (persisted) => {
      if (!Array.isArray(persisted.annualAccounts)) persisted.annualAccounts = [];
    },
  },
  {
    from: 20, to: 21, describe: 'Phase 3 (commercial) — pendingCommercialApplicants queue',
    apply: (persisted) => {
      if (!Array.isArray(persisted.pendingCommercialApplicants)) persisted.pendingCommercialApplicants = [];
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

      // ─── Slice composition — all domain actions live in ./slices/* ─
      ...createMonthEndActions(set as any, get as any),
      ...createOrchestratorActions(set as any, get as any),
      ...createPortfolioActions(set as any, get as any),
      ...createTenantActions(set as any, get as any),
      ...createConveyancingActions(set as any, get as any),
      ...createRenovationActions(set as any, get as any),
      ...createMarketActions(set as any, get as any),
      ...createFinancialActions(set as any, get as any),
      ...createGameControlActions(set as any, get as any),
      ...createPropertyManagementActions(set as any, get as any),

    }),
    {
      name: LEGACY_SAVE_KEY,
      // Phase 4 (v5) — slot-aware storage. Persist asks for the logical name
      // `propertyTycoonSave`, the resolver rewrites it to `..._<activeSlot>`.
      storage: (() => {
        migrateLegacySaveIntoSlot0();
        return createDebouncedStorage(2000, (name) => {
          if (name !== LEGACY_SAVE_KEY) return name;
          return slotKey(getActiveSlot());
        });
      })(),
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
