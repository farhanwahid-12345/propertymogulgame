// Centralized game types - all monetary values stored as pennies (integers)
import type { Tenant } from "@/components/ui/tenant-selector";
import type { RenovationType } from "@/components/ui/renovation-dialog";

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

export interface PropertyTenant {
  propertyId: string;
  tenant: Tenant;
  rentMultiplier: number;
  startDate: number;
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
  type: 'rate_cut' | 'tech_boom' | 'recession' | 'grant';
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
  // Finance
  mortgages: Mortgage[];
  mortgageProviderRates: Record<string, number>;
  currentMarketRate: number;
  // Time
  monthsPlayed: number;
  timeUntilNextMonth: number;
  lastYearlyGrowth: number;
  yearlyNetProfit: number; // pennies
  lastCorporationTaxMonth: number;
  lastGlobalDamageMonth: number;
  nextEconomicEventMonth: number;
  economicEvents: MacroEconomicEvent[];
  tenantEvents: TenantEvent[];
}

// Save version — increment when changing state shape
export const SAVE_VERSION = 2;
