import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Building2, Home, Crown, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Property {
  id: string;
  name: string;
  type: "residential" | "commercial" | "luxury";
  price: number;
  value: number;
  neighborhood: string;
  monthlyIncome: number;
  image: string;
  owned?: boolean;
  marketTrend: "up" | "down" | "stable";
}

interface PropertyCardProps {
  property: Property;
  onBuy?: (property: Property, mortgagePercentage?: number) => void;
  onSell?: (property: Property) => void;
  playerCash?: number;
}

const PropertyTypeIcon = {
  residential: Home,
  commercial: Building2,
  luxury: Crown,
};

const PropertyTypeColor = {
  residential: "property-residential",
  commercial: "property-commercial", 
  luxury: "property-luxury",
};

export function PropertyCard({ property, onBuy, onSell, playerCash = 0 }: PropertyCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showMortgageOptions, setShowMortgageOptions] = useState(false);
  const [mortgagePercentage, setMortgagePercentage] = useState([80]);
  
  const Icon = PropertyTypeIcon[property.type];
  const mortgageAmount = (property.price * mortgagePercentage[0]) / 100;
  const cashRequired = property.price - mortgageAmount;
  const canAffordCash = playerCash >= property.price;
  const canAffordMortgage = playerCash >= cashRequired;
  const profitLoss = property.value - property.price;
  const profitPercent = ((profitLoss / property.price) * 100).toFixed(1);

  const handleAction = async (action: () => void) => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate transaction
    action();
    setIsLoading(false);
  };

  return (
    <Card className={cn(
      "transition-all duration-300 hover:shadow-lg hover:scale-105",
      property.owned && "ring-2 ring-primary"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", `text-${PropertyTypeColor[property.type]}`)} />
            <CardTitle className="text-lg">{property.name}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {property.marketTrend === "up" ? (
              <TrendingUp className="h-4 w-4 text-success" />
            ) : property.marketTrend === "down" ? (
              <TrendingDown className="h-4 w-4 text-danger" />
            ) : null}
            <Badge variant="outline" className="capitalize">
              {property.type}
            </Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{property.neighborhood}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="aspect-video bg-muted rounded-lg overflow-hidden">
          <img 
            src={property.image} 
            alt={property.name}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Price:</span>
            <span className="font-bold text-lg">
              £{property.price.toLocaleString()}
            </span>
          </div>
          
          {property.owned && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Current Value:</span>
                <span className="font-bold">
                  £{property.value.toLocaleString()}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Profit/Loss:</span>
                <span className={cn(
                  "font-bold",
                  profitLoss >= 0 ? "text-success" : "text-danger"
                )}>
                  {profitLoss >= 0 ? "+" : ""}£{profitLoss.toLocaleString()} ({profitPercent}%)
                </span>
              </div>
            </>
          )}

          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Monthly Income:</span>
            <span className="font-semibold text-success">
              £{property.monthlyIncome.toLocaleString()}/mo
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Annual Yield:</span>
            <span className="font-semibold text-accent">
              {((property.monthlyIncome * 12 / property.price) * 100).toFixed(2)}%
            </span>
          </div>
        </div>

        {property.owned ? (
          <Button 
            variant="destructive" 
            className="w-full" 
            onClick={() => handleAction(() => onSell?.(property))}
            disabled={isLoading}
          >
            {isLoading ? "Selling..." : `Sell for £${property.value.toLocaleString()}`}
          </Button>
        ) : (
          <div className="space-y-3">
            {!showMortgageOptions ? (
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  className="w-full bg-gradient-primary hover:opacity-90" 
                  onClick={() => handleAction(() => onBuy?.(property, 0))}
                  disabled={!canAffordCash || isLoading}
                >
                  {isLoading ? "Buying..." : !canAffordCash ? "Not Enough Cash" : "Buy Cash"}
                </Button>
                <Button 
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowMortgageOptions(true)}
                >
                  Mortgage
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Mortgage: {mortgagePercentage[0]}%</Label>
                  <Slider
                    value={mortgagePercentage}
                    onValueChange={setMortgagePercentage}
                    max={95}
                    min={50}
                    step={5}
                    className="w-full"
                  />
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Mortgage: £{mortgageAmount.toLocaleString()}</div>
                    <div>Cash needed: £{cashRequired.toLocaleString()}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    className="w-full bg-gradient-primary hover:opacity-90" 
                    onClick={() => handleAction(() => onBuy?.(property, mortgagePercentage[0]))}
                    disabled={!canAffordMortgage || isLoading}
                  >
                    {isLoading ? "Buying..." : !canAffordMortgage ? "Not Enough Cash" : "Buy"}
                  </Button>
                  <Button 
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowMortgageOptions(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}