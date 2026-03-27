import { useState, useEffect, useCallback, useRef } from "react";
import { Property } from "@/components/ui/property-card";
import { Tenant } from "@/components/ui/tenant-selector";
import { RenovationType } from "@/components/ui/renovation-dialog";
import { toast } from "@/hooks/use-toast";

interface MortgageProvider {
  id: string;
  name: string;
  baseRate: number;
  maxLTV: number; // Maximum Loan-to-Value ratio
  minCreditScore: number;
  description: string;
}

interface Mortgage {
  id: string;
  propertyId: string;
  principal: number;
  monthlyPayment: number;
  remainingBalance: number;
  interestRate: number;
  termYears: number; // 5, 10, 15, 20, 25, 30
  mortgageType: 'repayment' | 'interest-only';
  providerId: string;
  // If set, this mortgage is secured against multiple properties (portfolio mortgage)
  collateralPropertyIds?: string[];
  startDate: number;
}

interface PropertyTenant {
  propertyId: string;
  tenant: Tenant;
  rentMultiplier: number;
  startDate: number; // timestamp
}

interface VoidPeriod {
  propertyId: string;
  startDate: number; // timestamp
  endDate: number; // timestamp
}

interface PropertyListing {
  propertyId: string;
  listingDate: number; // timestamp
  isAuction: boolean;
  daysUntilSale: number;
  askingPrice: number; // The price the player set for listing
  offers?: PropertyOffer[]; // Track offers for the listing
  lastOfferCheck?: number; // Track when we last generated offers
  autoAcceptThreshold?: number; // Auto-accept offers at or above this amount
}

interface PropertyOffer {
  id: string;
  buyerName: string;
  amount: number;
  daysOnMarket: number;
  isChainFree: boolean;
  mortgageApproved: boolean;
  timestamp: number;
  // Counter-offer fields
  status: 'pending' | 'accepted' | 'rejected' | 'countered' | 'buyer-countered' | 'walkaway';
  counterAmount?: number; // Player's counter-offer
  buyerCounterAmount?: number; // Buyer's response
  negotiationRound: number; // Track rounds (max 3)
  counterResponseDate?: number; // When the buyer will respond
}

interface Renovation {
  id: string;
  propertyId: string;
  type: RenovationType;
  startDate: number; // timestamp
  completionDate: number; // timestamp
}

interface TenantEvent {
  propertyId: string;
  type: 'default' | 'damage' | 'early_exit';
  amount: number;
  month: number;
}

interface PropertyDamage {
  id: string;
  propertyId: string;
  propertyName: string;
  repairCost: number;
  timestamp: number;
}

interface AnnualRepairCost {
  propertyId: string;
  year: number;
  totalCost: number;
}

interface PropertyDamageHistory {
  propertyId: string;
  lastDamageMonth: number; // Month when last damage occurred
}

interface GameState {
  cash: number;
  ownedProperties: Property[];
  mortgages: Mortgage[];
  tenants: PropertyTenant[];
  renovations: Renovation[];
  level: number;
  experience: number;
  experienceToNext: number;
  monthsPlayed: number;
  timeUntilNextMonth: number;
  isBankrupt: boolean;
  creditScore: number;
  currentMarketRate: number;
  tenantEvents: TenantEvent[];
  voidPeriods: VoidPeriod[];
  propertyListings: PropertyListing[];
  overdraftLimit: number;
  overdraftUsed: number;
  pendingDamages: PropertyDamage[];
  annualRepairCosts: AnnualRepairCost[];
  damageHistory: PropertyDamageHistory[];
  lastYearlyGrowth: number; // Tracks when we last applied yearly property value growth
  mortgageProviderRates: Record<string, number>; // Dynamic rates for each provider
  estateAgentPropertyIds: string[]; // Persist which properties are in estate agent
  auctionPropertyIds: string[]; // Persist which properties are in auction
  yearlyNetProfit: number; // Track net profit for corporation tax
  lastCorporationTaxMonth: number; // Track when we last paid corporation tax (April = month 4)
  lastGlobalDamageMonth: number; // Global cooldown: max 1 damage event per 6 months across portfolio
}

const INITIAL_CASH = 250000; // £250K starting cash
const EXPERIENCE_BASE = 1000;
const MORTGAGE_INTEREST_RATE = 0.055; // 5.5% annual interest rate
const BASE_MARKET_RATE = 0.035; // 3.5% base market rate

// UK Council Tax (charged monthly on empty properties)
const COUNCIL_TAX_BAND_D = 150; // £150/month average for Band D (empty properties)

// UK Corporation Tax
const CORPORATION_TAX_RATE = 0.19; // 19% on net profits (UK small profits rate)

// Transaction costs (UK-based)
const SOLICITOR_FEES = 600; // £600 solicitor fees
const ESTATE_AGENT_RATE = 0.015; // 1.5% of sale price
const AUCTION_SELLER_FEE = 0.05; // 5% for quick auction sales

// UK Stamp Duty Land Tax Calculator
const calculateStampDuty = (purchasePrice: number): number => {
  // UK Stamp Duty bands (additional property rates)
  if (purchasePrice <= 40000) return 0;
  
  let stampDuty = 0;
  
  // 0-£250,000: 3%
  if (purchasePrice > 40000) {
    const band1 = Math.min(purchasePrice, 250000) - 40000;
    stampDuty += band1 * 0.03;
  }
  
  // £250,001-£925,000: 8%
  if (purchasePrice > 250000) {
    const band2 = Math.min(purchasePrice, 925000) - 250000;
    stampDuty += band2 * 0.08;
  }
  
  // £925,001-£1,500,000: 13%
  if (purchasePrice > 925000) {
    const band3 = Math.min(purchasePrice, 1500000) - 925000;
    stampDuty += band3 * 0.13;
  }
  
  // £1,500,001+: 15%
  if (purchasePrice > 1500000) {
    const band4 = purchasePrice - 1500000;
    stampDuty += band4 * 0.15;
  }
  
  return Math.floor(stampDuty);
};

// Mortgage providers with different risk profiles
// Note: Cheaper providers have stricter requirements (higher credit scores, lower LTV)
const MORTGAGE_PROVIDERS: MortgageProvider[] = [
  {
    id: "hsbc",
    name: "HSBC",
    baseRate: 0.035, // 3.5% - Lowest base rate (was 4.2%)
    maxLTV: 0.75, // 75% - Strictest LTV
    minCreditScore: 740, // Highest credit requirement (was 720)
    description: "Premier bank with the best rates but strictest criteria"
  },
  {
    id: "nationwide",
    name: "Nationwide",
    baseRate: 0.045, // 4.5% (was 4.8%)
    maxLTV: 0.80, // 80%
    minCreditScore: 680,
    description: "Building society with competitive rates"
  },
  {
    id: "halifax",
    name: "Halifax",
    baseRate: 0.058, // 5.8% (was 5.5%)
    maxLTV: 0.85, // 85%
    minCreditScore: 640,
    description: "Flexible lending with moderate rates"
  },
  {
    id: "quickcash",
    name: "QuickCash Mortgages",
    baseRate: 0.095, // 9.5% (was 8.9%)
    maxLTV: 0.90, // 90%
    minCreditScore: 550,
    description: "Fast approval with higher rates"
  },
  {
    id: "easyloan",
    name: "Easy Finance Ltd",
    baseRate: 0.15, // 15% - Highest base rate (was 13.5%)
    maxLTV: 0.95, // 95% - Most lenient LTV
    minCreditScore: 450, // Lowest credit requirement
    description: "Last resort lender - approves almost anyone"
  }
];

// Expanded Middlesbrough properties with real street names and addresses
const MIDDLESBROUGH_STREETS = [
  "Linthorpe Road", "Park Road South", "Acklam Road", "Borough Road", "Marton Road",
  "Roman Road", "Trimdon Avenue", "Southfield Road", "Albert Road", "Newport Road",
  "Cargo Fleet Lane", "Vulcan Street", "The Crescent", "The Avenue", "Stokesley Road",
  "Parliament Road", "Corporation Road", "Cambridge Road", "Oxford Road", "Ormesby Road",
  "Mandale Road", "Ayresome Street", "Waterloo Road", "Grange Road", "Cypress Road",
  "Stainton Way", "Ladgate Lane", "The Greenway", "Tollesby Road", "Marton Burn Road",
  "Grove Hill Road", "Longlands Road", "Valley Road", "The Grove", "Clairville Road",
  "Cargo Fleet Road", "Saltersgill Avenue", "Hemlington Village Road", "Stainsby Road",
  "Ormesby Road", "Trunk Road", "Marton Moor Road", "Nunthorpe Avenue", "Green Lane"
];

const AVAILABLE_PROPERTIES: Property[] = [
  // Level 1: £40k-100k Residential
  { id: "1", name: "45 Linthorpe Road", type: "residential", price: 75000, value: 75000, neighborhood: "Linthorpe", monthlyIncome: 600, image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop", marketTrend: "up", yield: 9.6, lastRentIncrease: 0 },
  { id: "2", name: "12 Park Road South", type: "residential", price: 68000, value: 68000, neighborhood: "Linthorpe", monthlyIncome: 550, image: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop", marketTrend: "stable", yield: 9.7, lastRentIncrease: 0 },
  { id: "3", name: "78 Acklam Road", type: "residential", price: 95000, value: 95000, neighborhood: "Acklam", monthlyIncome: 725, image: "https://images.unsplash.com/photo-1449157291145-7efd050a4d0e?w=400&h=300&fit=crop", marketTrend: "up", yield: 9.2, lastRentIncrease: 0 },
  { id: "4", name: "156 Cargo Fleet Lane", type: "residential", price: 58000, value: 58000, neighborhood: "Port Clarence", monthlyIncome: 475, image: "https://images.unsplash.com/photo-1459767129954-1b1c1f9b9ace?w=400&h=300&fit=crop", marketTrend: "stable", yield: 9.8, lastRentIncrease: 0 },
  { id: "5", name: "89 Borough Road", type: "residential", price: 52000, value: 52000, neighborhood: "North Ormesby", monthlyIncome: 425, image: "https://images.unsplash.com/photo-1460574283810-2aab119d8511?w=400&h=300&fit=crop", marketTrend: "stable", yield: 9.8, lastRentIncrease: 0 },
  { id: "6", name: "67 Roman Road", type: "residential", price: 82000, value: 82000, neighborhood: "Pallister Park", monthlyIncome: 625, image: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=400&h=300&fit=crop", marketTrend: "down", yield: 9.1, lastRentIncrease: 0 },
  { id: "7", name: "91 Trimdon Avenue", type: "residential", price: 72000, value: 72000, neighborhood: "Acklam", monthlyIncome: 575, image: "https://images.unsplash.com/photo-1496307653780-42ee777d4833?w=400&h=300&fit=crop", marketTrend: "stable", yield: 9.6, lastRentIncrease: 0 },
  { id: "8", name: "23 Newport Road", type: "residential", price: 64000, value: 64000, neighborhood: "Middlesbrough Centre", monthlyIncome: 520, image: "https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=400&h=300&fit=crop", marketTrend: "up", yield: 9.8, lastRentIncrease: 0 },
  
  // Level 2: £100k-250k Mixed
  { id: "9", name: "23 Marton Road", type: "residential", price: 120000, value: 120000, neighborhood: "Marton", monthlyIncome: 850, image: "https://images.unsplash.com/photo-1460574283810-2aab119d8511?w=400&h=300&fit=crop", marketTrend: "up", yield: 8.5, lastRentIncrease: 0 },
  { id: "10", name: "34 Southfield Road", type: "residential", price: 145000, value: 145000, neighborhood: "Middlesbrough Centre", monthlyIncome: 950, image: "https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=400&h=300&fit=crop", marketTrend: "up", yield: 7.9, lastRentIncrease: 0 },
  { id: "11", name: "Unit 5 Albert Road", type: "commercial", price: 180000, value: 180000, neighborhood: "Middlesbrough Centre", monthlyIncome: 1200, image: "https://images.unsplash.com/photo-1497604401993-f2e922e5cb0a?w=400&h=300&fit=crop", marketTrend: "up", yield: 8.0, lastRentIncrease: 0 },
  { id: "12", name: "Shop A, Linthorpe Road", type: "commercial", price: 165000, value: 165000, neighborhood: "Linthorpe", monthlyIncome: 1100, image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop", marketTrend: "stable", yield: 8.0, lastRentIncrease: 0 },
  { id: "13", name: "45 Parliament Road", type: "residential", price: 135000, value: 135000, neighborhood: "Linthorpe", monthlyIncome: 900, image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop", marketTrend: "up", yield: 8.0, lastRentIncrease: 0 },
  
  // Level 3: £250k-500k
  { id: "14", name: "Captain Cook Square Unit", type: "commercial", price: 250000, value: 250000, neighborhood: "Captain Cook Square", monthlyIncome: 1800, image: "https://images.unsplash.com/photo-1527576539890-dfa815648363?w=400&h=300&fit=crop", marketTrend: "down", yield: 8.6, lastRentIncrease: 0 },
  { id: "15", name: "Warehouse, Vulcan Street", type: "commercial", price: 320000, value: 320000, neighborhood: "South Bank", monthlyIncome: 2100, image: "https://images.unsplash.com/photo-1488972685288-c3fd157d7c7a?w=400&h=300&fit=crop", marketTrend: "stable", yield: 7.9, lastRentIncrease: 0 },
  { id: "16", name: "8 The Avenue, Nunthorpe", type: "luxury", price: 385000, value: 385000, neighborhood: "Nunthorpe", monthlyIncome: 2400, image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&h=300&fit=crop", marketTrend: "up", yield: 7.5, lastRentIncrease: 0 },
  { id: "17", name: "Modern Townhouse, Hemlington", type: "luxury", price: 295000, value: 295000, neighborhood: "Hemlington", monthlyIncome: 1950, image: "https://images.unsplash.com/photo-1492321936769-b49830bc1d1e?w=400&h=300&fit=crop", marketTrend: "up", yield: 7.9, lastRentIncrease: 0 },
  
  // Level 4: £500k-1M
  { id: "18", name: "Executive Home, Nunthorpe", type: "luxury", price: 550000, value: 550000, neighborhood: "Nunthorpe", monthlyIncome: 3200, image: "https://images.unsplash.com/photo-1567496898869-502f2927b367?w=400&h=300&fit=crop", marketTrend: "stable", yield: 7.0, lastRentIncrease: 0 },
  { id: "19", name: "Luxury Penthouse", type: "luxury", price: 625000, value: 625000, neighborhood: "Middlesbrough Centre", monthlyIncome: 3500, image: "https://images.unsplash.com/photo-1514676487445-a8bde7ea2817?w=400&h=300&fit=crop", marketTrend: "up", yield: 6.7, lastRentIncrease: 0 },
  { id: "20", name: "Prime Commercial Unit", type: "commercial", price: 720000, value: 720000, neighborhood: "Middlesbrough Centre", monthlyIncome: 4200, image: "https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=400&h=300&fit=crop", marketTrend: "up", yield: 7.0, lastRentIncrease: 0 },
  
  // Level 5: £1M+
  { id: "21", name: "Waterfront Development", type: "luxury", price: 1200000, value: 1200000, neighborhood: "Middlesbrough Centre", monthlyIncome: 7000, image: "https://images.unsplash.com/photo-1600607686527-6fb886090705?w=400&h=300&fit=crop", marketTrend: "stable", yield: 7.0, lastRentIncrease: 0 },
  { id: "22", name: "Historic Mansion", type: "luxury", price: 1500000, value: 1500000, neighborhood: "Nunthorpe", monthlyIncome: 8500, image: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=400&h=300&fit=crop", marketTrend: "up", yield: 6.8, lastRentIncrease: 0 },
];

// Generate a new property when market needs more inventory
const getPropertyValueRangeForLevel = (level: number): { min: number; max: number } => {
  switch (level) {
    case 1: return { min: 0, max: 100000 };
    case 2: return { min: 100000, max: 250000 };
    case 3: return { min: 250000, max: 500000 };
    case 4: return { min: 500000, max: 750000 };
    case 5: return { min: 750000, max: 1000000 };
    case 6: return { min: 1000000, max: 2500000 };
    case 7: return { min: 2500000, max: 5000000 };
    case 8: return { min: 5000000, max: 10000000 };
    case 9: return { min: 10000000, max: 20000000 };
    case 10: return { min: 20000000, max: 30000000 };
    default: return { min: 0, max: 100000 };
  }
};

// Calculate average tenant yield (based on tenant multipliers)
const calculateAverageYield = () => {
  // Average of tenant multipliers: premium ~1.2, standard ~1.0, budget ~0.85, risky ~1.3
  const avgMultiplier = (1.2 + 1.0 + 0.85 + 1.3) / 4; // ~1.09
  // Base yield range 6-15%, adjusted by average multiplier
  const baseYield = 6 + Math.random() * 9;
  return baseYield;
};

const generateRandomProperty = (level: number): Property => {
  const id = `gen_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const types: Property['type'][] = ['residential', 'commercial', 'luxury'];
  const type = types[Math.floor(Math.random() * types.length)];
  
  const { min, max } = getPropertyValueRangeForLevel(level);
  // Ensure minimum realistic value of £40,000
  const actualMin = Math.max(40000, min);
  const basePrice = actualMin + Math.random() * (max - actualMin);
  const price = Math.floor(basePrice / 1000) * 1000;
  const value = price;
  
  // Generate average yield between 6-15% (represents average of all tenant types)
  const averageYield = calculateAverageYield();
  // Base monthly income calculated from average yield
  const baseMonthlyIncome = Math.floor((price * (averageYield / 100)) / 12);
  
  const neighborhoods = ["Linthorpe", "Acklam", "Marton", "Nunthorpe", "Middlesbrough Centre", "Hemlington", "South Bank", "Pallister Park", "North Ormesby", "Port Clarence"];
  const neighborhood = neighborhoods[Math.floor(Math.random() * neighborhoods.length)];
  
  const streetName = MIDDLESBROUGH_STREETS[Math.floor(Math.random() * MIDDLESBROUGH_STREETS.length)];
  const houseNumber = Math.floor(1 + Math.random() * 200);
  
  return {
    id,
    name: `${houseNumber} ${streetName}`,
    type,
    price,
    value,
    neighborhood,
    monthlyIncome: Math.max(400, baseMonthlyIncome),
    image: "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=400&h=300&fit=crop",
    marketTrend: "stable",
    yield: averageYield,
    lastRentIncrease: 0,
  };
};

const getMaxPropertiesForLevel = (level: number) => 10;

const getAvailablePropertyTypes = (level: number) => {
  if (level >= 5) return ['all'];
  if (level >= 4) return ['residential', 'commercial', 'luxury'];
  if (level >= 3) return ['residential', 'commercial'];
  return ['residential'];
};

const getMaxPropertyValue = (level: number) => {
  const range = getPropertyValueRangeForLevel(level);
  return range.max;
};

// Initialize mortgage provider rates from base rates
const getInitialProviderRates = (): Record<string, number> => {
  const rates: Record<string, number> = {};
  MORTGAGE_PROVIDERS.forEach(provider => {
    rates[provider.id] = provider.baseRate;
  });
  return rates;
};

// Fluctuate mortgage rates each month with wider swings
// Cheaper providers are more volatile, expensive ones are stable
const fluctuateProviderRates = (currentRates: Record<string, number>): Record<string, number> => {
  const newRates: Record<string, number> = {};
  MORTGAGE_PROVIDERS.forEach(provider => {
    const currentRate = currentRates[provider.id] || provider.baseRate;
    // Volatility inversely proportional to base rate (cheap = volatile)
    const volatility = provider.baseRate < 0.05 ? 0.008 : provider.baseRate < 0.07 ? 0.005 : 0.003;
    const fluctuation = (Math.random() - 0.5) * 2 * volatility;
    let newRate = currentRate + fluctuation;
    
    // Keep rates within 1.5% of base rate
    const minRate = provider.baseRate - 0.015;
    const maxRate = provider.baseRate + 0.015;
    newRate = Math.max(Math.max(0.01, minRate), Math.min(maxRate, newRate));
    
    newRates[provider.id] = newRate;
  });
  return newRates;
};

// DTI thresholds per provider (max DTI ratio they'll accept)
const PROVIDER_DTI_LIMITS: Record<string, number> = {
  hsbc: 0.50,
  nationwide: 0.50,
  halifax: 0.65,
  quickcash: 0.80,
  easyloan: 0.80,
};

// Application rejection chance per provider (premium = higher rejection)
const PROVIDER_REJECTION_CHANCE: Record<string, number> = {
  hsbc: 0.15,
  nationwide: 0.10,
  halifax: 0.05,
  quickcash: 0,
  easyloan: 0,
};

// Calculate DTI ratio for the player
const calculateDTI = (mortgages: Mortgage[], ownedProperties: Property[], tenants: PropertyTenant[]): number => {
  const totalMortgagePayments = mortgages.reduce((sum, m) => sum + m.monthlyPayment, 0);
  const totalRentalIncome = ownedProperties.reduce((total, prop) => {
    const hasTenant = tenants.some(t => t.propertyId === prop.id);
    return total + (hasTenant ? prop.monthlyIncome : 0);
  }, 0);
  if (totalRentalIncome === 0) return totalMortgagePayments > 0 ? 999 : 0;
  return totalMortgagePayments / totalRentalIncome;
};

// Check mortgage application eligibility including DTI
const checkMortgageEligibility = (
  providerId: string, 
  creditScore: number, 
  ltvRequired: number,
  currentDTI: number,
  additionalMonthlyPayment: number,
  totalRentalIncome: number
): { eligible: boolean; reason?: string } => {
  const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId);
  if (!provider) return { eligible: false, reason: "Unknown provider" };
  
  // Credit score check
  if (creditScore < provider.minCreditScore) {
    return { eligible: false, reason: `Credit score too low (need ${provider.minCreditScore}+)` };
  }
  
  // LTV check
  if (ltvRequired > provider.maxLTV) {
    return { eligible: false, reason: `LTV too high (max ${(provider.maxLTV * 100).toFixed(0)}%)` };
  }
  
  // DTI check with new payment included
  const dtiLimit = PROVIDER_DTI_LIMITS[providerId] || 0.80;
  const projectedDTI = totalRentalIncome > 0 
    ? (totalRentalIncome > 0 ? (currentDTI * totalRentalIncome + additionalMonthlyPayment) / totalRentalIncome : 999)
    : (additionalMonthlyPayment > 0 ? 999 : 0);
  
  if (projectedDTI > dtiLimit) {
    return { eligible: false, reason: `DTI too high (${(projectedDTI * 100).toFixed(0)}% > ${(dtiLimit * 100).toFixed(0)}% limit)` };
  }
  
  // Random rejection chance for premium providers
  const rejectionChance = PROVIDER_REJECTION_CHANCE[providerId] || 0;
  if (rejectionChance > 0 && Math.random() < rejectionChance) {
    return { eligible: false, reason: "Application declined - try again next month" };
  }
  
  return { eligible: true };
};

export function useGameState() {
  const [gameState, setGameState] = useState<GameState>(() => {
    const saved = localStorage.getItem("propertyTycoonSave");
    if (saved) {
      const parsedState = JSON.parse(saved);
      // Ensure all required properties exist for backward compatibility
    return {
      cash: parsedState.cash ?? INITIAL_CASH,
      ownedProperties: parsedState.ownedProperties ?? [],
      mortgages: parsedState.mortgages ?? [],
      tenants: parsedState.tenants ?? [],
      renovations: parsedState.renovations ?? [],
      level: parsedState.level ?? 1,
      experience: parsedState.experience ?? 0,
      experienceToNext: parsedState.experienceToNext ?? EXPERIENCE_BASE,
      monthsPlayed: parsedState.monthsPlayed ?? 0,
      timeUntilNextMonth: parsedState.timeUntilNextMonth ?? 180,
      isBankrupt: parsedState.isBankrupt ?? false,
      creditScore: parsedState.creditScore ?? 580,
      currentMarketRate: parsedState.currentMarketRate ?? BASE_MARKET_RATE,
      tenantEvents: parsedState.tenantEvents ?? [],
      voidPeriods: parsedState.voidPeriods ?? [],
      propertyListings: parsedState.propertyListings ?? [],
      pendingDamages: parsedState.pendingDamages ?? [],
      annualRepairCosts: parsedState.annualRepairCosts ?? [],
      damageHistory: parsedState.damageHistory ?? [],
      lastYearlyGrowth: parsedState.lastYearlyGrowth ?? 0,
      overdraftLimit: parsedState.overdraftLimit ?? 0,
      overdraftUsed: parsedState.overdraftUsed ?? 0,
      mortgageProviderRates: parsedState.mortgageProviderRates ?? getInitialProviderRates(),
      lastGlobalDamageMonth: parsedState.lastGlobalDamageMonth ?? 0,
      estateAgentPropertyIds: parsedState.estateAgentPropertyIds ?? [],
      auctionPropertyIds: parsedState.auctionPropertyIds ?? [],
      yearlyNetProfit: parsedState.yearlyNetProfit ?? 0,
      lastCorporationTaxMonth: parsedState.lastCorporationTaxMonth ?? 0,
    };
    }
    return {
      cash: INITIAL_CASH,
      ownedProperties: [],
      mortgages: [],
      tenants: [],
      renovations: [],
      level: 1,
      experience: 0,
      experienceToNext: EXPERIENCE_BASE,
      monthsPlayed: 0,
      timeUntilNextMonth: 180,
      isBankrupt: false,
      creditScore: 580,
      currentMarketRate: BASE_MARKET_RATE,
      tenantEvents: [],
      voidPeriods: [],
      propertyListings: [],
      overdraftLimit: 0,
      overdraftUsed: 0,
      pendingDamages: [],
      annualRepairCosts: [],
      damageHistory: [],
      lastYearlyGrowth: 0,
      mortgageProviderRates: getInitialProviderRates(),
      estateAgentPropertyIds: [],
      auctionPropertyIds: [],
      yearlyNetProfit: 0,
      lastCorporationTaxMonth: 0,
      lastGlobalDamageMonth: 0,
    };
  });

  const [availableProperties, setAvailableProperties] = useState<Property[]>([]);
  const [estateAgentProperties, setEstateAgentProperties] = useState<Property[]>([]);
  const [auctionProperties, setAuctionProperties] = useState<Property[]>([]);

  // Initialize properties from game state or split on first load
  useEffect(() => {
    if (gameState.estateAgentPropertyIds.length > 0 || gameState.auctionPropertyIds.length > 0) {
      // Load from saved IDs
      const estate = AVAILABLE_PROPERTIES.filter(p => gameState.estateAgentPropertyIds.includes(p.id));
      const auction = AVAILABLE_PROPERTIES.filter(p => gameState.auctionPropertyIds.includes(p.id));
      setEstateAgentProperties(estate);
      setAuctionProperties(auction);
    } else if (estateAgentProperties.length === 0 && auctionProperties.length === 0) {
      // First load - split properties (5 for auction)
      const shuffled = [...AVAILABLE_PROPERTIES].sort(() => Math.random() - 0.5);
      const auctionProps = shuffled.slice(0, Math.min(5, shuffled.length));
      const estateProps = shuffled.slice(auctionProps.length);
      setAuctionProperties(auctionProps);
      setEstateAgentProperties(estateProps);
      
      // Save to game state
      setGameState(prev => ({
        ...prev,
        auctionPropertyIds: auctionProps.map(p => p.id),
        estateAgentPropertyIds: estateProps.map(p => p.id)
      }));
    }
  }, []);

  // Sync property IDs to game state when they change
  useEffect(() => {
    setGameState(prev => ({
      ...prev,
      estateAgentPropertyIds: estateAgentProperties.map(p => p.id),
      auctionPropertyIds: auctionProperties.map(p => p.id)
    }));
  }, [estateAgentProperties, auctionProperties]);

  // Track level changes and regenerate properties when level changes
  const prevLevelRef = useRef(gameState.level);
  useEffect(() => {
    if (prevLevelRef.current !== gameState.level) {
      // Level changed - clear out-of-range properties and generate fresh ones
      const { min, max } = getPropertyValueRangeForLevel(gameState.level);
      
      // Filter out properties outside new level range
      setEstateAgentProperties(prev => {
        const validProperties = prev.filter(p => p.price >= min && p.price <= max);
        
        // If we have very few valid properties, generate new ones immediately
        if (validProperties.length < 8) {
          const newProperties: Property[] = [];
          for (let i = validProperties.length; i < 10; i++) {
            const prop = generateRandomProperty(gameState.level);
            // Ensure price is at lower end of level range for affordability
            const priceFloor = Math.max(40000, min);
            const targetPrice = priceFloor + Math.random() * (priceFloor * 0.5);
            prop.price = Math.max(priceFloor, Math.min(max, Math.floor(targetPrice)));
            prop.value = prop.price;
            prop.monthlyIncome = Math.floor((prop.price * (6 + Math.random() * 9) / 100) / 12);
            newProperties.push(prop);
          }
          return [...validProperties, ...newProperties];
        }
        
        return validProperties;
      });
      
      prevLevelRef.current = gameState.level;
    }
  }, [gameState.level]);

  // Maintain 5 auction properties and replenish market inventory
  useEffect(() => {
    const { min, max } = getPropertyValueRangeForLevel(gameState.level);
    const TARGET_AUCTION_COUNT = 5;
    
    setAuctionProperties(prev => {
      // Filter out-of-range properties, move them back to estate agent
      const valid = prev.filter(p => p.price >= min && p.price <= max);
      const invalid = prev.filter(p => p.price < min || p.price > max);
      
      if (invalid.length > 0) {
        setEstateAgentProperties(est => {
          const merged = [...est];
          invalid.forEach(p => {
            if (!merged.find(x => x.id === p.id)) merged.push(p);
          });
          return merged;
        });
      }
      
      // Replenish to target count
      if (valid.length < TARGET_AUCTION_COUNT) {
        const needed = TARGET_AUCTION_COUNT - valid.length;
        const newProps: Property[] = [];
        
        for (let i = 0; i < needed; i++) {
          let moved: Property | undefined;
          setEstateAgentProperties(est => {
            const candidate = est.find(p => 
              p.price >= min && p.price <= max && 
              !valid.find(v => v.id === p.id) &&
              !newProps.find(n => n.id === p.id)
            );
            if (candidate) {
              moved = candidate;
              return est.filter(p => p.id !== candidate.id);
            }
            return est;
          });
          if (!moved) {
            moved = generateRandomProperty(gameState.level);
          }
          newProps.push(moved);
        }
        
        return [...valid, ...newProps];
      }
      
      return valid;
    });

    // Always maintain 30 total properties for sale if portfolio not full
    if (gameState.ownedProperties.length < getMaxPropertiesForLevel(gameState.level)) {
      const totalAvailable = auctionProperties.length + estateAgentProperties.length;
      const targetTotal = 30;
      
      // Get current level range
      const { min: levelMin, max: levelMax } = getPropertyValueRangeForLevel(gameState.level);
      
      // Calculate affordability for a property
      const isAffordable = (property: Property, cash: number, creditScore: number) => {
        // Find best LTV player qualifies for
        const eligibleProviders = MORTGAGE_PROVIDERS.filter(p => creditScore >= p.minCreditScore);
        const maxLTV = eligibleProviders.length > 0 
          ? Math.max(...eligibleProviders.map(p => p.maxLTV))
          : 0;
        
        const maxMortgage = property.price * maxLTV;
        const stampDuty = property.price <= 250000 ? property.price * 0.03 :
          (250000 * 0.03) + ((property.price - 250000) * 0.08);
        const fees = 600 + (property.price * 0.01) + stampDuty;
        const cashNeeded = (property.price - maxMortgage) + fees;
        
        return cash >= cashNeeded;
      };
      
      // Check if property is within current level range
      const isWithinLevelRange = (property: Property) => {
        return property.price >= levelMin && property.price <= levelMax;
      };
      
      // Count properties that are BOTH within level range AND affordable
      const levelAffordableCount = estateAgentProperties.filter(p => 
        isWithinLevelRange(p) && isAffordable(p, gameState.cash, gameState.creditScore)
      ).length;
      
      // Ensure minimum 8 affordable properties within level range
      const minAffordable = 8;
      const needsMoreAffordable = levelAffordableCount < minAffordable;
      
      if (totalAvailable < targetTotal || needsMoreAffordable) {
        setEstateAgentProperties(prev => {
          let list = prev.slice();
          const ownedIds = new Set(gameState.ownedProperties.map(p => p.id));
          const usedIds = new Set([
            ...auctionProperties.map(p => p.id),
            ...list.map(p => p.id),
          ]);
          
          // First, ensure we have minimum affordable properties WITHIN LEVEL RANGE
          if (needsMoreAffordable) {
            const currentLevelAffordable = list.filter(p => 
              isWithinLevelRange(p) && isAffordable(p, gameState.cash, gameState.creditScore)
            ).length;
            const affordableNeeded = minAffordable - currentLevelAffordable;
            
            for (let i = 0; i < affordableNeeded; i++) {
              // Generate properties at the lower 50% of the level range to be more affordable
              // Ensure the price stays WITHIN level bounds
              const priceFloor = Math.max(40000, levelMin);
              const targetPrice = priceFloor + Math.random() * (priceFloor * 0.5);
              const adjustedPrice = Math.max(priceFloor, Math.min(levelMax, Math.floor(targetPrice)));
              
              // Generate a property and adjust its price to be within level range
              const affordableProperty = generateRandomProperty(gameState.level);
              affordableProperty.price = adjustedPrice;
              affordableProperty.value = adjustedPrice;
              affordableProperty.monthlyIncome = Math.floor((adjustedPrice * (6 + Math.random() * 9) / 100) / 12);
              
              if (!usedIds.has(affordableProperty.id)) {
                list.push(affordableProperty);
                usedIds.add(affordableProperty.id);
              }
            }
          }
          
          // Need to add (targetTotal - totalAvailable) properties
          const needed = Math.max(0, targetTotal - list.length - auctionProperties.length);
          for (let i = 0; i < needed; i++) {
            // Filter available properties by level range and exclude owned properties
            const candidates = AVAILABLE_PROPERTIES.filter(p => 
              !usedIds.has(p.id) && 
              !ownedIds.has(p.id) &&
              p.price >= levelMin && 
              p.price <= levelMax
            );
            const pick = candidates.length > 0
              ? candidates[Math.floor(Math.random() * candidates.length)]
              : generateRandomProperty(gameState.level);
            if (!usedIds.has(pick.id) && !ownedIds.has(pick.id)) {
              list.push({ ...pick });
              usedIds.add(pick.id);
            }
          }
          return list;
        });
      }
    }
  }, [auctionProperties.length, estateAgentProperties.length, gameState.ownedProperties.length, gameState.level, gameState.cash, gameState.creditScore]);

  // Save to localStorage whenever game state changes
  useEffect(() => {
    localStorage.setItem("propertyTycoonSave", JSON.stringify(gameState));
  }, [gameState]);

  // Market fluctuation, tenant events, and renovation completion
  useEffect(() => {
    const interval = setInterval(() => {
      setGameState(prev => {
        // Update market rate (simulates economic conditions)
        const marketChange = (Math.random() - 0.5) * 0.002; // ±0.1% change
        const newMarketRate = Math.max(0.015, Math.min(0.08, prev.currentMarketRate + marketChange));
        
        // Check for completed renovations
        const currentTime = Date.now();
        const completedRenovations = prev.renovations.filter(r => currentTime >= r.completionDate);
        const activeRenovations = prev.renovations.filter(r => currentTime < r.completionDate);
        
        // Apply renovation benefits
        let updatedProperties = [...prev.ownedProperties];
        completedRenovations.forEach(renovation => {
          const propertyIndex = updatedProperties.findIndex(p => p.id === renovation.propertyId);
          if (propertyIndex >= 0) {
            updatedProperties[propertyIndex] = {
              ...updatedProperties[propertyIndex],
              value: updatedProperties[propertyIndex].value + renovation.type.valueIncrease,
              monthlyIncome: updatedProperties[propertyIndex].monthlyIncome + renovation.type.rentIncrease
            };
            
            toast({
              title: "Renovation Complete!",
              description: `${renovation.type.name} finished on ${updatedProperties[propertyIndex].name}! Property value increased by £${renovation.type.valueIncrease.toLocaleString()}, rent by £${renovation.type.rentIncrease}/mo.`,
            });
          }
        });

        // Update property listings (properties being sold)
        const updatedListings = prev.propertyListings.map(listing => {
          const daysOnMarket = Math.floor((currentTime - listing.listingDate) / (1000 * 60 * 60 * 24));
          const property = prev.ownedProperties.find(p => p.id === listing.propertyId);
          
          // Generate new offers every 3-5 days for non-auction listings (faster sales)
          const daysSinceLastCheck = listing.lastOfferCheck 
            ? Math.floor((currentTime - listing.lastOfferCheck) / (1000 * 60 * 60 * 24))
            : 0;
          
          let newOffers = listing.offers || [];
          let lastCheck = listing.lastOfferCheck || listing.listingDate;
          
          // Faster offer generation: every 3-5 days instead of 7-14
          if (!listing.isAuction && property && daysSinceLastCheck >= 3) {
            // Generate 1-2 new offers
            const numNewOffers = Math.random() > 0.5 ? 2 : 1;
            const buyerNames = [
              "Mr & Mrs Johnson", "Sarah Matthews", "David Chen", "Emma Wilson", 
              "The Thompson Family", "Investment Properties Ltd", "Michael Brown",
              "Liverpool Capital Group", "First Time Buyer", "Retirement Home Buyer"
            ];
            
            for (let i = 0; i < numNewOffers; i++) {
              const priceMultiplier = 0.85 + (Math.random() * 0.2); // 85% to 105%
              const timeAdjustment = Math.max(0.9, 1 - (daysOnMarket * 0.002));
              
              const newOffer: PropertyOffer = {
                id: `offer-${Date.now()}-${i}`,
                buyerName: buyerNames[Math.floor(Math.random() * buyerNames.length)],
                amount: Math.floor(property.value * priceMultiplier * timeAdjustment),
                daysOnMarket: daysOnMarket,
                isChainFree: Math.random() > 0.6,
                mortgageApproved: Math.random() > 0.3,
                timestamp: currentTime,
                status: 'pending',
                negotiationRound: 0
              };
              
              newOffers.push(newOffer);
              
              // Check if offer meets auto-accept threshold
              if (listing.autoAcceptThreshold && newOffer.amount >= listing.autoAcceptThreshold) {
                toast({
                  title: "Offer Auto-Accepted! 🎉",
                  description: `${newOffer.buyerName}'s offer of £${newOffer.amount.toLocaleString()} for ${property.name} was automatically accepted!`,
                });
                // This will be handled by auto-sale logic below
              } else {
                // Notify about new offer
                toast({
                  title: "New Offer Received! 💰",
                  description: `${newOffer.buyerName} offered £${newOffer.amount.toLocaleString()} for ${property.name}`,
                });
              }
            }
            
            lastCheck = currentTime;
          }
          
          // Check for auto-accepted offers
          const autoAcceptedOffer = newOffers.find(offer => 
            listing.autoAcceptThreshold && offer.amount >= listing.autoAcceptThreshold
          );
          
          if (autoAcceptedOffer && property) {
            // Auto-sell the property
            const mortgage = prev.mortgages.find(m => m.propertyId === property.id);
            const salePrice = autoAcceptedOffer.amount;
            const estateAgentFees = listing.isAuction ? salePrice * AUCTION_SELLER_FEE : salePrice * ESTATE_AGENT_RATE;
            const mortgagePayoff = mortgage ? mortgage.remainingBalance : 0;
            const netProceeds = salePrice - estateAgentFees - SOLICITOR_FEES - mortgagePayoff;
            
            return {
              ...listing,
              daysUntilSale: 0, // Will be processed immediately
              offers: newOffers,
              lastOfferCheck: lastCheck
            };
          }
          
          return {
            ...listing,
            daysUntilSale: Math.max(0, listing.daysUntilSale - 1),
            offers: newOffers,
            lastOfferCheck: lastCheck
          };
        });

        // Process property sales
        const completedSales = updatedListings.filter(listing => listing.daysUntilSale === 0);
        completedSales.forEach(sale => {
          const property = prev.ownedProperties.find(p => p.id === sale.propertyId);
          if (property) {
            const mortgage = prev.mortgages.find(m => m.propertyId === property.id);
            
            // Check if this was an auto-accepted sale
            const autoAcceptedOffer = sale.offers?.find(offer => 
              sale.autoAcceptThreshold && offer.amount >= sale.autoAcceptThreshold
            );
            
            const salePrice = autoAcceptedOffer 
              ? autoAcceptedOffer.amount 
              : (sale.isAuction ? property.value * 0.85 : property.value);
            
            const estateAgentFees = sale.isAuction ? salePrice * AUCTION_SELLER_FEE : salePrice * ESTATE_AGENT_RATE;
            const mortgagePayoff = mortgage ? mortgage.remainingBalance : 0;
            const netProceeds = salePrice - estateAgentFees - SOLICITOR_FEES - mortgagePayoff;
            
            toast({
              title: `Property Sold ${sale.isAuction ? '(Auction)' : autoAcceptedOffer ? '(Auto-Accepted)' : ''}!`,
              description: `${property.name} sold for £${salePrice.toLocaleString()}. Net proceeds: £${netProceeds.toLocaleString()}`,
            });
            
            // Will be handled in the return statement
          }
        });

        // Process void periods
        const activeVoidPeriods = prev.voidPeriods.filter(vp => currentTime < vp.endDate);
        const endedVoidPeriods = prev.voidPeriods.filter(vp => currentTime >= vp.endDate);
        
        endedVoidPeriods.forEach(vp => {
          toast({
            title: "Void Period Ended",
            description: "Your property is now ready for a new tenant!",
          });
        });
        
        // Check for tenant events - only damage events now, shown as prompts
        // Restrict to one damage event every 48 months (4 years) per property
        // Global cooldown: max 1 damage event across entire portfolio per 6 months
        const newPendingDamages: PropertyDamage[] = [];
        const currentYear = Math.floor(prev.monthsPlayed / 12);
        const globalMonthsSinceLastDamage = prev.lastGlobalDamageMonth !== undefined
          ? prev.monthsPlayed - prev.lastGlobalDamageMonth
          : 999;
        
        if (globalMonthsSinceLastDamage >= 6) {
        prev.tenants.forEach(({ propertyId, tenant }) => {
          if (newPendingDamages.length === 0 && Math.random() < tenant.damageRisk / 100) {
            const property = prev.ownedProperties.find(p => p.id === propertyId);
            if (property) {
              // Check if 48 months have passed since last damage on this property
              const damageHistory = prev.damageHistory.find(dh => dh.propertyId === propertyId);
              const monthsSinceLastDamage = damageHistory 
                ? prev.monthsPlayed - damageHistory.lastDamageMonth 
                : 999; // No previous damage
              
              // Only allow damage if 48+ months since last damage
              if (monthsSinceLastDamage >= 48) {
                // Check annual repair cost cap (2% of property value)
                const annualCap = property.value * 0.02;
                const existingAnnualCost = prev.annualRepairCosts.find(
                  arc => arc.propertyId === propertyId && arc.year === currentYear
                );
                const currentYearCost = existingAnnualCost?.totalCost || 0;
                
                // Only create damage if under the annual cap
                if (currentYearCost < annualCap) {
                  const maxDamage = Math.min(
                    property.value * (0.01 + Math.random() * 0.01), // 1-2% of property value
                    annualCap - currentYearCost // Don't exceed annual cap
                  );
                  
                  if (maxDamage > 0) {
                    newPendingDamages.push({
                      id: `damage_${Date.now()}_${propertyId}`,
                      propertyId,
                      propertyName: property.name,
                      repairCost: Math.floor(maxDamage),
                      timestamp: Date.now()
                    });
                  }
                }
              }
            }
          }
        });
        } // end global cooldown check

        // Handle completed sales
        const remainingProperties = updatedProperties.filter(p => 
          !completedSales.some(sale => sale.propertyId === p.id)
        );
        const remainingMortgages = prev.mortgages.filter(m => 
          !completedSales.some(sale => sale.propertyId === m.propertyId)
        );
        const remainingTenants = prev.tenants.filter(t => 
          !completedSales.some(sale => sale.propertyId === t.propertyId)
        );
        
        const saleCashGained = completedSales.reduce((total, sale) => {
          const property = prev.ownedProperties.find(p => p.id === sale.propertyId);
          if (property) {
            const mortgage = prev.mortgages.find(m => m.propertyId === property.id);
            
            // Check if this was an auto-accepted sale
            const autoAcceptedOffer = sale.offers?.find(offer => 
              sale.autoAcceptThreshold && offer.amount >= sale.autoAcceptThreshold
            );
            
            const salePrice = autoAcceptedOffer 
              ? autoAcceptedOffer.amount 
              : (sale.isAuction ? property.value * 0.85 : property.value);
            
            const estateAgentFees = sale.isAuction ? salePrice * AUCTION_SELLER_FEE : salePrice * ESTATE_AGENT_RATE;
            const mortgagePayoff = mortgage ? mortgage.remainingBalance : 0;
            return total + salePrice - estateAgentFees - SOLICITOR_FEES - mortgagePayoff;
          }
          return total;
        }, 0);

        return {
          ...prev,
          cash: prev.cash + saleCashGained,
          ownedProperties: remainingProperties,
          mortgages: remainingMortgages,
          tenants: remainingTenants,
          renovations: activeRenovations,
          currentMarketRate: newMarketRate,
          tenantEvents: prev.tenantEvents,
          voidPeriods: activeVoidPeriods,
          propertyListings: updatedListings.filter(listing => listing.daysUntilSale > 0),
          pendingDamages: [...prev.pendingDamages, ...newPendingDamages],
          lastGlobalDamageMonth: newPendingDamages.length > 0 ? prev.monthsPlayed : prev.lastGlobalDamageMonth,
          annualRepairCosts: prev.annualRepairCosts,
          damageHistory: prev.damageHistory
        };
      });
    }, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  // Game clock timer (updates every second)
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setGameState(prev => ({
        ...prev,
        timeUntilNextMonth: Math.max(0, prev.timeUntilNextMonth - 1)
      }));
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  // Monthly income, expenses and progression - triggered by timeUntilNextMonth reaching 0
  useEffect(() => {
    if (gameState.timeUntilNextMonth === 0) {
      setGameState(prev => {
        if (prev.isBankrupt) return prev;

        // Only count income from properties with tenants (not in void periods)
        const currentTime = Date.now();
        const monthlyIncome = prev.ownedProperties.reduce((total, property) => {
          const hasTenant = prev.tenants.some(t => t.propertyId === property.id);
          const isInVoidPeriod = prev.voidPeriods.some(vp => 
            vp.propertyId === property.id && currentTime >= vp.startDate && currentTime <= vp.endDate
          );
          return total + (hasTenant && !isInVoidPeriod ? property.monthlyIncome : 0);
        }, 0);
        
        // Calculate monthly expenses
        const mortgagePayments = prev.mortgages.reduce((total, mortgage) => 
          total + mortgage.monthlyPayment, 0
        );
        
        // Council tax for empty properties (no tenant)
        const councilTax = prev.ownedProperties.reduce((total, property) => {
          const hasTenant = prev.tenants.some(t => t.propertyId === property.id);
          const isInVoidPeriod = prev.voidPeriods.some(vp => 
            vp.propertyId === property.id && currentTime >= vp.startDate && currentTime <= vp.endDate
          );
          // Charge council tax only if property is empty (no tenant and not in void period being prepared)
          return total + (!hasTenant || isInVoidPeriod ? COUNCIL_TAX_BAND_D : 0);
        }, 0);
        
        const totalExpenses = mortgagePayments + councilTax;
        const netIncome = monthlyIncome - totalExpenses;
        
        // Update mortgage balances, check for payoffs, and improve credit score
        const updatedMortgages = prev.mortgages.map(mortgage => {
          const interest = mortgage.remainingBalance * (mortgage.interestRate / 12);
          let principal = 0;
          let newBalance = mortgage.remainingBalance;
          
          if (mortgage.mortgageType === 'repayment') {
            principal = mortgage.monthlyPayment - interest;
            newBalance = Math.max(0, mortgage.remainingBalance - principal);
          }
          // For interest-only, balance stays the same
          
          return {
            ...mortgage,
            remainingBalance: newBalance
          };
        });

        // Improve credit score - conditional on DTI health
        let creditScoreImprovement = 0;
        const playerDTI = calculateDTI(prev.mortgages, prev.ownedProperties, prev.tenants);
        
        // Slower monthly gain: +1 only on even months (effectively +0.5/month avg)
        if (prev.mortgages.length > 0 && playerDTI < 0.40 && prev.monthsPlayed % 2 === 0) {
          creditScoreImprovement += 1; // Only improve every other month if DTI is healthy
        }
        // DTI penalty on credit score
        if (playerDTI > 0.60) {
          creditScoreImprovement -= 2; // Flat penalty for high DTI
        }
        
        // Tenant default penalty: -10 per default this month
        const thisMonthDefaults = prev.tenantEvents.filter(
          e => e.type === 'default' && e.month === prev.monthsPlayed
        );
        creditScoreImprovement -= thisMonthDefaults.length * 10;
        
        // Unrepaired damage penalty: -5 for each damage older than 2 months
        const oldDamages = prev.pendingDamages.filter(d => {
          const monthsOld = (Date.now() - d.timestamp) / (1000 * 60 * 60 * 24 * 30);
          return monthsOld >= 2;
        });
        creditScoreImprovement -= oldDamages.length * 5;
        
        // Consecutive 6 months with no defaults bonus
        if (prev.monthsPlayed > 0 && prev.monthsPlayed % 6 === 0) {
          const recentDefaults = prev.tenantEvents.filter(
            e => e.type === 'default' && e.month > prev.monthsPlayed - 6
          );
          if (recentDefaults.length === 0 && prev.ownedProperties.length > 0) {
            creditScoreImprovement += 3;
          }
        }

        // Check for paid-off mortgages
        const paidOffMortgages = updatedMortgages.filter(m => 
          prev.mortgages.find(old => old.id === m.id)?.remainingBalance > 0 && m.remainingBalance === 0
        );
        
        paidOffMortgages.forEach(mortgage => {
          const property = prev.ownedProperties.find(p => p.id === mortgage.propertyId);
          if (property) {
            creditScoreImprovement += 15; // +15 credit score for paying off a mortgage
            toast({
              title: "Mortgage Paid Off! 🎉",
              description: `${property.name} is now fully owned! No more monthly payments of £${mortgage.monthlyPayment.toLocaleString()}. Credit score improved!`,
            });
          }
        });

        const finalMortgages = updatedMortgages.filter(mortgage => mortgage.remainingBalance > 0);
        
        const newCash = prev.cash + netIncome;
        const isBankrupt = newCash < 0 && totalExpenses > monthlyIncome;
        
        if (isBankrupt && !prev.isBankrupt) {
          toast({
            title: "BANKRUPTCY!",
            description: "Your expenses exceed your income and you've run out of cash!",
            variant: "destructive"
          });
        }
        
        // Calculate net worth for level progression
        const propertyEquity = prev.ownedProperties.reduce((total, property) => {
          const mortgage = finalMortgages.find(m => m.propertyId === property.id);
          const equity = property.value - (mortgage?.remainingBalance || 0);
          return total + equity;
        }, 0);
        const netWorth = newCash + propertyEquity;
        
        // Net worth-based level progression: Level 1 = start, Level 2 = £250k, then doubles each level
        const getRequiredNetWorth = (level: number): number => {
          if (level <= 1) return 0;
          if (level === 2) return 250000;
          // Level 3 = £500k, Level 4 = £1M, Level 5 = £2M, etc.
          return 250000 * Math.pow(2, level - 2);
        };
        
        let newLevel = prev.level;
        while (newLevel < 10 && netWorth >= getRequiredNetWorth(newLevel + 1)) {
          newLevel++;
        }

        if (newLevel > prev.level) {
          toast({
            title: "Level Up!",
            description: `Congratulations! You reached level ${newLevel}! Net worth: £${netWorth.toLocaleString()}`,
          });
        }

        // Apply yearly property value growth (2-4% compounded annually) + 3% rent increases
        // Check if 12 months have passed since last yearly growth
        const shouldApplyYearlyGrowth = prev.monthsPlayed > 0 && (prev.monthsPlayed - prev.lastYearlyGrowth) >= 12;
        let updatedOwnedProperties = prev.ownedProperties;
        let newLastYearlyGrowth = prev.lastYearlyGrowth;

        if (shouldApplyYearlyGrowth) {
          const annualGrowthRate = 0.02 + Math.random() * 0.02; // 2-4% per year
          const rentIncreaseRate = 0.03; // Fixed 3% annual rent increase
          updatedOwnedProperties = prev.ownedProperties.map(property => {
            const newBaseRent = Math.floor((property.baseRent || property.monthlyIncome) * (1 + rentIncreaseRate));
            return {
              ...property,
              value: property.value * (1 + annualGrowthRate),
              marketValue: (property.marketValue || property.value) * (1 + annualGrowthRate),
              monthlyIncome: Math.floor(property.monthlyIncome * (1 + rentIncreaseRate)),
              baseRent: newBaseRent, // Update base rent for tenant switches
              lastRentIncrease: prev.monthsPlayed,
            };
          });
          newLastYearlyGrowth = prev.monthsPlayed;
          
          toast({
            title: "Annual Property Growth!",
            description: `Your properties increased in value by ${(annualGrowthRate * 100).toFixed(1)}% and rents increased by 3%`,
          });
        }

        // Fluctuate mortgage provider rates monthly
        const newProviderRates = fluctuateProviderRates(prev.mortgageProviderRates);

        // Track yearly net profit for corporation tax
        const accumulatedYearlyProfit = prev.yearlyNetProfit + netIncome;
        
        // Corporation tax on April 1st (month 4 in 1-12 cycle)
        const currentMonth = (prev.monthsPlayed + 1) % 12; // 0 = Jan, 3 = April, etc.
        const isAprilTaxTime = currentMonth === 3; // April
        const lastTaxYear = Math.floor(prev.lastCorporationTaxMonth / 12);
        const currentTaxYear = Math.floor((prev.monthsPlayed + 1) / 12);
        
        let corporationTaxPaid = 0;
        let finalYearlyProfit = accumulatedYearlyProfit;
        let lastCorpTaxMonth = prev.lastCorporationTaxMonth;
        let finalCash = Math.max(0, newCash);
        
        if (isAprilTaxTime && currentTaxYear > lastTaxYear && accumulatedYearlyProfit > 0) {
          // Calculate 19% corporation tax on net profits
          corporationTaxPaid = Math.floor(accumulatedYearlyProfit * CORPORATION_TAX_RATE);
          finalCash = Math.max(0, newCash - corporationTaxPaid);
          finalYearlyProfit = 0; // Reset for new tax year
          lastCorpTaxMonth = prev.monthsPlayed + 1;
          
          toast({
            title: "Corporation Tax Due! 📋",
            description: `Paid £${corporationTaxPaid.toLocaleString()} corporation tax (19%) on £${accumulatedYearlyProfit.toLocaleString()} net profit.`,
          });
        }

        return {
          ...prev,
          cash: finalCash,
          ownedProperties: updatedOwnedProperties,
          mortgages: finalMortgages,
          experience: prev.experience,
          level: newLevel,
          experienceToNext: prev.experienceToNext,
          monthsPlayed: prev.monthsPlayed + 1,
          timeUntilNextMonth: 180, // Reset to 3 minutes (180 seconds)
          isBankrupt,
          creditScore: Math.max(300, Math.min(850, prev.creditScore + creditScoreImprovement)),
          lastYearlyGrowth: newLastYearlyGrowth,
          mortgageProviderRates: newProviderRates,
          yearlyNetProfit: finalYearlyProfit,
          lastCorporationTaxMonth: lastCorpTaxMonth,
        };
      });
    }
  }, [gameState.timeUntilNextMonth]);

  const buyProperty = useCallback((property: Property, mortgagePercentage: number = 0, providerId?: string, termYears: number = 25, mortgageType: 'repayment' | 'interest-only' = 'repayment') => {
    setGameState(prev => {
      if (prev.isBankrupt) {
        toast({
          title: "Bankrupt",
          description: "You cannot purchase properties while bankrupt!",
          variant: "destructive"
        });
        return prev;
      }

      // Prevent buying the same property twice
      if (prev.ownedProperties.some(p => p.id === property.id)) {
        toast({
          title: "Already Owned",
          description: "You already own this property.",
          variant: "destructive"
        });
        return prev;
      }

      // Check property limit
      if (prev.ownedProperties.length >= getMaxPropertiesForLevel(prev.level)) {
        toast({
          title: "Property Limit Reached",
          description: `You can only own ${getMaxPropertiesForLevel(prev.level)} properties at level ${prev.level}!`,
          variant: "destructive"
        });
        return prev;
      }

      // Check level restrictions
      const allowedTypes = getAvailablePropertyTypes(prev.level);
      const { min: minValue, max: maxValue } = getPropertyValueRangeForLevel(prev.level);
      
      if (!allowedTypes.includes('all') && !allowedTypes.includes(property.type)) {
        toast({
          title: "Level Restriction",
          description: `You need level ${property.type === 'commercial' ? 3 : property.type === 'luxury' ? 4 : 1} to buy ${property.type} properties!`,
          variant: "destructive"
        });
        return prev;
      }

      // Prevent buying properties below current level minimum
      if (property.price < minValue) {
        toast({
          title: "Property Too Cheap",
          description: `At level ${prev.level}, you can only buy properties worth £${minValue.toLocaleString()} or more!`,
          variant: "destructive"
        });
        return prev;
      }

      if (property.price > maxValue) {
        toast({
          title: "Level Restriction", 
          description: `You can only buy properties up to £${maxValue.toLocaleString()} at level ${prev.level}!`,
          variant: "destructive"
        });
        return prev;
      }

      const mortgageAmount = (property.price * mortgagePercentage) / 100;
      const stampDuty = calculateStampDuty(property.price);
      const mortgageFee = mortgageAmount > 0 ? property.price * 0.01 : 0; // 1% mortgage fee
      const cashRequired = property.price - mortgageAmount + SOLICITOR_FEES + stampDuty + mortgageFee;
      
      if (prev.cash < cashRequired) {
        toast({
          title: "Insufficient Funds",
          description: `You need £${cashRequired.toLocaleString()} cash (inc. fees) to buy this property!`,
          variant: "destructive"
        });
        return prev;
      }

      let newMortgage: Mortgage | null = null;
      let creditAdjust = 0;
      if (mortgageAmount > 0) {
        const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];
        
        // Eligibility check
        const totalRentalIncome = prev.ownedProperties.reduce((total, prop) => {
          const hasTenant = prev.tenants.some(t => t.propertyId === prop.id);
          return total + (hasTenant ? prop.monthlyIncome : 0);
        }, 0);
        const currentDTI = calculateDTI(prev.mortgages, prev.ownedProperties, prev.tenants);
        
        // Use dynamic rate from game state
        const providerRate = prev.mortgageProviderRates[provider.id] || provider.baseRate;
        const dynamicRate = providerRate + prev.currentMarketRate - BASE_MARKET_RATE + 
          (prev.creditScore < 650 ? 0.01 : 0) + (prev.creditScore < 600 ? 0.015 : 0);
        const monthlyRate = dynamicRate / 12;
        
        let monthlyPayment: number;
        if (mortgageType === 'interest-only') {
          monthlyPayment = mortgageAmount * monthlyRate;
        } else {
          const totalPayments = termYears * 12;
          monthlyPayment = mortgageAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / 
            (Math.pow(1 + monthlyRate, totalPayments) - 1);
        }
        
        const ltvRequired = mortgagePercentage / 100;
        const eligibility = checkMortgageEligibility(
          provider.id, prev.creditScore, ltvRequired, currentDTI, monthlyPayment, totalRentalIncome
        );
        
        if (!eligibility.eligible) {
          toast({
            title: "Mortgage Rejected",
            description: eligibility.reason || "Application declined",
            variant: "destructive"
          });
          return prev;
        }
        
        // High LTV penalty
        if (ltvRequired > 0.85) {
          creditAdjust -= 3;
        }
        
        newMortgage = {
          id: `${property.id}_${Date.now()}`,
          propertyId: property.id,
          principal: mortgageAmount,
          monthlyPayment,
          remainingBalance: mortgageAmount,
          interestRate: dynamicRate,
          termYears,
          mortgageType,
          providerId: providerId || "halifax",
          startDate: Date.now()
        };
      }

      toast({
        title: "Property Purchased!",
        description: `You bought ${property.name} for £${property.price.toLocaleString()}${mortgageAmount > 0 ? ` (£${mortgageAmount.toLocaleString()} mortgage)` : ''}. Total cost: £${cashRequired.toLocaleString()}`,
      });

      // Track market value separately for profit calculation
      // If property doesn't have a yield, assign one (6-15%)
      const yieldPercentage = property.yield || (6 + Math.random() * 9);
      const purchasedProperty = { 
        ...property, 
        owned: true,
        marketValue: property.value, // Store original market value
        yield: yieldPercentage,
        lastRentIncrease: prev.monthsPlayed,
        baseRent: property.monthlyIncome, // Set initial base rent
      };

      return {
        ...prev,
        cash: prev.cash - cashRequired,
        ownedProperties: [...prev.ownedProperties, purchasedProperty],
        mortgages: newMortgage ? [...prev.mortgages, newMortgage] : prev.mortgages,
        experience: prev.experience + Math.floor(property.price / 10000),
        creditScore: Math.max(300, Math.min(850, prev.creditScore + creditAdjust)),
      };
      };
    });

    setEstateAgentProperties(prev => prev.filter(p => p.id !== property.id));
    setAuctionProperties(prev => prev.filter(p => p.id !== property.id));
  }, []);

  // Purchase a property at a specific price (e.g., auction win)
  const buyPropertyAtPrice = useCallback((property: Property, purchasePrice: number, mortgagePercentage: number = 0, providerId?: string, termYears: number = 25, mortgageType: 'repayment' | 'interest-only' = 'repayment') => {
    setGameState(prev => {
      if (prev.isBankrupt) return prev;
      
      // Check if already owned
      if (prev.ownedProperties.some(p => p.id === property.id)) {
        toast({
          title: "Already Owned",
          description: `You already own ${property.name}!`,
          variant: "destructive"
        });
        return prev;
      }
      
      // Check max properties
      if (prev.ownedProperties.length >= getMaxPropertiesForLevel(prev.level)) {
        toast({
          title: "Portfolio Limit Reached",
          description: `You can only own ${getMaxPropertiesForLevel(prev.level)} properties at level ${prev.level}!`,
          variant: "destructive"
        });
        return prev;
      }

      // Check level restrictions for minimum value
      const { min: minValue } = getPropertyValueRangeForLevel(prev.level);
      if (property.value < minValue) {
        toast({
          title: "Property Too Cheap",
          description: `At level ${prev.level}, you can only buy properties worth £${minValue.toLocaleString()} or more!`,
          variant: "destructive"
        });
        return prev;
      }

      const mortgageAmount = (purchasePrice * mortgagePercentage) / 100;
      const stampDuty = calculateStampDuty(purchasePrice);
      const mortgageFee = mortgageAmount > 0 ? purchasePrice * 0.01 : 0; // 1% mortgage fee
      const cashRequired = purchasePrice - mortgageAmount + SOLICITOR_FEES + stampDuty + mortgageFee;
      
      // Check cash
      if (prev.cash < cashRequired) {
        toast({
          title: "Insufficient Funds",
          description: `You need £${cashRequired.toLocaleString()} to complete this purchase (£${purchasePrice.toLocaleString()} + £${(cashRequired - purchasePrice + mortgageAmount).toLocaleString()} fees)!`,
          variant: "destructive"
        });
        return prev;
      }

      let newMortgage: Mortgage | null = null;
      if (mortgageAmount > 0) {
        const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];
        // Use dynamic rate from game state
        const providerRate = prev.mortgageProviderRates[provider.id] || provider.baseRate;
        const dynamicRate = providerRate + prev.currentMarketRate - BASE_MARKET_RATE + (prev.creditScore < 650 ? 0.01 : 0) + (prev.creditScore < 600 ? 0.015 : 0);
        const monthlyRate = dynamicRate / 12;
        const totalPayments = termYears * 12;
        const monthlyPayment = mortgageType === 'interest-only'
          ? mortgageAmount * monthlyRate
          : mortgageAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1);
        newMortgage = {
          id: `${property.id}_${Date.now()}`,
          propertyId: property.id,
          principal: mortgageAmount,
          monthlyPayment,
          remainingBalance: mortgageAmount,
          interestRate: dynamicRate,
          termYears,
          mortgageType,
          providerId: providerId || "halifax",
          startDate: Date.now()
        };
      }

      // If bought below market price, value instantly increases to market price
      const actualValue = Math.max(purchasePrice, property.value);
      const boughtBelowMarket = purchasePrice < property.value;
      
      toast({
        title: "Property Purchased!",
        description: `You bought ${property.name} for £${purchasePrice.toLocaleString()}${mortgageAmount > 0 ? ` (£${mortgageAmount.toLocaleString()} mortgage)` : ''}${boughtBelowMarket ? `. Value instantly increased to £${actualValue.toLocaleString()}!` : ''}`,
      });

      // Track market value separately - use property.value as true market value
      // If property doesn't have a yield, assign one (6-15%)
      const yieldPercentage = property.yield || (6 + Math.random() * 9);
      const purchased = { 
        ...property, 
        price: purchasePrice, 
        value: actualValue, // Use market value if bought below market
        owned: true,
        marketValue: property.value, // Store original market value
        yield: yieldPercentage,
        lastRentIncrease: prev.monthsPlayed,
        baseRent: property.monthlyIncome, // Set initial base rent
      };
      
      return {
        ...prev,
        cash: prev.cash - cashRequired,
        ownedProperties: [...prev.ownedProperties, purchased],
        mortgages: newMortgage ? [...prev.mortgages, newMortgage] : prev.mortgages,
        experience: prev.experience + Math.floor(purchasePrice / 10000)
      };
    });

    setEstateAgentProperties(prev => prev.filter(p => p.id !== property.id));
    setAuctionProperties(prev => prev.filter(p => p.id !== property.id));
  }, []);

  const sellProperty = useCallback((property: Property, isAuction: boolean = false) => {
    setGameState(prev => {
      const daysToSell = isAuction ? 1 : 30 + Math.floor(Math.random() * 60); // Auction: 1 day, Market: 30-90 days
      
      const newListing: PropertyListing = {
        propertyId: property.id,
        listingDate: Date.now(),
        isAuction,
        daysUntilSale: daysToSell,
        askingPrice: property.value,
        offers: [],
        lastOfferCheck: Date.now(),
        autoAcceptThreshold: undefined // User can set this later
      };

      toast({
        title: `Property Listed for Sale!`,
        description: `${property.name} listed ${isAuction ? 'for auction' : 'on the market'}. Expected sale in ${daysToSell} days.`,
      });

      return {
        ...prev,
        propertyListings: [...prev.propertyListings, newListing]
      };
    });
  }, []);

  const resetGame = useCallback(() => {
    const newState: GameState = {
      cash: INITIAL_CASH,
      ownedProperties: [],
      mortgages: [],
      tenants: [],
      renovations: [],
      level: 1,
      experience: 0,
      experienceToNext: EXPERIENCE_BASE,
      monthsPlayed: 0,
      timeUntilNextMonth: 180,
      isBankrupt: false,
      creditScore: 650,
      currentMarketRate: BASE_MARKET_RATE,
      tenantEvents: [],
      voidPeriods: [],
      propertyListings: [],
      overdraftLimit: 0,
      overdraftUsed: 0,
      pendingDamages: [],
      annualRepairCosts: [],
      damageHistory: [],
      lastYearlyGrowth: 0,
      mortgageProviderRates: getInitialProviderRates(),
      estateAgentPropertyIds: [],
      auctionPropertyIds: [],
      yearlyNetProfit: 0,
      lastCorporationTaxMonth: 0,
      lastGlobalDamageMonth: 0,
    };
    setGameState(newState);
    const shuffled = [...AVAILABLE_PROPERTIES].sort(() => Math.random() - 0.5);
    setAuctionProperties(shuffled.slice(0, Math.min(5, shuffled.length)));
    setEstateAgentProperties(shuffled.slice(1));
    localStorage.removeItem("propertyTycoonSave");
    
    toast({
      title: "Game Reset",
      description: "Started fresh with £250K. Good luck building your empire!",
    });
  }, []);

  const selectTenant = useCallback((propertyId: string, tenant: Tenant) => {
    setGameState(prev => {
      const property = prev.ownedProperties.find(p => p.id === propertyId);
      if (!property) return prev;
      
      // Check if this is a rent upgrade (higher paying tenant)
      const currentBaseRent = property.baseRent || property.monthlyIncome;
      let newAdjustment = 1.0;
      if (tenant.profile === 'premium') newAdjustment = 1.10;
      else if (tenant.profile === 'budget') newAdjustment = 0.90;
      else if (tenant.profile === 'risky') newAdjustment = 1.05;
      
      const newRent = Math.floor(currentBaseRent * newAdjustment);
      const currentRent = property.monthlyIncome;
      const isRentIncrease = newRent > currentRent;
      
      // Only allow higher rent tenants after 3+ months since last tenant change
      if (isRentIncrease && property.lastTenantChange !== undefined) {
        const monthsSinceChange = prev.monthsPlayed - property.lastTenantChange;
        if (monthsSinceChange < 3) {
          toast({
            title: "Tenant Change Too Soon",
            description: `You must wait ${3 - monthsSinceChange} more month(s) before selecting a higher-paying tenant.`,
            variant: "destructive"
          });
          return prev;
        }
      }
      
      // Remove any existing void period for this property
      const updatedVoidPeriods = prev.voidPeriods.filter(vp => vp.propertyId !== propertyId);
      
      const existingTenantIndex = prev.tenants.findIndex(t => t.propertyId === propertyId);
      const newTenantRecord: PropertyTenant = {
        propertyId,
        tenant,
        rentMultiplier: tenant.rentMultiplier,
        startDate: Date.now()
      };

      let updatedTenants;
      if (existingTenantIndex >= 0) {
        updatedTenants = [...prev.tenants];
        updatedTenants[existingTenantIndex] = newTenantRecord;
      } else {
        updatedTenants = [...prev.tenants, newTenantRecord];
      }

      // Update property monthly income and track tenant change timing
      const updatedProperties = prev.ownedProperties.map(prop => {
        if (prop.id === propertyId) {
          return {
            ...prop,
            monthlyIncome: newRent,
            baseRent: currentBaseRent,
            lastTenantChange: prev.monthsPlayed, // Track when tenant was changed
          };
        }
        return prop;
      });

      toast({
        title: "Tenant Selected!",
        description: `${tenant.name} is now renting your property at £${newRent}/mo`,
      });

      return {
        ...prev,
        tenants: updatedTenants,
        ownedProperties: updatedProperties,
        voidPeriods: updatedVoidPeriods
      };
    });
  }, []);

  const removeTenant = useCallback((propertyId: string) => {
    setGameState(prev => {
      // Create void period (1-3 months)
      const voidDuration = (30 + Math.random() * 60) * 24 * 60 * 60 * 1000; // 30-90 days in ms
      const voidPeriod: VoidPeriod = {
        propertyId,
        startDate: Date.now(),
        endDate: Date.now() + voidDuration
      };

      toast({
        title: "Tenant Removed",
        description: `Property will be void for ${Math.floor(voidDuration / (24 * 60 * 60 * 1000))} days.`,
      });

      return {
        ...prev,
        tenants: prev.tenants.filter(t => t.propertyId !== propertyId),
        voidPeriods: [...prev.voidPeriods, voidPeriod]
      };
    });
  }, []);

  const startRenovation = useCallback((propertyId: string, renovationType: RenovationType) => {
    setGameState(prev => {
      if (prev.cash < renovationType.cost) {
        toast({
          title: "Insufficient Funds",
          description: `You need £${renovationType.cost.toLocaleString()} to start this renovation!`,
          variant: "destructive"
        });
        return prev;
      }

      // Check for existing renovation on same property
      const existingRenovation = prev.renovations.find(r => r.propertyId === propertyId);
      if (existingRenovation) {
        toast({
          title: "Renovation in Progress",
          description: "This property already has an ongoing renovation!",
          variant: "destructive"
        });
        return prev;
      }

      const renovation: Renovation = {
        id: `${propertyId}_${renovationType.id}_${Date.now()}`,
        propertyId,
        type: renovationType,
        startDate: Date.now(),
        completionDate: Date.now() + (renovationType.duration * 60 * 1000) // Convert minutes to milliseconds
      };

      toast({
        title: "Renovation Started!",
        description: `${renovationType.name} renovation has begun. It will take ${renovationType.duration} minutes to complete.`,
      });

      return {
        ...prev,
        cash: prev.cash - renovationType.cost,
        renovations: [...prev.renovations, renovation]
      };
    });
  }, []);

  const settleMortgage = useCallback((mortgagePropertyId: string, useCash: boolean = false, settlementPropertyId?: string, partialAmount?: number) => {
    setGameState(prev => {
      const mortgage = prev.mortgages.find(m => m.propertyId === mortgagePropertyId);
      
      if (!mortgage) {
        toast({
          title: "Settlement Failed",
          description: "Could not find mortgage!",
          variant: "destructive"
        });
        return prev;
      }

      if (useCash) {
        // Handle partial payment if specified
        if (partialAmount && partialAmount > 0) {
          if (prev.cash < partialAmount) {
            toast({
              title: "Insufficient Cash",
              description: `You need £${partialAmount.toLocaleString()} to make this payment!`,
              variant: "destructive"
            });
            return prev;
          }

          const newBalance = mortgage.remainingBalance - partialAmount;
          
          // If payment pays off the mortgage completely, remove it
          if (newBalance <= 0) {
            toast({
              title: "Mortgage Paid Off!",
              description: `Mortgage fully paid off with £${partialAmount.toLocaleString()}`,
            });

            return {
              ...prev,
              cash: prev.cash - partialAmount,
              mortgages: prev.mortgages.filter(m => m.propertyId !== mortgagePropertyId),
              creditScore: Math.min(850, prev.creditScore + 5) // Improve credit for paying off
            };
          }

          // Update mortgage with new balance
          const updatedMortgages = prev.mortgages.map(m => 
            m.propertyId === mortgagePropertyId 
              ? { ...m, remainingBalance: newBalance }
              : m
          );

          toast({
            title: "Partial Payment Made!",
            description: `Paid £${partialAmount.toLocaleString()}. Remaining balance: £${newBalance.toLocaleString()}`,
          });

          return {
            ...prev,
            cash: prev.cash - partialAmount,
            mortgages: updatedMortgages
          };
        }

        // Full payment
        if (prev.cash < mortgage.remainingBalance) {
          toast({
            title: "Insufficient Cash",
            description: `You need £${mortgage.remainingBalance.toLocaleString()} to pay off this mortgage!`,
            variant: "destructive"
          });
          return prev;
        }

        toast({
          title: "Mortgage Paid Off!",
          description: `Mortgage paid off with cash: £${mortgage.remainingBalance.toLocaleString()}`,
        });

        return {
          ...prev,
          cash: prev.cash - mortgage.remainingBalance,
          mortgages: prev.mortgages.filter(m => m.propertyId !== mortgagePropertyId),
          creditScore: Math.min(850, prev.creditScore + 5) // Improve credit for paying off
        };
      } else {
        const settlementProperty = prev.ownedProperties.find(p => p.id === settlementPropertyId);
        
        if (!settlementProperty) {
          toast({
            title: "Settlement Failed",
            description: "Could not find settlement property!",
            variant: "destructive"
          });
          return prev;
        }

        if (settlementProperty.value < mortgage.remainingBalance) {
          toast({
            title: "Insufficient Property Value",
            description: "The settlement property value is not enough to cover the mortgage!",
            variant: "destructive"
          });
          return prev;
        }

        const cashFromSale = settlementProperty.value - mortgage.remainingBalance - SOLICITOR_FEES - (settlementProperty.value * ESTATE_AGENT_RATE);

        toast({
          title: "Mortgage Settled!",
          description: `${settlementProperty.name} was sold to pay off the mortgage. Net cash: £${cashFromSale.toLocaleString()}`,
        });

        return {
          ...prev,
          cash: prev.cash + cashFromSale,
          ownedProperties: prev.ownedProperties.filter(p => p.id !== settlementPropertyId),
          mortgages: prev.mortgages.filter(m => m.propertyId !== mortgagePropertyId),
          tenants: prev.tenants.filter(t => t.propertyId !== settlementPropertyId),
          voidPeriods: prev.voidPeriods.filter(vp => vp.propertyId !== settlementPropertyId)
        };
      }
    });
  }, []);

  const remortgageProperty = useCallback((propertyId: string, newLoanAmount: number, providerId: string) => {
    setGameState(prev => {
      const property = prev.ownedProperties.find(p => p.id === propertyId);
      const existingMortgage = prev.mortgages.find(m => m.propertyId === propertyId);
      const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId);
      
      if (!property || !provider) {
        toast({
          title: "Remortgage Failed",
          description: "Property or provider not found!",
          variant: "destructive"
        });
        return prev;
      }

      const maxLTV = property.value * provider.maxLTV;
      if (newLoanAmount > maxLTV) {
        toast({
          title: "Loan Too Large",
          description: `Maximum loan for this property is £${maxLTV.toLocaleString()}`,
          variant: "destructive"
        });
        return prev;
      }

      const mortgageFee = newLoanAmount * 0.01; // 1% mortgage fee
      const totalFees = SOLICITOR_FEES + mortgageFee;
      const existingBalance = existingMortgage ? existingMortgage.remainingBalance : 0;
      const cashRaised = newLoanAmount - existingBalance - totalFees;

      // Only require cash if fees exceed the new loan minus existing balance
      // When refinancing, the new loan covers the old mortgage, so no cash needed
      if (newLoanAmount < existingBalance) {
        toast({
          title: "Remortgage Failed",
          description: "New loan amount must cover existing mortgage and fees!",
          variant: "destructive"
        });
        return prev;
      }

      const dynamicRate = (prev.mortgageProviderRates[provider.id] || provider.baseRate) + prev.currentMarketRate - BASE_MARKET_RATE + 
        (prev.creditScore < 650 ? 0.01 : 0) + (prev.creditScore < 600 ? 0.015 : 0);
      const termMonths = 300; // 25 years
      const monthlyRate = dynamicRate / 12;
      const monthlyPayment = newLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
        (Math.pow(1 + monthlyRate, termMonths) - 1);

      const newMortgage: Mortgage = {
        id: `${propertyId}_${Date.now()}`,
        propertyId,
        principal: newLoanAmount,
        monthlyPayment,
        remainingBalance: newLoanAmount,
        interestRate: dynamicRate,
        termYears: 25,
        mortgageType: 'repayment',
        providerId,
        startDate: Date.now()
      };

      toast({
        title: "Remortgage Complete!",
        description: `Property remortgaged for £${newLoanAmount.toLocaleString()}. Cash raised: £${cashRaised.toLocaleString()}`,
      });

      return {
        ...prev,
        cash: prev.cash + cashRaised,
        mortgages: existingMortgage 
          ? prev.mortgages.map(m => m.propertyId === propertyId ? newMortgage : m)
          : [...prev.mortgages, newMortgage]
      };
    });
  }, []);

  const netWorth = gameState.cash + gameState.ownedProperties.reduce((total, property) => 
    total + property.value, 0
  );

  const totalMonthlyIncome = gameState.ownedProperties.reduce((total, property) => 
    total + property.monthlyIncome, 0
  );

  // Calculate expense breakdown
  const mortgageExpenses = gameState.mortgages.reduce((total, mortgage) => 
    total + mortgage.monthlyPayment, 0
  );
  
  const councilTaxExpenses = gameState.ownedProperties.reduce((total, property) => {
    // Council tax only for empty properties
    const hasTenant = gameState.tenants.some(t => t.propertyId === property.id);
    return total + (!hasTenant ? COUNCIL_TAX_BAND_D : 0);
  }, 0);
  
  const emptyPropertiesCount = gameState.ownedProperties.filter(property => {
    const hasTenant = gameState.tenants.some(t => t.propertyId === property.id);
    return !hasTenant;
  }).length;

  const totalMonthlyExpenses = mortgageExpenses + councilTaxExpenses;

  const totalDebt = gameState.mortgages.reduce((total, mortgage) => 
    total + mortgage.remainingBalance, 0
  );

  // Calculate credit score based on player performance (toughened formula)
  const calculateCreditScore = () => {
    let score = 550; // Base score
    
    // Increase based on net worth - slower scaling (divisor 20000, was 10000)
    score += Math.min((netWorth - totalDebt) / 20000, 100);
    
    // Increase based on level - capped at 20 (was uncapped level * 10)
    score += Math.min(gameState.level * 10, 20);
    
    // No more feedback loop from stored credit score - removed compounding
    
    // Decrease if high debt-to-value (portfolio LTV) ratio
    const portfolioValue = gameState.ownedProperties.reduce((sum, p) => sum + p.value, 0);
    const debtToValue = portfolioValue > 0 ? totalDebt / portfolioValue : 0;
    if (debtToValue > 0.8) score -= 100;
    else if (debtToValue > 0.6) score -= 50;
    
    // DTI penalty
    const playerDTI = calculateDTI(gameState.mortgages, gameState.ownedProperties, gameState.tenants);
    if (playerDTI > 0.60) {
      score -= Math.min(100, Math.floor((playerDTI - 0.60) * 200));
    }
    
    // Portfolio size pressure: -8 per property beyond 3 (was -5)
    const propCount = gameState.ownedProperties.length;
    if (propCount > 3) {
      score -= (propCount - 3) * 8;
    }
    
    // Decrease if bankrupt history
    if (gameState.isBankrupt) score -= 150;
    
    return Math.max(400, Math.min(850, Math.floor(score)));
  };

  const handleEstateAgentSale = useCallback((propertyId: string, offer: any) => {
    setGameState(prev => {
      const property = prev.ownedProperties.find(p => p.id === propertyId);
      if (!property) return prev;

      const mortgage = prev.mortgages.find(m => m.propertyId === propertyId);
      const salePrice = offer.amount;
      const estateAgentFees = salePrice * ESTATE_AGENT_RATE;
      const mortgagePayoff = mortgage ? mortgage.remainingBalance : 0;
      const netProceeds = salePrice - estateAgentFees - SOLICITOR_FEES - mortgagePayoff;

      toast({
        title: "Property Sold!",
        description: `${property.name} sold to ${offer.buyerName} for £${salePrice.toLocaleString()}. Net proceeds: £${netProceeds.toLocaleString()} (after fees & mortgage payoff)`,
      });

      return {
        ...prev,
        cash: prev.cash + netProceeds,
        ownedProperties: prev.ownedProperties.filter(p => p.id !== propertyId),
        mortgages: prev.mortgages.filter(m => m.propertyId !== propertyId),
        tenants: prev.tenants.filter(t => t.propertyId !== propertyId),
        voidPeriods: prev.voidPeriods.filter(vp => vp.propertyId !== propertyId),
        propertyListings: prev.propertyListings.filter(l => l.propertyId !== propertyId)
      };
    });
  }, []);

  const handleAuctionSale = useCallback((propertyId: string, salePrice: number) => {
    setGameState(prev => {
      const property = prev.ownedProperties.find(p => p.id === propertyId);
      if (!property) return prev;

      const mortgage = prev.mortgages.find(m => m.propertyId === propertyId);
      const auctionFees = salePrice * 0.02; // 2% auction house commission
      const mortgagePayoff = mortgage ? mortgage.remainingBalance : 0;
      const netProceeds = salePrice - auctionFees - mortgagePayoff;

      return {
        ...prev,
        cash: prev.cash + netProceeds,
        ownedProperties: prev.ownedProperties.filter(p => p.id !== propertyId),
        mortgages: prev.mortgages.filter(m => m.propertyId !== propertyId),
        tenants: prev.tenants.filter(t => t.propertyId !== propertyId),
        voidPeriods: prev.voidPeriods.filter(vp => vp.propertyId !== propertyId),
        propertyListings: prev.propertyListings.filter(l => l.propertyId !== propertyId)
      };
    });
  }, []);

  // Estate agent listing management
  const listPropertyForSale = useCallback((propertyId: string, askingPrice: number) => {
    setGameState(prev => {
      const property = prev.ownedProperties.find(p => p.id === propertyId);
      if (!property) return prev;

      // Check if already listed
      if (prev.propertyListings.some(l => l.propertyId === propertyId)) {
        toast({
          title: "Already Listed",
          description: `${property.name} is already listed for sale.`,
          variant: "destructive"
        });
        return prev;
      }

      const newListing: PropertyListing = {
        propertyId,
        listingDate: Date.now(),
        isAuction: false,
        daysUntilSale: 30,
        askingPrice: askingPrice,
        offers: [],
        lastOfferCheck: Date.now(),
      };

      toast({
        title: "Property Listed",
        description: `${property.name} listed for £${askingPrice.toLocaleString()}`,
      });

      return {
        ...prev,
        propertyListings: [...prev.propertyListings, newListing]
      };
    });
  }, []);

  const cancelPropertyListing = useCallback((propertyId: string) => {
    setGameState(prev => ({
      ...prev,
      propertyListings: prev.propertyListings.filter(l => l.propertyId !== propertyId)
    }));
  }, []);

  const updatePropertyListingPrice = useCallback((propertyId: string, newPrice: number) => {
    setGameState(prev => ({
      ...prev,
      propertyListings: prev.propertyListings.map(l =>
        l.propertyId === propertyId ? { ...l, askingPrice: newPrice } : l
      )
    }));
    toast({
      title: "Price Updated",
      description: `Asking price updated to £${newPrice.toLocaleString()}`,
    });
  }, []);

  const addOfferToListing = useCallback((propertyId: string, offer: PropertyOffer) => {
    setGameState(prev => {
      const listing = prev.propertyListings.find(l => l.propertyId === propertyId);
      if (!listing) return prev;

      const property = prev.ownedProperties.find(p => p.id === propertyId);
      if (!property) return prev;

      const updatedListings = prev.propertyListings.map(l => {
        if (l.propertyId === propertyId) {
          const newOffers = [...(l.offers || []), offer].sort((a, b) => b.amount - a.amount);
          
          // Check auto-accept threshold
          if (l.autoAcceptThreshold && offer.amount >= l.autoAcceptThreshold) {
            // Auto-accept this offer
            setTimeout(() => {
              handleEstateAgentSale(propertyId, offer);
            }, 100);
          } else {
            // Show notification for new offer
            toast({
              title: "New Offer Received!",
              description: `${offer.buyerName} offered £${offer.amount.toLocaleString()} for ${property.name}`,
            });
          }
          
          return { ...l, offers: newOffers, lastOfferCheck: Date.now() };
        }
        return l;
      });

      return {
        ...prev,
        propertyListings: updatedListings
      };
    });
  }, [handleEstateAgentSale]);

  const rejectPropertyOffer = useCallback((propertyId: string, offerId: string) => {
    setGameState(prev => ({
      ...prev,
      propertyListings: prev.propertyListings.map(l =>
        l.propertyId === propertyId
          ? { ...l, offers: (l.offers || []).filter(o => o.id !== offerId) }
          : l
      )
    }));
  }, []);

  // Counter-offer functionality
  const counterOffer = useCallback((propertyId: string, offerId: string, counterAmount: number) => {
    setGameState(prev => {
      const listing = prev.propertyListings.find(l => l.propertyId === propertyId);
      if (!listing) return prev;

      const offer = listing.offers?.find(o => o.id === offerId);
      if (!offer || offer.status !== 'pending') return prev;

      // Set buyer response time (1-2 in-game days from now, simulated as 5-10 seconds real time)
      const responseDelay = 5000 + Math.random() * 5000;
      const counterResponseDate = Date.now() + responseDelay;

      toast({
        title: "Counter-Offer Sent",
        description: `You countered £${offer.amount.toLocaleString()} with £${counterAmount.toLocaleString()}. Awaiting buyer response...`,
      });

      return {
        ...prev,
        propertyListings: prev.propertyListings.map(l =>
          l.propertyId === propertyId
            ? {
                ...l,
                offers: (l.offers || []).map(o =>
                  o.id === offerId
                    ? {
                        ...o,
                        status: 'countered' as const,
                        counterAmount,
                        negotiationRound: o.negotiationRound + 1,
                        counterResponseDate
                      }
                    : o
                )
              }
            : l
        )
      };
    });
  }, []);

  // Reduce price functionality - drops asking price and generates immediate offers
  const reducePriceOnListing = useCallback((propertyId: string, reductionPercent: number = 0.07) => {
    setGameState(prev => {
      const property = prev.ownedProperties.find(p => p.id === propertyId);
      const listing = prev.propertyListings.find(l => l.propertyId === propertyId);
      if (!property || !listing) return prev;

      const currentAskingPrice = listing.askingPrice || property.value;
      const newPrice = Math.floor(currentAskingPrice * (1 - reductionPercent));
      
      // Generate 1-3 new immediate offers anchored to MARKET VALUE
      const numNewOffers = Math.random() > 0.3 ? (Math.random() > 0.5 ? 3 : 2) : 1;
      const buyerNames = [
        "Mr & Mrs Johnson", "Sarah Matthews", "David Chen", "Emma Wilson", 
        "The Thompson Family", "Investment Properties Ltd", "Michael Brown",
        "Liverpool Capital Group", "First Time Buyer", "Retirement Home Buyer"
      ];
      
      const newOffers: PropertyOffer[] = [];
      for (let i = 0; i < numNewOffers; i++) {
        const roll = Math.random();
        let offerAmount: number;

        if (roll < 0.70) {
          // 70% cluster around market value (90-105%)
          offerAmount = property.value * (0.90 + Math.random() * 0.15);
        } else if (roll < 0.85) {
          // 15% below market (80-90%)
          offerAmount = property.value * (0.80 + Math.random() * 0.10);
        } else {
          // 15% above market (105-115%)
          offerAmount = property.value * (1.05 + Math.random() * 0.10);
        }

        // Never exceed the new asking price
        offerAmount = Math.min(offerAmount, newPrice);

        newOffers.push({
          id: `offer-${Date.now()}-reduce-${i}`,
          buyerName: buyerNames[Math.floor(Math.random() * buyerNames.length)],
          amount: Math.floor(offerAmount),
          daysOnMarket: 0,
          isChainFree: Math.random() > 0.5,
          mortgageApproved: Math.random() > 0.25,
          timestamp: Date.now(),
          status: 'pending',
          negotiationRound: 0
        });
      }

      toast({
        title: "Price Reduced!",
        description: `${property.name} reduced to £${newPrice.toLocaleString()}. ${numNewOffers} new offer(s) generated!`,
      });

      // Update listing asking price and add new offers
      return {
        ...prev,
        propertyListings: prev.propertyListings.map(l =>
          l.propertyId === propertyId
            ? { ...l, askingPrice: newPrice, offers: [...(l.offers || []), ...newOffers].sort((a, b) => b.amount - a.amount) }
            : l
        )
      };
    });
  }, []);

  // Process counter-offer responses from buyers
  useEffect(() => {
    const checkCounterResponses = setInterval(() => {
      setGameState(prev => {
        let hasChanges = false;
        const updatedListings = prev.propertyListings.map(listing => {
          const property = prev.ownedProperties.find(p => p.id === listing.propertyId);
          if (!property) return listing;

          const updatedOffers = (listing.offers || []).map(offer => {
            // Check if this is a countered offer awaiting response
            if (offer.status === 'countered' && offer.counterResponseDate && Date.now() >= offer.counterResponseDate) {
              hasChanges = true;
              
              // Buyer decision based on negotiation round
              const acceptChance = offer.negotiationRound >= 3 ? 0.8 : 0.6; // Higher accept chance on final round
              const counterChance = offer.negotiationRound >= 3 ? 0 : 0.25; // No more counters after round 3
              
              const roll = Math.random();
              
              if (roll < acceptChance) {
                // Buyer accepts player's counter
                toast({
                  title: "Counter-Offer Accepted! 🎉",
                  description: `${offer.buyerName} accepted your counter of £${offer.counterAmount?.toLocaleString()} for ${property.name}!`,
                });
                return {
                  ...offer,
                  status: 'accepted' as const,
                  amount: offer.counterAmount || offer.amount
                };
              } else if (roll < acceptChance + counterChance) {
                // Buyer makes their own counter (split the difference)
                const difference = (offer.counterAmount || offer.amount) - offer.amount;
                const buyerCounter = offer.amount + Math.floor(difference * (0.4 + Math.random() * 0.3));
                
                toast({
                  title: "Buyer Counter-Offered",
                  description: `${offer.buyerName} countered with £${buyerCounter.toLocaleString()} for ${property.name}`,
                });
                
                return {
                  ...offer,
                  status: 'buyer-countered' as const,
                  buyerCounterAmount: buyerCounter,
                  counterResponseDate: undefined
                };
              } else {
                // Buyer walks away
                toast({
                  title: "Buyer Walked Away",
                  description: `${offer.buyerName} has withdrawn their interest in ${property.name}`,
                  variant: "destructive"
                });
                return {
                  ...offer,
                  status: 'walkaway' as const,
                  counterResponseDate: undefined
                };
              }
            }
            return offer;
          });

          return { ...listing, offers: updatedOffers };
        });

        if (hasChanges) {
          return { ...prev, propertyListings: updatedListings };
        }
        return prev;
      });
    }, 1000);

    return () => clearInterval(checkCounterResponses);
  }, []);

  // Accept buyer's counter-offer
  const acceptBuyerCounter = useCallback((propertyId: string, offerId: string) => {
    setGameState(prev => {
      const listing = prev.propertyListings.find(l => l.propertyId === propertyId);
      const offer = listing?.offers?.find(o => o.id === offerId);
      
      if (!offer || offer.status !== 'buyer-countered' || !offer.buyerCounterAmount) return prev;

      return {
        ...prev,
        propertyListings: prev.propertyListings.map(l =>
          l.propertyId === propertyId
            ? {
                ...l,
                offers: (l.offers || []).map(o =>
                  o.id === offerId
                    ? { ...o, status: 'accepted' as const, amount: offer.buyerCounterAmount! }
                    : o
                )
              }
            : l
        )
      };
    });
  }, []);

  // Reject buyer's counter and continue negotiation
  const rejectBuyerCounter = useCallback((propertyId: string, offerId: string, newCounterAmount: number) => {
    setGameState(prev => {
      const listing = prev.propertyListings.find(l => l.propertyId === propertyId);
      const offer = listing?.offers?.find(o => o.id === offerId);
      
      if (!offer || offer.status !== 'buyer-countered') return prev;

      const responseDelay = 5000 + Math.random() * 5000;
      const counterResponseDate = Date.now() + responseDelay;

      toast({
        title: "Counter-Offer Sent",
        description: `You countered with £${newCounterAmount.toLocaleString()}. Awaiting buyer response...`,
      });

      return {
        ...prev,
        propertyListings: prev.propertyListings.map(l =>
          l.propertyId === propertyId
            ? {
                ...l,
                offers: (l.offers || []).map(o =>
                  o.id === offerId
                    ? {
                        ...o,
                        status: 'countered' as const,
                        counterAmount: newCounterAmount,
                        negotiationRound: o.negotiationRound + 1,
                        counterResponseDate
                      }
                    : o
                )
              }
            : l
        )
      };
    });
  }, []);

// Mortgage refinancing
const handleRefinance = useCallback((propertyId: string, newLoanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only') => {
  setGameState(prev => {
    const property = prev.ownedProperties.find(p => p.id === propertyId);
    if (!property) return prev;

    // Block refinance if property is part of an active portfolio mortgage
    const inPortfolio = prev.mortgages.some(m => m.collateralPropertyIds?.includes(propertyId));
    if (inPortfolio) {
      toast({
        title: "Refinance Not Allowed",
        description: "This property is part of a portfolio mortgage. Settle or adjust the portfolio loan first.",
        variant: "destructive"
      });
      return prev;
    }

    const existingMortgage = prev.mortgages.find(m => m.propertyId === propertyId);
    const currentMortgage = existingMortgage?.remainingBalance || 0;
    const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];

    // Check if new loan amount covers the existing mortgage
    if (newLoanAmount < currentMortgage) {
      toast({
        title: "Refinance Failed",
        description: "New loan amount must be at least equal to current mortgage balance!",
        variant: "destructive"
      });
      return prev;
    }

    // Recalculate rate and monthly payment
    const dynamicRate = (prev.mortgageProviderRates[provider.id] || provider.baseRate) + prev.currentMarketRate - BASE_MARKET_RATE + (prev.creditScore < 650 ? 0.01 : 0) + (prev.creditScore < 600 ? 0.015 : 0);
    const monthlyRate = dynamicRate / 12;
    const totalPayments = termYears * 12;
    const monthlyPayment = mortgageType === 'interest-only'
      ? newLoanAmount * monthlyRate
      : newLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1);

    const newMortgage: Mortgage = {
      id: `${propertyId}_${Date.now()}`,
      propertyId,
      principal: newLoanAmount,
      monthlyPayment,
      remainingBalance: newLoanAmount,
      interestRate: dynamicRate,
      termYears,
      mortgageType,
      providerId: provider.id,
      startDate: Date.now(),
    };

    const updatedMortgages = existingMortgage
      ? prev.mortgages.map(m => (m.propertyId === propertyId ? newMortgage : m))
      : [...prev.mortgages, newMortgage];

    const cashFromRefinance = newLoanAmount - currentMortgage;

    toast({
      title: "Refinance Complete!",
      description: cashFromRefinance > 0 
        ? `Property refinanced! £${cashFromRefinance.toLocaleString()} cash released.`
        : `Property refinanced for £${newLoanAmount.toLocaleString()}`,
    });

    return {
      ...prev,
      cash: prev.cash + cashFromRefinance, // Add cash (can be positive or negative after fees)
      mortgages: updatedMortgages,
    };
  });
}, []);

// Portfolio mortgage
const handlePortfolioMortgage = useCallback((selectedPropertyIds: string[], loanAmount: number, providerId: string, termYears: number, mortgageType: 'repayment' | 'interest-only') => {
  setGameState(prev => {
    // Prevent overlapping portfolio loans on the same properties
    const hasExistingPortfolio = prev.mortgages.some(m => m.collateralPropertyIds?.some(id => selectedPropertyIds.includes(id)));
    if (hasExistingPortfolio) {
      toast({
        title: "Cannot Create Portfolio Mortgage",
        description: "One or more selected properties are already part of a portfolio mortgage.",
        variant: "destructive"
      });
      return prev;
    }

    // Sum all existing individual mortgages for these properties
    const totalCurrentMortgages = prev.mortgages
      .filter(m => selectedPropertyIds.includes(m.propertyId))
      .reduce((sum, m) => sum + m.remainingBalance, 0);

    const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];
    const dynamicRate = (prev.mortgageProviderRates[provider.id] || provider.baseRate) + prev.currentMarketRate - BASE_MARKET_RATE + 0.005; // portfolio +0.5%
    const monthlyRate = dynamicRate / 12;
    const totalPayments = termYears * 12;
    const monthlyPayment = mortgageType === 'interest-only'
      ? loanAmount * monthlyRate
      : loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / (Math.pow(1 + monthlyRate, totalPayments) - 1);

    const portfolioMortgage: Mortgage = {
      id: `portfolio_${Date.now()}`,
      propertyId: `portfolio_${selectedPropertyIds[0] || 'group'}`,
      principal: loanAmount,
      monthlyPayment,
      remainingBalance: loanAmount,
      interestRate: dynamicRate,
      termYears,
      mortgageType,
      providerId: provider.id,
      collateralPropertyIds: [...selectedPropertyIds],
      startDate: Date.now()
    };

    // Remove existing individual mortgages for these properties before adding the portfolio loan
    const remainingMortgages = prev.mortgages.filter(m => !selectedPropertyIds.includes(m.propertyId));

    const cashDelta = loanAmount - totalCurrentMortgages;

    return {
      ...prev,
      cash: prev.cash + cashDelta,
      mortgages: [...remainingMortgages, portfolioMortgage]
    };
  });
}, []);

  // Overdraft functions
  const handleApplyOverdraft = useCallback((requestedLimit: number) => {
    setGameState(prev => ({
      ...prev,
      overdraftLimit: requestedLimit
    }));
  }, []);

  const setCash = useCallback((newCash: number) => {
    setGameState(prev => ({
      ...prev,
      cash: newCash
    }));
  }, []);

  const setOverdraftUsed = useCallback((used: number) => {
    setGameState(prev => ({
      ...prev,
      overdraftUsed: used
    }));
  }, []);

  // Remove an auction property from market when sold externally
  const removeAuctionProperty = useCallback((propertyId: string) => {
    setAuctionProperties(prev => prev.filter(p => p.id !== propertyId));
    setEstateAgentProperties(prev => prev.filter(p => p.id !== propertyId));
  }, []);

  // Pay for property damage with cash
  const payDamageWithCash = useCallback((damageId: string, actualCost?: number) => {
    setGameState(prev => {
      const damage = prev.pendingDamages.find(d => d.id === damageId);
      if (!damage) return prev;

      const costToPay = actualCost ?? damage.repairCost;

      const currentYear = Math.floor(prev.monthsPlayed / 12);
      const existingAnnualCost = prev.annualRepairCosts.find(
        arc => arc.propertyId === damage.propertyId && arc.year === currentYear
      );

      const updatedAnnualCosts = existingAnnualCost
        ? prev.annualRepairCosts.map(arc =>
            arc.propertyId === damage.propertyId && arc.year === currentYear
              ? { ...arc, totalCost: arc.totalCost + costToPay }
              : arc
          )
        : [...prev.annualRepairCosts, {
            propertyId: damage.propertyId,
            year: currentYear,
            totalCost: costToPay
          }];

      // Update damage history to record when this property last had damage
      const updatedDamageHistory = prev.damageHistory.find(dh => dh.propertyId === damage.propertyId)
        ? prev.damageHistory.map(dh =>
            dh.propertyId === damage.propertyId
              ? { ...dh, lastDamageMonth: prev.monthsPlayed }
              : dh
          )
        : [...prev.damageHistory, { propertyId: damage.propertyId, lastDamageMonth: prev.monthsPlayed }];

      toast({
        title: "Repairs Paid",
        description: `Paid £${costToPay.toLocaleString()} to repair ${damage.propertyName}`,
      });

      return {
        ...prev,
        cash: prev.cash - costToPay,
        pendingDamages: prev.pendingDamages.filter(d => d.id !== damageId),
        annualRepairCosts: updatedAnnualCosts,
        damageHistory: updatedDamageHistory
      };
    });
  }, []);

  // Take a loan to pay for property damage
  const payDamageWithLoan = useCallback((damageId: string, actualCost?: number) => {
    setGameState(prev => {
      const damage = prev.pendingDamages.find(d => d.id === damageId);
      if (!damage) return prev;

      const costToPay = actualCost ?? damage.repairCost;

      const currentYear = Math.floor(prev.monthsPlayed / 12);
      const existingAnnualCost = prev.annualRepairCosts.find(
        arc => arc.propertyId === damage.propertyId && arc.year === currentYear
      );

      const updatedAnnualCosts = existingAnnualCost
        ? prev.annualRepairCosts.map(arc =>
            arc.propertyId === damage.propertyId && arc.year === currentYear
              ? { ...arc, totalCost: arc.totalCost + costToPay }
              : arc
          )
        : [...prev.annualRepairCosts, {
            propertyId: damage.propertyId,
            year: currentYear,
            totalCost: costToPay
          }];

      // Update damage history to record when this property last had damage
      const updatedDamageHistory = prev.damageHistory.find(dh => dh.propertyId === damage.propertyId)
        ? prev.damageHistory.map(dh =>
            dh.propertyId === damage.propertyId
              ? { ...dh, lastDamageMonth: prev.monthsPlayed }
              : dh
          )
        : [...prev.damageHistory, { propertyId: damage.propertyId, lastDamageMonth: prev.monthsPlayed }];

      // Add to cash (as a loan) - credit score will take a hit
      toast({
        title: "Bank Loan Taken",
        description: `Borrowed £${costToPay.toLocaleString()} to repair ${damage.propertyName}. Credit score reduced.`,
        variant: "destructive"
      });

      return {
        ...prev,
        cash: prev.cash + costToPay,
        pendingDamages: prev.pendingDamages.filter(d => d.id !== damageId),
        annualRepairCosts: updatedAnnualCosts,
        creditScore: Math.max(300, prev.creditScore - 10), // Reduce credit score for emergency loan
        damageHistory: updatedDamageHistory
      };
    });
  }, []);

  // Dismiss damage without paying
  const dismissDamage = useCallback((damageId: string) => {
    setGameState(prev => ({
      ...prev,
      pendingDamages: prev.pendingDamages.filter(d => d.id !== damageId)
    }));
  }, []);

  // Get mortgage providers with dynamic rates
  const getProvidersWithDynamicRates = useCallback((): MortgageProvider[] => {
    return MORTGAGE_PROVIDERS.map(provider => ({
      ...provider,
      baseRate: gameState.mortgageProviderRates[provider.id] || provider.baseRate
    }));
  }, [gameState.mortgageProviderRates]);

  // Set auto-accept threshold for a property listing
  const setAutoAcceptThreshold = useCallback((propertyId: string, threshold: number | undefined) => {
    setGameState(prev => ({
      ...prev,
      propertyListings: prev.propertyListings.map(listing =>
        listing.propertyId === propertyId
          ? { ...listing, autoAcceptThreshold: threshold }
          : listing
      )
    }));
  }, []);

  return {
    ...gameState,
    netWorth: netWorth - totalDebt,
    totalMonthlyIncome,
    totalMonthlyExpenses,
    expenseBreakdown: {
      mortgages: mortgageExpenses,
      councilTax: councilTaxExpenses,
      emptyPropertiesCount,
    },
    totalDebt,
    creditScore: calculateCreditScore(),
    mortgageProviders: getProvidersWithDynamicRates(),
    availableProperties: estateAgentProperties,
    estateAgentProperties,
    auctionProperties,
    getMaxPropertiesForLevel,
    getAvailablePropertyTypes,
    getMaxPropertyValue,
    buyProperty,
    buyPropertyAtPrice,
    sellProperty,
    selectTenant,
    removeTenant,
    startRenovation,
    settleMortgage,
    remortgageProperty,
    handleEstateAgentSale,
    handleAuctionSale,
    handleRefinance,
    handlePortfolioMortgage,
    handleApplyOverdraft,
    setCash,
    setOverdraftUsed,
    removeAuctionProperty,
    payDamageWithCash,
    payDamageWithLoan,
    listPropertyForSale,
    cancelPropertyListing,
    updatePropertyListingPrice,
    setAutoAcceptThreshold,
    addOfferToListing,
    rejectPropertyOffer,
    dismissDamage,
    resetGame,
    counterOffer,
    reducePriceOnListing,
    acceptBuyerCounter,
    rejectBuyerCounter
  };
}