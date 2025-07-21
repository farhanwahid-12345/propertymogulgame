import { useState, useEffect, useCallback } from "react";
import { Property } from "@/components/ui/property-card";
import { toast } from "@/hooks/use-toast";

interface GameState {
  cash: number;
  ownedProperties: Property[];
  level: number;
  experience: number;
  experienceToNext: number;
  monthsPlayed: number;
}

const INITIAL_CASH = 1000000; // $1M starting cash
const EXPERIENCE_BASE = 1000;

// Sample properties for the game
const AVAILABLE_PROPERTIES: Property[] = [
  {
    id: "1",
    name: "Cozy Downtown Apartment",
    type: "residential",
    price: 250000,
    value: 250000,
    neighborhood: "Downtown District",
    monthlyIncome: 2500,
    image: "/placeholder.svg",
    marketTrend: "up"
  },
  {
    id: "2", 
    name: "Suburban Family Home",
    type: "residential",
    price: 450000,
    value: 450000,
    neighborhood: "Maple Heights",
    monthlyIncome: 3200,
    image: "/placeholder.svg",
    marketTrend: "stable"
  },
  {
    id: "3",
    name: "Corner Office Building",
    type: "commercial",
    price: 1200000,
    value: 1200000,
    neighborhood: "Business Center",
    monthlyIncome: 8500,
    image: "/placeholder.svg",
    marketTrend: "up"
  },
  {
    id: "4",
    name: "Shopping Plaza",
    type: "commercial", 
    price: 2100000,
    value: 2100000,
    neighborhood: "Commerce District",
    monthlyIncome: 15000,
    image: "/placeholder.svg",
    marketTrend: "down"
  },
  {
    id: "5",
    name: "Luxury Penthouse",
    type: "luxury",
    price: 850000,
    value: 850000,
    neighborhood: "Elite Heights",
    monthlyIncome: 6500,
    image: "/placeholder.svg",
    marketTrend: "up"
  },
  {
    id: "6",
    name: "Beachfront Villa",
    type: "luxury",
    price: 1800000,
    value: 1800000,
    neighborhood: "Coastal Paradise",
    monthlyIncome: 12000,
    image: "/placeholder.svg",
    marketTrend: "stable"
  }
];

export function useGameState() {
  const [gameState, setGameState] = useState<GameState>(() => {
    const saved = localStorage.getItem("propertyTycoonSave");
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      cash: INITIAL_CASH,
      ownedProperties: [],
      level: 1,
      experience: 0,
      experienceToNext: EXPERIENCE_BASE,
      monthsPlayed: 0
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

  // Monthly income and progression
  useEffect(() => {
    const monthlyInterval = setInterval(() => {
      setGameState(prev => {
        const monthlyIncome = prev.ownedProperties.reduce((total, property) => 
          total + property.monthlyIncome, 0
        );
        
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
          cash: prev.cash + monthlyIncome,
          experience: newLevel > prev.level ? 0 : newExperience,
          level: newLevel,
          experienceToNext: newExperienceToNext,
          monthsPlayed: prev.monthsPlayed + 1
        };
      });
    }, 15000); // Every 15 seconds = 1 month

    return () => clearInterval(monthlyInterval);
  }, []);

  const buyProperty = useCallback((property: Property) => {
    setGameState(prev => {
      if (prev.cash < property.price) {
        toast({
          title: "Insufficient Funds",
          description: "You don't have enough cash to buy this property!",
          variant: "destructive"
        });
        return prev;
      }

      toast({
        title: "Property Purchased!",
        description: `You bought ${property.name} for $${property.price.toLocaleString()}`,
      });

      return {
        ...prev,
        cash: prev.cash - property.price,
        ownedProperties: [...prev.ownedProperties, { ...property, owned: true }],
        experience: prev.experience + Math.floor(property.price / 10000)
      };
    });

    setAvailableProperties(prev => prev.filter(p => p.id !== property.id));
  }, []);

  const sellProperty = useCallback((property: Property) => {
    setGameState(prev => {
      const profit = property.value - property.price;
      
      toast({
        title: "Property Sold!",
        description: `You sold ${property.name} for $${property.value.toLocaleString()}. ${profit >= 0 ? `Profit: $${profit.toLocaleString()}` : `Loss: $${Math.abs(profit).toLocaleString()}`}`,
      });

      return {
        ...prev,
        cash: prev.cash + property.value,
        ownedProperties: prev.ownedProperties.filter(p => p.id !== property.id),
        experience: prev.experience + Math.floor(property.value / 15000)
      };
    });

    setAvailableProperties(prev => [...prev, { ...property, owned: false }]);
  }, []);

  const resetGame = useCallback(() => {
    const newState: GameState = {
      cash: INITIAL_CASH,
      ownedProperties: [],
      level: 1,
      experience: 0,
      experienceToNext: EXPERIENCE_BASE,
      monthsPlayed: 0
    };
    setGameState(newState);
    setAvailableProperties(AVAILABLE_PROPERTIES);
    localStorage.removeItem("propertyTycoonSave");
    
    toast({
      title: "Game Reset",
      description: "Started fresh with $1M. Good luck building your empire!",
    });
  }, []);

  const netWorth = gameState.cash + gameState.ownedProperties.reduce((total, property) => 
    total + property.value, 0
  );

  const totalMonthlyIncome = gameState.ownedProperties.reduce((total, property) => 
    total + property.monthlyIncome, 0
  );

  return {
    ...gameState,
    netWorth,
    totalMonthlyIncome,
    availableProperties,
    buyProperty,
    sellProperty,
    resetGame
  };
}