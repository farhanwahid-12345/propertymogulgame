import { useState, useEffect, useCallback } from "react";
import { Property } from "@/components/ui/property-card";
import { toast } from "@/hooks/use-toast";

interface Mortgage {
  propertyId: string;
  principal: number;
  monthlyPayment: number;
  remainingBalance: number;
  interestRate: number;
  termMonths: number;
}

interface GameState {
  cash: number;
  ownedProperties: Property[];
  mortgages: Mortgage[];
  level: number;
  experience: number;
  experienceToNext: number;
  monthsPlayed: number;
  timeUntilNextMonth: number;
  isBankrupt: boolean;
}

const INITIAL_CASH = 100000; // £100K starting cash
const EXPERIENCE_BASE = 1000;
const MORTGAGE_INTEREST_RATE = 0.055; // 5.5% annual interest rate
const PROPERTY_TAX_RATE = 0.012; // 1.2% annual property tax
const MAINTENANCE_RATE = 0.008; // 0.8% annual maintenance costs

// Middlesbrough properties based on real market data
const AVAILABLE_PROPERTIES: Property[] = [
  {
    id: "1",
    name: "Victorian Terrace House",
    type: "residential",
    price: 85000,
    value: 85000,
    neighborhood: "Linthorpe",
    monthlyIncome: 650,
    image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400&h=300&fit=crop",
    marketTrend: "up"
  },
  {
    id: "2", 
    name: "Modern Starter Home",
    type: "residential",
    price: 120000,
    value: 120000,
    neighborhood: "Marton",
    monthlyIncome: 850,
    image: "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400&h=300&fit=crop",
    marketTrend: "stable"
  },
  {
    id: "3",
    name: "Town Centre Office",
    type: "commercial",
    price: 180000,
    value: 180000,
    neighborhood: "Middlesbrough Centre",
    monthlyIncome: 1200,
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400&h=300&fit=crop",
    marketTrend: "up"
  },
  {
    id: "4",
    name: "Retail Unit",
    type: "commercial", 
    price: 250000,
    value: 250000,
    neighborhood: "Captain Cook Square",
    monthlyIncome: 1800,
    image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop",
    marketTrend: "down"
  },
  {
    id: "5",
    name: "Executive Home",
    type: "luxury",
    price: 320000,
    value: 320000,
    neighborhood: "Nunthorpe",
    monthlyIncome: 2200,
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=400&h=300&fit=crop",
    marketTrend: "up"
  },
  {
    id: "6",
    name: "Detached Family Home",
    type: "luxury",
    price: 450000,
    value: 450000,
    neighborhood: "Stokesley Road",
    monthlyIncome: 2800,
    image: "https://images.unsplash.com/photo-1518780664697-55e3ad937233?w=400&h=300&fit=crop",
    marketTrend: "stable"
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
        level: parsedState.level || 1,
        experience: parsedState.experience || 0,
        experienceToNext: parsedState.experienceToNext || EXPERIENCE_BASE,
        monthsPlayed: parsedState.monthsPlayed || 0,
        timeUntilNextMonth: parsedState.timeUntilNextMonth || 180,
        isBankrupt: parsedState.isBankrupt || false
      };
    }
    return {
      cash: INITIAL_CASH,
      ownedProperties: [],
      mortgages: [],
      level: 1,
      experience: 0,
      experienceToNext: EXPERIENCE_BASE,
      monthsPlayed: 0,
      timeUntilNextMonth: 180,
      isBankrupt: false
    };
  });

  const [availableProperties, setAvailableProperties] = useState<Property[]>(AVAILABLE_PROPERTIES);

  // Save to localStorage whenever game state changes
  useEffect(() => {
    localStorage.setItem("propertyTycoonSave", JSON.stringify(gameState));
  }, [gameState]);

  // Market fluctuation simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setGameState(prev => ({
        ...prev,
        ownedProperties: prev.ownedProperties.map(property => ({
          ...property,
          value: Math.max(
            property.price * 0.5, // Minimum 50% of original price
            property.value * (0.98 + Math.random() * 0.04) // -2% to +2% change
          )
        }))
      }));

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

  const buyProperty = useCallback((property: Property, mortgagePercentage: number = 0) => {
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
        const termMonths = 300; // 25 years
        const monthlyRate = MORTGAGE_INTEREST_RATE / 12;
        const monthlyPayment = mortgageAmount * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) / 
          (Math.pow(1 + monthlyRate, termMonths) - 1);
        
        newMortgage = {
          propertyId: property.id,
          principal: mortgageAmount,
          monthlyPayment,
          remainingBalance: mortgageAmount,
          interestRate: MORTGAGE_INTEREST_RATE,
          termMonths
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
      level: 1,
      experience: 0,
      experienceToNext: EXPERIENCE_BASE,
      monthsPlayed: 0,
      timeUntilNextMonth: 180,
      isBankrupt: false
    };
    setGameState(newState);
    setAvailableProperties(AVAILABLE_PROPERTIES);
    localStorage.removeItem("propertyTycoonSave");
    
    toast({
      title: "Game Reset",
      description: "Started fresh with £100K. Good luck building your empire!",
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

  return {
    ...gameState,
    netWorth: netWorth - totalDebt,
    totalMonthlyIncome,
    totalMonthlyExpenses,
    totalDebt,
    availableProperties,
    buyProperty,
    sellProperty,
    resetGame
  };
}