import { useState, memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TenantSelector, Tenant } from "@/components/ui/tenant-selector";
import { Building2, Home, Crown, TrendingUp, TrendingDown, Calculator } from "lucide-react";
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
  mortgageRemaining?: number;
  marketValue?: number;
  yield?: number;
  lastRentIncrease?: number;
  baseRent?: number;
  lastTenantChange?: number;
  condition: "dilapidated" | "standard" | "premium";
  monthsSinceLastRenovation: number;
}

interface PropertyCardProps {
  property: Property;
  onBuy?: (property: Property, mortgagePercentage?: number, providerId?: string, termYears?: number, mortgageType?: 'repayment' | 'interest-only') => void;
  onSell?: (property: Property, isAuction?: boolean) => void;
  onSelectTenant?: (propertyId: string, tenant: Tenant) => void;
  onRemortgage?: (propertyId: string, newLoanAmount: number, providerId: string) => void;
  playerCash?: number;
  creditScore?: number;
  mortgageProviders?: any[];
  currentTenant?: Tenant;
  propertyListings?: any[];
  removeTenant?: (propertyId: string) => void;
  mortgages?: Array<{
    propertyId: string;
    monthlyPayment: number;
    remainingBalance: number;
  }>;
  monthsPlayed?: number;
  isInConveyancing?: boolean;
  conveyancingStatus?: 'buying' | 'selling';
  conveyancingCompletion?: number;
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

export const PropertyCard = memo(function PropertyCard({ 
  property, 
  onBuy, 
  onSell,
  onSelectTenant,
  onRemortgage,
  playerCash = 0, 
  creditScore = 600,
  mortgageProviders = [],
  currentTenant,
  propertyListings = [],
  removeTenant,
  mortgages = [],
  monthsPlayed = 0,
  isInConveyancing = false,
  conveyancingStatus,
  conveyancingCompletion,
}: PropertyCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showMortgageOptions, setShowMortgageOptions] = useState(false);
  const [showMonthlyCosts, setShowMonthlyCosts] = useState(false);
  const [mortgagePercentage, setMortgagePercentage] = useState([60]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [mortgageTermYears, setMortgageTermYears] = useState("25");
  const [mortgageType, setMortgageType] = useState<'repayment' | 'interest-only'>('repayment');
  
  const Icon = PropertyTypeIcon[property.type];
  const mortgageAmount = (property.price * mortgagePercentage[0]) / 100;
  const cashRequired = property.price - mortgageAmount;
  const canAffordCash = playerCash >= property.price;
  const canAffordMortgage = playerCash >= cashRequired;
  
  // Calculate profit/loss based on true market value if available (for below-market purchases)
  const marketValueToUse = property.marketValue || property.value;
  const profitLoss = marketValueToUse - property.price;
  const profitPercent = ((profitLoss / property.price) * 100).toFixed(1);

  // Calculate monthly costs for owned properties
  const propertyMortgage = mortgages.find(m => m.propertyId === property.id);
  const monthlyMortgagePayment = propertyMortgage?.monthlyPayment || 0;
  const PROPERTY_TAX_RATE = 0.012; // 1.2% annual
  const MAINTENANCE_RATE = 0.008; // 0.8% annual
  const monthlyPropertyTax = (property.value * PROPERTY_TAX_RATE) / 12;
  const monthlyMaintenance = (property.value * MAINTENANCE_RATE) / 12;
  const totalMonthlyExpenses = monthlyMortgagePayment + monthlyPropertyTax + monthlyMaintenance;
  const netMonthlyIncome = property.monthlyIncome - totalMonthlyExpenses;

  const handleAction = async (action: () => void) => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate transaction
    action();
    setIsLoading(false);
  };

  const handleBuyWithMortgage = () => {
    if (mortgageAmount > 0 && !selectedProviderId) {
      return; // Don't allow purchase without selecting provider
    }
    handleAction(() => {
      onBuy?.(property, mortgagePercentage[0], selectedProviderId, parseInt(mortgageTermYears), mortgageType);
      setShowMortgageOptions(false);
      setSelectedProviderId("");
      setMortgageTermYears("25");
      setMortgageType('repayment');
    });
  };

  const typeEmoji = {
    residential: "🏠",
    commercial: "🏢",
    luxury: "👑",
  };

  const typeBorderColor = {
    residential: "border-t-[hsl(var(--property-residential))]",
    commercial: "border-t-[hsl(var(--property-commercial))]",
    luxury: "border-t-[hsl(var(--property-luxury))]",
  };

  const typeGlow = {
    residential: "hover:shadow-[0_0_20px_hsl(var(--property-residential)/0.15)]",
    commercial: "hover:shadow-[0_0_20px_hsl(var(--property-commercial)/0.15)]",
    luxury: "hover:shadow-[0_0_20px_hsl(var(--property-luxury)/0.15)]",
  };

  return (
    <Card className={cn(
      "glass border-t-4 transition-all duration-300 hover:scale-[1.02]",
      typeBorderColor[property.type],
      typeGlow[property.type],
      property.owned && "ring-2 ring-primary/50"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{typeEmoji[property.type]}</span>
            <CardTitle className="text-base">{property.name}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {property.marketTrend === "up" ? (
              <TrendingUp className="h-4 w-4 text-success" />
            ) : property.marketTrend === "down" ? (
              <TrendingDown className="h-4 w-4 text-danger" />
            ) : null}
            <Badge variant="outline" className="capitalize text-xs">
              {property.type}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{property.neighborhood}</p>
      </CardHeader>

      <CardContent className="space-y-4">
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
                <span className="text-sm font-medium">Market Value:</span>
                <span className="font-bold">
                  £{marketValueToUse.toLocaleString()}
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
              
              {property.marketValue && property.marketValue > property.price && (
                <div className="text-xs text-muted-foreground italic">
                  * Purchased £{(property.marketValue - property.price).toLocaleString()} below market
                </div>
              )}
            </>
          )}

          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Monthly Income:</span>
            <Badge className="bg-success/20 text-success border-success/30 hover:bg-success/30">
              £{property.monthlyIncome.toLocaleString()}/mo
            </Badge>
          </div>

          {property.owned && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMonthlyCosts(!showMonthlyCosts)}
                className="w-full justify-between text-xs h-7"
              >
                <span className="flex items-center gap-1">
                  <Calculator className="h-3 w-3" />
                  Monthly Cost Breakdown
                </span>
                <span className={cn(
                  "font-semibold",
                  netMonthlyIncome >= 0 ? "text-success" : "text-danger"
                )}>
                  Net: £{netMonthlyIncome.toLocaleString()}/mo
                </span>
              </Button>

              {showMonthlyCosts && (
                <div className="space-y-1.5 pt-2 border-t text-xs">
                  <div className="flex justify-between items-center text-success">
                    <span>+ Rental Income:</span>
                    <span className="font-medium">£{property.monthlyIncome.toLocaleString()}</span>
                  </div>
                  
                  {monthlyMortgagePayment > 0 && (
                    <div className="flex justify-between items-center text-danger">
                      <span>- Mortgage Payment:</span>
                      <span className="font-medium">£{monthlyMortgagePayment.toLocaleString()}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>- Property Tax (1.2%):</span>
                    <span className="font-medium">£{monthlyPropertyTax.toLocaleString()}</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>- Maintenance (0.8%):</span>
                    <span className="font-medium">£{monthlyMaintenance.toLocaleString()}</span>
                  </div>
                  
                  <div className="flex justify-between items-center pt-1.5 border-t font-semibold">
                    <span>Net Monthly Income:</span>
                    <span className={cn(
                      netMonthlyIncome >= 0 ? "text-success" : "text-danger"
                    )}>
                      £{netMonthlyIncome.toLocaleString()}/mo
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {!property.owned && (
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Annual Yield:</span>
              <span className="font-semibold text-[hsl(var(--stat-credit))]">
                {((property.monthlyIncome * 12 / property.price) * 100).toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {property.owned ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2">
              {onSelectTenant && (
                <TenantSelector
                  propertyId={property.id}
                  baseRent={property.baseRent || property.monthlyIncome}
                  onSelectTenant={onSelectTenant}
                  currentTenant={currentTenant}
                  currentMonthlyRent={property.monthlyIncome}
                  lastTenantChange={property.lastTenantChange}
                  monthsPlayed={monthsPlayed}
                />
              )}
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Button 
                variant="destructive" 
                size="sm"
                onClick={() => handleAction(() => onSell?.(property, false))}
                disabled={isLoading}
              >
                List for Sale
              </Button>
            </div>
          </div>
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
                
                {mortgageAmount > 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-sm font-medium">Term</Label>
                        <Select value={mortgageTermYears} onValueChange={setMortgageTermYears}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">5 years</SelectItem>
                            <SelectItem value="10">10 years</SelectItem>
                            <SelectItem value="15">15 years</SelectItem>
                            <SelectItem value="20">20 years</SelectItem>
                            <SelectItem value="25">25 years</SelectItem>
                            <SelectItem value="30">30 years</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">Type</Label>
                        <RadioGroup 
                          value={mortgageType} 
                          onValueChange={(value: 'repayment' | 'interest-only') => setMortgageType(value)}
                          className="flex gap-4 mt-1"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="repayment" id="repayment" />
                            <Label htmlFor="repayment" className="text-xs">Repayment</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="interest-only" id="interest-only" />
                            <Label htmlFor="interest-only" className="text-xs">Interest Only</Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Choose Mortgage Provider:</Label>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {mortgageProviders.map((provider: any) => {
                          const requiredLTV = mortgageAmount / property.price;
                          const eligible = requiredLTV <= provider.maxLTV && creditScore >= provider.minCreditScore;
                          
                          // Calculate estimated monthly payment
                          const interestRate = provider.baseRate + ((700 - creditScore) / 1000) * 0.02;
                          const monthlyInterest = interestRate / 12;
                          let estimatedMonthly: number;
                          
                          if (mortgageType === 'interest-only') {
                            estimatedMonthly = mortgageAmount * monthlyInterest;
                          } else {
                            const totalPayments = parseInt(mortgageTermYears) * 12;
                            estimatedMonthly = mortgageAmount * (monthlyInterest * Math.pow(1 + monthlyInterest, totalPayments)) / (Math.pow(1 + monthlyInterest, totalPayments) - 1);
                          }
                          
                          return (
                            <div 
                              key={provider.id}
                              className={`p-2 border rounded cursor-pointer transition-colors ${
                                selectedProviderId === provider.id ? 'border-primary bg-primary/10' : 'border-border'
                              } ${!eligible ? 'opacity-50' : ''}`}
                              onClick={() => eligible && setSelectedProviderId(provider.id)}
                            >
                              <div className="flex justify-between items-center">
                                <span className="font-medium text-sm">{provider.name}</span>
                                <span className="text-xs">{(provider.baseRate * 100).toFixed(1)}%</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {eligible ? `£${estimatedMonthly.toLocaleString()}/mo (${mortgageType})` : `Requires ${provider.minCreditScore}+ credit, ${(provider.maxLTV * 100)}% max LTV`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    className="w-full bg-gradient-primary hover:opacity-90" 
                    onClick={handleBuyWithMortgage}
                    disabled={!canAffordMortgage || isLoading || (mortgageAmount > 0 && !selectedProviderId)}
                  >
                    {isLoading ? "Buying..." : !canAffordMortgage ? "Not Enough Cash" : "Buy"}
                  </Button>
                  <Button 
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setShowMortgageOptions(false);
                      setSelectedProviderId("");
                      setMortgageTermYears("25");
                      setMortgageType('repayment');
                    }}
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
});