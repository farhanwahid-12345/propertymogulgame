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
}

const INITIAL_CASH = 1000000; // £1M starting cash
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
const AVAILABLE_PROPERTIES: Property[] = [
  // Residential Properties
  {
    id: "1",
    name: "45 Linthorpe Road",
    type: "residential",
    price: 75000,
    value: 75000,
    neighborhood: "Linthorpe",
    monthlyIncome: 600,
    image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop",
    marketTrend: "up"
  },
  {
    id: "2",
    name: "12 Park Road South",
    type: "residential",
    price: 68000,
    value: 68000,
    neighborhood: "Linthorpe",
    monthlyIncome: 550,
    image: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop",
    marketTrend: "stable"
  },
  {
    id: "3",
    name: "78 Acklam Road",
    type: "residential",
    price: 95000,
    value: 95000,
    neighborhood: "Acklam",
    monthlyIncome: 725,
    image: "https://images.unsplash.com/photo-1449157291145-7efd050a4d0e?w=400&h=300&fit=crop",
    marketTrend: "up"
  },
  {
    id: "4",
    name: "156 Cargo Fleet Lane",
    type: "residential",
    price: 58000,
    value: 58000,
    neighborhood: "Port Clarence",
    monthlyIncome: 475,
    image: "https://images.unsplash.com/photo-1459767129954-1b1c1f9b9ace?w=400&h=300&fit=crop",
    marketTrend: "stable"
  },
  {
    id: "5",
    name: "23 Marton Road",
    type: "residential",
    price: 120000,
    value: 120000,
    neighborhood: "Marton",
    monthlyIncome: 850,
    image: "https://images.unsplash.com/photo-1460574283810-2aab119d8511?w=400&h=300&fit=crop",
    marketTrend: "up"
  },
  {
    id: "6",
    name: "67 Roman Road",
    type: "residential",
    price: 82000,
    value: 82000,
    neighborhood: "Pallister Park",
    monthlyIncome: 625,
    image: "https://images.unsplash.com/photo-1487958449943-2429e8be8625?w=400&h=300&fit=crop",
    marketTrend: "down"
  },
  {
    id: "7",
    name: "91 Trimdon Avenue",
    type: "residential",
    price: 72000,
    value: 72000,
    neighborhood: "Acklam",
    monthlyIncome: 575,
    image: "https://images.unsplash.com/photo-1496307653780-42ee777d4833?w=400&h=300&fit=crop",
    marketTrend: "stable"
  },
  {
    id: "8",
    name: "34 Southfield Road",
    type: "residential",
    price: 145000,
    value: 145000,
    neighborhood: "Middlesbrough Centre",
    monthlyIncome: 950,
    image: "https://images.unsplash.com/photo-1431576901776-e539bd916ba2?w=400&h=300&fit=crop",
    marketTrend: "up"
  },

  // Commercial Properties
  {
    id: "9",
    name: "Unit 5 Albert Road",
    type: "commercial",
    price: 180000,
    value: 180000,
    neighborhood: "Middlesbrough Centre",
    monthlyIncome: 1200,
    image: "https://images.unsplash.com/photo-1497604401993-f2e922e5cb0a?w=400&h=300&fit=crop",
    marketTrend: "up"
  },
  {
    id: "10",
    name: "Shop A, Linthorpe Road",
    type: "commercial",
    price: 165000,
    value: 165000,
    neighborhood: "Linthorpe",
    monthlyIncome: 1100,
    image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop",
    marketTrend: "stable"
  },
  {
    id: "11",
    name: "Captain Cook Square Unit",
    type: "commercial",
    price: 250000,
    value: 250000,
    neighborhood: "Captain Cook Square",
    monthlyIncome: 1800,
    image: "https://images.unsplash.com/photo-1527576539890-dfa815648363?w=400&h=300&fit=crop",
    marketTrend: "down"
  },
  {
    id: "12",
    name: "Warehouse, Vulcan Street",
    type: "commercial",
    price: 320000,
    value: 320000,
    neighborhood: "South Bank",
    monthlyIncome: 2100,
    image: "https://images.unsplash.com/photo-1488972685288-c3fd157d7c7a?w=400&h=300&fit=crop",
    marketTrend: "stable"
  },

  // Luxury Properties
  {
    id: "13",
    name: "8 The Avenue, Nunthorpe",
    type: "luxury",
    price: 385000,
    value: 385000,
    neighborhood: "Nunthorpe",
    monthlyIncome: 2400,
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&h=300&fit=crop",
    marketTrend: "up"
  },
  {
    id: "14",
    name: "Manor House, Stokesley Road",
    type: "luxury",
    price: 520000,
    value: 520000,
    neighborhood: "Marton",
    monthlyIncome: 3200,
    image: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&h=300&fit=crop",
    marketTrend: "stable"
  },
  {
    id: "15",
    name: "Executive Home, Grey Towers",
    type: "luxury",
    price: 675000,
    value: 675000,
    neighborhood: "Nunthorpe",
    monthlyIncome: 4100,
    image: "https://images.unsplash.com/photo-1433832597046-4f10e10ac764?w=400&h=300&fit=crop",
    marketTrend: "up"
  },
  {
    id: "16",
    name: "Penthouse, Centre Square",
    type: "luxury",
    price: 450000,
    value: 450000,
    neighborhood: "Middlesbrough Centre",
    monthlyIncome: 2800,
    image: "https://images.unsplash.com/photo-1493397212122-2b85dda8106b?w=400&h=300&fit=crop",
    marketTrend: "down"
  },
  {
    id: "17",
    name: "Historic Villa, The Crescent",
    type: "luxury",
    price: 750000,
    value: 750000,
    neighborhood: "Linthorpe",
    monthlyIncome: 4500,
    image: "https://images.unsplash.com/photo-1466442929976-97f336a657be?w=400&h=300&fit=crop",
    marketTrend: "stable"
  },
  {
    id: "18",
    name: "Modern Townhouse, Hemlington",
    type: "luxury",
    price: 295000,
    value: 295000,
    neighborhood: "Hemlington",
    monthlyIncome: 1950,
    image: "https://images.unsplash.com/photo-1492321936769-b49830bc1d1e?w=400&h=300&fit=crop",
    marketTrend: "up"
  }
];

export function useGameState() {
  const [gameState, setGameState] = useState<GameState>(() => {
    const saved = localStorage.getItem("propertyTycoonSave");
    if (saved) {
      const parsedState = JSON.parse(saved);
      // Ensure all required properties exist for backward compatibility
    return {
      cash: parsedState.cash || INITIAL_CASH,
      ownedProperties: parsedState.ownedProperties || [],
      mortgages: parsedState.mortgages || [],
      tenants: parsedState.tenants || [],
      renovations: parsedState.renovations || [],
      level: parsedState.level || 1,
      experience: parsedState.experience || 0,
      experienceToNext: parsedState.experienceToNext || EXPERIENCE_BASE,
      monthsPlayed: parsedState.monthsPlayed || 0,
      timeUntilNextMonth: parsedState.timeUntilNextMonth || 60,
      isBankrupt: parsedState.isBankrupt || false,
      creditScore: parsedState.creditScore || 650,
      currentMarketRate: parsedState.currentMarketRate || BASE_MARKET_RATE,
      tenantEvents: parsedState.tenantEvents || [],
      voidPeriods: parsedState.voidPeriods || [],
      propertyListings: parsedState.propertyListings || []
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
      timeUntilNextMonth: 60,
      isBankrupt: false,
      creditScore: 650,
      currentMarketRate: BASE_MARKET_RATE,
      tenantEvents: [],
      voidPeriods: [],
      propertyListings: []
    };
  });

  const [availableProperties, setAvailableProperties] = useState<Property[]>(AVAILABLE_PROPERTIES);

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
        
        // Check for tenant events
        const newTenantEvents: TenantEvent[] = [];
        prev.tenants.forEach(({ propertyId, tenant }) => {
          if (Math.random() < (tenant.defaultRisk + tenant.damageRisk) / 200) {
            const eventType = Math.random() < 0.4 ? 'default' : Math.random() < 0.7 ? 'damage' : 'early_exit';
            const property = prev.ownedProperties.find(p => p.id === propertyId);
            if (property) {
              const amount = eventType === 'damage' ? property.value * (0.05 + Math.random() * 0.15) :
                            eventType === 'default' ? property.monthlyIncome * (1 + Math.random() * 2) :
                            0;
              newTenantEvents.push({
                propertyId,
                type: eventType,
                amount,
                month: prev.monthsPlayed
              });
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
          ownedProperties: remainingProperties.map(property => ({
            ...property,
            value: Math.max(
              property.price * 0.5, // Minimum 50% of original price
              property.value * (0.98 + Math.random() * 0.04) // -2% to +2% change
            )
          })),
          mortgages: remainingMortgages,
          tenants: remainingTenants,
          renovations: activeRenovations,
          currentMarketRate: newMarketRate,
          tenantEvents: [...prev.tenantEvents, ...newTenantEvents],
          voidPeriods: activeVoidPeriods,
          propertyListings: updatedListings.filter(listing => listing.daysUntilSale > 0)
        };
      });

      setAvailableProperties(prev => 
        prev.map(property => ({
          ...property,
          price: Math.max(
            property.price * 0.8, // Minimum 80% of original price  
            property.price * (0.985 + Math.random() * 0.03) // -1.5% to +1.5% change
          ),
          value: Math.max(
            property.price * 0.8,
            property.value * (0.985 + Math.random() * 0.03)
          ),
          marketTrend: Math.random() > 0.7 ? (Math.random() > 0.5 ? "up" : "down") : "stable"
        }))
      );
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

  // Monthly income, expenses and progression
  useEffect(() => {
    const monthlyInterval = setInterval(() => {
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
        
        const newExperience = prev.experience + Math.floor(monthlyIncome / 100);
        const newLevel = prev.level + (newExperience >= prev.experienceToNext ? 1 : 0);
        const newExperienceToNext = newLevel > prev.level ? 
          EXPERIENCE_BASE * Math.pow(1.5, newLevel - 1) : prev.experienceToNext;

        if (newLevel > prev.level) {
          toast({
            title: "Level Up!",
            description: `Congratulations! You reached level ${newLevel}!`,
          });
        }

        return {
          ...prev,
          cash: Math.max(0, newCash),
          mortgages: finalMortgages,
          experience: newLevel > prev.level ? 0 : newExperience,
          level: newLevel,
          experienceToNext: newExperienceToNext,
          monthsPlayed: prev.monthsPlayed + 1,
          timeUntilNextMonth: 60, // Reset to 1 minute
          isBankrupt,
          creditScore: Math.min(850, prev.creditScore + creditScoreImprovement)
        };
      });
    }, 60000); // Every 1 minute = 1 month

    return () => clearInterval(monthlyInterval);
  }, []);

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
          interestRate: provider.baseRate + prev.currentMarketRate - BASE_MARKET_RATE + 
            (prev.creditScore < 650 ? 0.01 : 0) + (prev.creditScore < 600 ? 0.015 : 0),
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

      return {
        ...prev,
        cash: prev.cash - cashRequired,
        ownedProperties: [...prev.ownedProperties, { ...property, owned: true }],
        mortgages: newMortgage ? [...prev.mortgages, newMortgage] : prev.mortgages,
        experience: prev.experience + Math.floor(property.price / 10000)
      };
    });

    setAvailableProperties(prev => prev.filter(p => p.id !== property.id));
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
      timeUntilNextMonth: 60,
      isBankrupt: false,
      creditScore: 650,
      currentMarketRate: BASE_MARKET_RATE,
      tenantEvents: [],
      voidPeriods: [],
      propertyListings: []
    };
    setGameState(newState);
    setAvailableProperties(AVAILABLE_PROPERTIES);
    localStorage.removeItem("propertyTycoonSave");
    
    toast({
      title: "Game Reset",
      description: "Started fresh with £1M. Good luck building your empire!",
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

  const settleMortgage = useCallback((mortgagePropertyId: string, useCash: boolean = false, settlementPropertyId?: string) => {
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
          mortgages: prev.mortgages.filter(m => m.propertyId !== mortgagePropertyId)
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

      if (cashRaised < 0) {
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
    
    // Decrease if high debt-to-income ratio
    const debtToIncomeRatio = totalDebt / Math.max(totalMonthlyIncome * 12, 1);
    if (debtToIncomeRatio > 0.5) score -= 100;
    if (debtToIncomeRatio > 0.3) score -= 50;
    
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
        voidPeriods: prev.voidPeriods.filter(vp => vp.propertyId !== propertyId)
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
        voidPeriods: prev.voidPeriods.filter(vp => vp.propertyId !== propertyId)
      };
    });
  }, []);

  return {
    ...gameState,
    netWorth: netWorth - totalDebt,
    totalMonthlyIncome,
    totalMonthlyExpenses,
    totalDebt,
    creditScore: calculateCreditScore(),
    mortgageProviders: MORTGAGE_PROVIDERS,
    availableProperties,
    buyProperty,
    sellProperty,
    selectTenant,
    removeTenant,
    startRenovation,
    settleMortgage,
    remortgageProperty,
    handleEstateAgentSale,
    handleAuctionSale,
    resetGame
  };
}