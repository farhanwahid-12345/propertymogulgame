// Centralized game types - all monetary values stored as pennies (integers)
import type { Tenant } from "@/components/ui/tenant-selector";
import type { RenovationType } from "@/components/ui/renovation-dialog";

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
  };
  cashHeld: number; // pennies - cash locked in escrow
  isAuction?: boolean;
  buyerOffer?: any; // for selling via estate agent
}

export interface Property {
  id: string;
  name: string;
  type: "residential" | "commercial" | "luxury";
  price: number; // pennies
  value: number; // pennies
  neighborhood: string;
  monthlyIncome: number; // pennies
  image: string;
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
}

export type EvictionGround = 'rent_arrears' | 'landlord_sale' | 'landlord_move_in' | 'antisocial_behaviour';

export interface PropertyTenant {
  propertyId: string;
  tenant: Tenant;
  rentMultiplier: number;
  startDate: number;
  /** 0-100. Decays based on neglect; affects default risk + early exit. Starts at 80. */
  satisfaction: number;
  /** monthsPlayed snapshot of the last satisfaction update (for monthly tick). */
  lastSatisfactionUpdate: number;
  /** Reasons array for the last satisfaction adjustment, surfaced in tooltips. */
  satisfactionReasons?: Array<{ reason: string; delta: number }>;
  /** Deposit held under TDS (pennies). 5 weeks of rent on tenancy start. 0 for grandfathered tenants. */
  depositHeld: number;
  /** monthsPlayed when an eviction notice was served. Tenant pays no rent during notice if arrears. */
  evictionNoticeMonth?: number;
  evictionGround?: EvictionGround;
}

export interface PendingEviction {
  propertyId: string;
  tenantName: string;
  ground: EvictionGround;
  servedMonth: number;
  effectiveMonth: number;
}

export interface PropertyLock {
  propertyId: string;
  reason: 'sale_lock' | 'relet_lock' | 'appeal_cooldown' | 'planning_cooldown';
  untilMonth: number;
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
  isAuction: boolean;
  daysUntilSale: number;
  askingPrice: number; // pennies
  offers?: PropertyOffer[];
  lastOfferCheck?: number;
  autoAcceptThreshold?: number; // pennies
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
  // Time
  monthsPlayed: number;
  timeUntilNextMonth: number;
  /** Wall-clock-to-game-time multiplier. 1 = normal, 2 = 2x, 0.5 = half. */
  gameSpeed: number;
  lastYearlyGrowth: number;
  yearlyNetProfit: number; // pennies
  lastCorporationTaxMonth: number;
  lastGlobalDamageMonth: number;
  nextEconomicEventMonth: number;
  economicEvents: MacroEconomicEvent[];
  tenantEvents: TenantEvent[];
  // Tax
  taxRecords: TaxRecord[];
  totalTaxPaid: number; // pennies - lifetime
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
export const SAVE_VERSION = 10;
