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
  propertyId: string;
  principal: number;
  monthlyPayment: number;
  remainingBalance: number;
  interestRate: number;
  termMonths: number;
  providerId: string;
}

interface PropertyTenant {
  propertyId: string;
  tenant: Tenant;
  rentMultiplier: number;
  startDate: number; // timestamp
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
}

const INITIAL_CASH = 100000; // £100K starting cash
const EXPERIENCE_BASE = 1000;
const MORTGAGE_INTEREST_RATE = 0.055; // 5.5% annual interest rate
const PROPERTY_TAX_RATE = 0.012; // 1.2% annual property tax
const MAINTENANCE_RATE = 0.008; // 0.8% annual maintenance costs
const BASE_MARKET_RATE = 0.035; // 3.5% base market rate

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
      timeUntilNextMonth: parsedState.timeUntilNextMonth || 180,
      isBankrupt: parsedState.isBankrupt || false,
      creditScore: parsedState.creditScore || 650,
      currentMarketRate: parsedState.currentMarketRate || BASE_MARKET_RATE,
      tenantEvents: parsedState.tenantEvents || []
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
      tenantEvents: []
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
              description: `${renovation.type.name} finished! Property value increased by £${renovation.type.valueIncrease.toLocaleString()}, rent by £${renovation.type.rentIncrease}/mo.`,
            });
          }
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

        return {
          ...prev,
          ownedProperties: updatedProperties.map(property => ({
            ...property,
            value: Math.max(
              property.price * 0.5, // Minimum 50% of original price
              property.value * (0.98 + Math.random() * 0.04) // -2% to +2% change
            )
          })),
          renovations: activeRenovations,
          currentMarketRate: newMarketRate,
          tenantEvents: [...prev.tenantEvents, ...newTenantEvents]
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

        const monthlyIncome = prev.ownedProperties.reduce((total, property) => 
          total + property.monthlyIncome, 0
        );
        
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
        
        // Update mortgage balances
        const updatedMortgages = prev.mortgages.map(mortgage => {
          const interest = mortgage.remainingBalance * (mortgage.interestRate / 12);
          const principal = mortgage.monthlyPayment - interest;
          const newBalance = Math.max(0, mortgage.remainingBalance - principal);
          
          return {
            ...mortgage,
            remainingBalance: newBalance
          };
        }).filter(mortgage => mortgage.remainingBalance > 0);
        
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
          mortgages: updatedMortgages,
          experience: newLevel > prev.level ? 0 : newExperience,
          level: newLevel,
          experienceToNext: newExperienceToNext,
          monthsPlayed: prev.monthsPlayed + 1,
          timeUntilNextMonth: 180, // Reset to 3 minutes
          isBankrupt
        };
      });
    }, 180000); // Every 3 minutes = 1 month

    return () => clearInterval(monthlyInterval);
  }, []);

  const buyProperty = useCallback((property: Property, mortgagePercentage: number = 0, providerId?: string) => {
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
      const cashRequired = property.price - mortgageAmount;
      
      if (prev.cash < cashRequired) {
        toast({
          title: "Insufficient Funds",
          description: `You need £${cashRequired.toLocaleString()} cash to buy this property!`,
          variant: "destructive"
        });
        return prev;
      }

      let newMortgage: Mortgage | null = null;
      if (mortgageAmount > 0) {
        const provider = MORTGAGE_PROVIDERS.find(p => p.id === providerId) || MORTGAGE_PROVIDERS[1];
        const dynamicRate = provider.baseRate + prev.currentMarketRate - BASE_MARKET_RATE + 
          (prev.creditScore < 650 ? 0.01 : 0) + (prev.creditScore < 600 ? 0.015 : 0);
        const termMonths = 300; // 25 years
        const monthlyRate = dynamicRate / 12;
        const monthlyPayment = mortgageAmount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
          (Math.pow(1 + monthlyRate, termMonths) - 1);
        
        newMortgage = {
          propertyId: property.id,
          principal: mortgageAmount,
          monthlyPayment,
          remainingBalance: mortgageAmount,
          interestRate: provider.baseRate + prev.currentMarketRate - BASE_MARKET_RATE + 
            (prev.creditScore < 650 ? 0.01 : 0) + (prev.creditScore < 600 ? 0.015 : 0),
          termMonths,
          providerId: providerId || "halifax"
        };
      }

      toast({
        title: "Property Purchased!",
        description: `You bought ${property.name} for £${property.price.toLocaleString()}${mortgageAmount > 0 ? ` (£${mortgageAmount.toLocaleString()} mortgage)` : ''}`,
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

  const sellProperty = useCallback((property: Property) => {
    setGameState(prev => {
      const mortgage = prev.mortgages.find(m => m.propertyId === property.id);
      const salePrice = property.value;
      const mortgagePayoff = mortgage ? mortgage.remainingBalance : 0;
      const netProceeds = salePrice - mortgagePayoff;
      const profit = netProceeds - (property.price - (mortgage ? mortgage.principal : 0));
      
      toast({
        title: "Property Sold!",
        description: `You sold ${property.name} for £${salePrice.toLocaleString()}. ${mortgage ? `Mortgage payoff: £${mortgagePayoff.toLocaleString()}. ` : ''}${profit >= 0 ? `Profit: £${profit.toLocaleString()}` : `Loss: £${Math.abs(profit).toLocaleString()}`}`,
      });

      return {
        ...prev,
        cash: prev.cash + netProceeds,
        ownedProperties: prev.ownedProperties.filter(p => p.id !== property.id),
        mortgages: prev.mortgages.filter(m => m.propertyId !== property.id),
        experience: prev.experience + Math.floor(salePrice / 15000)
      };
    });

    setAvailableProperties(prev => [...prev, { ...property, owned: false }]);
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
      tenantEvents: []
    };
    setGameState(newState);
    setAvailableProperties(AVAILABLE_PROPERTIES);
    localStorage.removeItem("propertyTycoonSave");
    
    toast({
      title: "Game Reset",
      description: "Started fresh with £100K. Good luck building your empire!",
    });
  }, []);

  const selectTenant = useCallback((propertyId: string, tenant: Tenant) => {
    setGameState(prev => {
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
        ownedProperties: updatedProperties
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

      const renovation: Renovation = {
        id: `${propertyId}_${renovationType.id}_${Date.now()}`,
        propertyId,
        type: renovationType,
        startDate: Date.now(),
        completionDate: Date.now() + (renovationType.duration * 24 * 60 * 60 * 1000)
      };

      toast({
        title: "Renovation Started!",
        description: `${renovationType.name} renovation has begun. It will take ${renovationType.duration} days to complete.`,
      });

      return {
        ...prev,
        cash: prev.cash - renovationType.cost,
        renovations: [...prev.renovations, renovation]
      };
    });
  }, []);

  const settleMortgage = useCallback((mortgagePropertyId: string, settlementPropertyId: string) => {
    setGameState(prev => {
      const mortgage = prev.mortgages.find(m => m.propertyId === mortgagePropertyId);
      const settlementProperty = prev.ownedProperties.find(p => p.id === settlementPropertyId);
      
      if (!mortgage || !settlementProperty) {
        toast({
          title: "Settlement Failed",
          description: "Could not find mortgage or settlement property!",
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

      const cashFromSale = settlementProperty.value - mortgage.remainingBalance;

      toast({
        title: "Mortgage Settled!",
        description: `${settlementProperty.name} was sold to pay off the mortgage. You received £${cashFromSale.toLocaleString()} in cash.`,
      });

      return {
        ...prev,
        cash: prev.cash + cashFromSale,
        ownedProperties: prev.ownedProperties.filter(p => p.id !== settlementPropertyId),
        mortgages: prev.mortgages.filter(m => m.propertyId !== mortgagePropertyId),
        tenants: prev.tenants.filter(t => t.propertyId !== settlementPropertyId)
      };
    });

    // Add settlement property back to available properties
    const settlementProperty = gameState.ownedProperties.find(p => p.id === settlementPropertyId);
    if (settlementProperty) {
      setAvailableProperties(prev => [...prev, { ...settlementProperty, owned: false }]);
    }
  }, [gameState.ownedProperties]);

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
    startRenovation,
    settleMortgage,
    resetGame
  };
}