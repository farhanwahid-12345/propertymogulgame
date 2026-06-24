// Centralized game types - all monetary values stored as pennies (integers)
import type { Tenant } from "@/components/game/tenant-selector";
import type { RenovationType } from "@/components/game/renovation-dialog";

// Property condition tiers
export type PropertyCondition = 'dilapidated' | 'standard' | 'premium';

// Entity type for taxation
export type EntityType = 'sole_trader' | 'ltd';

// Conveyancing status
export type ConveyancingStatus = 'buying' | 'selling';

export interface Conveyancing {
  id: string;
  propertyId: string;
  propertyName: string;
  status: ConveyancingStatus;
  startMonth: number;
  completionMonth: number; // 1-3 months after start
  purchasePrice?: number; // pennies (for buying)
  salePrice?: number; // pennies (for selling)
  mortgageData?: {
    amount: number; // pennies
    providerId: string;
    termYears: number;
    mortgageType: 'repayment' | 'interest-only';
    monthlyPayment: number; // pennies
    interestRate: number;
    /** 0 = SVR/tracker, 2/5/10 = initial fixed-rate term in years. */
    fixedTermYears?: number;
  };
  cashHeld: number; // pennies - cash locked in conveyancing
  isAuction?: boolean;
  buyerOffer?: any; // for selling via estate agent
  /** Snapshot of the yield shown at the estate agent at offer-time —
   *  preserved so the realised yield on completion matches the label. */
  advertisedYield?: number;
  /** Snapshot of the advertised monthly rent (pennies) at offer-time. */
  advertisedMonthlyIncome?: number;
  /** Snapshot of property.type at offer time. Prevents commercial → residential
   *  flip when the source listing is no longer in market lists at settlement. */
  propertyType?: "residential" | "commercial" | "luxury";
}

export interface Property {
  id: string;
  name: string;
  type: "residential" | "commercial" | "luxury";
  price: number; // pennies
  value: number; // pennies
  neighborhood: string;
  monthlyIncome: number; // pennies
  owned?: boolean;
  marketTrend: "up" | "down" | "stable";
  mortgageRemaining?: number; // pennies
  marketValue?: number; // pennies
  yield?: number; // percentage (not monetary)
  lastRentIncrease?: number;
  baseRent?: number; // pennies
  lastTenantChange?: number;
  // Condition & depreciation
  condition: PropertyCondition;
  monthsSinceLastRenovation: number;
  // Sizing — optional on legacy entries, derived on display when missing
  internalSqft?: number;
  plotSqft?: number;
  // Conversion subtype set by post-purchase renovations
  subtype?: 'standard' | 'hmo' | 'flats' | 'multi-let';
  /** IDs of renovation types completed on this property (one-shot per type). */
  completedRenovationIds?: string[];
  /** Map of renovation typeId → in-game month it completed (for cooldown gating). */
  renovationCompletionMonths?: Record<string, number>;
  /** For conversions: number of HMO rooms or flat units chosen at conversion time. */
  subtypeUnits?: number;
  /** Cumulative renovation spend on this property (pennies). */
  totalRenovationSpendPennies?: number;
  /** Cumulative capital improvement spend (extensions/conversions) — added to CGT base on sale. */
  capitalImprovementsPennies?: number;
  /** Furnishing tier — affects rent multiplier and tenant pool. Defaults to unfurnished. */
  furnishingTier?: 'unfurnished' | 'part_furnished' | 'fully_furnished';
  /** Months remaining before furnishings depreciate back to unfurnished. */
  furnishingMonthsRemaining?: number;
  /** EPC energy rating A–G. Defaults derived from condition for legacy saves. */
  epcRating?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
  /** monthsPlayed snapshot of last EICR (electrical safety) check. */
  lastEicrMonth?: number;
  /** Continuous condition score 0–100. Replaces the discrete condition tier;
   *  the legacy `condition` field is now derived from this each tick. */
  conditionScore?: number;
  /** monthsPlayed snapshot of the last repair-bar top-up — used to throttle spam. */
  conditionLastTopUpMonth?: number;
  /** Sum of repair-bar points purchased in the current month (caps spam). */
  conditionTopUpPointsThisMonth?: number;
  /** Phase 4 #15a — commercial use class. Defaults to 'E' (retail/office) when unset. */
  useClass?: 'E' | 'sui_generis';
  /** Phase 4 #13 — commercial FRI lease metadata. Only populated on commercial lets. */
  commercialLease?: {
    /** Full Repairing & Insuring — tenant covers maintenance + insurance. */
    fri: boolean;
    /** Fixed term length in months (typically 60 or 120). */
    termMonths: number;
    /** In-game month the lease started. */
    startMonth: number;
    /** In-game month the lease expires (startMonth + termMonths). */
    expiryMonth: number;
    /** monthsPlayed snapshot when 6-month renewal warning was last surfaced. */
    renewalWarnedMonth?: number;
    /** Phase 1 — months between contractual upward-only rent reviews (typically 60). */
    reviewFrequencyMonths: number;
    /** Phase 1 — tenant/mutual break clause. `atMonth` is the in-game month it can be exercised. */
    breakClause: { type: 'none' | 'tenant' | 'mutual'; atMonth?: number };
    /** Phase 1 — condition score (0–100) recorded at lease commencement (used at expiry dilapidations check). */
    conditionScoreAtLeaseStart: number;
    /** Phase 1 — final headline rent agreed with the tenant, in pennies. */
    negotiatedRentPennies: number;
    /** Phase 4 — set when the tenant has declined to renew; lease will terminate at expiry. */
    endingAtExpiry?: boolean;
  };
  /** Phase 3 — sitting tenant attached to a market listing. Transferred to
   *  the player's tenants list when the property completes conveyancing. */
  sittingTenant?: Tenant;

  /** Phase 5 #16 — auction lot is missing kitchen/bathroom or otherwise
   *  uninhabitable. Standard BTL mortgages are refused; only bridging finance
   *  can complete the purchase until the property is renovated. */
  needsRefurb?: boolean;
  /** Phase 4 #3 — city this property belongs to. Defaults to 'middlesbrough'. */
  city?: 'middlesbrough' | 'leeds' | 'manchester' | 'london';
  /** Phase 4 #2 — id of the parent house this flat was split out of (leasehold flats only). */
  titleSplitOf?: string;
  /** Phase 4 #2 — slot index this flat occupied in its parent before splitting. */
  flatUnitId?: number;
  /** Phase 4 #2 — leasehold flag. Triggers monthly service charge + ground rent. */
  isLeasehold?: boolean;
  /** Phase 4 #2 — annual service charge as a % of value (2–5%). Decimal e.g. 0.03. */
  serviceChargePctAnnual?: number;
  /** Phase 4 #2 — fixed annual ground rent (pennies). Peppercorn = 1000 (£10). */
  groundRentPennies?: number;
  /** Phase 8 #20 — id of the freehold property the ground rent is payable to. If
   *  the recipient is still in `ownedProperties`, ground rent is a wash (net zero). */
  groundRentRecipientId?: string;
  // ─── Phase 2 (v5) — Letting Agent ─────────────────────────
  /** True when a letting agent manages this property. Auto-resolves concerns; deducts fee from rent. */
  isManaged?: boolean;
  /** Agent service tier. Premium = higher fee, faster concern resolution. */
  agentTier?: 'standard' | 'premium';
  /** Decimal fee on collected rent (e.g. 0.10 = 10%). */
  agentFeePct?: number;
  // ─── Phase 2 (v5) — Rent Guarantee Insurance ──────────────
  /** True when an RGI policy is active. 3% premium; pays out on arrears / void. */
  hasRentGuarantee?: boolean;
  /** monthsPlayed snapshot when policy was taken out (30-day waiting period). */
  rentGuaranteeStartMonth?: number;
  // ─── Phase 2 (v5) — HMO Licensing ─────────────────────────
  /** HMO licence status. Only meaningful when subtype === 'hmo'. */
  hmoLicenceStatus?: 'none' | 'applied' | 'licensed' | 'expired';
  /** monthsPlayed snapshot when licence application was filed. */
  hmoLicenceAppliedMonth?: number;
  /** monthsPlayed when licence expires (typically applied + 60). */
  hmoLicenceExpiresMonth?: number;
  /** Phase 3 — monthsPlayed when this commercial property became vacant.
   *  Drives the agent-applicant drip mechanic. Cleared when a tenant is placed. */
  commercialVacantSinceMonth?: number;
}

/** Phase 2 (v5) — monthly portfolio performance snapshot for the Bank chart. */
export interface PortfolioSnapshot {
  month: number;
  netWorth: number;          // pennies
  cashflow: number;          // pennies (net of month)
  rentalIncome: number;      // pennies
  mortgagePayments: number;  // pennies
  propertyCount: number;
}


// Tenant concerns — issues raised that decay satisfaction if ignored
export type ConcernCategory = 'maintenance' | 'noise' | 'mould' | 'appliance' | 'safety';
export interface TenantConcern {
  id: string;
  propertyId: string;
  tenantProfile: 'premium' | 'standard' | 'budget' | 'risky';
  category: ConcernCategory;
  description: string;
  raisedMonth: number;
  resolveCost: number; // pennies
  satisfactionPenaltyIfIgnored: number; // -X per month unresolved
  resolvedMonth?: number;
  /** 'damage' = real property damage (linked to repair-cap/cooldown); 'tenant' = lifestyle concern. */
  source?: 'damage' | 'tenant';
}

export interface MortgageProvider {
  id: string;
  name: string;
  baseRate: number;
  maxLTV: number;
  minCreditScore: number;
  description: string;
}

export type LoanKind = 'personal' | 'business' | 'investor' | 'bridging';

export interface Loan {
  id: string;
  kind: LoanKind;
  principal: number;        // pennies
  remainingBalance: number; // pennies
  monthlyPayment: number;   // pennies
  interestRate: number;     // annual decimal
  termMonths: number;
  startMonth: number;       // monthsPlayed snapshot
  /** Optional friendly lender name — used by investor loans. */
  lenderName?: string;
  /** Number of consecutive on-time monthly payments (resets on miss). */
  onTimeStreak?: number;
  /** Snapshot of monthsPlayed when last payment was missed (for arrears + credit penalty). */
  lastMissedMonth?: number;
  /** Phase 5 #16 — interest-only flag (bridging finance). */
  interestOnly?: boolean;
  /** Phase 5 #16 — property this loan is secured against (bridging only). */
  propertyId?: string;
  /** Phase 5 #16 — credit/default penalty already applied once on bridge expiry. */
  expiryPenaltyApplied?: boolean;
}

export interface Mortgage {
  id: string;
  propertyId: string;
  principal: number; // pennies
  monthlyPayment: number; // pennies
  remainingBalance: number; // pennies
  interestRate: number;
  termYears: number;
  mortgageType: 'repayment' | 'interest-only';
  providerId: string;
  collateralPropertyIds?: string[];
  startDate: number;
  /** Snapshot of monthsPlayed when this mortgage was issued — used for fixed-term reversion. */
  startMonth?: number;
  /** 0/undefined = SVR/tracker, 2/5/10 = initial fixed-rate term in years. */
  fixedTermYears?: number;
  /** Snapshot of the fixed rate (decimal) — preserved for UI display. */
  fixedRate?: number;
  /** True once the fix has expired and the mortgage has reverted to SVR. */
  revertedToSVR?: boolean;
}

export type EvictionGround = 'rent_arrears' | 'landlord_sale' | 'landlord_move_in' | 'antisocial_behaviour' | 'lease_expiry' | 'tenant_default' | 'break_clause';

export interface PropertyTenant {
  propertyId: string;
  /** Unit slot index for HMO rooms / converted flats. 0 for standard properties. */
  slotIndex: number;
  tenant: Tenant;
  rentMultiplier: number;
  startDate: number;
  /** 0-100. Decays based on neglect; affects default risk + early exit. Starts at 80. */
  satisfaction: number;
  /** monthsPlayed snapshot of the last satisfaction update (for monthly tick). */
  lastSatisfactionUpdate: number;
  /** Reasons array for the last satisfaction adjustment, surfaced in tooltips. */
  satisfactionReasons?: Array<{ reason: string; delta: number }>;
  /** monthsPlayed when the tenant moved in. Used to avoid penalising new tenants for pre-existing rent increases. */
  moveInMonth?: number;
  /** Deposit held under TDS (pennies). 5 weeks of rent on tenancy start. 0 for grandfathered tenants. */
  depositHeld: number;
  /** Per-tenant rent (pennies/mo). For multi-slot properties this is the slot's contribution. */
  rentPennies?: number;
  /** monthsPlayed when an eviction notice was served. Tenant pays no rent during notice if arrears. */
  evictionNoticeMonth?: number;
  evictionGround?: EvictionGround;
  /** monthsPlayed snapshot of the last "tenant at risk of leaving" warning fired
   *  for this tenant — prevents the chime/toast from spamming every tick. */
  lastWalkoutWarningMonth?: number;
  /** Commercial leases only — monthsPlayed of the most recent triennial rent review. */
  lastRentReviewMonth?: number;
  /** Item 2: months of unpaid rent owed by this tenant. Increments on miss, resets on payment. */
  arrearsMonths?: number;
  /** Item 2: total cumulative rent owed (pennies). */
  arrearsPennies?: number;
  /** Item 2: monthsPlayed snapshot of the last missed-rent toast for this tenant — throttles spam to ~1 per 2-3 months. */
  lastDefaultToastMonth?: number;
  /** Phase 4 #19: monthsPlayed when a Letter Before Action was issued. Bumps CCJ recovery odds. */
  letterBeforeActionMonth?: number;
}

export interface PendingEviction {
  propertyId: string;
  /** Unit slot index. 0 for standard properties. */
  slotIndex: number;
  tenantName: string;
  ground: EvictionGround;
  servedMonth: number;
  effectiveMonth: number;
  /** True if the tenant has filed (or will file) a tribunal appeal. */
  appealFiled?: boolean;
  /** Month the tribunal will rule on the tenant's appeal. */
  appealResolveMonth?: number;
  /** True after the appeal has been resolved (upheld/overturned). */
  appealResolved?: boolean;
}

export interface PropertyLock {
  propertyId: string;
  reason: 'sale_lock' | 'relet_lock' | 'appeal_cooldown' | 'planning_cooldown';
  untilMonth: number;
  /** Optional slot scope for multi-unit properties. Undefined = property-wide (legacy). */
  slotIndex?: number;
  /** For `planning_cooldown`: the specific renovation type that was refused.
   *  Undefined on legacy locks = property-wide block (broad/safe). */
  renovationTypeId?: string;
}

export type PlanningStatus = 'pending' | 'approved' | 'refused';

export interface PlanningApplication {
  id: string;
  propertyId: string;
  renovationTypeId: string;
  /** Snapshot of the (already-scaled) renovation cost in pennies — used to
   *  start the renovation on approval without re-scaling. */
  renovationCostPennies: number;
  renovationName: string;
  submittedMonth: number;
  decisionMonth: number;
  status: PlanningStatus;
  feePaid: number;          // pennies
  approvalProb: number;     // 0..1, rolled at submission for transparency
  approved: boolean;        // pre-rolled at submission, revealed on decisionMonth
  refusalReason?: string;
  /** monthsPlayed when the player saw the decision toast — used to hide the
   *  refused entry from the tracker after 1 month. */
  acknowledgedMonth?: number;
  /** Phase 6 #15 — sqft uplift snapshot from the renovation type at submission. */
  sqftAdded?: number;
  /** Phase 6 #15 — true once the sqft uplift has been baked into the property's
   *  internalSqft at planning approval, so completion (and the display helper)
   *  must not add it again. */
  sqftAppliedAtPlanning?: boolean;
}

/** Player-raised dispute over a withheld portion of a tenant's deposit (TDS adjudication). */
export interface DepositDispute {
  id: string;
  propertyId: string;
  propertyName: string;
  tenantName: string;
  /** Pennies withheld from the tenant at eviction completion. */
  withheldAmount: number;
  /** Pennies already refunded to the tenant. */
  refundedAmount: number;
  raisedMonth: number;
  status: 'open' | 'won' | 'lost' | 'settled';
  /** monthsPlayed when the dispute was resolved (for hide-after-1-month UI). */
  resolvedMonth?: number;
}

export interface VoidPeriod {
  propertyId: string;
  startDate: number;
  endDate: number;
}

export interface PropertyOffer {
  id: string;
  buyerName: string;
  amount: number; // pennies
  daysOnMarket: number;
  isChainFree: boolean;
  mortgageApproved: boolean;
  /** True when the buyer is a cash purchaser (no mortgage chain). */
  isCash?: boolean;
  timestamp: number;
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'buyer-countered' | 'walkaway';
  counterAmount?: number; // pennies
  buyerCounterAmount?: number; // pennies
  negotiationRound: number;
  counterResponseDate?: number;
}

export interface PropertyListing {
  propertyId: string;
  listingDate: number;
  /** In-game month when the property was first listed (drives game-time DOM). */
  listingMonth?: number;
  isAuction: boolean;
  daysUntilSale: number;
  askingPrice: number; // pennies
  offers?: PropertyOffer[];
  lastOfferCheck?: number;
  autoAcceptThreshold?: number; // pennies
}

/** Chain-collapse event payload surfaced in the global pop-out modal. */
export interface ChainCollapseEvent {
  id: string;
  propertyName: string;
  /** Were we the buyer ("buying") or seller ("selling") in the chain? */
  side: 'buying' | 'selling';
  /** In-game month it collapsed. */
  month: number;
  /** Pennies returned to cash (cashHeld refund), informational. */
  cashReturned: number;
}

export interface Renovation {
  id: string;
  propertyId: string;
  type: RenovationType;
  startDate: number;
  completionDate: number;
  /** In-game month when work began. Drives progress + completion. */
  startMonth?: number;
  /** In-game month when work completes. Drives completion check. */
  completionMonth?: number;
}

export interface TenantEvent {
  propertyId: string;
  type: 'default' | 'damage' | 'early_exit';
  amount: number; // pennies
  month: number;
}

export interface PropertyDamage {
  id: string;
  propertyId: string;
  propertyName: string;
  repairCost: number; // pennies
  timestamp: number;
}

export interface AnnualRepairCost {
  propertyId: string;
  year: number;
  totalCost: number; // pennies
}

export interface PropertyDamageHistory {
  propertyId: string;
  lastDamageMonth: number;
}

export interface MacroEconomicEvent {
  id: string;
  name: string;
  description: string;
  month: number;
  type: 'rate_cut' | 'tech_boom' | 'recession' | 'mild_correction' | 'rate_hike' | 'rate_cut_small';
}

// Tax record for tracking
export interface TaxRecord {
  month: number;
  type: 'income_tax' | 'corporation_tax' | 'cgt';
  amount: number; // pennies
  description: string;
}

export interface GameState {
  // Version for save migration
  _version: number;
  // Player
  cash: number; // pennies
  level: number;
  experience: number;
  experienceToNext: number;
  creditScore: number;
  isBankrupt: boolean;
  overdraftLimit: number; // pennies
  overdraftUsed: number; // pennies
  entityType: EntityType;
  /** Has the player explicitly chosen sole_trader vs ltd at game start? */
  entityChosen?: boolean;
  /** Has the player completed the welcome/onboarding intro? */
  onboardingCompleted?: boolean;
  /** Landlord reputation 0-100 — gates premium tenant access, displayed as stars. Starts at 50. */
  landlordReputation: number;
  /** Seed for the deterministic PRNG (mulberry32). Generated on first load. */
  rngSeed?: number;
  // Properties
  ownedProperties: Property[];
  estateAgentProperties: Property[];
  auctionProperties: Property[];
  propertyListings: PropertyListing[];
  tenants: PropertyTenant[];
  voidPeriods: VoidPeriod[];
  renovations: Renovation[];
  pendingDamages: PropertyDamage[];
  annualRepairCosts: AnnualRepairCost[];
  damageHistory: PropertyDamageHistory[];
  // Conveyancing
  conveyancing: Conveyancing[];
  // Finance
  mortgages: Mortgage[];
  mortgageProviderRates: Record<string, number>;
  currentMarketRate: number;
  /** Current spreads above market rate for personal/business loans. Fluctuates monthly. */
  currentLoanRates: { personal: number; business: number };
  // Time
  monthsPlayed: number;
  timeUntilNextMonth: number;
  /** Wall-clock-to-game-time multiplier. 1 = normal, 2 = 2x, 0.5 = half. */
  gameSpeed: number;
  /** When true, engine ticks are skipped — clock and month-end pause. */
  isPaused: boolean;
  lastYearlyGrowth: number;
  yearlyNetProfit: number; // pennies — running net cashflow (legacy / level signal)
  /** Pennies — actual gross rent received in the current tax year (resets at April tax point). */
  yearlyGrossRent: number;
  /** Pennies — mortgage interest paid in the current tax year. */
  yearlyMortgageInterest: number;
  /** Pennies — deductible operating expenses paid in the current tax year (council tax, repairs). */
  yearlyDeductibleExpenses: number;
  lastCorporationTaxMonth: number;
  lastGlobalDamageMonth: number;
  nextEconomicEventMonth: number;
  economicEvents: MacroEconomicEvent[];
  tenantEvents: TenantEvent[];
  // Tax
  taxRecords: TaxRecord[];
  totalTaxPaid: number; // pennies - lifetime
  /** Item 5: UK loss carry-forward — losses (pennies) brought forward to offset future taxable profits. */
  unusedLosses?: number;
  /** Pennies of losses applied within the current tax year (reset each April). */
  lossesAppliedThisYear?: number;
  /** Pennies of losses generated within the current tax year (reset each April). */
  lossesGeneratedThisYear?: number;
  // Tenant concerns
  tenantConcerns: TenantConcern[];
  // Renters' Rights — eviction notice queue & post-eviction property locks
  pendingEvictions: PendingEviction[];
  propertyLocks: PropertyLock[];
  // Player-raised TDS deposit disputes
  depositDisputes: DepositDispute[];
  // Planning applications — gates major renovations behind PP approval
  planningApplications: PlanningApplication[];
  // Tenant departure log — surfaced in Activity feed and on property cards
  tenantHistory: TenantDeparture[];
  // Personal / business / bridging loans
  loans: Loan[];
  // Planning approvals awaiting player acknowledgement (drives celebration dialog)
  pendingPlanningCelebrations: string[];
  // Planning refusals awaiting player acknowledgement (drives refusal dialog)
  pendingPlanningRefusals: string[];
  // Court / bailiff escalation when cashflow runs persistently negative
  arrears?: ArrearsState | null;
  /** Timestamp (Date.now()) of the most recent operations-significant event —
   * drives the Operations button flash (item 3). */
  opsFlashAt?: number;
  /** Item 1: rolling log of reputation-affecting events (capped ~40 entries). */
  reputationLog?: Array<{ id: string; month: number; reason: string; delta: number; category: 'eviction' | 'walkout' | 'tribunal' | 'dispute' | 'maintenance' | 'tenancy' | 'other' }>;
  /** Macro-event IDs already shown in the popup modal (item 8). */
  seenEconomicEventIds?: string[];
  /** Active and historic debt-recovery court cases against ex/current tenants. */
  debtRecoveryCases?: DebtRecoveryCase[];
  /** Pennies of projected annual tax due next month — stamped one month before April. */
  projectedTaxPennies?: number;
  /** monthsPlayed snapshot when the projected tax warning was issued (de-dupes toast). */
  projectedTaxStampedMonth?: number;
  /** Item #10 — queued debits awaiting explicit player approval. Game auto-pauses while any exist. */
  pendingTransactions?: PendingTransaction[];
  /** Phase 3 #5 — queued chain-collapse pop-out events awaiting acknowledgement. */
  chainCollapseEvents?: ChainCollapseEvent[];
  /** v3 #2 — month at which the next annual landlord-insurance bill becomes due. */
  nextInsuranceDueMonth?: number;
  /** v3 #2 — most recent month a one-month-ahead insurance warning was shown (dedupe). */
  lastInsuranceWarnedMonth?: number;
  /** v3 #4 — queued payoff events awaiting acknowledgement via modal. */
  payoffEvents?: PayoffEvent[];
  /** Phase 3 #4 — explicit long-term endgame target (pennies of net worth). Configured per profile. */
  goalTarget?: number;
  /** Phase 3 #4 — monthsPlayed at which the player first crossed `goalTarget`. */
  goalAchievedAt?: number;
  /** Phase 3 #6 — has the MEES/EPC contextual tutorial been shown yet? */
  seenEpcTutorial?: boolean;
  /** Phase 8 #20 — one-time toast when player first splits a flat (explains ground-rent wash). */
  seenGroundRentExplainer?: boolean;
  /** Phase 2 (v5) — rolling monthly snapshots for the Bank performance chart. Capped at 60. */
  monthlySnapshots?: PortfolioSnapshot[];
  /** Phase 4 (v5) — unlocked achievements. Map of achievement id → unlock month. */
  achievements?: Record<string, number>;
  /** Phase 4 (v5 statements) — annual P&L + balance-sheet snapshots, one per tax year. */
  annualAccounts?: AnnualAccountRecord[];
  /** Phase 4 (v5 statements) — CGT realised so far in the current tax year (pennies). Reset at year close. */
  cgtThisYearPennies?: number;
  /** Phase 3 (commercial) — outstanding rent reviews queued for player negotiation. */
  pendingRentReviews?: PendingRentReview[];
  /** Phase 4 (commercial) — interested-renewal HoT prompts queued for player negotiation. */
  pendingLeaseRenewals?: PendingLeaseRenewal[];
  /** Phase 3 (commercial) — queued applicants for vacant commercial units; arrive over time via the agent. */
  pendingCommercialApplicants?: Array<{ propertyId: string; tenant: Tenant; arrivalMonth: number }>;
  /** Phase 5 #12 — official ASB letters queued for player acknowledgement. */
  pendingPoliceLetters?: PoliceLetter[];
  /** Phase 5 #13 — debt-recovery case IDs queued for the resolution pop-up. */
  pendingCourtResolutions?: string[];
  /** Phase 7 #16 — overdraft prompt queued during a fresh distress episode. */
  pendingOverdraftPrompt?: { eligibleLimit: number; month: number } | null;
  /** Phase 7 #16 — monthsPlayed when overdraft prompt last fired (once per distress episode). */
  overdraftPromptedMonth?: number;
  /** Phase 7 #16 — snapshot recorded at the moment of bankruptcy for the end-game modal. */
  bankruptcySummary?: {
    month: number;
    totalDebt: number;          // pennies
    propertiesLostCount: number;
    remainingCash: number;      // pennies (may be negative)
  } | null;
  /** Phase 7 #18 — chronological log of completed loans, with on-time flag. */
  loanPayoffHistory?: Array<{ id: string; kind: 'personal' | 'business' | 'investor' | 'bridging'; repaidOnSchedule: boolean; month: number }>;
}

export interface PoliceLetter {
  id: string;
  concernId: string;
  propertyId: string;
  propertyName: string;
  tenantName: string;
  city?: string;
  concernCategory: string;
  description: string;
  month: number;
}


/** Phase 3 (commercial) — a contractual rent review that's come due and is
 *  awaiting the player to open Heads of Terms (review mode) and settle. */
export interface PendingRentReview {
  id: string;
  propertyId: string;
  /** monthsPlayed when the review fell due (lease anniversary). */
  dueMonth: number;
  /** Rent in place immediately before the review (pennies/mo). */
  currentRentPennies: number;
  /** Suggested upward market rent (pennies/mo) — basis for the player's opening offer. */
  proposedMarketRentPennies: number;
}

/** Phase 4 (commercial) — a renewal offer awaiting Heads of Terms negotiation. */
export interface PendingLeaseRenewal {
  id: string;
  propertyId: string;
  /** monthsPlayed when the renewal interest was registered. */
  raisedMonth: number;
  /** The lease's contracted expiry month (renewal must be agreed before this). */
  expiryMonth: number;
  /** Current rent (pennies/mo) — basis for the player's opening offer. */
  currentRentPennies: number;
}


/** Phase 4 (v5 statements) — P&L + balance-sheet snapshot for one tax year. */
export interface AnnualAccountRecord {
  year: number;                    // 1-indexed in-game tax year
  startMonth: number;
  endMonth: number;
  entityType: EntityType;
  grossRent: number;                // pennies
  mortgageInterest: number;         // pennies
  allowableExpenses: number;        // pennies
  netProfitBeforeTax: number;       // pennies
  taxPaid: number;                  // pennies — income tax or corp tax for this year
  cgtPaid: number;                  // pennies — any CGT realised this year
  cashAtYearEnd: number;            // pennies
  propertyValueAtYearEnd: number;   // pennies, sum of all owned property values
  mortgageDebtAtYearEnd: number;    // pennies
  loanDebtAtYearEnd: number;        // pennies
  netWorthAtYearEnd: number;        // pennies
}




/** v3 #4 — mortgage or loan reached zero balance; surfaced as a confirmation modal. */
export interface PayoffEvent {
  id: string;
  kind: 'mortgage' | 'loan';
  /** Friendly label (property name for mortgages, loan kind for loans). */
  label: string;
  month: number;
  /** Pennies of principal paid (informational). */
  amountPennies?: number;
}



/** A queued, non-rent / non-sale debit that the player must approve before it leaves cash. */
export type PendingTransactionType =
  | 'insurance'
  | 'council_tax'
  | 'income_tax'
  | 'corporation_tax'
  | 'eicr'
  | 'other';

export interface PendingTransaction {
  id: string;
  type: PendingTransactionType;
  amount: number; // pennies
  description: string;
  month: number;
}

/** A debt-recovery / county-court case filed against a tenant in arrears. */
export interface DebtRecoveryCase {
  id: string;
  propertyId: string;
  propertyName: string;
  tenantName: string;
  /** Pennies the tenant owed at filing (snapshot — arrears may be cleared after filing). */
  originalArrearsPennies: number;
  filedMonth: number;
  resolveMonth: number;
  status: 'in_court' | 'recovered' | 'partial' | 'unrecoverable';
  /** Pennies actually recovered AFTER agency fee. Set on resolution. */
  netRecoveredPennies?: number;
  /** Fee taken by debt-recovery agency (decimal, e.g. 0.25). */
  recoveryFeePct: number;
  /** Phase 4 #19: High Court Enforcement escalation after CCJ partial/unrecoverable. */
  escalatedToHighCourtMonth?: number;
  /** Pre-rolled extra pennies recovered via HCE (resolved on monthsPlayed + 3). */
  hceExpectedRecoveryPennies?: number;
  hceResolveMonth?: number;
  hceResolved?: boolean;
}

/** Player arrears / forced-sale escalation state. */
export interface ArrearsState {
  /** Month the warning was first issued. */
  startMonth: number;
  /** Consecutive months the player has been cash-negative & over overdraft. */
  monthsBehind: number;
  /** Month a court order was granted (forced sale scheduled). */
  courtOrderMonth?: number;
  /** Property earmarked by bailiffs for forced auction. */
  forcedAuctionPropertyId?: string;
  /** Month the forced sale will execute (next monthEnd after court order). */
  scheduledSaleMonth?: number;
}

/** A single tenant-departure event for the persistent activity log. */
export type TenantDepartureReason =
  | 'eviction_completed'
  | 'low_satisfaction'
  | 'end_of_tenancy';

export interface TenantDeparture {
  id: string;
  propertyId: string;
  propertyName: string;
  tenantName: string;
  reason: TenantDepartureReason;
  month: number;
  /** Optional human-readable detail (e.g. eviction ground). */
  detail?: string;
}

// Save version — increment when changing state shape
export const SAVE_VERSION = 20;
