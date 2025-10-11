import { useState, useEffect, useCallback } from "react";
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
}

const INITIAL_CASH = 250000; // £250K starting cash
const EXPERIENCE_BASE = 1000;
const MORTGAGE_INTEREST_RATE = 0.055; // 5.5% annual interest rate
const PROPERTY_TAX_RATE = 0.012; // 1.2% annual property tax
const MAINTENANCE_RATE = 0.008; // 0.8% annual maintenance costs
const BASE_MARKET_RATE = 0.035; // 3.5% base market rate

// Transaction costs
const SOLICITOR_FEES = 1500; // Fixed solicitor fees
const ESTATE_AGENT_RATE = 0.015; // 1.5% of sale price
const STAMP_DUTY_RATE = 0.03; // 3% stamp duty
const MORTGAGE_BROKER_FEE = 500; // Fixed broker fee
const AUCTION_SELLER_FEE = 0.05; // 5% for quick auction sales

// Mortgage providers with different risk profiles
const MORTGAGE_PROVIDERS: MortgageProvider[] = [
  {
    id: "hsbc",
    name: "HSBC",
    baseRate: 0.045, // 4.5%
    maxLTV: 0.8, // 80%
    minCreditScore: 700,
    description: "Premier high street bank with strict lending criteria"
  },
  {
    id: "halifax",
    name: "Halifax",
    baseRate: 0.052, // 5.2%
    maxLTV: 0.85, // 85%
    minCreditScore: 650,
    description: "Popular building society with competitive rates"
  },
  {
    id: "nationwide",
    name: "Nationwide",
    baseRate: 0.048, // 4.8%
    maxLTV: 0.85, // 85%
    minCreditScore: 680,
    description: "Member-owned building society"
  },
  {
    id: "quickcash",
    name: "QuickCash Mortgages",
    baseRate: 0.089, // 8.9%
    maxLTV: 0.95, // 95%
    minCreditScore: 500,
    description: "Fast approval but high rates"
  },
  {
    id: "shadylender",
    name: "Easy Finance Ltd",
    baseRate: 0.125, // 12.5%
    maxLTV: 0.95, // 95%
    minCreditScore: 400,
    description: "Last resort lender with very high rates"
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
  { id: "1", name: "45 Linthorpe Road", type: "residential", price: 75000, value: 75000, neighborhood: "Linthorpe", monthlyIncome: 600, image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop", marketTrend: "up" },
  { id: "2", name: "12 Park Road South", type: "residential", price: 68000, value: 68000, neighborhood: "Linthorpe", monthlyIncome: 550, image: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop", marketTrend: "stable" },
  { id: "3", name: "78 Acklam Road", type: "residential", price: 95000, value: 95000, neighborhood: "Acklam", monthlyIncome: 725, image: "https://images.unsplash.com/photo-1449157291145-7efd050a4d0e?w=400&h=300&fit=crop", marketTrend: "up" },
  { id: "4", name: "156 Cargo Fleet Lane", type: "residential", price: 58000, value: 58000, neighborhood: "Port Clarence", monthlyIncome: 475, image: "https://images.unsplash.com/photo-1459767129954-1b1c1f9b9ace?w=400&h=300&fit=crop", marketTrend: "stable" },
  { id: "5", name: "89 Borough Road", type: "residential", price: 52000, value: 52000, neighborhood: "North Ormesby", monthlyIncome: 425, image: "https://images.unsplash.com/photo-1460574283810-2aab119d8511?w=400&h=300&fit=crop", marketTrend: "stable" },
  { id: "6", name: "67 Roman Road", type: "residential", price: 82000, value: 82000, neighborhood: "Pallister Park", monthlyIncome: 625, image: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=400&h=300&fit=crop", marketTrend: "down" },
  { id: "7", name: "91 Trimdon Avenue", type: "residential", price: 72000, value: 72000, neighborhood: "Acklam", monthlyIncome: 575, image: "https://images.unsplash.com/photo-1496307653780-42ee777d4833?w=400&h=300&fit=crop", marketTrend: "stable" },
  { id: "8", name: "23 Newport Road", type: "residential", price: 64000, value: 64000, neighborhood: "Middlesbrough Centre", monthlyIncome: 520, image: "https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=400&h=300&fit=crop", marketTrend: "up" },
  
  // Level 2: £100k-250k Mixed
  { id: "9", name: "23 Marton Road", type: "residential", price: 120000, value: 120000, neighborhood: "Marton", monthlyIncome: 850, image: "https://images.unsplash.com/photo-1460574283810-2aab119d8511?w=400&h=300&fit=crop", marketTrend: "up" },
  { id: "10", name: "34 Southfield Road", type: "residential", price: 145000, value: 145000, neighborhood: "Middlesbrough Centre", monthlyIncome: 950, image: "https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=400&h=300&fit=crop", marketTrend: "up" },
  { id: "11", name: "Unit 5 Albert Road", type: "commercial", price: 180000, value: 180000, neighborhood: "Middlesbrough Centre", monthlyIncome: 1200, image: "https://images.unsplash.com/photo-1497604401993-f2e922e5cb0a?w=400&h=300&fit=crop", marketTrend: "up" },
  { id: "12", name: "Shop A, Linthorpe Road", type: "commercial", price: 165000, value: 165000, neighborhood: "Linthorpe", monthlyIncome: 1100, image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop", marketTrend: "stable" },
  { id: "13", name: "45 Parliament Road", type: "residential", price: 135000, value: 135000, neighborhood: "Linthorpe", monthlyIncome: 900, image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop", marketTrend: "up" },
  
  // Level 3: £250k-500k
  { id: "14", name: "Captain Cook Square Unit", type: "commercial", price: 250000, value: 250000, neighborhood: "Captain Cook Square", monthlyIncome: 1800, image: "https://images.unsplash.com/photo-1527576539890-dfa815648363?w=400&h=300&fit=crop", marketTrend: "down" },
  { id: "15", name: "Warehouse, Vulcan Street", type: "commercial", price: 320000, value: 320000, neighborhood: "South Bank", monthlyIncome: 2100, image: "https://images.unsplash.com/photo-1488972685288-c3fd157d7c7a?w=400&h=300&fit=crop", marketTrend: "stable" },
  { id: "16", name: "8 The Avenue, Nunthorpe", type: "luxury", price: 385000, value: 385000, neighborhood: "Nunthorpe", monthlyIncome: 2400, image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&h=300&fit=crop", marketTrend: "up" },
  { id: "17", name: "Modern Townhouse, Hemlington", type: "luxury", price: 295000, value: 295000, neighborhood: "Hemlington", monthlyIncome: 1950, image: "https://images.unsplash.com/photo-1492321936769-b49830bc1d1e?w=400&h=300&fit=crop", marketTrend: "up" },
  { id: "18", name: "Penthouse, Centre Square", type: "luxury", price: 450000, value: 450000, neighborhood: "Middlesbrough Centre", monthlyIncome: 2800, image: "https://images.unsplash.com/photo-1493397212122-2b85dda8106b?w=400&h=300&fit=crop", marketTrend: "down" },
  
  // Level 4+: £500k+
  { id: "19", name: "Manor House, Stokesby Road", type: "luxury", price: 520000, value: 520000, neighborhood: "Marton", monthlyIncome: 3200, image: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&h=300&fit=crop", marketTrend: "stable" },
  { id: "20", name: "Executive Home, Grey Towers", type: "luxury", price: 675000, value: 675000, neighborhood: "Nunthorpe", monthlyIncome: 4100, image: "https://images.unsplash.com/photo-1433832597046-4f10e10ac764?w=400&h=300&fit=crop", marketTrend: "up" },
  { id: "21", name: "Historic Villa, The Crescent", type: "luxury", price: 750000, value: 750000, neighborhood: "Linthorpe", monthlyIncome: 4500, image: "https://images.unsplash.com/photo-1466442929976-97f336a657be?w=400&h=300&fit=crop", marketTrend: "stable" },
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
  const monthlyIncome = Math.floor((price * (type === 'luxury' ? 0.05 : type === 'commercial' ? 0.06 : 0.07)) / 12);
  
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
    monthlyIncome: Math.max(400, monthlyIncome),
    image: "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?w=400&h=300&fit=crop",
    marketTrend: "stable",
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
      creditScore: parsedState.creditScore ?? 650,
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
    };
  });

  const [availableProperties, setAvailableProperties] = useState<Property[]>([]);
  const [estateAgentProperties, setEstateAgentProperties] = useState<Property[]>([]);
  const [auctionProperties, setAuctionProperties] = useState<Property[]>([]);

  // Split properties between estate agent and auction on first load
  useEffect(() => {
    const splitProperties = () => {
      const shuffled = [...AVAILABLE_PROPERTIES].sort(() => Math.random() - 0.5);
      const first = shuffled[0];
      setAuctionProperties(first ? [first] : []);
      setEstateAgentProperties(shuffled.slice(1));
    };
    
    if (estateAgentProperties.length === 0 && auctionProperties.length === 0) {
      splitProperties();
    }
  }, []);

  // Ensure a single live auction property and replenish market inventory
  useEffect(() => {
    const { min, max } = getPropertyValueRangeForLevel(gameState.level);
    
    // Enforce exactly one property in auction that matches current level
    setAuctionProperties(prev => {
      // If current auction property is outside level range, replace it
      if (prev.length > 0 && (prev[0].price < min || prev[0].price > max)) {
        let replacement: Property | undefined;
        setEstateAgentProperties(est => {
          // Try to find a property from estate agent that matches level
          const validProperty = est.find(p => p.price >= min && p.price <= max);
          if (validProperty) {
            replacement = validProperty;
            return est.filter(p => p.id !== validProperty.id);
          }
          return est;
        });
        
        // If no valid property found in estate agent, generate one
        if (!replacement) {
          replacement = generateRandomProperty(gameState.level);
        }
        
        // Move old auction property back to estate agent
        const old = prev[0];
        setEstateAgentProperties(est => {
          if (!est.find(p => p.id === old.id)) {
            return [...est, old];
          }
          return est;
        });
        
        return [replacement];
      }
      
      // If no auction property, get one that matches level
      if (prev.length === 0) {
        let moved: Property | undefined;
        setEstateAgentProperties(est => {
          const validProperty = est.find(p => p.price >= min && p.price <= max);
          if (validProperty) {
            moved = validProperty;
            return est.filter(p => p.id !== validProperty.id);
          }
          return est;
        });
        if (!moved) {
          moved = generateRandomProperty(gameState.level);
        }
        return [moved];
      } else if (prev.length > 1) {
        const [keep, ...rest] = prev;
        setEstateAgentProperties(est => {
          const merged = [...est];
          rest.forEach(p => {
            if (!merged.find(x => x.id === p.id)) merged.push(p);
          });
          return merged;
        });
        return [keep];
      }
      return prev;
    });

    // Always maintain 30 total properties for sale if portfolio not full
    if (gameState.ownedProperties.length < getMaxPropertiesForLevel(gameState.level)) {
      const totalAvailable = auctionProperties.length + estateAgentProperties.length;
      const targetTotal = 30;
      
      if (totalAvailable < targetTotal) {
        setEstateAgentProperties(prev => {
          let list = prev.slice();
          const ownedIds = new Set(gameState.ownedProperties.map(p => p.id));
          const usedIds = new Set([
            ...auctionProperties.map(p => p.id),
            ...list.map(p => p.id),
          ]);
          
          // Need to add (targetTotal - totalAvailable) properties
          const needed = targetTotal - totalAvailable;
          for (let i = 0; i < needed; i++) {
            // Filter available properties by level range and exclude owned properties
            const candidates = AVAILABLE_PROPERTIES.filter(p => 
              !usedIds.has(p.id) && 
              !ownedIds.has(p.id) &&
              p.price >= min && 
              p.price <= max
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
  }, [auctionProperties.length, estateAgentProperties.length, gameState.ownedProperties.length, gameState.level]);

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
        const updatedListings = prev.propertyListings.map(listing => ({
          ...listing,
          daysUntilSale: Math.max(0, listing.daysUntilSale - 1)
        }));

        // Process property sales
        const completedSales = updatedListings.filter(listing => listing.daysUntilSale === 0);
        completedSales.forEach(sale => {
          const property = prev.ownedProperties.find(p => p.id === sale.propertyId);
          if (property) {
            const mortgage = prev.mortgages.find(m => m.propertyId === property.id);
            const salePrice = sale.isAuction ? property.value * 0.85 : property.value; // 15% discount for auction
            const estateAgentFees = sale.isAuction ? salePrice * AUCTION_SELLER_FEE : salePrice * ESTATE_AGENT_RATE;
            const mortgagePayoff = mortgage ? mortgage.remainingBalance : 0;
            const netProceeds = salePrice - estateAgentFees - SOLICITOR_FEES - mortgagePayoff;
            
            toast({
              title: `Property Sold ${sale.isAuction ? '(Auction)' : ''}!`,
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
        // Restrict to one damage event every 24 months (2 years) per property
        const newPendingDamages: PropertyDamage[] = [];
        const currentYear = Math.floor(prev.monthsPlayed / 12);
        
        prev.tenants.forEach(({ propertyId, tenant }) => {
          if (Math.random() < tenant.damageRisk / 100) {
            const property = prev.ownedProperties.find(p => p.id === propertyId);
            if (property) {
              // Check if 24 months have passed since last damage
              const damageHistory = prev.damageHistory.find(dh => dh.propertyId === propertyId);
              const monthsSinceLastDamage = damageHistory 
                ? prev.monthsPlayed - damageHistory.lastDamageMonth 
                : 999; // No previous damage
              
              // Only allow damage if 24+ months since last damage
              if (monthsSinceLastDamage >= 24) {
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
            const salePrice = sale.isAuction ? property.value * 0.85 : property.value;
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
        
        const propertyTax = prev.ownedProperties.reduce((total, property) => 
          total + (property.value * PROPERTY_TAX_RATE / 12), 0
        );
        
        const maintenance = prev.ownedProperties.reduce((total, property) => 
          total + (property.value * MAINTENANCE_RATE / 12), 0
        );
        
        const totalExpenses = mortgagePayments + propertyTax + maintenance;
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

        // Improve credit score for consistent payments and mortgage payoffs
        let creditScoreImprovement = 0;
        if (prev.mortgages.length > 0) {
          creditScoreImprovement += 1; // +1 for each month with mortgage payments
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

        // Apply yearly property value growth (2-4% compounded annually)
        // Check if 12 months have passed since last yearly growth
        const shouldApplyYearlyGrowth = prev.monthsPlayed > 0 && (prev.monthsPlayed - prev.lastYearlyGrowth) >= 12;
        let updatedOwnedProperties = prev.ownedProperties;
        let newLastYearlyGrowth = prev.lastYearlyGrowth;

        if (shouldApplyYearlyGrowth) {
          const annualGrowthRate = 0.02 + Math.random() * 0.02; // 2-4% per year
          updatedOwnedProperties = prev.ownedProperties.map(property => ({
            ...property,
            value: property.value * (1 + annualGrowthRate),
            marketValue: (property.marketValue || property.value) * (1 + annualGrowthRate)
          }));
          newLastYearlyGrowth = prev.monthsPlayed;
          
          toast({
            title: "Annual Property Growth!",
            description: `Your properties increased in value by ${(annualGrowthRate * 100).toFixed(1)}%`,
          });
        }

        return {
          ...prev,
          cash: Math.max(0, newCash),
          ownedProperties: updatedOwnedProperties,
          mortgages: finalMortgages,
          experience: prev.experience,
          level: newLevel,
          experienceToNext: prev.experienceToNext,
          monthsPlayed: prev.monthsPlayed + 1,
          timeUntilNextMonth: 180, // Reset to 3 minutes (180 seconds)
          isBankrupt,
          creditScore: Math.min(850, prev.creditScore + creditScoreImprovement),
          lastYearlyGrowth: newLastYearlyGrowth
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
      const maxValue = getMaxPropertyValue(prev.level);
      
      if (!allowedTypes.includes('all') && !allowedTypes.includes(property.type)) {
        toast({
          title: "Level Restriction",
          description: `You need level ${property.type === 'commercial' ? 3 : property.type === 'luxury' ? 4 : 1} to buy ${property.type} properties!`,
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
      const stampDuty = property.price * STAMP_DUTY_RATE;
      const cashRequired = property.price - mortgageAmount + SOLICITOR_FEES + stampDuty + 
        (mortgageAmount > 0 ? MORTGAGE_BROKER_FEE : 0);
      
      if (prev.cash < cashRequired) {
        toast({
          title: "Insufficient Funds",
          description: `You need £${cashRequired.toLocaleString()} cash (inc. fees) to buy this property!`,
          variant: "destructive"
        });
        return prev;
      }

      let newMortgage: Mortgage | null = null;
      if (mortgageAmount > 0) {
        const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];
        // Dynamic rate based on current market conditions
        const dynamicRate = provider.baseRate + prev.currentMarketRate - BASE_MARKET_RATE + 
          (prev.creditScore < 650 ? 0.01 : 0) + (prev.creditScore < 600 ? 0.015 : 0);
        const monthlyRate = dynamicRate / 12;
        
        let monthlyPayment: number;
        if (mortgageType === 'interest-only') {
          monthlyPayment = mortgageAmount * monthlyRate;
        } else {
          // Repayment mortgage calculation
          const totalPayments = termYears * 12;
          monthlyPayment = mortgageAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / 
            (Math.pow(1 + monthlyRate, totalPayments) - 1);
        }
        
        newMortgage = {
          id: `${property.id}_${Date.now()}`,
          propertyId: property.id,
          principal: mortgageAmount,
          monthlyPayment,
          remainingBalance: mortgageAmount,
          interestRate: dynamicRate, // Use dynamic rate
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
      const purchasedProperty = { 
        ...property, 
        owned: true,
        marketValue: property.value // Store original market value
      };

      return {
        ...prev,
        cash: prev.cash - cashRequired,
        ownedProperties: [...prev.ownedProperties, purchasedProperty],
        mortgages: newMortgage ? [...prev.mortgages, newMortgage] : prev.mortgages,
        experience: prev.experience + Math.floor(property.price / 10000)
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

      const mortgageAmount = (purchasePrice * mortgagePercentage) / 100;
      const stampDuty = purchasePrice * STAMP_DUTY_RATE;
      const cashRequired = purchasePrice - mortgageAmount + SOLICITOR_FEES + stampDuty + (mortgageAmount > 0 ? MORTGAGE_BROKER_FEE : 0);
      
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
        const dynamicRate = provider.baseRate + prev.currentMarketRate - BASE_MARKET_RATE + (prev.creditScore < 650 ? 0.01 : 0) + (prev.creditScore < 600 ? 0.015 : 0);
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

      toast({
        title: "Property Purchased!",
        description: `You bought ${property.name} for £${purchasePrice.toLocaleString()}${mortgageAmount > 0 ? ` (£${mortgageAmount.toLocaleString()} mortgage)` : ''}.`,
      });

      // Track market value separately - use property.value as true market value
      const purchased = { 
        ...property, 
        price: purchasePrice, 
        value: purchasePrice, 
        owned: true,
        marketValue: property.value // Store original market value (could be higher if bought below market)
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
        daysUntilSale: daysToSell
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
    };
    setGameState(newState);
    const shuffled = [...AVAILABLE_PROPERTIES].sort(() => Math.random() - 0.5);
    setAuctionProperties(shuffled.length ? [shuffled[0]] : []);
    setEstateAgentProperties(shuffled.slice(1));
    localStorage.removeItem("propertyTycoonSave");
    
    toast({
      title: "Game Reset",
      description: "Started fresh with £250K. Good luck building your empire!",
    });
  }, []);

  const selectTenant = useCallback((propertyId: string, tenant: Tenant) => {
    setGameState(prev => {
      // Remove any existing void period for this property
      const updatedVoidPeriods = prev.voidPeriods.filter(vp => vp.propertyId !== propertyId);
      
      const existingTenantIndex = prev.tenants.findIndex(t => t.propertyId === propertyId);
      const newTenant: PropertyTenant = {
        propertyId,
        tenant,
        rentMultiplier: tenant.rentMultiplier,
        startDate: Date.now()
      };

      let updatedTenants;
      if (existingTenantIndex >= 0) {
        updatedTenants = [...prev.tenants];
        updatedTenants[existingTenantIndex] = newTenant;
      } else {
        updatedTenants = [...prev.tenants, newTenant];
      }

      // Update property monthly income based on tenant
      const updatedProperties = prev.ownedProperties.map(property => {
        if (property.id === propertyId) {
          const baseRent = AVAILABLE_PROPERTIES.find(p => p.id === propertyId)?.monthlyIncome || property.monthlyIncome;
          return {
            ...property,
            monthlyIncome: Math.floor(baseRent * tenant.rentMultiplier)
          };
        }
        return property;
      });

      toast({
        title: "Tenant Selected!",
        description: `${tenant.name} is now renting your property at £${Math.floor((AVAILABLE_PROPERTIES.find(p => p.id === propertyId)?.monthlyIncome || 0) * tenant.rentMultiplier)}/mo`,
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

      const totalFees = SOLICITOR_FEES + MORTGAGE_BROKER_FEE;
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

      const dynamicRate = provider.baseRate + prev.currentMarketRate - BASE_MARKET_RATE + 
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

  const totalMonthlyExpenses = gameState.mortgages.reduce((total, mortgage) => 
    total + mortgage.monthlyPayment, 0
  ) + gameState.ownedProperties.reduce((total, property) => 
    total + (property.value * (PROPERTY_TAX_RATE + MAINTENANCE_RATE) / 12), 0
  );

  const totalDebt = gameState.mortgages.reduce((total, mortgage) => 
    total + mortgage.remainingBalance, 0
  );

  // Calculate credit score based on player performance
  const calculateCreditScore = () => {
    let score = 600; // Base score
    
    // Increase based on net worth
    score += Math.min((netWorth - totalDebt) / 10000, 200); // Up to 200 points
    
    // Increase based on level
    score += gameState.level * 10;
    
    // Decrease if high debt-to-value (portfolio LTV) ratio
    const portfolioValue = gameState.ownedProperties.reduce((sum, p) => sum + p.value, 0);
    const debtToValue = portfolioValue > 0 ? totalDebt / portfolioValue : 0;
    if (debtToValue > 0.8) score -= 100;
    if (debtToValue > 0.6) score -= 50;
    
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
    const dynamicRate = provider.baseRate + prev.currentMarketRate - BASE_MARKET_RATE + (prev.creditScore < 650 ? 0.01 : 0) + (prev.creditScore < 600 ? 0.015 : 0);
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
    const dynamicRate = provider.baseRate + prev.currentMarketRate - BASE_MARKET_RATE + 0.005; // portfolio +0.5%
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
  const payDamageWithCash = useCallback((damageId: string) => {
    setGameState(prev => {
      const damage = prev.pendingDamages.find(d => d.id === damageId);
      if (!damage) return prev;

      const currentYear = Math.floor(prev.monthsPlayed / 12);
      const existingAnnualCost = prev.annualRepairCosts.find(
        arc => arc.propertyId === damage.propertyId && arc.year === currentYear
      );

      const updatedAnnualCosts = existingAnnualCost
        ? prev.annualRepairCosts.map(arc =>
            arc.propertyId === damage.propertyId && arc.year === currentYear
              ? { ...arc, totalCost: arc.totalCost + damage.repairCost }
              : arc
          )
        : [...prev.annualRepairCosts, {
            propertyId: damage.propertyId,
            year: currentYear,
            totalCost: damage.repairCost
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
        description: `Paid £${damage.repairCost.toLocaleString()} to repair ${damage.propertyName}`,
      });

      return {
        ...prev,
        cash: prev.cash - damage.repairCost,
        pendingDamages: prev.pendingDamages.filter(d => d.id !== damageId),
        annualRepairCosts: updatedAnnualCosts,
        damageHistory: updatedDamageHistory
      };
    });
  }, []);

  // Take a loan to pay for property damage
  const payDamageWithLoan = useCallback((damageId: string) => {
    setGameState(prev => {
      const damage = prev.pendingDamages.find(d => d.id === damageId);
      if (!damage) return prev;

      const currentYear = Math.floor(prev.monthsPlayed / 12);
      const existingAnnualCost = prev.annualRepairCosts.find(
        arc => arc.propertyId === damage.propertyId && arc.year === currentYear
      );

      const updatedAnnualCosts = existingAnnualCost
        ? prev.annualRepairCosts.map(arc =>
            arc.propertyId === damage.propertyId && arc.year === currentYear
              ? { ...arc, totalCost: arc.totalCost + damage.repairCost }
              : arc
          )
        : [...prev.annualRepairCosts, {
            propertyId: damage.propertyId,
            year: currentYear,
            totalCost: damage.repairCost
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
        description: `Borrowed £${damage.repairCost.toLocaleString()} to repair ${damage.propertyName}. Credit score reduced.`,
        variant: "destructive"
      });

      return {
        ...prev,
        cash: prev.cash + damage.repairCost,
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

  return {
    ...gameState,
    netWorth: netWorth - totalDebt,
    totalMonthlyIncome,
    totalMonthlyExpenses,
    totalDebt,
    creditScore: calculateCreditScore(),
    mortgageProviders: MORTGAGE_PROVIDERS,
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
    dismissDamage,
    resetGame
  };
}